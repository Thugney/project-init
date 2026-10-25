import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {bootstrapProject} from '../lib/bootstrap.mjs';
import {initProject,readState,selectFramework,statePath,recordReview,approve,checkBaseline} from '../lib/core.mjs';

function fixture(t,{exists=true}={}) {
  const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-bootstrap-prep-'));
  const root=path.join(base,'repo'),bin=path.join(base,'bin'),calls=path.join(base,'install-calls.jsonl');
  if(exists)fs.mkdirSync(root);
  fs.mkdirSync(bin);
  const put=(relative,value)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const tool=(name,body)=>{
    const file=path.join(bin,name);
    fs.writeFileSync(file,`#!${process.execPath}\n${body}\n`);fs.chmodSync(file,0o755);
    if(process.platform==='win32')fs.writeFileSync(file+'.cmd',`@echo off\r\n"${process.execPath}" "%~dp0${name}" %*\r\n`);
  };
  tool('specify',`const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='version'){console.log('specify 1.2.3 (synthetic fixture)');process.exit(0);}
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(['specify',...a])+'\\n');
if(a[0]==='init'){fs.mkdirSync('.specify',{recursive:true});fs.writeFileSync('.specify/fixture.txt','synthetic installer');fs.mkdirSync('.agents/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.agents/skills/speckit-fixture/SKILL.md','synthetic skill');process.exit(0);}
if(a[0]==='integration'&&a[1]==='install'){fs.mkdirSync('.claude/skills/speckit-fixture',{recursive:true});fs.writeFileSync('.claude/skills/speckit-fixture/SKILL.md','synthetic skill');process.exit(0);}
process.exit(9);`);
  tool('npx',`const fs=require('fs');const a=process.argv.slice(2);
if(a[0]==='--version'){console.log('10.9.0');process.exit(0);}
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(['npx',...a])+'\\n');process.exit(0);`);
  tool('codex',`const a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex synthetic');process.exit(0);}if(a[0]==='login'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('{}');process.exit(0);}process.exit(9);`);
  tool('claude',`const a=process.argv.slice(2);if(a[0]==='--version'){console.log('claude synthetic');process.exit(0);}if(a[0]==='auth'&&a[1]==='status')process.exit(0);if(a[0]==='plugin'&&a.includes('--json')){console.log('[]');process.exit(0);}process.exit(9);`);
  const priorPath=process.env.PATH,priorNative=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;
  process.env.PATH=bin+path.delimiter+priorPath;
  if(process.platform==='win32')process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=process.execPath;
  t.after(()=>{
    process.env.PATH=priorPath;
    if(priorNative===undefined)delete process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;else process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE=priorNative;
    fs.rmSync(base,{recursive:true,force:true});
  });
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout;};
  return {root,base,put,calls,git};
}

test('init preview leaves a missing project path absent and provides the actual planned commands',async t=>{
  const {root,calls}=fixture(t,{exists:false});
  const result=await bootstrapProject(root,{intent:'new-product',ui:'no'});
  assert.equal(result.initialized,false);
  assert.equal(result.initialization.planned,true);
  assert.equal(result.status,'preview');
  assert.equal(result.plan.git.action,'init');
  assert.ok(result.plan.specKit.steps.some(step=>step.cmd==='specify'&&step.args.includes('--non-interactive')));
  assert.ok(result.plan.ecc.steps.every(step=>step.command.length>1));
  assert.ok(result.plan.projectSkills.skills.some(skill=>skill.path==='.claude/skills/project-init-verify/SKILL.md'&&skill.action==='create'));
  assert.equal(result.preparation.status,'feature-required');
  assert.equal(fs.existsSync(root),false);
  assert.equal(fs.existsSync(calls),false,'preview must not invoke a synthetic installer');
});

