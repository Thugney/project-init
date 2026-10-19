import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  discover,recommendation,initProject,readState,selectFramework,installPlan,establishBaseline,
  checkBaseline,recordReview,approve,status,runChecks,runCodex,statePath,projectFile,validUIDesign,frameworkCheck
} from '../lib/core.mjs';
import { renderVisualReview } from '../lib/visual.mjs';

function temp(name){const base=fs.mkdtempSync(path.join(os.tmpdir(),`project-init-${name}-`));return {base,root:path.join(base,'app')};}
function newProject(name,{existing=false,ui='no'}={}){
 const p=temp(name);fs.mkdirSync(p.root,{recursive:true});
 if(existing){fs.writeFileSync(path.join(p.root,'AGENTS.md'),'ORIGINAL AGENT RULES\n');fs.writeFileSync(path.join(p.root,'program.ps1'),'Write-Output "Original"\n');}
 initProject(p.root,{mode:existing?'Existing':'New',intent:existing?'bugfix':'new-product',complexity:'medium',ui});
 return p;
}
function selectAndSpec(root,{ui=false}={}) {
 selectFramework(root,'none');
 fs.mkdirSync(path.join(root,'specs'),{recursive:true});
 fs.writeFileSync(path.join(root,'specs','feature.md'),'# Accepted design v1\n');
 if(ui){
  const demo=JSON.parse(fs.readFileSync(new URL('../examples/ui-design.example.json',import.meta.url),'utf8'));
  fs.writeFileSync(statePath(root,'ui-design.json'),JSON.stringify(demo,null,2));
 }
 return establishBaseline(root,['specs/feature.md']);
}
function reviewer(root){recordReview(root,{actor:'TEST_REVIEWER',evidence:'Synthetic test audit event only',verdict:'pass'});approve(root,{actor:'TEST_OWNER',evidence:'Synthetic fixture approval only'});}
test('read-only discovery does not create state and detects existing sources',()=>{
 const p=temp('discover');fs.mkdirSync(p.root);fs.writeFileSync(path.join(p.root,'README.md'),'original\n');
 assert.equal(discover(p.root).mode,'Existing');
 assert.equal(fs.existsSync(path.join(p.root,'.project-init')),false);
});
test('new/existing init is non-destructive, resumable only through status',()=>{
 const p=newProject('old',{existing:true});
 assert.equal(fs.readFileSync(path.join(p.root,'AGENTS.md'),'utf8'),'ORIGINAL AGENT RULES\n');
 assert.equal(fs.readFileSync(path.join(p.root,'program.ps1'),'utf8'),'Write-Output "Original"\n');
 assert.equal(readState(p.root).mode,'Existing');
 assert.throws(()=>initProject(p.root,{mode:'Existing'}),/already exists/);
 assert.equal(fs.existsSync(path.join(p.root,'package.json')),false);
 assert.equal(fs.existsSync(path.join(p.root,'.git')),false);
 const q=newProject('new');assert.equal(readState(q.root).mode,'New');
});
test('recommendation considers intent, complexity, existing footprints',()=>{
 const p=newProject('rank',{existing:true});
 const d=discover(p.root);
 assert.equal(recommendation(d,{intent:'bugfix',complexity:'medium'}).ranking[0].id,'openspec');
 assert.equal(recommendation(d,{intent:'automation',complexity:'small'}).ranking[0].id,'none');
 const q=newProject('ranknew');
 assert.equal(recommendation(discover(q.root),{intent:'new-product',complexity:'large',ui:'yes'}).ranking[0].id,'bmad');
});
test('framework pin is idempotent and refuses silent methodology switching',()=>{
 const p=newProject('pin');selectFramework(p.root,'openspec');selectFramework(p.root,'openspec');
 assert.throws(()=>selectFramework(p.root,'bmad'),/migration requires/);
 assert.equal(readState(p.root).framework,'openspec');
});
test('native framework directories alone are not treated as working CLI integrations',()=>{
 const {root}=newProject('runtime');
 selectFramework(root,'openspec');
 fs.mkdirSync(path.join(root,'openspec'));
 const runtime=frameworkCheck(root,'openspec');
 assert.equal(runtime.detected,true);
 // An installed OpenSpec binary may exist on the host, but this test environment
 // only checks that readiness is tied to a real probe, never the directory alone.
 assert.equal(runtime.ready,runtime.check==='cli-executable');
 const state=status(root);
 assert.equal(state.frameworkCheck.ready,runtime.ready);
});
test('install preview never executes package managers or vendor scaffolding',()=>{
 const p=newProject('install');selectFramework(p.root,'openspec');
 const plan=installPlan(p.root,'9.8.7');
 assert.equal(plan.framework,'openspec');
 assert.equal(plan.steps.at(-1).cmd,'openspec');
 assert.deepEqual(plan.steps.at(-1).args,['init','--tools','codex']);
 assert.equal(fs.existsSync(path.join(p.root,'openspec')),false);
 assert.equal(readState(p.root).installation.state,'selected');
});
test('approval requires current spec, review and actual actor/evidence',()=>{
 const p=newProject('review');selectAndSpec(p.root);
 assert.throws(()=>approve(p.root,{actor:'test',evidence:'x'}),/passing review/);
 assert.throws(()=>recordReview(p.root,{actor:'',evidence:'x'}),/required/);
 reviewer(p.root);
 assert.equal(status(p.root).approved,true);
 assert.equal(status(p.root).releaseReady,false);
 fs.writeFileSync(path.join(p.root,'specs','feature.md'),'# Changed design v2\n');
 assert.equal(checkBaseline(p.root).current,false);
 assert.equal(status(p.root).approved,false);
});
test('UI mockup file is part of approval hash; missing UI cannot pass',()=>{
 const p=newProject('ui',{ui:'yes'});selectFramework(p.root,'none');
 fs.mkdirSync(path.join(p.root,'specs'));
 fs.writeFileSync(path.join(p.root,'specs','feature.md'),'# Design\n');
 assert.throws(()=>establishBaseline(p.root,['specs/feature.md']),/at least one actual designed screen/);
 const demo=JSON.parse(fs.readFileSync(new URL('../examples/ui-design.example.json',import.meta.url),'utf8'));
 fs.writeFileSync(statePath(p.root,'ui-design.json'),JSON.stringify(demo));
 const base=establishBaseline(p.root,['specs/feature.md']);reviewer(p.root);
 assert.equal(status(p.root).approved,true);
 demo.screens[0].actions[0].label='Change approval';
 fs.writeFileSync(statePath(p.root,'ui-design.json'),JSON.stringify(demo));
 assert.equal(status(p.root).approved,false);
 assert.equal(base.files.some(x=>x.path==='.project-init/ui-design.json'),true);
});
test('UI approval rejects missing non-default component states',()=>{
 const p=newProject('states',{ui:'yes'});
 selectFramework(p.root,'none');
 fs.mkdirSync(path.join(p.root,'specs'));
 fs.writeFileSync(path.join(p.root,'specs','feature.md'),'Approved UI design\n');
 const ui=JSON.parse(fs.readFileSync(new URL('../examples/ui-design.example.json',import.meta.url),'utf8'));
 ui.screens[0].states=[];
 fs.writeFileSync(statePath(p.root,'ui-design.json'),JSON.stringify(ui));
 assert.throws(()=>establishBaseline(p.root,['specs/feature.md']),/non-default component/);
});
test('rendered review is standalone, escaping labels and never invents missing screens',()=>{
 const p=newProject('render',{ui:'yes'});
 const first=renderVisualReview(p.root);
 let html=fs.readFileSync(first.output,'utf8');
 assert.match(html,/No screens authored/);
 const mock=JSON.parse(fs.readFileSync(new URL('../examples/ui-design.example.json',import.meta.url),'utf8'));
 mock.screens[0].title='</script><script>alert(1)</script>';
 fs.writeFileSync(statePath(p.root,'ui-design.json'),JSON.stringify(mock));
 const second=renderVisualReview(p.root);
 html=fs.readFileSync(second.output,'utf8');
 assert.ok(!html.includes('</script><script>alert(1)</script>'));
 assert.ok(html.includes('\\u003c/script\\u003e'));
 assert.equal(second.screenCount,2);
});
test('cannot use traversal or link to escape configured project artifacts',()=>{
 const p=newProject('traversal');selectFramework(p.root,'none');
 assert.throws(()=>projectFile(p.root,'../../elsewhere'),/outside project/);
 assert.throws(()=>establishBaseline(p.root,['../topsecret.md']),/outside project/);
 const outside=path.join(p.base,'outside.md');fs.writeFileSync(outside,'outside');
 try{fs.symlinkSync(outside,path.join(p.root,'link.md'));assert.throws(()=>projectFile(p.root,'link.md'),/Symbolic-link/);}catch(error){if(error.code!=='EPERM'&&error.code!=='EACCES')throw error;}
});
test('verification is dry-run until execute; real success/failure captured',async()=>{
 const p=newProject('checks');selectAndSpec(p.root);reviewer(p.root);
 const configPath=statePath(p.root,'config.json');
 fs.writeFileSync(configPath,JSON.stringify({schemaVersion:1,checks:[{name:'smoke',argv:['node','-e','process.exit(0)']}]}));
 assert.equal(checkBaseline(p.root).current,false,'config changed after approval invalidates baseline');
 establishBaseline(p.root,['specs/feature.md']);reviewer(p.root);
 let result=await runChecks(p.root);assert.equal(result.executed,false);
 result=await runChecks(p.root,{execute:true});assert.equal(result.passed,true);
 assert.equal(status(p.root).testEvidenceCurrent,true);
 fs.writeFileSync(path.join(p.root,'changed-after-check.js'),'// external source drift\n');
 assert.equal(status(p.root).testEvidenceCurrent,false, 'Source edits invalidate previous test evidence');
 assert.equal(status(p.root).sourceAligned,false, 'Unreviewed source changes invalidate code readiness');
 fs.unlinkSync(path.join(p.root,'changed-after-check.js'));
 fs.writeFileSync(configPath,JSON.stringify({schemaVersion:1,checks:[{name:'smoke',argv:['node','-e','process.exit(3)']}]}));
 establishBaseline(p.root,['specs/feature.md']);reviewer(p.root);
 result=await runChecks(p.root,{execute:true});assert.equal(result.passed,false);
 assert.equal(result.checks[0].exitCode,3);
 assert.equal(status(p.root).releaseReady,false);
});
test('no Codex implementation without approved baseline and allowed-file scope',async()=>{
 const p=newProject('codex');selectFramework(p.root,'none');
 await assert.rejects(()=>runCodex(p.root,{phase:'implementation',task:'Fix UI',execute:false}),/blocked/);
 selectAndSpec(p.root);reviewer(p.root);
 await assert.rejects(()=>runCodex(p.root,{phase:'implementation',task:'Fix UI',execute:false}),/allow/);
 const preview=await runCodex(p.root,{phase:'implementation',task:'Fix UI',allowed:['src/']});
 assert.equal(preview.executed,false);
 assert.equal(fs.existsSync(statePath(p.root,'evidence/latest-run.json')),false);
});

