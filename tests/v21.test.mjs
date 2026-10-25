import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {initProject,readState,selectFramework,establishBaseline,recordReview,approve,checkBaseline,status,statePath,runChecks,installPlan,applyInstall,eccInstallPlan,applyEcc} from '../lib/core.mjs';
import {skillPlan} from '../lib/skills.mjs';
import {renderLean} from '../lib/lean.mjs';
import {comparePng,readPng,writePng} from '../lib/png.mjs';
import {visualPlan,compareVisual,captureVisual} from '../lib/visual-gate.mjs';
import {semanticPlan,importSemanticReview,verifyGuard} from '../lib/guard.mjs';
import {renderVisualReview} from '../lib/visual.mjs';
import {factoryPlan,applyFactory} from '../lib/factory.mjs';
import {bootstrapProject} from '../lib/bootstrap.mjs';
import {compareVersions,updateDecision,updateProjectInit} from '../lib/update.mjs';
import {prerequisitePlan,prepareVendorRuntimeEnvironment,authenticateCodexCli,authenticateClaudeCodeCli} from '../lib/prerequisites.mjs';
test('self-update version comparison handles preview releases',()=>{
 assert.equal(compareVersions('2.1.0-preview.6','2.1.0-preview.7')<0,true);
 assert.equal(compareVersions('2.1.0-preview.7','2.1.0-preview.7'),0);
 assert.equal(compareVersions('2.1.0','2.1.0-preview.99')>0,true);
 assert.equal(updateDecision('2.1.0-preview.7','2.1.0-preview.7').status,'current');
 assert.equal(updateDecision('2.1.0-preview.7','2.1.0-preview.7',{force:true}).status,'update-available');
});

test('self-update check never invokes npm when current',async()=>{
 const sha='a'.repeat(40);
 const fetcher=async url=>({ok:true,status:200,json:async()=>url.includes('/commits/main')?{sha}:{name:'@thugney/project-init',version:'2.1.0-preview.14'}});
 let calls=0;
 const result=await updateProjectInit({check:true,fetcher,runner:()=>{calls++;throw new Error('runner should not execute');}});
 assert.equal(result.status,'current');assert.equal(result.updated,false);assert.equal(calls,0);assert.equal(result.remoteCommit,sha);
});

test('self-update installs pinned GitHub source and verifies replacement CLI',async()=>{
 const sha='b'.repeat(40);
 const fetcher=async url=>({ok:true,status:200,json:async()=>url.includes('/commits/main')?{sha}:{name:'@thugney/project-init',version:'2.1.0-preview.15'}});
 const calls=[];
 const runner=(command,args)=>{calls.push([command,...args]);if(command==='npm')return {status:0,stdout:'updated',stderr:''};return {status:0,stdout:'2.1.0-preview.15\n',stderr:''};};
 const result=await updateProjectInit({fetcher,runner});
 assert.equal(result.status,'updated');assert.equal(result.installedVersion,'2.1.0-preview.15');
 assert.deepEqual(calls[0],['npm','install','--global','--force',`git+https://github.com/Thugney/project-init.git#${sha}`]);
 assert.deepEqual(calls[1],['project-init','version']);
});

