import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {initProject,selectFramework,establishBaseline,recordReview,approve,checkBaseline,status,statePath,runChecks} from '../lib/core.mjs';
import {skillPlan} from '../lib/skills.mjs';
import {renderLean} from '../lib/lean.mjs';
import {comparePng,readPng,writePng} from '../lib/png.mjs';
import {visualPlan,compareVisual,captureVisual} from '../lib/visual-gate.mjs';
import {semanticPlan,importSemanticReview,verifyGuard} from '../lib/guard.mjs';
import {renderVisualReview} from '../lib/visual.mjs';
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
