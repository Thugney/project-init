import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 initProject,selectFramework,statePath,establishBaseline,recordReview,approve,reconcileSource,
 runChecks,readJson,sourceSnapshot,status,checkBaseline,hashFile
} from '../lib/core.mjs';
import {applyFactory} from '../lib/factory.mjs';
import {factoryEvidence,verifyExisting,executionEvidence} from '../lib/execution.mjs';
import {importSemanticReview,verifyGuard} from '../lib/guard.mjs';
import {existingPathIdentity,sameExistingPath,isWithinExistingPath} from '../lib/paths.mjs';

const py=process.platform==='win32'?'python':'python3';
function childEnvironment(extra={}){const env={...process.env,...extra};delete env.NODE_TEST_CONTEXT;return env;}
function command(root,exe,args,env){
 const result=spawnSync(exe,args,{cwd:root,encoding:'utf8',timeout:30000,env:env||childEnvironment()});
 assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message);return result.stdout.trim();
}
function fixture(t,{factory=false,value=2}={}){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-execution-')),root=path.join(base,'repo');
 fs.mkdirSync(root);t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 command(root,'git',['init','-q']);command(root,'git',['config','user.name','Synthetic Fixture']);command(root,'git',['config','user.email','fixture@example.invalid']);
 initProject(root,{mode:'Existing',ui:'no',intent:'automation'});selectFramework(root,'none');
 for(const dir of ['specs','src','tests'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'.gitignore'),'.project-init/\n.factory-context/\n');
 fs.writeFileSync(path.join(root,'specs/feature.md'),'# Synthetic fixture only\nFR-1: Return the reviewed value 2.\n');
 fs.writeFileSync(path.join(root,'specs/other-feature.md'),'# A distinct synthetic feature\nFR-2: A different approved scope.\n');
 fs.mkdirSync(path.join(root,'_bmad-output/implementation-artifacts'),{recursive:true});
 fs.writeFileSync(path.join(root,'_bmad-output/implementation-artifacts/1-1-synthetic.md'),'# Story 1.1: Synthetic\n\nStatus: ready-for-dev\n\n## Acceptance Criteria\n- AC1: Return value 2.\n\n## Tasks / Subtasks\n- [ ] Task 1: Keep the story contract.\n');
 fs.writeFileSync(path.join(root,'src/feature.mjs'),`export const value = ${value};\n`);
 fs.writeFileSync(path.join(root,'tests/feature.mjs'),"import assert from 'node:assert/strict'; import {value} from '../src/feature.mjs'; assert.equal(value,2);\n");
 fs.writeFileSync(statePath(root,'config.json'),JSON.stringify({schemaVersion:1,checks:[{name:'feature',argv:['node','tests/feature.mjs']}]}));
 fs.writeFileSync(statePath(root,'requirements.json'),JSON.stringify({schemaVersion:1,requirements:[{id:'FR-1',specPath:'specs/feature.md',checks:['feature'],visualCases:[]}]}));
 if(factory){
  applyFactory(root,{apply:true});
  const filename=path.join(root,'.claude/skills/factory/config.json'),config=readJson(filename);
  // Node rejects Claude CLI flags, so the Claude stand-in is a wrapper that runs the script named by FAKE_CLAUDE_SCRIPT.
  const claude=path.join(base,process.platform==='win32'?'fake-claude.cmd':'fake-claude');
  fs.writeFileSync(claude,process.platform==='win32'?`@"${process.execPath}" "%FAKE_CLAUDE_SCRIPT%" %*\r\n`:`#!/bin/sh\nexec "${process.execPath}" "$FAKE_CLAUDE_SCRIPT" "$@"\n`);
  if(process.platform!=='win32')fs.chmodSync(claude,0o755);
  config.codex.executable=process.execPath;config.claude.executable=claude;fs.writeFileSync(filename,JSON.stringify(config));
 }
 command(root,'git',['add','.']);command(root,'git',['commit','-qm','Synthetic accepted fixture']);
 fs.writeFileSync(statePath(root,'preparation.json'),JSON.stringify({schemaVersion:1,framework:'none',branch:'fixture-source',feature:{id:'synthetic-feature',specPaths:['specs/feature.md']},taskPath:null,remainingTasks:[],checks:['feature'],requirementIds:['FR-1']}));
 establishBaseline(root,['specs/feature.md']);recordReview(root,{actor:'Fixture design reviewer',evidence:'Synthetic fixture only'});approve(root,{actor:'Fixture owner',evidence:'Synthetic fixture approval only'});
 return {base,root};
}
function review(root){
 reconcileSource(root,{actor:'Fixture independent reviewer',evidence:'Synthetic inspection of current integrated code'});
 const file='.project-init/semantic-input.json';
 fs.writeFileSync(path.join(root,file),JSON.stringify({schemaVersion:1,findings:[{id:'FR-1',verdict:'pass',evidenceFiles:['src/feature.mjs']}]}));
 importSemanticReview(root,{file,actor:'Fixture independent reviewer',evidence:'Synthetic requirement review'});
}
function job(root,{source='idea'}={}){
 if(source==='bmad'){
  const preparation=readJson(statePath(root,'preparation.json'));
  preparation.framework='bmad';preparation.feature={id:'1-1-synthetic',directory:'_bmad-output/implementation-artifacts/1-1-synthetic.md',taskPath:'_bmad-output/implementation-artifacts/1-1-synthetic.md',specPaths:['specs/feature.md']};
  preparation.taskPath=preparation.feature.taskPath;fs.writeFileSync(statePath(root,'preparation.json'),JSON.stringify(preparation));
 }
 const helper=name=>path.join(root,`.claude/skills/factory/scripts/${name}.py`);
 const args=[helper('board'),'init','Synthetic observed implementation'];if(source==='bmad')args.push('--source','bmad:_bmad-output/implementation-artifacts/1-1-synthetic.md');
 const slug=command(root,py,args);
 command(root,py,[helper('board'),'note',slug,'base_commit',command(root,'git',['rev-parse','HEAD'])]);
 fs.writeFileSync(path.join(root,`factory/jobs/${slug}/spec.md`),`# Synthetic Factory fixture\nJob: ${slug}\nSource: ${source==='bmad'?'bmad:_bmad-output/implementation-artifacts/1-1-synthetic.md':'idea'}\n- [ ] T001 [CODEX] Implement FR-1 in src/feature.mjs\n`);
 command(root,py,[helper('worktree'),'init',slug]);
 const integration=command(root,py,[helper('worktree'),'path',slug,'integration']);
 return {slug,integration,helper};
}
function fakeWorker(base,{fail=false,blocked=false,bmadStory=false}={}){
 const filename=path.join(base,`synthetic-worker-${fail?'fail':blocked?'blocked':'pass'}.cjs`);
 fs.writeFileSync(filename,`
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),cwd=args[args.indexOf('--cd')+1],last=args[args.indexOf('-o')+1];
if(${fail}){console.error('synthetic process failure');process.exit(9);}
fs.writeFileSync(last,${JSON.stringify(blocked?'WORKER: BLOCKED synthetic fixture':'WORKER: DONE\nSynthetic fixture; no authenticated agent was used.\n')});
if(!${blocked})fs.writeFileSync(path.join(cwd,'src/feature.mjs'),'export const value = 2;\\n');
if(${bmadStory}){const story=path.join(cwd,'_bmad-output/implementation-artifacts/1-1-synthetic.md');fs.writeFileSync(story,fs.readFileSync(story,'utf8').replace('- [ ] Task 1','- [x] Task 1'));}
console.log(JSON.stringify({type:'synthetic.fixture.completed'}));process.exit(0);
`);
 return childEnvironment({NODE_OPTIONS:`--require ${JSON.stringify(filename)}`});
}