test('init preview in an existing dirty repository does not select a framework or create state',async t=>{
  const {root,put,git,calls}=fixture(t);
  put('README.md','Keep this working copy.\n');git('init');
  const before=fs.readFileSync(path.join(root,'README.md'));
  const result=await bootstrapProject(root,{mode:'Existing',ui:'no'});
  assert.equal(result.framework.id,'spec-kit');
  assert.equal(result.framework.changed,false);
  assert.equal(result.plan.factory.source,'project-init-bundled-factory');
  assert.equal(fs.existsSync(path.join(root,'.project-init')),false);
  assert.equal(fs.existsSync(path.join(root,'factory')),false);
  assert.deepEqual(fs.readFileSync(path.join(root,'README.md')),before);
  assert.equal(fs.existsSync(calls),false);
});

test('preview resumes existing state without persisting a proposed framework selection',async t=>{
  const {root,put}=fixture(t);put('README.md','Existing project\n');
  initProject(root,{mode:'Existing',ui:'no'});
  const state=fs.readFileSync(statePath(root,'project.json'));
  const audit=fs.readFileSync(statePath(root,'audit.jsonl'));
  const result=await bootstrapProject(root,{ui:'no'});
  assert.equal(result.resumed,true);
  assert.equal(result.framework.id,'spec-kit');
  assert.equal(readState(root).framework,null);
  assert.deepEqual(fs.readFileSync(statePath(root,'project.json')),state);
  assert.deepEqual(fs.readFileSync(statePath(root,'audit.jsonl')),audit);
});

test('preview refuses a competing native framework without changing the existing project',async t=>{
  const {root,put}=fixture(t);put('openspec/specs/existing.md','Existing authoritative specification\n');
  await assert.rejects(()=>bootstrapProject(root,{ui:'no'}),/competing Spec Kit/);
  assert.equal(fs.existsSync(path.join(root,'.project-init')),false);
  await assert.rejects(()=>bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true}),/competing Spec Kit/);
  assert.equal(fs.existsSync(path.join(root,'.project-init')),false,'even explicit apply must refuse a competing framework before creating state');
  initProject(root,{mode:'Existing',ui:'no'});selectFramework(root,'openspec');
  const before=fs.readFileSync(statePath(root,'project.json'));
  await assert.rejects(()=>bootstrapProject(root,{ui:'no'}),/pinned to openspec/);
  assert.deepEqual(fs.readFileSync(statePath(root,'project.json')),before);
});

test('successful tooling setup without a native feature reports pending feature work instead of application readiness',async t=>{
  const {root,put}=fixture(t);put('README.md','Existing project without a selected feature\n');
  const progress=[];
  const result=await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true,progress:message=>progress.push(message)});
  assert.equal(result.status,'ready');
  assert.equal(result.readyScope,'tooling');
  assert.equal(result.readiness.tooling,true);
  assert.equal(result.readiness.feature,false);
  assert.equal(result.readiness.approval,false);
  assert.equal(result.readiness.projectSkills,true);
  assert.equal(result.preparation.status,'feature-required');
  assert.equal(result.preparation.applied,false);
  assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'factory/board.json'),'utf8')).jobs,[]);
  assert.ok(progress.some(line=>line.includes('TOOLING READY')));
  assert.ok(!progress.some(line=>line.includes('PROJECT READY')));
  assert.match(result.next,/Feature: feature-required/);
  const skill=fs.readFileSync(path.join(root,'.claude/skills/project-init-verify/SKILL.md'),'utf8');
  assert.match(skill,/project-init prepare/);
  assert.match(skill,/execution existing/);
});