test('Factory prerequisites require Codex and Claude CLIs plus authentication, not desktop apps',()=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-agent-cli-')),bin=path.join(base,'bin');fs.mkdirSync(bin);
 const node=process.execPath.replaceAll('\\','\\\\');
 const js=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,`#!${process.execPath}\n${body}\n`);fs.chmodSync(file,0o755);return file;};
 js('npm',"if(process.argv[2]==='--version'){console.log('10.0.0');process.exit(0)}process.exit(0)");
 js('codex',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-test');process.exit(0)}if(a[0]==='login'&&a[1]==='status')process.exit(1);if(a[0]==='plugin'&&a.includes('--json')){console.log('{}');process.exit(0)}process.exit(0)");
 js('claude',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude-test');process.exit(0)}if(a[0]==='auth'&&a[1]==='status')process.exit(1);if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0)}process.exit(0)");
 if(process.platform==='win32'){
  for(const name of ['npm','codex','claude'])fs.writeFileSync(path.join(bin,name+'.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`);
 }
 const prior=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;process.env.PATH=bin;
 if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
 try{
  const plan=prerequisitePlan({needUv:false,needEcc:false,needFactory:true});
  const codex=plan.checks.find(x=>x.id==='codex-cli'),claude=plan.checks.find(x=>x.id==='claude-code');
  assert.equal(codex.ready,true);assert.equal(claude.ready,true);
  assert.equal(plan.checks.find(x=>x.id==='codex-auth').ready,false);
  assert.equal(plan.checks.find(x=>x.id==='claude-auth').ready,false);
  assert.ok(plan.missing.includes('codex-auth'));assert.ok(plan.missing.includes('claude-auth'));if(process.platform==='win32')assert.equal(plan.checks.find(x=>x.id==='codex-native-runtime').ready,true);
 }finally{process.env.PATH=prior;if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;}
});

test('Windows vendor runtime exposes a native codex.exe to shell-less child processes',async()=>{
 if(process.platform!=='win32') return;
 const {spawnSync}=await import('node:child_process');
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-native-codex-')),nativeDir=path.join(base,'native');fs.mkdirSync(nativeDir);
 const native=path.join(nativeDir,'codex.exe');fs.copyFileSync(process.execPath,native);
 const priorPath=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;
 process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=native;
 try{
  const runtime=prepareVendorRuntimeEnvironment();
  assert.equal(path.resolve(runtime.codexNative),path.resolve(native));
  assert.equal(path.resolve(runtime.env.PATH.split(path.delimiter)[0]),path.resolve(nativeDir));
  const direct=spawnSync('codex',['--version'],{env:runtime.env,encoding:'utf8',windowsHide:true,shell:false});
  assert.equal(direct.status,0,direct.stderr||direct.error?.message);
  assert.match(direct.stdout,/^v?\d+\./);
 }finally{
  process.env.PATH=priorPath;
  if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;
 }
});

test('agent authentication helpers use current Codex and Claude CLI subcommands',()=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-agent-auth-')),bin=path.join(base,'bin');fs.mkdirSync(bin);
 const codexState=path.join(base,'codex-authenticated'),claudeState=path.join(base,'claude-authenticated');
 const write=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,`#!${process.execPath}\n${body}\n`);fs.chmodSync(file,0o755);return file;};
 write('codex',`const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='--version'){console.log('codex-test');process.exit(0);}
if(a[0]==='login'&&a.length===1){fs.writeFileSync(${JSON.stringify(codexState)},'yes');process.exit(0);}
if(a[0]==='login'&&a[1]==='status'){process.exit(fs.existsSync(${JSON.stringify(codexState)})?0:1);}
console.error('unexpected codex args '+JSON.stringify(a));process.exit(9);`);
 write('claude',`const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='--version'){console.log('claude-test');process.exit(0);}
if(a[0]==='auth'&&a[1]==='login'&&a.length===2){fs.writeFileSync(${JSON.stringify(claudeState)},'yes');process.exit(0);}
if(a[0]==='auth'&&a[1]==='status'){process.exit(fs.existsSync(${JSON.stringify(claudeState)})?0:1);}
console.error('unexpected claude args '+JSON.stringify(a));process.exit(9);`);
 if(process.platform==='win32'){
  for(const name of ['codex','claude'])fs.writeFileSync(path.join(bin,name+'.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`);
 }
 const prior=process.env.PATH;process.env.PATH=bin;
 try{
  const codex=authenticateCodexCli();assert.equal(codex.authenticated,true);assert.equal(codex.already,false);assert.equal(fs.existsSync(codexState),true);
  const claude=authenticateClaudeCodeCli();assert.equal(claude.authenticated,true);assert.equal(claude.already,false);assert.equal(fs.existsSync(claudeState),true);
 }finally{process.env.PATH=prior;}
});

function fixture(label,ui='no'){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),`pinit-v21-${label}-`)),root=path.join(base,'repo');
 initProject(root,{mode:'New',ui,intent:'automation'});selectFramework(root,'none');fs.mkdirSync(path.join(root,'specs'));fs.writeFileSync(path.join(root,'specs','feature.md'),'# Requirement\nMake a working feature.\n');return {base,root};
}
function pngColor(file,width,height,color=[22,45,90,255]){fs.mkdirSync(path.dirname(file),{recursive:true});const rgba=Buffer.alloc(width*height*4);for(let p=0;p<rgba.length;p+=4)rgba.set(color,p);writePng(file,{width,height,rgba});}
function visualFixture(){
 const {root}=fixture('visual','yes');fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','feature.js'),'export const feature = true;\n');
 const design={schemaVersion:1,project:'Security Console',theme:{primary:'#2868bb',sidebar:'#16253e',font:'system-ui'},screens:[{id:'overview',title:'Overview',navigation:[{label:'Overview',active:true}],sections:[{title:'Device data',description:'Shows actual posture'}],actions:[{label:'Review device',kind:'primary'}],states:['Error']}]};
 fs.writeFileSync(statePath(root,'ui-design.json'),JSON.stringify(design));
 const cases=[];
 for(const viewport of ['desktop','mobile'])for(const theme of ['light','dark'])cases.push({id:`overview-${viewport}-${theme}`,screen:'overview',viewport,theme,state:'Default',width:viewport==='desktop'?400:320,height:500,maxDiffRatio:0.01,pixelThreshold:12,reference:`.project-init/visual/baselines/overview-${viewport}-${theme}.png`,actual:`.project-init/visual/actual/overview-${viewport}-${theme}.png`});
 cases.push({id:'overview-error',screen:'overview',viewport:'desktop',theme:'light',state:'Error',width:400,height:500,maxDiffRatio:0.01,pixelThreshold:12,reference:'.project-init/visual/baselines/overview-error.png',actual:'.project-init/visual/actual/overview-error.png'});
 fs.writeFileSync(statePath(root,'visual-cases.json'),JSON.stringify({schemaVersion:1,cases}));
 for(const c of cases){pngColor(path.join(root,c.reference),c.width,c.height);pngColor(path.join(root,c.actual),c.width,c.height);}
 fs.writeFileSync(statePath(root,'requirements.json'),JSON.stringify({schemaVersion:1,requirements:[{id:'REQ-1',specPath:'specs/feature.md',checks:['smoke'],visualCases:['overview-desktop-light']}]}));
 fs.writeFileSync(statePath(root,'config.json'),JSON.stringify({schemaVersion:1,checks:[{name:'smoke',argv:['node','--version']}]}));
 establishBaseline(root,['specs/feature.md']);recordReview(root,{actor:'TEST_REVIEWER',evidence:'Synthetic offline fixture review'});approve(root,{actor:'TEST_OWNER',evidence:'Synthetic offline fixture design approval'});
 return {root,cases};
}
test('bundled Lean Kit renders real report; no separate installation or global skill needed',()=>{
 const {root}=fixture('lean');fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs','report.md'),'# Endpoint report\n\nStatus **validated**.\n');
 const plan=renderLean(root,{input:'docs/report.md',out:'.project-init/lean/report.html'});assert.equal(plan.executed,false);
 const result=renderLean(root,{input:'docs/report.md',out:'.project-init/lean/report.html',execute:true});assert.equal(result.passed,true,result.error);
 assert.match(fs.readFileSync(result.output,'utf8'),/Endpoint report/);assert.ok(fs.existsSync(statePath(root,'lean/audit.jsonl')));
 assert.equal(fs.existsSync(path.join(root,'.codex-lean-kit')),false);
 assert.throws(()=>renderLean(root,{input:'docs/report.md',out:'src/report.html',execute:true}),/inside .project-init/);
});
test('agent skills install in Codex and Claude with descriptions and Claude plugin namespace',()=>{
 const {root}=fixture('skills');fs.writeFileSync(path.join(root,'AGENTS.md'),'ORIGINAL RULES');
 const preview=skillPlan(root,{agent:'both',plugin:true});assert.equal(preview.applied,false);assert.equal(preview.skills.length,22);
 const install=skillPlan(root,{agent:'both',plugin:true,apply:true});assert.equal(install.created,22);assert.ok(install.commands.claude.includes('/project-init-design'));assert.ok(install.commands.codex.includes('$project-init-verify'));
 assert.ok(install.commands.claudePlugin.includes('/project-init:design'));
 assert.match(fs.readFileSync(path.join(root,'.claude/skills/project-init-design/SKILL.md'),'utf8'),/description: Create or review high-fidelity/);
 assert.equal(fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'),'ORIGINAL RULES');
 assert.equal(skillPlan(root,{agent:'both',plugin:true,apply:true}).created,0);
 fs.writeFileSync(path.join(root,'.claude/skills/project-init-design/SKILL.md'),'CUSTOM');
 assert.throws(()=>skillPlan(root,{agent:'both',plugin:true,apply:true}),/Existing skill content differs/);
 assert.equal(fs.readFileSync(path.join(root,'.claude/skills/project-init-design/SKILL.md'),'utf8'),'CUSTOM');
});
test('strict PNG comparator catches changed pixels, mismatched dimensions, and CRC corruption',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pinit-png-'));const base=path.join(tmp,'ref.png'),same=path.join(tmp,'same.png'),different=path.join(tmp,'different.png');
 pngColor(base,300,400);pngColor(same,300,400);pngColor(different,300,400,[190,45,90,255]);
 assert.equal(comparePng(base,same).passed,true);const mismatch=comparePng(base,different,{maxDiffRatio:0.02,diffOutput:path.join(tmp,'diff.png')});assert.equal(mismatch.passed,false);assert.equal(mismatch.changedPixels,120000);assert.equal(readPng(path.join(tmp,'diff.png')).height,400);
 pngColor(different,320,400);assert.match(comparePng(base,different).reason,/Dimension mismatch/);
 const bad=Buffer.from(fs.readFileSync(base));bad[50]^=255;fs.writeFileSync(path.join(tmp,'corrupt.png'),bad);assert.throws(()=>readPng(path.join(tmp,'corrupt.png')),/(CRC|corrupt|Invalid)/i);
});
test('visual screenshots and critical states are enforced and approval hashes references',()=>{
 const {root,cases}=visualFixture();const plan=visualPlan(root);assert.equal(plan.complete,true);
 const first=compareVisual(root);assert.equal(first.passed,true,JSON.stringify(first.missingCoverage));assert.equal(first.results.length,5);assert.equal(status(root).visualEvidenceCurrent,true);
 assert.ok(fs.existsSync(statePath(root,'evidence/visual-review.html')));
 pngColor(path.join(root,cases[0].actual),400,500,[240,20,20,255]);assert.equal(status(root).visualEvidenceCurrent,false,'changing actual screenshot invalidates old PASS');
 assert.equal(compareVisual(root).passed,false,'altered screen must fail screenshot comparison');
 pngColor(path.join(root,cases[0].actual),400,500);
 assert.equal(compareVisual(root).passed,true);
 pngColor(path.join(root,cases[0].reference),400,500,[1,1,1,255]);assert.equal(checkBaseline(root).current,false,'approved reference modification invalidates approval');
 assert.equal(status(root).approved,false);
 assert.equal(compareVisual(root).passed,false);
});
test('visual capture refuses remote URLs and does not overwrite references',()=>{
 const {root,cases}=visualFixture();
 assert.throws(()=>captureVisual(root,{id:cases[0].id,side:'actual',url:'https://example.com',execute:false}),/Only local HTTP/);
 assert.throws(()=>captureVisual(root,{id:cases[0].id,side:'reference',url:'http://127.0.0.1:5173/'}),/Reference already exists/);
});
test('semantic mapping checks authoritative specs and requires test evidence and grounded reviews',async()=>{
 const {root}=visualFixture();assert.equal(semanticPlan(root).complete,true);
 const reviewFile=path.join(root,'review.json');fs.writeFileSync(reviewFile,JSON.stringify({schemaVersion:1,findings:[{id:'REQ-1',verdict:'pass',evidenceFiles:['src/feature.js'],note:'Synthetic code line inspected.'}]}));
 const imported=importSemanticReview(root,{file:'review.json',actor:'TEST_REVIEWER',evidence:'Synthetic static test fixture'});assert.equal(imported.findings.length,1);
 const result=verifyGuard(root);assert.equal(result.passed,false);assert.ok(result.missing.some(x=>x.includes('test evidence')));assert.ok(result.missing.some(x=>x.includes('implementation')));
 await runChecks(root,{execute:true});compareVisual(root);
 const blocked=verifyGuard(root);assert.equal(blocked.testsCurrent,true);assert.equal(blocked.semanticCurrent,true);assert.equal(blocked.visualCurrent,true);assert.equal(blocked.executionValid,false);assert.equal(blocked.passed,false);
 fs.writeFileSync(path.join(root,'src/feature.js'),'export const feature = false;\n');
 assert.equal(verifyGuard(root).semanticCurrent,false,'changed source cannot reuse passing review');
});
test('missing screenshot/state matrix blocks visual acceptance even if one screenshot passes',()=>{
 const {root,cases}=visualFixture();fs.writeFileSync(statePath(root,'visual-cases.json'),JSON.stringify({schemaVersion:1,cases:[cases[0]]}));
 assert.equal(visualPlan(root).complete,false);const v=compareVisual(root);assert.equal(v.passed,false);assert.ok(v.missingCoverage.length>0);
});
test('visual HTML supports deterministic capture routes for screen, theme, viewport and state',()=>{
 const {root}=visualFixture();const rendered=renderVisualReview(root);const text=fs.readFileSync(rendered.output,'utf8');assert.match(text,/URLSearchParams\(location.search\)/);assert.match(text,/body\.capture/);assert.match(text,/request\.get\('theme'\)/);
});
test('full synthetic evidence lifecycle can pass candidate gate, but never self-approves release',async()=>{
 const {root}=visualFixture();
 const base=path.dirname(root);
 const {spawnSync}=await import('node:child_process');
 const {runCodex,reconcileSource}=await import('../lib/core.mjs');
 function git(...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 git('init');git('config','user.name','Synthetic Fixture');git('config','user.email','fixture@example.invalid');
 fs.writeFileSync(path.join(root,'.gitignore'),'.project-init/\n');git('add','.');git('commit','-m','Synthetic baseline');
 reconcileSource(root,{actor:'Fixture reviewer',evidence:'Synthetic Git baseline reviewed'});
 const bin=path.join(base,'bin');fs.mkdirSync(bin,{recursive:true});const mock=path.join(bin,'codex');
 fs.writeFileSync(mock,`#!/usr/bin/env node\nconst fs=require('fs');const args=process.argv.slice(2);\nif(args[0]==='login'&&args[1]==='status')process.exit(0);\nif(args[0]==='exec'){fs.readFileSync(0,'utf8');fs.writeFileSync('src/feature.js','export const feature = 42;\\n');console.log(JSON.stringify({type:'turn.completed'}));process.exit(0);}\nprocess.exit(1);\n`);fs.chmodSync(mock,0o755);
 if(process.platform==='win32') fs.writeFileSync(path.join(bin,'codex.cmd'),'@echo off\r\nnode "%~dp0codex" %*\r\n');
 const prior=process.env.PATH;process.env.PATH=bin+path.delimiter+prior;
 try{
  const run=await runCodex(root,{phase:'implementation',task:'Implement approved bounded feature',allowed:['src/'],execute:true});
  assert.equal(run.status,'code-executed-unverified');assert.ok(run.sourceHashAfter);
 }finally{process.env.PATH=prior;}
 reconcileSource(root,{actor:'Fixture reviewer',evidence:'Synthetic scope change reviewed'});
 const input=statePath(root,'review-input.json');fs.writeFileSync(input,JSON.stringify({schemaVersion:1,findings:[{id:'REQ-1',verdict:'pass',evidenceFiles:['src/feature.js']}]}));
 importSemanticReview(root,{file:'.project-init/review-input.json',actor:'Independent fixture reviewer',evidence:'Synthetic evidence only'});
 await runChecks(root,{execute:true});assert.equal(compareVisual(root).passed,true);
 const accepted=verifyGuard(root);assert.equal(accepted.passed,true,JSON.stringify(accepted.missing));assert.equal(accepted.readyForHumanReleaseReview,true);assert.equal(accepted.releaseApproved,false);
 assert.equal(status(root).releaseCandidateReady,true);assert.equal(status(root).releaseReady,false);
 // A cached guard pass must never survive tampering with an approved visual receipt.
 pngColor(path.join(root,'.project-init/visual/actual/overview-desktop-light.png'),400,500,[70,200,20,255]);
 assert.equal(status(root).releaseCandidateReady,false,'cached accepted status invalidates when screenshot changes');
 pngColor(path.join(root,'.project-init/visual/actual/overview-desktop-light.png'),400,500);
 fs.writeFileSync(path.join(root,'src/feature.js'),'export const feature = -1;\n');
 const after=verifyGuard(root);assert.equal(after.passed,false);assert.equal(after.executionValid,false);
});

test('user-wide skills use Codex ~/.agents/skills and Claude ~/.claude/skills',()=>{
 const {root,base}=fixture('user-skills');
 const home=path.join(base,'home');fs.mkdirSync(home);
 const preview=skillPlan(root,{agent:'both',scope:'user',userHome:home});
 assert.equal(preview.applied,false);
 assert.ok(preview.skills.some(x=>x.path==='.agents/skills/project-init/SKILL.md'));
 assert.ok(preview.skills.some(x=>x.path==='.claude/skills/project-init/SKILL.md'));
 assert.equal(preview.skills.some(x=>x.path.includes('.codex/skills')),false);
 const applied=skillPlan(root,{agent:'both',scope:'user',userHome:home,apply:true});
 assert.equal(applied.created,14);
 assert.ok(fs.existsSync(path.join(home,'.agents/skills/project-init/SKILL.md')));
 assert.ok(fs.existsSync(path.join(home,'.claude/skills/project-init/SKILL.md')));
 assert.equal(skillPlan(root,{agent:'both',scope:'user',userHome:home,apply:true}).created,0);
});
test('explicit conflict backups preserve old skills and do not touch unrelated ones',()=>{
 const {root,base}=fixture('skill-upgrade');
 const home=path.join(base,'home');
 const oldDir=path.join(home,'.agents','skills','project-init');
 fs.mkdirSync(oldDir,{recursive:true});
 fs.writeFileSync(path.join(oldDir,'SKILL.md'),'---\nname: project-init\ndescription: Old diagram-first skill\n---\n');
 fs.writeFileSync(path.join(oldDir,'legacy.txt'),'KEEP');
 const unrelated=path.join(home,'.agents','skills','other-skill','SKILL.md');
 fs.mkdirSync(path.dirname(unrelated),{recursive:true});fs.writeFileSync(unrelated,'UNCHANGED');
 const preview=skillPlan(root,{agent:'both',scope:'user',userHome:home});
 assert.equal(preview.skills.find(x=>x.path==='.agents/skills/project-init/SKILL.md').action,'conflict');
 assert.throws(()=>skillPlan(root,{agent:'both',scope:'user',userHome:home,apply:true}),/Existing skill content differs/);
 const upgradePlan=skillPlan(root,{agent:'both',scope:'user',userHome:home,backupConflicts:true});
 assert.equal(upgradePlan.skills.find(x=>x.path==='.agents/skills/project-init/SKILL.md').action,'backup-and-create');
 assert.equal(fs.readFileSync(path.join(oldDir,'legacy.txt'),'utf8'),'KEEP','preview must not modify old skill');
 const result=skillPlan(root,{agent:'both',scope:'user',userHome:home,backupConflicts:true,apply:true});
 assert.equal(result.created,14);
 assert.equal(result.backedUp,1);
 assert.equal(fs.readFileSync(path.join(result.backupPaths[0],'legacy.txt'),'utf8'),'KEEP');
 assert.match(fs.readFileSync(path.join(oldDir,'SKILL.md'),'utf8'),/Start or resume development project/);
 assert.equal(fs.readFileSync(unrelated,'utf8'),'UNCHANGED');
 assert.equal(skillPlan(root,{agent:'both',scope:'user',userHome:home,backupConflicts:true,apply:true}).backedUp,0);
});


test('guided init selects Spec Kit and returns the complete Factory stack plan',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-bootstrap-plan-')),root=path.join(base,'repo');fs.mkdirSync(root);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'baseline\n');git('add','.');git('commit','-m','baseline');
 fs.writeFileSync(path.join(root,'LOCAL.txt'),'dirty existing work\n');
 const first=await bootstrapProject(root,{mode:'Existing',intent:'feature',ui:'auto'});
 assert.equal(first.initialized,true);assert.equal(first.resumed,false);assert.equal(first.profile,'factory');assert.equal(first.framework.id,'spec-kit');
 assert.equal(first.plan.specKit.framework,'spec-kit');assert.equal(first.plan.specKit.agent,'both');assert.equal(first.plan.ecc.agent,'both');assert.equal(first.plan.ecc.scope,'local');assert.ok(first.plan.prerequisites);
 assert.equal(first.plan.factory.source,'project-init-bundled-factory');assert.equal(first.applied,false);assert.match(first.next,/same init command with --apply/i);
 assert.equal(readState(root).framework,'spec-kit');assert.equal(fs.readFileSync(path.join(root,'LOCAL.txt'),'utf8'),'dirty existing work\n');
 const resumed=await bootstrapProject(root,{mode:'Existing'});
 assert.equal(resumed.initialized,false);assert.equal(resumed.resumed,true);assert.equal(resumed.framework.id,'spec-kit');
});