test('filesystem identity resolves short/long aliases while preserving containment and distinct directories',t=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-path-identity-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const longHome=path.join(base,'Runner Account'),shortHome=path.join(base,'RUNNER~1');
 const root=path.join(longHome,'repo','.project-init','worktrees'),inside=path.join(root,'001-job','integration');
 const sibling=path.join(root,'001-other','integration'),outside=path.join(longHome,'repo','.project-init','worktrees-other','integration');
 for(const file of [inside,sibling,outside])fs.mkdirSync(file,{recursive:true});
 const realpath=fs.realpathSync.native;
 // Model the OS expanding an existing Windows 8.3 alias. Lexical relative paths
 // alone disagree; the production helper must use the filesystem's identity.
 t.mock.method(fs.realpathSync,'native',(value,...args)=>{
  const expanded=value===shortHome||value.startsWith(shortHome+path.sep)?longHome+value.slice(shortHome.length):value;
  return realpath(expanded,...args);
 });
 const aliasInside=shortHome+inside.slice(longHome.length);
 assert.notEqual(path.relative(root,aliasInside),path.relative(root,inside));
 assert.equal(sameExistingPath(aliasInside,inside),true);
 assert.equal(isWithinExistingPath(aliasInside,root),true);
 assert.equal(isWithinExistingPath(aliasInside,shortHome+root.slice(longHome.length)),true);
 assert.equal(sameExistingPath(inside,sibling),false);
 assert.equal(isWithinExistingPath(outside,root),false);
 assert.equal(sameExistingPath(path.join(base,'missing'),inside),false);
});