test('wire creates a Codex skill only when explicitly applied; never changes existing AGENTS',async()=>{
 const {codexSkillPlan}=await import('../lib/core.mjs');
 const p=newProject('wire',{existing:true});
 let plan=codexSkillPlan(p.root);
 assert.equal(plan.applied,false);
 assert.equal(fs.existsSync(path.join(p.root,'.agents','skills','project-init','SKILL.md')),false);
 plan=codexSkillPlan(p.root,{apply:true});
 assert.equal(plan.applied,true);
 assert.match(fs.readFileSync(path.join(p.root,'.agents','skills','project-init','SKILL.md'),'utf8'),/Do not create competing copies/);
 assert.equal(fs.readFileSync(path.join(p.root,'AGENTS.md'),'utf8'),'ORIGINAL AGENT RULES\n');
 plan=codexSkillPlan(p.root,{apply:true});
 assert.equal(plan.state,'already-exists');
});
test('visual output cannot overwrite application source',()=>{
 const p=newProject('render-safe');
 assert.throws(()=>renderVisualReview(p.root,'README.html'),/inside .project-init/);
 assert.throws(()=>renderVisualReview(p.root,'.project-init/config.json'),/HTML file/);
});
test('existing review workspace remains unchanged and separately discoverable',()=>{
 const p=temp('legacy');fs.mkdirSync(path.join(p.root,'planning','architecture'),{recursive:true});
 fs.writeFileSync(path.join(p.root,'planning','architecture','design.json'),'LEGACY SENTINEL\n');
 initProject(p.root,{mode:'Existing',intent:'migration'});
 assert.equal(readState(p.root).initialSource.existingV1Review,true);
 assert.equal(fs.readFileSync(path.join(p.root,'planning','architecture','design.json'),'utf8'),'LEGACY SENTINEL\n');
});
test('real Codex receipt requires Git, preserves scoped changes and never marks release ready',async()=>{
 const p=newProject('mock-codex');selectAndSpec(p.root);reviewer(p.root);
 const {spawnSync}=await import('node:child_process');
 const {reconcileSource}=await import('../lib/core.mjs');
 function git(...args){const r=spawnSync('git',args,{cwd:p.root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 git('init');git('config','user.name','Test Only');git('config','user.email','test@example.invalid');
 fs.writeFileSync(path.join(p.root,'.gitignore'),'.project-init/\n');
 git('add','.');git('commit','-m','synthetic test baseline');
 assert.equal(status(p.root).readyForImplementation,false, 'Unreviewed source changes must block implementation');
 reconcileSource(p.root,{actor:'SYNTHETIC_REVIEWER',evidence:'Synthetic fixture: reviewed changes from Git initialization'});
 assert.equal(status(p.root).readyForImplementation,true);
 const tools=path.join(p.base,'bin');fs.mkdirSync(tools);
 const mock=path.join(tools,'codex');
 fs.writeFileSync(mock,`#!/usr/bin/env node
const fs=require('fs');const path=require('path');
const args=process.argv.slice(2);
if(args[0]==='login'&&args[1]==='status'){console.log('signed in synthetic fixture');process.exit(0);}
if(args[0]==='exec'){
  const txt=fs.readFileSync(0,'utf8');
  if(!txt.includes('approved scoped feature')&&!txt.includes('Agreed'))process.exit(4);
  fs.mkdirSync('src',{recursive:true});fs.writeFileSync('src/scope.js','// actual synthetic change\\n');
  console.log(JSON.stringify({type:'turn.completed',status:'completed'}));process.exit(0);
}
process.exit(5);
`);
 fs.chmodSync(mock,0o755);
 const before=process.env.PATH;
 process.env.PATH=tools+path.delimiter+before;
 try {
  const result=await runCodex(p.root,{phase:'implementation',task:'Agreed scoped feature',allowed:['src/'],execute:true});
  assert.equal(result.status,'code-executed-unverified');
  assert.equal(result.exitCode,0);
  assert.equal(result.changedFiles.includes('src/scope.js'),true);
  assert.equal(result.unapprovedFiles.length,0);
  assert.equal(status(p.root).sourceAligned,false, 'New code must be reconciled before the next task');
  reconcileSource(p.root,{actor:'SYNTHETIC_REVIEWER',evidence:'Synthetic fixture reviewed new source change'});
  assert.equal(status(p.root).sourceAligned,true);
  assert.equal(status(p.root).releaseReady,false);
 } finally {process.env.PATH=before;}
});

test('unapproved Codex source changes are blocked rather than reported complete',async()=>{
 const p=newProject('scope-block');selectAndSpec(p.root);
 const {reconcileSource}=await import('../lib/core.mjs');
 const {spawnSync}=await import('node:child_process');
 function git(...args){const r=spawnSync('git',args,{cwd:p.root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 git('init');git('config','user.name','Test Only');git('config','user.email','test@example.invalid');
 fs.writeFileSync(path.join(p.root,'.gitignore'),'.project-init/\n');
 git('add','.');git('commit','-m','baseline');
 recordReview(p.root,{actor:'Fixture reviewer',evidence:'Synthetic test review'});
 approve(p.root,{actor:'Fixture owner',evidence:'Synthetic test approval'});
 const tools=path.join(p.base,'bin');fs.mkdirSync(tools);
 const mock=path.join(tools,'codex');
 fs.writeFileSync(mock,`#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='login'){process.exit(0);}
if(a[0]==='exec'){fs.readFileSync(0,'utf8');fs.writeFileSync('AGENTS.md','UNAUTHORIZED CHANGE');console.log('{}');process.exit(0);}
process.exit(1);
`);fs.chmodSync(mock,0o755);
 const prior=process.env.PATH;process.env.PATH=tools+path.delimiter+prior;
 try {
  const result=await runCodex(p.root,{phase:'implementation',task:'Fix one function',allowed:['src/'],execute:true});
  assert.equal(result.status,'blocked-review');
  assert.equal(result.unapprovedFiles.includes('AGENTS.md'),true);
  assert.equal(result.exitCode,0,'Codex process success cannot override out-of-scope gate');
  assert.equal(status(p.root).sourceAligned,false);
 } finally {process.env.PATH=prior;}
});