test('guided init --apply executes Spec Kit, ECC and Factory and resumes idempotently',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-bootstrap-apply-')),root=path.join(base,'repo'),bin=path.join(base,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'baseline\n');git('add','.');git('commit','-m','baseline');
 fs.writeFileSync(path.join(root,'README.md'),'local dirty work\n');fs.writeFileSync(path.join(root,'LOCAL.txt'),'keep me\n');
 const specify=path.join(bin,'specify');
 fs.writeFileSync(specify,`#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='version'){console.log('specify 1.2.3');process.exit(0);}
if(a[0]==='init'){let input='';try{input=fs.readFileSync(0,'utf8')}catch{};if(input.trim()!=='y')process.exit(8);fs.mkdirSync('.specify',{recursive:true});fs.writeFileSync('.specify/fixture.txt','installed\\n');fs.mkdirSync('.agents/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.agents/skills/speckit-fixture/SKILL.md','fixture\\n');process.exit(0);}
if(a[0]==='integration'&&a[1]==='install'&&a[2]==='claude'){fs.mkdirSync('.claude/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.claude/skills/speckit-fixture/SKILL.md','fixture\\n');process.exit(0);}
process.exit(9);
`);fs.chmodSync(specify,0o755);
 const npx=path.join(bin,'npx');
 fs.writeFileSync(npx,`#!/usr/bin/env node
const fs=require('fs');fs.mkdirSync('.claude/ecc-fixture',{recursive:true});fs.writeFileSync('.claude/ecc-fixture/installed','yes\\n');process.exit(0);
`);fs.chmodSync(npx,0o755);
 const codex=path.join(bin,'codex');fs.writeFileSync(codex,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-cli test');process.exit(0);}if(a[0]==='login'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('{}');process.exit(0);}process.exit(0);
`);fs.chmodSync(codex,0o755);
 const claude=path.join(bin,'claude');fs.writeFileSync(claude,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude-code test');process.exit(0);}if(a[0]==='auth'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0);}process.exit(0);
`);fs.chmodSync(claude,0o755);
 if(process.platform==='win32'){
  fs.writeFileSync(path.join(bin,'specify.cmd'),'@echo off\r\nnode "%~dp0specify" %*\r\n');
  fs.writeFileSync(path.join(bin,'npx.cmd'),'@echo off\r\nnode "%~dp0npx" %*\r\n');
  fs.writeFileSync(path.join(bin,'codex.cmd'),'@echo off\r\nnode "%~dp0codex" %*\r\n');
  fs.writeFileSync(path.join(bin,'claude.cmd'),'@echo off\r\nnode "%~dp0claude" %*\r\n');
 }
 const prior=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;process.env.PATH=bin+path.delimiter+prior;
 if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
 try{
  const prompts=[],messages=[];
  const result=await bootstrapProject(root,{mode:'Existing',intent:'feature',ui:'auto',apply:true,confirm:async message=>{prompts.push(message);return true;},progress:message=>messages.push(message)});
  assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.applied,true);assert.ok(prompts.some(x=>x.includes('Spec Kit')));assert.ok(prompts.some(x=>x.includes('ECC')));assert.ok(prompts.some(x=>x.includes('Factory')));assert.ok(messages.some(x=>x.includes('PROJECT READY')));
  assert.ok(fs.existsSync(path.join(root,'.specify/fixture.txt')));
  assert.ok(fs.existsSync(path.join(root,'.claude/ecc-fixture/installed')));
  assert.ok(fs.existsSync(path.join(root,'.claude/skills/factory/SKILL.md')));
  assert.ok(fs.existsSync(path.join(root,'.agents/skills/factory-worker/SKILL.md')));
  assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'local dirty work\n');assert.equal(fs.readFileSync(path.join(root,'LOCAL.txt'),'utf8'),'keep me\n');
  const state=JSON.parse(fs.readFileSync(statePath(root,'bootstrap.json'),'utf8'));assert.equal(state.steps.specKit.status,'completed');assert.equal(state.steps.ecc.status,'completed');assert.equal(state.steps.factory.status,'completed');
  const resumed=await bootstrapProject(root,{mode:'Existing',apply:true});assert.equal(resumed.status,'ready');assert.equal(resumed.execution.ecc.skipped,true);
 }finally{process.env.PATH=prior;if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;}
});