test('filesystem identity keeps bigint file IDs distinct and falls back safely when IDs are unavailable',t=>{
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-file-identity-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const first=path.join(base,'first'),second=path.join(base,'second');fs.mkdirSync(first);fs.mkdirSync(second);
 const stat=fs.statSync;let unavailable=false;
 t.mock.method(fs,'statSync',(file,options)=>{
  const result=stat(file,options);
  if(!options?.bigint)return result;
  return {...result,dev:unavailable?0n:1n,ino:unavailable?0n:path.basename(file)==='first'?9007199254740992n:9007199254740993n};
 });
 assert.notEqual(existingPathIdentity(first),existingPathIdentity(second));
 assert.equal(sameExistingPath(first,second),false);
 unavailable=true;
 assert.equal(sameExistingPath(first,first),true);
 assert.equal(sameExistingPath(first,second),false,'zero file IDs cannot make unrelated checkouts equal');
});

test('real Git Factory integration and synthetic worker produce evidence for integrated source',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const before=sourceSnapshot(root).hash;
 const preview=await factoryEvidence(root,{job:j.slug,allowed:['src/']});
 assert.equal(preview.executed,false);assert.equal(fs.existsSync(statePath(j.integration,'project.json')),false);
 assert.equal(sourceSnapshot(root).hash,before);
 assert.equal(executionEvidence(root).valid,false,'Coordinator is not integrated execution evidence');
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});
 assert.equal(result.passed,true,JSON.stringify(result));assert.equal(result.receipt.runner,'factory');
 assert.equal(result.receipt.sourceHashBefore,before);assert.notEqual(result.receipt.sourceHashAfter,before);
 assert.deepEqual(result.receipt.changedFiles,['src/feature.mjs']);
 assert.equal(executionEvidence(j.integration).valid,true);
 const blocked=verifyGuard(j.integration);assert.equal(blocked.passed,false);assert.equal(blocked.executionValid,true);
 review(j.integration);
 const accepted=verifyGuard(j.integration);assert.equal(accepted.passed,true,JSON.stringify(accepted.missing));assert.equal(accepted.releaseApproved,false);
 assert.equal(status(j.integration).driftGuardCurrent,true);
 const approvalOriginal=readJson(statePath(root,'approval.json')),approvalCopied=readJson(statePath(j.integration,'approval.json'));
 assert.deepEqual(approvalCopied,approvalOriginal,'Approval was copied, never re-granted or relabeled.');
 const prepared=readJson(statePath(j.integration,'preparation.json'));
 assert.equal(prepared.feature.id,'synthetic-feature');assert.equal(prepared.branch,`factory/${j.slug}/integration`);
 const jobSpec=path.join(root,`factory/jobs/${j.slug}/spec.md`);
 fs.writeFileSync(jobSpec,fs.readFileSync(jobSpec,'utf8').replace('- [ ] T001','- [x] T001'));
 assert.equal(executionEvidence(j.integration).valid,true,'Native task completion does not rewrite the execution contract.');
 fs.writeFileSync(path.join(j.integration,'src/feature.mjs'),'export const value = 3;\n');
 assert.equal(executionEvidence(j.integration).valid,false);assert.equal(status(j.integration).driftGuardCurrent,false);
});