test('successful setup prepares an existing native baseline and preserves its approval on a repeated apply',async t=>{
  const {root,put,calls}=fixture(t);
  put('package.json',{packageManager:'npm@10.9.0',scripts:{test:'node --test test/assessment.test.mjs'}});
  put('test/assessment.test.mjs','// Synthetic preparation fixture; discovery must not run this file.\n');
  put('specs/001-assessment/spec.md','# Existing requirement\n- **FR-001**: Refuse answer keys during an active assessment. checks: test\n');
  put('specs/001-assessment/plan.md','# Existing technical plan\nUse the current assessment lock.\n');
  put('specs/001-assessment/tasks.md','- [ ] T001 Implement FR-001 checks: test\n');
  const specification=fs.readFileSync(path.join(root,'specs/001-assessment/spec.md'));
  const result=await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true,feature:'specs/001-assessment'});
  assert.equal(result.readiness.tooling,true);
  assert.equal(result.readiness.feature,true,JSON.stringify(result.preparation));
  assert.equal(result.readiness.approval,false);
  assert.equal(result.preparation.status,'review-required');
  assert.equal(result.preparation.feature.id,'001-assessment');
  assert.equal(checkBaseline(root).current,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath(root,'requirements.json'),'utf8')).requirements[0].checks,['test']);
  assert.equal(fs.existsSync(statePath(root,'review.json')),false);
  assert.equal(fs.existsSync(statePath(root,'approval.json')),false);
  assert.deepEqual(fs.readFileSync(path.join(root,'specs/001-assessment/spec.md')),specification);
  recordReview(root,{actor:'SYNTHETIC_INDEPENDENT_REVIEWER',evidence:'Synthetic test baseline review only'});
  approve(root,{actor:'SYNTHETIC_OWNER',evidence:'Synthetic test approval only'});
  const watched=['baseline.json','review.json','approval.json','config.json','requirements.json'];
  const saved=new Map(watched.map(name=>[name,fs.readFileSync(statePath(root,name))]));
  const callsBefore=fs.readFileSync(calls,'utf8');
  const board=fs.readFileSync(path.join(root,'factory/board.json'));
  const resumed=await bootstrapProject(root,{ui:'no',apply:true});
  assert.equal(resumed.resumed,true);
  assert.equal(resumed.preparation.status,'prepared');
  assert.equal(resumed.readiness.approval,true);
  assert.deepEqual(resumed.preparation.changed,[]);
  assert.equal(resumed.execution.ecc.skipped,true);
  assert.equal(resumed.execution.wire.skipped,true);
  assert.equal(fs.readFileSync(calls,'utf8'),callsBefore);
  for(const name of watched)assert.deepEqual(fs.readFileSync(statePath(root,name)),saved.get(name),`${name} must remain unchanged`);
  assert.deepEqual(fs.readFileSync(path.join(root,'factory/board.json')),board);
});

test('resume creates a missing board without inventing jobs or replacing existing native inputs',async t=>{
  const {root,put}=fixture(t);put('README.md','Existing project\n');
  await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true});
  fs.unlinkSync(path.join(root,'factory/board.json'));
  const resumed=await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true});
  assert.equal(resumed.execution.factory.boardInitialization.action,'created');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'factory/board.json'),'utf8')).jobs,[]);
  assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8'),'Existing project\n');
});

test('guided skill updates preserve custom content on decline and back it up before an approved replacement',async t=>{
  const {root,put}=fixture(t);put('README.md','Existing project\n');
  await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true});
  const skillPath='.claude/skills/project-init-verify/SKILL.md';
  put(skillPath,'User-customized verification skill\n');
  put('.claude/skills/project-init-verify/reference.txt','User-owned supporting material\n');
  const declined=await bootstrapProject(root,{ui:'no',apply:true,confirm:async message=>!message.includes('Project Init workflow skills differ')});
  assert.equal(declined.status,'stopped');
  assert.equal(declined.stoppedAt,'project-skills');
  assert.equal(fs.readFileSync(path.join(root,skillPath),'utf8'),'User-customized verification skill\n');
  assert.equal(fs.existsSync(statePath(root,'backups/skills')),false);
  const messages=[];
  const upgraded=await bootstrapProject(root,{ui:'no',apply:true,confirm:async()=>true,progress:message=>messages.push(message)});
  assert.equal(upgraded.readiness.projectSkills,true);
  assert.equal(upgraded.execution.wire.backedUp,1);
  const backup=upgraded.execution.wire.backupPaths[0];
  assert.equal(fs.readFileSync(path.join(backup,'SKILL.md'),'utf8'),'User-customized verification skill\n');
  assert.equal(fs.readFileSync(path.join(backup,'reference.txt'),'utf8'),'User-owned supporting material\n');
  assert.match(fs.readFileSync(path.join(root,skillPath),'utf8'),/project-init prepare/);
  assert.ok(messages.some(message=>message.includes('skill backup plan')));
});