test('guided init stops cleanly when a component install is declined',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-bootstrap-decline-')),root=path.join(base,'repo'),bin=path.join(base,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'baseline\n');git('add','.');git('commit','-m','baseline');
 const specify=path.join(bin,'specify');fs.writeFileSync(specify,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='version'){console.log('specify 1.2.3');process.exit(0);}process.exit(9);
`);fs.chmodSync(specify,0o755);
 const npx=path.join(bin,'npx');fs.writeFileSync(npx,'#!/usr/bin/env node\nprocess.exit(0);\n');fs.chmodSync(npx,0o755);
 const codex=path.join(bin,'codex');fs.writeFileSync(codex,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-cli test');process.exit(0);}if(a[0]==='login'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('{}');process.exit(0);}process.exit(0);
`);fs.chmodSync(codex,0o755);
 const claude=path.join(bin,'claude');fs.writeFileSync(claude,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude-code test');process.exit(0);}if(a[0]==='auth'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0);}process.exit(0);
`);fs.chmodSync(claude,0o755);
 if(process.platform==='win32'){
  fs.writeFileSync(path.join(bin,'specify.cmd'),'@echo off\r\nnode "%~dp0specify" %*\r\n');
  fs.writeFileSync(path.join(bin,'npx.cmd'),'@echo off\r\nnode "%~dp0npx" %*\r\n');
  fs.writeFileSync(path.join(bin,'codex.cmd'),'@echo off\r\nnode "%~dp0codex" %*\r\n');
  fs.writeFileSync(path.join(bin,'claude.cmd'),'@echo off\r\nnode "%~dp0claude" %*\r\n');
 }
 const prior=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;process.env.PATH=bin+path.delimiter+prior;
 if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
 try{
  const result=await bootstrapProject(root,{mode:'Existing',intent:'feature',ui:'no',apply:true,confirm:async message=>!message.includes('Spec Kit')});
  assert.equal(result.status,'stopped');assert.equal(result.stoppedAt,'spec-kit');assert.equal(result.applied,false);assert.equal(fs.existsSync(path.join(root,'.specify')),false);
 }finally{process.env.PATH=prior;if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;}
});

test('guided init detects and creates a brand-new repository before Git exists',async()=>{
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-bootstrap-new-')),root=path.join(base,'repo');
 const result=await bootstrapProject(root,{intent:'new-product',ui:'yes'});
 assert.equal(result.initialized,true);assert.equal(result.initialization.state.mode,'New');assert.equal(result.framework.id,'spec-kit');assert.equal(result.plan.git.action,'init');assert.equal(result.plan.factory.deferredUntilGitInit,true);
 assert.equal(result.plan.specKit.mode,'New');const init=result.plan.specKit.steps.find(x=>x.cmd==='specify'&&x.args[0]==='init');assert.ok(init);assert.ok(init.args.includes('--non-interactive'));assert.equal(init.args.includes('--force'),false);assert.equal(init.input,undefined);
 assert.equal(fs.existsSync(root),true);
});

test('dirty existing repo initializes and Spec Kit plan uses preserve-merge without force',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-speckit-')),root=path.join(base,'repo');fs.mkdirSync(root);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'existing\n');git('add','.');git('commit','-m','baseline');
 fs.writeFileSync(path.join(root,'README.md'),'existing local work\n');fs.writeFileSync(path.join(root,'AGENTS.md'),'LOCAL AGENT RULES\n');
 const initialized=initProject(root,{mode:'Existing',intent:'feature',ui:'no'});assert.equal(initialized.state.initialSource.gitClean,false);
 assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'existing local work\n');assert.equal(fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'),'LOCAL AGENT RULES\n');
 selectFramework(root,'spec-kit');
 const plan=installPlan(root,'1.2.3','both');assert.equal(plan.safeToApply,true);assert.equal(plan.preflight.gitClean,false);
 const tool=plan.steps.find(x=>x.kind==='tool');if(tool){assert.equal(tool.cmd,'uv');assert.ok(tool.args.includes('git+https://github.com/github/spec-kit.git@v1.2.3'));}
 const init=plan.steps.find(x=>x.cmd==='specify'&&x.args[0]==='init');assert.ok(init);assert.equal(init.input,'y\n');assert.equal(init.preservesExisting,true);assert.equal(init.args.includes('--force'),false);assert.equal(init.args.includes('--non-interactive'),false);assert.ok(init.args.includes('codex'));assert.ok(init.args.includes('--ignore-agent-tools'));
 const claude=plan.steps.find(x=>x.cmd==='specify'&&x.args[0]==='integration'&&x.args.includes('claude'));assert.ok(claude);assert.equal(claude.interactive,undefined);
});

test('Spec Kit apply preserves dirty existing files while scaffolding missing paths',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-speckit-apply-')),root=path.join(base,'repo'),bin=path.join(base,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'baseline\n');git('add','.');git('commit','-m','baseline');
 fs.writeFileSync(path.join(root,'README.md'),'dirty local work\n');fs.writeFileSync(path.join(root,'AGENTS.md'),'LOCAL AGENTS\n');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});selectFramework(root,'spec-kit');
 const fake=path.join(bin,'specify');
 fs.writeFileSync(fake,`#!/usr/bin/env node
const fs=require('fs'),path=require('path');const a=process.argv.slice(2);
if(a[0]==='version'){console.log('specify 1.2.3');process.exit(0);}
if(a[0]==='init'){let input='';try{input=fs.readFileSync(0,'utf8')}catch{};if(input.trim()!=='y')process.exit(8);fs.mkdirSync('.specify',{recursive:true});fs.writeFileSync('.specify/fixture.txt','installed\\n');fs.mkdirSync('.agents/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.agents/skills/speckit-fixture/SKILL.md','fixture\\n');process.exit(0);}
if(a[0]==='integration'&&a[1]==='install'&&a[2]==='claude'){fs.mkdirSync('.claude/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.claude/skills/speckit-fixture/SKILL.md','fixture\\n');process.exit(0);}
process.exit(9);
`);fs.chmodSync(fake,0o755);
 if(process.platform==='win32')fs.writeFileSync(path.join(bin,'specify.cmd'),'@echo off\r\nnode "%~dp0specify" %*\r\n');
 const prior=process.env.PATH;process.env.PATH=bin+path.delimiter+prior;
 try{
  const result=await applyInstall(root,'1.2.3',{apply:true,agent:'both'});assert.equal(result.applied,true,JSON.stringify(result));
 }finally{process.env.PATH=prior;}
 assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'dirty local work\n');
 assert.equal(fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'),'LOCAL AGENTS\n');
 assert.ok(fs.existsSync(path.join(root,'.specify/fixture.txt')));
 assert.ok(fs.existsSync(path.join(root,'.claude/skills/speckit-fixture/SKILL.md')));
});

test('ECC apply is allowed on a dirty existing repo and preserves unrelated files',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-ecc-apply-')),root=path.join(base,'repo'),bin=path.join(base,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'baseline\n');git('add','.');git('commit','-m','baseline');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});
 fs.writeFileSync(path.join(root,'README.md'),'dirty ecc work\n');fs.writeFileSync(path.join(root,'LOCAL.txt'),'keep me\n');
 const fake=path.join(bin,'npx');fs.writeFileSync(fake,`#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);
if(a.includes('--harness')) {
  const h=a[a.indexOf('--harness')+1];
  if(h!=='claude'&&h!=='codex'){console.error('unexpected guided harness '+h);process.exit(24);}
  if(h==='claude'&&(!a.includes('--claude-scope')||!a.includes('local')||!a.includes('--claude-hooks')||!a.includes('standard'))){console.error('missing Claude choices');process.exit(25);}
} else {
  const target=a[a.indexOf('--target')+1];
  if(!a.includes('--profile')||!a.includes('core')){console.error('managed fallback requires core profile');process.exit(26);}
  if(target!=='claude-project'&&target!=='codex'){console.error('unexpected managed target '+target);process.exit(27);}
}
const log='ecc-calls.log';fs.appendFileSync(log,JSON.stringify(a)+'\\n');
fs.mkdirSync('.claude/ecc-fixture',{recursive:true});fs.writeFileSync('.claude/ecc-fixture/installed','yes\\n');process.exit(0);
`);fs.chmodSync(fake,0o755);
 if(process.platform==='win32')fs.writeFileSync(path.join(bin,'npx.cmd'),'@echo off\r\nnode "%~dp0npx" %*\r\n');
 const prior=process.env.PATH;process.env.PATH=bin+path.delimiter+prior;
 try{
  const result=await applyEcc(root,'2.2.3',{apply:true,agent:'both',scope:'local'});assert.equal(result.applied,true,JSON.stringify(result));
 }finally{process.env.PATH=prior;}
 assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'dirty ecc work\n');
 assert.equal(fs.readFileSync(path.join(root,'LOCAL.txt'),'utf8'),'keep me\n');
 const calls=fs.readFileSync(path.join(root,'ecc-calls.log'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 assert.equal(calls.length,2);assert.ok(calls.some(a=>a.includes('--target')&&a.includes('codex')));
});

test('ECC Codex fallback honors custom CODEX_HOME by choosing legacy sync, not default managed home',()=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-ecc-custom-home-')),root=path.join(base,'repo'),bin=path.join(base,'bin'),codexHome=path.join(base,'CodexHome');fs.mkdirSync(root);fs.mkdirSync(bin);fs.mkdirSync(codexHome);
 fs.writeFileSync(path.join(root,'README.md'),'existing app\n');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});
 fs.writeFileSync(path.join(codexHome,'config.toml'),'# test config\n');
 const write=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,`#!${process.execPath}\n${body}\n`);fs.chmodSync(file,0o755);return file;};
 write('codex',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-test');process.exit(0)}if(a[0]==='plugin'){process.exit(2)}process.exit(0)");
 write('claude',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude-test');process.exit(0)}if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0)}process.exit(0)");
 if(process.platform==='win32'){for(const name of ['codex','claude'])fs.writeFileSync(path.join(bin,name+'.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`);}
 const priorPath=process.env.PATH,priorHome=process.env.CODEX_HOME,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;
 process.env.PATH=bin+path.delimiter+priorPath;process.env.CODEX_HOME=codexHome;
 if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
 try{
  const plan=eccInstallPlan(root,'2.2.3',{agent:'both',scope:'local'});
  assert.equal(plan.channels.codex,'legacy-sync');
  const codex=plan.steps.find(x=>x.id==='codex');
  assert.equal(codex.channel,'legacy-sync');assert.equal(codex.internal,'legacy-codex-sync');
  assert.equal(codex.command.includes('--target'),false);
  assert.equal(path.resolve(plan.capabilities.codex.activeHome),path.resolve(codexHome));
 }finally{
  process.env.PATH=priorPath;
  if(priorHome===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=priorHome;
  if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;
 }
});

test('ECC plan chooses one supported channel per harness and never stacks them',()=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-ecc-channel-')),root=path.join(base,'repo'),bin=path.join(base,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 fs.writeFileSync(path.join(root,'README.md'),'existing app\n');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});
 const write=(name,body)=>{const file=path.join(bin,name);fs.writeFileSync(file,`#!${process.execPath}\n${body}\n`);fs.chmodSync(file,0o755);return file;};
 write('codex',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-test');process.exit(0)}if(a[0]==='plugin'){process.exit(2)}process.exit(0)");
 write('claude',"const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude-test');process.exit(0)}if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0)}process.exit(0)");
 if(process.platform==='win32'){for(const name of ['codex','claude'])fs.writeFileSync(path.join(bin,name+'.cmd'),`@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`);}
 const prior=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;process.env.PATH=bin+path.delimiter+prior;
 if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
 try{
  const plan=eccInstallPlan(root,'2.2.3',{agent:'both',scope:'local'});
  assert.equal(plan.channels.claude,'native-plugin');
  assert.equal(plan.channels.codex,'managed-home');
  assert.equal(plan.steps.length,2);
  const claude=plan.steps.find(x=>x.id==='claude'),codex=plan.steps.find(x=>x.id==='codex');
  assert.ok(claude.command.includes('--guided'));assert.ok(claude.command.includes('--harness'));assert.ok(claude.command.includes('claude'));
  assert.equal(claude.command.includes('--profile'),false);
  assert.ok(codex.command.includes('--profile'));assert.ok(codex.command.includes('core'));assert.ok(codex.command.includes('--target'));assert.ok(codex.command.includes('codex'));
  assert.equal(codex.command.includes('--guided'),false);assert.equal(codex.command.includes('--harness'),false);
  assert.ok(plan.dryRunCommands.every(cmd=>cmd.includes('--dry-run')));
 }finally{process.env.PATH=prior;if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;}
});

test('Factory installs generic Codex and Claude parallel-worktree stack and preserves user config',async()=>{
 const {spawnSync}=await import('node:child_process');
 const tempRoot=fs.realpathSync(os.tmpdir()); const base=fs.mkdtempSync(path.join(tempRoot,'pinit-factory-')),root=path.join(base,'repo');fs.mkdirSync(root);
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r;};
 git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');fs.writeFileSync(path.join(root,'README.md'),'factory\n');git('add','.');git('commit','-m','baseline');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});
 fs.writeFileSync(path.join(root,'README.md'),'factory local work\n');fs.writeFileSync(path.join(root,'LOCAL-NOTES.md'),'do not touch\n');
 const plan=factoryPlan(root);
 assert.equal(plan.ready,true);assert.equal(plan.source,'project-init-bundled-factory');assert.equal(plan.override,false);assert.equal(plan.codexSkills.length,2);assert.ok(plan.factoryFiles.length>=12);
 assert.equal(plan.workers.parallel,true);assert.equal(plan.workers.codex.role,'general');assert.equal(plan.workers.claude.role,'general');assert.equal(plan.workers.codex.worktree,'isolated');assert.equal(plan.workers.claude.worktree,'isolated');
 const applied=applyFactory(root,{apply:true});assert.equal(applied.applied,true);assert.equal(applied.installedBridgeCheck.ok,true);
 assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'factory local work\n');assert.equal(fs.readFileSync(path.join(root,'LOCAL-NOTES.md'),'utf8'),'do not touch\n');
 for(const rel of [
  '.claude/skills/factory/SKILL.md',
  '.claude/skills/factory/scripts/board.py',
  '.claude/skills/factory/scripts/worktree.py',
  '.claude/skills/factory/scripts/codex_worker.py',
  '.claude/agents/factory-builder.md',
  '.agents/skills/factory-worker/SKILL.md',
  '.agents/skills/factory-audit/SKILL.md',
  'factory/dashboard.html',
  'factory/backlog.md'
 ]) assert.ok(fs.existsSync(path.join(root,rel)),rel);
 assert.equal(fs.existsSync(path.join(root,'.agents/skills/backend-factory/SKILL.md')),false);
 assert.equal(fs.existsSync(path.join(root,'.agents/skills/backend-audit/SKILL.md')),false);
 assert.match(fs.readFileSync(path.join(root,'.claude/skills/factory/SKILL.md'),'utf8'),/One worker = one isolated worktree/);
 assert.match(fs.readFileSync(path.join(root,'.agents/skills/factory-worker/SKILL.md'),'utf8'),/Neither worker owns frontend or backend/);
 assert.match(fs.readFileSync(path.join(root,'.agents/skills/factory-worker/SKILL.md'),'utf8'),/\[CODEX\].*worker assignment/is);
 const workerBridge=fs.readFileSync(path.join(root,'.claude/skills/factory/scripts/codex_worker.py'),'utf8');
 assert.match(workerBridge,/codex-win32-x64/);assert.match(workerBridge,/npm_global_root/);assert.match(workerBridge,/resolve_codex/);
 git('add','.');git('commit','-m','factory install');

 // Simulate a legacy config with a user customization, then verify migration keeps the customization.
 const cfgPath=path.join(root,'.claude/skills/factory/config.json');
 const legacy=JSON.parse(fs.readFileSync(cfgPath,'utf8'));legacy.test_command='npm test';legacy.backend_engine='codex';delete legacy.workers;delete legacy.worktrees;legacy.codex.fallback_to_claude_after_failures=2;
 fs.writeFileSync(cfgPath,JSON.stringify(legacy,null,2)+'\n');
 git('add','.claude/skills/factory/config.json');git('commit','-m','legacy local config');
 const reapplied=applyFactory(root,{apply:true});assert.equal(reapplied.applied,true);assert.equal(reapplied.configMigration.action,'migrated-legacy');
 const migrated=JSON.parse(fs.readFileSync(cfgPath,'utf8'));assert.equal(migrated.test_command,'npm test');assert.equal(migrated.workers.mode,'parallel-worktrees');assert.equal(migrated.backend_engine,undefined);assert.equal(migrated.codex.fallback_to_claude_after_failures,undefined);

 // Real Git worktree isolation: three distinct branches/checkouts from the same base.
 git('add','.');git('commit','-m','factory migrated');
 const py=process.platform==='win32'?'python':'python3';
 const wt=path.join(root,'.claude/skills/factory/scripts/worktree.py');
 const created=spawnSync(py,[wt,'init','001-parallel-test'],{cwd:root,encoding:'utf8'});assert.equal(created.status,0,created.stderr||created.stdout);
 for(const name of ['integration','codex','claude']){
  const p=path.join(root,'.project-init','worktrees','001-parallel-test',name);assert.equal(fs.existsSync(p),true,p);
  const branch=spawnSync('git',['-C',p,'rev-parse','--abbrev-ref','HEAD'],{encoding:'utf8'});assert.equal(branch.status,0,branch.stderr);assert.equal(branch.stdout.trim(),`factory/001-parallel-test/${name}`);
 }
});