test('BMAD story source registers and produces valid Factory execution evidence while binding its contract',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root,{source:'bmad'});
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base,{bmadStory:true}));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/','_bmad-output/implementation-artifacts/1-1-synthetic.md'],execute:true});
 assert.equal(result.passed,true,JSON.stringify(result));
 assert.equal(readJson(path.join(root,'factory/board.json')).jobs.find(item=>item.id===j.slug).source,'bmad:_bmad-output/implementation-artifacts/1-1-synthetic.md');
 const integratedStory=path.join(j.integration,'_bmad-output/implementation-artifacts/1-1-synthetic.md');
 assert.ok(fs.readFileSync(integratedStory,'utf8').includes('- [x] Task 1'));
 assert.equal(executionEvidence(j.integration).valid,true,'Ticking completed task checkboxes does not rewrite the BMAD contract.');
 fs.writeFileSync(integratedStory,fs.readFileSync(integratedStory,'utf8').replace('AC1: Return value 2.','AC1: Changed contract.'));
 assert.equal(executionEvidence(j.integration).valid,false,'Acceptance criteria are bound at dispatch.');
});

test('Git CRLF checkout preserves the approved native baseline while source evidence remains byte-bound',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1});
 command(root,'git',['config','core.autocrlf','true']);
 const nativeSpec=fs.readFileSync(path.join(root,'specs/feature.md'));
 assert.equal(nativeSpec.includes(Buffer.from('\r\n')),false,'The authoritative checkout starts with LF bytes.');
 const baselineBefore=fs.readFileSync(statePath(root,'baseline.json')),approvalBefore=fs.readFileSync(statePath(root,'approval.json'));
 const j=job(root),integrationSpec=path.join(j.integration,'specs/feature.md');
 const checkoutBytes=fs.readFileSync(integrationSpec);
 assert.equal(checkoutBytes.includes(Buffer.from('\r\n')),true,'Real Git checkout, not a test rewrite, converted the native text to CRLF.');
 assert.equal(checkoutBytes.toString('utf8').replaceAll('\r\n','\n'),nativeSpec.toString('utf8'));
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const expectedRepresentations=[{path:'specs/feature.md',mode:'utf8-crlf-lf-v1',approvedSha256:JSON.parse(baselineBefore).files.find(file=>file.path==='specs/feature.md').sha256,actualSha256:hashFile(integrationSpec)}];
 const preview=await factoryEvidence(root,{job:j.slug,allowed:['src/']});
 assert.equal(preview.executed,false);assert.deepEqual(preview.nativeTextRepresentations,expectedRepresentations);
 assert.equal(fs.existsSync(statePath(j.integration,'project.json')),false,'Preview does not copy runtime state.');
 assert.equal(fs.existsSync(statePath(j.integration,'factory-origin.json')),false,'Preview does not authorize native text representation changes.');
 assert.deepEqual(fs.readFileSync(integrationSpec),checkoutBytes);
 const conflictFile=statePath(j.integration,'config.json'),conflict=JSON.stringify({schemaVersion:1,checks:[]});
 fs.mkdirSync(path.dirname(conflictFile),{recursive:true});fs.writeFileSync(conflictFile,conflict);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true}),/Integration state differs at config\.json/);
 assert.equal(fs.readFileSync(conflictFile,'utf8'),conflict,'An existing state conflict is preserved.');
 assert.equal(fs.existsSync(statePath(j.integration,'approval.json')),false);
 assert.equal(fs.existsSync(statePath(j.integration,'factory-origin.json')),false);
 assert.deepEqual(fs.readFileSync(integrationSpec),checkoutBytes);
 fs.unlinkSync(conflictFile); // Resolve only this synthetic fixture's deliberate conflict.
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});
 assert.equal(result.passed,true,JSON.stringify(checkBaseline(j.integration)));
 assert.equal(checkBaseline(j.integration).current,true);
 assert.deepEqual(fs.readFileSync(statePath(j.integration,'baseline.json')),baselineBefore,'The baseline is preserved, not re-registered.');
 assert.deepEqual(fs.readFileSync(statePath(j.integration,'approval.json')),approvalBefore,'The human approval is copied without rewriting its digest.');
 const origin=readJson(statePath(j.integration,'factory-origin.json'));
 assert.equal(origin.baselineHash,JSON.parse(baselineBefore).hash);assert.deepEqual(origin.nativeTextRepresentations,expectedRepresentations);
 assert.deepEqual(fs.readFileSync(integrationSpec),checkoutBytes,'The native checkout file is not rewritten to satisfy approval.');
 assert.equal(verifyGuard(j.integration).passed,false,'The changed implementation still needs actual independent review.');
 review(j.integration);assert.equal(verifyGuard(j.integration).passed,true);
 // Approval permits equivalent native text; execution/source receipts still bind
 // the exact bytes actually checked and independently reviewed.
 fs.writeFileSync(integrationSpec,nativeSpec);
 assert.equal(checkBaseline(j.integration).current,true);
 assert.equal(executionEvidence(j.integration).valid,false);
});

test('Factory import rejects substantive native specification changes before copying approval state',async t=>{
 const {root}=fixture(t,{factory:true,value:1}),j=job(root);
 const worker=command(root,py,[j.helper('worktree'),'path',j.slug,'claude']);
 fs.writeFileSync(path.join(worker,'src/feature.mjs'),'export const value = 2;\n');
 fs.appendFileSync(path.join(worker,'specs/feature.md'),'FR-2: An unapproved extra requirement.\n');
 command(worker,'git',['add','src/feature.mjs','specs/feature.md']);
 command(worker,'git',['commit','-qm','Synthetic substantive native specification edit']);
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'claude']);
 const native=path.join(j.integration,'specs/feature.md'),before=fs.readFileSync(native);
 for(const execute of [false,true]){
  await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/','specs/'],execute}),/Integrated native specification differs from the approved baseline: specs\/feature\.md/);
  assert.equal(fs.existsSync(statePath(j.integration,'approval.json')),false,'Rejected import cannot copy approval.');
  assert.equal(fs.existsSync(statePath(j.integration,'factory-origin.json')),false,'Rejected import cannot grant a representation exception.');
  assert.deepEqual(fs.readFileSync(native),before,'Rejected import preserves the actual native file.');
 }
});

test('Factory rejects unsupported scope, unrecorded jobs, failed worker evidence and modified logs',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 const failure=spawnSync(py,[j.helper('codex_worker'),'build',j.slug],{cwd:root,encoding:'utf8',env:fakeWorker(base,{fail:true})});
 assert.notEqual(failure.status,0);
 const pointer=readJson(path.join(root,`factory/jobs/${j.slug}/codex/latest-execution.json`));
 assert.equal(readJson(path.join(root,pointer.path)).status,'failed');
 const refused=spawnSync(py,[j.helper('worktree'),'integrate',j.slug,'codex'],{cwd:root,encoding:'utf8'});
 assert.notEqual(refused.status,0);assert.match(refused.stdout,/successful Codex process evidence/);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true}),/No actual Factory integration/);
 // A new successful real process observation supersedes a failed attempt. Both remain on disk.
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 await assert.rejects(factoryEvidence(root,{job:'999-does-not-exist',allowed:['src/']}),/No registered/);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['docs/']}),/outside the explicit scope/);
});

test('Factory observations reject scope violations, mutated command logs and stale baseline',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['docs/']}),/outside the explicit scope/);
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});assert.equal(result.passed,true);
 const op=readJson(path.join(root,result.receipt.factory.operations[0].path));
 fs.appendFileSync(path.join(root,op.log.path),'changed log');
 assert.equal(executionEvidence(j.integration).valid,false);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/']}),/evidence changed/);
 fs.appendFileSync(path.join(j.integration,'specs/feature.md'),'Changed requirement');
 assert.equal(verifyGuard(j.integration).executionValid,false);
});

test('a failed worker preflight cannot reuse a previous successful process receipt',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const observed=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});assert.equal(observed.passed,true);
 // Invalid local configuration fails before a process can launch, after invalidating its old pointer.
 const cfg=path.join(root,'.claude/skills/factory/config.json');fs.writeFileSync(cfg,'invalid synthetic configuration');
 const next=spawnSync(py,[j.helper('codex_worker'),'build',j.slug],{cwd:root,encoding:'utf8',env:childEnvironment()});
 assert.notEqual(next.status,0);
 const pointer=readJson(path.join(root,`factory/jobs/${j.slug}/codex/latest-execution.json`));
 assert.equal(pointer.processStarted,false);assert.equal(pointer.path,null);
 assert.equal(executionEvidence(j.integration).valid,false);
});

function fakeClaude(base,{blocked=false}={}){
 const filename=path.join(base,`synthetic-claude-${blocked?'blocked':'pass'}.cjs`);
 fs.writeFileSync(filename,`
const fs=require('fs'),path=require('path');
const result=${JSON.stringify(blocked?'WORKER: BLOCKED synthetic fixture':'WORKER: DONE\nSynthetic fixture; no authenticated agent was used.')};
if(!${blocked})fs.writeFileSync(path.join(process.cwd(),'src/feature.mjs'),'export const value = 2;\\n');
console.log(JSON.stringify({type:'system',subtype:'init'}));
console.log(JSON.stringify({type:'result',result}));process.exit(0);
`);
 return childEnvironment({FAKE_CLAUDE_SCRIPT:filename});
}

test('a headless Claude worker leaves process evidence that integration and execution verify',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 assert.match(command(root,py,[j.helper('claude_worker'),'build',j.slug],fakeClaude(base)),/^CLAUDE DONE mode=build/);
 const pointer=readJson(path.join(root,`factory/jobs/${j.slug}/claude/latest-execution.json`));
 const worker=readJson(path.join(root,pointer.path));
 assert.equal(worker.worker,'claude');assert.equal(worker.status,'done');assert.equal(worker.logs.length,3);
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'claude']);
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});
 assert.equal(result.passed,true,JSON.stringify(result));
 const op=readJson(path.join(root,result.receipt.factory.operations[0].path));
 assert.equal(op.workerEvidenceKind,'claude-process');assert.equal(op.workerEvidence.path,pointer.path);
 const blocked=spawnSync(py,[j.helper('claude_worker'),'build',j.slug],{cwd:root,encoding:'utf8',env:fakeClaude(base,{blocked:true})});
 assert.equal(blocked.status,4,blocked.stdout);assert.match(blocked.stdout,/^CLAUDE BLOCKED/);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true}),/latest Claude result has not been successfully integrated/);
});

test('interactive Claude integration records observed Git facts without inventing a Claude process',async t=>{
 const {root}=fixture(t,{factory:true,value:1}),j=job(root);
 const worker=command(root,py,[j.helper('worktree'),'path',j.slug,'claude']);
 fs.writeFileSync(path.join(worker,'src/feature.mjs'),'export const value = 2;\n');
 command(worker,'git',['add','src/feature.mjs']);command(worker,'git',['commit','-qm','Synthetic interactive worker commit']);
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'claude']);
 const result=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});
 assert.equal(result.passed,true);
 const op=readJson(path.join(root,result.receipt.factory.operations[0].path));
 assert.equal(op.workerEvidenceKind,'interactive-commit');assert.equal(op.workerEvidence,undefined);
 assert.equal(executionEvidence(j.integration).valid,true);
});

test('Factory scope preserves whitespace in Git paths instead of admitting a different directory',async t=>{
 const {root}=fixture(t,{factory:true,value:1}),j=job(root);
 const worker=command(root,py,[j.helper('worktree'),'path',j.slug,'claude']);
 fs.mkdirSync(path.join(worker,' src'));fs.writeFileSync(path.join(worker,' src/outside.mjs'),'export const outside = true;\n');
 command(worker,'git',['add',' src/outside.mjs']);command(worker,'git',['commit','-qm','Synthetic outside-scope path']);
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'claude']);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true}),/outside the explicit scope:  src\/outside.mjs/);
 assert.equal(fs.existsSync(statePath(j.integration,'evidence/latest-run.json')),false);
});

test('Factory runtime-only changes cannot masquerade as an implementation',async t=>{
 const {root}=fixture(t,{factory:true,value:1}),j=job(root);
 const worker=command(root,py,[j.helper('worktree'),'path',j.slug,'claude']);
 fs.mkdirSync(path.join(worker,'factory/jobs/synthetic'),{recursive:true});
 fs.writeFileSync(path.join(worker,'factory/jobs/synthetic/note.md'),'Synthetic runtime metadata, not application code.\n');
 command(worker,'git',['add','-f','factory/jobs/synthetic/note.md']);command(worker,'git',['commit','-qm','Synthetic runtime-only change']);
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'claude']);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['factory/'],execute:true}),/runtime state is not an implementation/);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['factory/jobs/']}),/scope cannot include runtime/);
 assert.equal(fs.existsSync(statePath(j.integration,'evidence/latest-run.json')),false);
});

test('Factory evidence stays bound to its dispatched native baseline even on the same Git base',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const originalHead=command(root,'git',['rev-parse','HEAD']);
 fs.writeFileSync(statePath(root,'requirements.json'),JSON.stringify({schemaVersion:1,requirements:[{id:'FR-2',specPath:'specs/other-feature.md',checks:['feature'],visualCases:[]}]}));
 establishBaseline(root,['specs/other-feature.md']);recordReview(root,{actor:'Fixture reviewer',evidence:'Synthetic other feature'});approve(root,{actor:'Fixture owner',evidence:'Synthetic other feature approval'});
 assert.equal(command(root,'git',['rev-parse','HEAD']),originalHead);
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true}),/different native baseline/);
 assert.equal(fs.existsSync(statePath(j.integration,'project.json')),false);
});

test('Factory execution rejects changed job identity and contract scope',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const spec=path.join(root,`factory/jobs/${j.slug}/spec.md`),original=fs.readFileSync(spec,'utf8');
 fs.writeFileSync(spec,original.replace(`Job: ${j.slug}`,'Job: 999-unrelated'));
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/']}),/Job\/Source headers/);
 fs.writeFileSync(spec,original.replace('src/feature.mjs','src/different-feature.mjs'));
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/']}),/contract changed after dispatch/);
});

test('Factory path identity still rejects a different checkout and a symlink to the correct checkout',async t=>{
 const {base,root}=fixture(t,{factory:true,value:1}),j=job(root);
 command(root,py,[j.helper('codex_worker'),'build',j.slug],fakeWorker(base));
 command(root,py,[j.helper('worktree'),'integrate',j.slug,'codex']);
 const metadataFile=statePath(root,`factory-worktrees/${j.slug}.json`),original=readJson(metadataFile);
 const changed=structuredClone(original);changed.paths.integration=changed.paths.claude;
 fs.writeFileSync(metadataFile,JSON.stringify(changed));
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/']}),/registered isolated checkout/);
 const alias=statePath(root,`worktrees/${j.slug}/integration-alias`);
 fs.symlinkSync(j.integration,alias,process.platform==='win32'?'junction':'dir');
 changed.paths.integration=alias;fs.writeFileSync(metadataFile,JSON.stringify(changed));
 await assert.rejects(factoryEvidence(root,{job:j.slug,allowed:['src/']}),/Symbolic-link\/reparse-point path refused/);
 fs.writeFileSync(metadataFile,JSON.stringify(original));
 const recorded=await factoryEvidence(root,{job:j.slug,allowed:['src/'],execute:true});assert.equal(recorded.passed,true);
 recorded.receipt.factory.integrationProject=original.paths.claude;
 fs.writeFileSync(statePath(j.integration,'evidence/latest-run.json'),JSON.stringify(recorded.receipt));
 assert.equal(executionEvidence(j.integration).valid,false,'another worker checkout cannot use integration evidence');
});

test('existing-code verification does not fabricate implementation and retains all other gates',async t=>{
 const {root}=fixture(t);
 assert.throws(()=>verifyExisting(root,{task:'Verify existing feature',actor:'Fixture independent reviewer',evidence:'Synthetic acceptance'}),/source-review/);
 await runChecks(root,{execute:true});review(root);
 const options={task:'Verify existing feature',actor:'Fixture independent reviewer',evidence:'Synthetic acceptance'};
 const preview=verifyExisting(root,options);assert.equal(preview.executed,false);assert.equal(fs.existsSync(statePath(root,'evidence/latest-run.json')),false);
 const before=sourceSnapshot(root).hash;
 const result=verifyExisting(root,{...options,execute:true});assert.equal(result.passed,true);
 assert.equal(result.receipt.implementationExecuted,false);assert.equal(result.receipt.changedFiles,undefined);assert.equal(sourceSnapshot(root).hash,before);
 const gate=verifyGuard(root);assert.equal(gate.passed,true,JSON.stringify(gate.missing));assert.equal(gate.executionMode,'existing-code');assert.equal(gate.releaseApproved,false);
 assert.equal(status(root).driftGuardCurrent,true);
 const checks=readJson(statePath(root,'evidence/latest-checks.json'));checks.passed=false;
 fs.writeFileSync(statePath(root,'evidence/latest-checks.json'),JSON.stringify(checks));
 assert.equal(executionEvidence(root).valid,false);assert.equal(verifyGuard(root).passed,false);
});

test('unbound legacy receipts and fabricated or stale existing-code attestations fail closed',async t=>{
 const {root}=fixture(t);await runChecks(root,{execute:true});review(root);
 fs.writeFileSync(statePath(root,'evidence/latest-run.json'),JSON.stringify({phase:'implementation',status:'code-executed-unverified',sourceHashAfter:sourceSnapshot(root).hash,changedFiles:['src/feature.mjs'],unapprovedFiles:[]}));
 assert.match(executionEvidence(root).reason,/stale or unbound/);
 const result=verifyExisting(root,{task:'Review already built code',actor:'Fixture independent reviewer',evidence:'Synthetic acceptance',execute:true});
 result.receipt.implementationExecuted=true;fs.writeFileSync(statePath(root,'evidence/latest-run.json'),JSON.stringify(result.receipt));
 assert.equal(executionEvidence(root).valid,false);
 fs.appendFileSync(path.join(root,'specs/feature.md'),'Changed requirement\n');
 assert.throws(()=>verifyExisting(root,{task:'Review',actor:'Fixture independent reviewer',evidence:'Synthetic'}),/current reviewed/);
});

test('existing-code verification rejects a right command recorded in a wrong working directory',async t=>{
 const {root}=fixture(t);await runChecks(root,{execute:true});review(root);
 const checks=readJson(statePath(root,'evidence/latest-checks.json'));checks.checks[0].cwd='unrelated-component';
 fs.writeFileSync(statePath(root,'evidence/latest-checks.json'),JSON.stringify(checks));
 assert.throws(()=>verifyExisting(root,{task:'Verify existing',actor:'Fixture independent reviewer',evidence:'Synthetic current review',execute:true}),/Current passing configured checks/);
 assert.equal(fs.existsSync(statePath(root,'evidence/latest-run.json')),false);
});
