import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
 initProject,selectFramework,statePath,readJson,recordReview,approve,checkBaseline,
 status,sourceSnapshot,runChecks,validateChecks,establishBaseline,readState,projectRoot
} from '../lib/core.mjs';
import {prepareProject,preparationPlan,featureReadiness,worktreeContext} from '../lib/prepare.mjs';
import {semanticPlan,verifyGuard} from '../lib/guard.mjs';
import {sameExistingPath} from '../lib/paths.mjs';
import {bmadStories} from '../lib/bmad.mjs';

function write(root,file,text){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof text==='string'?text:JSON.stringify(text,null,2));}
function git(root,...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
function fixture(t,{feature=true,initialized=true}={}){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-preparation-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Synthetic Fixture');git(root,'config','user.email','fixture@example.invalid');git(root,'symbolic-ref','HEAD','refs/heads/main');
 write(root,'.gitignore','.project-init/\nfactory/jobs/\nfactory/board.json\n');
 write(root,'package.json',{name:'synthetic-preparation',private:true,packageManager:'npm@10.0.0',scripts:{test:'node --test test.mjs'}});
 write(root,'test.mjs',"import {test} from 'node:test';test('synthetic behavior',()=>{});\n");
 write(root,'.specify/memory/constitution.md','# Synthetic fixture constitution\n');
 if(feature)addFeature(root,'001-example');
 if(initialized){initProject(root,{mode:'Existing',intent:'feature',ui:'no'});selectFramework(root,'spec-kit');}
 return root;
}
function bmadProject(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-bmad-preparation-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.name','Synthetic Fixture');git(root,'config','user.email','fixture@example.invalid');git(root,'symbolic-ref','HEAD','refs/heads/main');
 const bmadFixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','bmad-v6.12.0');
 fs.cpSync(bmadFixture,root,{recursive:true});
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});selectFramework(root,'bmad');
 return root;
}
function directoryAlias(t,target){
 const folder=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-directory-alias-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const alias=path.join(folder,'checkout');
 fs.symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');
 return alias;
}
function addFeature(root,id,{spec='- **FR-001**: Behave as specified. checks: test\n',tasks='- [x] T001 Establish synthetic fixture\n- [ ] T002 Implement FR-001 checks: test\n'}={}){
 write(root,`specs/${id}/spec.md`,'# Synthetic feature\n'+spec);
 write(root,`specs/${id}/plan.md`,'# Synthetic implementation plan\n');
 write(root,`specs/${id}/tasks.md`,tasks);
}
function stateBytes(root){
 const base=statePath(root,'.'),files=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push([path.relative(base,p),fs.readFileSync(p,'utf8')]);}}
 walk(base);return JSON.stringify(files.sort((a,b)=>a[0].localeCompare(b[0])));
}
function accept(root){recordReview(root,{actor:'SYNTHETIC_INDEPENDENT_REVIEWER',evidence:'Synthetic fixture review'});approve(root,{actor:'SYNTHETIC_OWNER',evidence:'Synthetic fixture explicit design approval'});}

test('preparation adopts existing native feature, configures real checks, and baselines only after mapping',t=>{
 const root=fixture(t),before=stateBytes(root),spec=fs.readFileSync(path.join(root,'specs/001-example/spec.md'),'utf8');
 const preview=prepareProject(root);
 assert.equal(preview.feature.directory,'specs/001-example');assert.deepEqual(preview.tasks.pending,['T002']);assert.equal(preview.readyForBaseline,true);
 assert.equal(stateBytes(root),before,'preview must be read-only');
 const applied=prepareProject(root,{apply:true});
 assert.equal(applied.status,'review-required');assert.equal(applied.baseline.current,true);assert.equal(applied.approved,false);
 assert.deepEqual(readJson(statePath(root,'config.json')).checks,[{name:'test',argv:['npm','run','test'],cwd:'.'}]);
 assert.deepEqual(readJson(statePath(root,'requirements.json')).requirements,[{id:'FR-001',specPath:'specs/001-example/spec.md',checks:['test'],visualCases:[]}]);
 assert.deepEqual(readJson(statePath(root,'baseline.json')).specPaths,['specs/001-example/spec.md','specs/001-example/plan.md']);
 assert.equal(fs.existsSync(statePath(root,'approval.json')),false);
 assert.equal(fs.readFileSync(path.join(root,'specs/001-example/spec.md'),'utf8'),spec);
});

test('repeated preparation preserves current approval and all state bytes',t=>{
 const root=fixture(t);prepareProject(root,{apply:true});accept(root);
 const before=stateBytes(root),again=prepareProject(root,{apply:true});
 assert.equal(again.status,'prepared');assert.deepEqual(again.changed,[]);assert.equal(again.approved,true);
 assert.equal(stateBytes(root),before);assert.equal(status(root).feature.configured,true);
});

test('exact explicit spec scope survives ordinary preparation without adding a plan or dropping contracts',t=>{
 const root=fixture(t);write(root,'docs/contract.md','# Existing authoritative contract\n');
 const specs=['specs/001-example/spec.md','docs/contract.md'];
 prepareProject(root,{specs,apply:true});accept(root);const before=stateBytes(root);
 const again=prepareProject(root,{apply:true});
 assert.deepEqual(again.feature.specPaths,specs);assert.equal(again.approved,true);assert.deepEqual(again.changed,[]);assert.equal(stateBytes(root),before);
});

test('recorded explicit feature and spec selection outrank branch-name inference on the same branch',t=>{
 const root=fixture(t);addFeature(root,'002-other');git(root,'symbolic-ref','HEAD','refs/heads/feature/other');
 prepareProject(root,{feature:'specs/001-example',apply:true});accept(root);
 assert.equal(prepareProject(root).feature.id,'001-example');assert.equal(prepareProject(root,{apply:true}).approved,true);
 prepareProject(root,{specs:['specs/001-example/spec.md'],apply:true});accept(root);
 const result=prepareProject(root,{apply:true});assert.deepEqual(result.feature.specPaths,['specs/001-example/spec.md']);assert.equal(result.approved,true);
});

test('repeating preparation cannot turn a package-manager conflict into success',t=>{
 const root=fixture(t);write(root,'yarn.lock','# conflicting lock\n');write(root,'package-lock.json',{lockfileVersion:3});
 const first=prepareProject(root,{apply:true}),second=prepareProject(root,{apply:true});
 assert.equal(first.readyForBaseline,false);assert.equal(second.readyForBaseline,false);assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
});

test('native task progress updates handoff without invalidating the requirements baseline',t=>{
 const root=fixture(t);prepareProject(root,{apply:true});accept(root);
 const hash=checkBaseline(root).actualHash;
 write(root,'specs/001-example/tasks.md','- [x] T001 Establish synthetic fixture\n- [x] T002 Implement FR-001 checks: test\n');
 const prepared=prepareProject(root,{apply:true});
 assert.deepEqual(prepared.tasks.pending,[]);assert.equal(prepared.approved,true);assert.equal(checkBaseline(root).actualHash,hash);
 assert.deepEqual(prepared.changed,['.project-init/preparation.json']);
 assert.equal(status(root).sourceAligned,false,'changed native task file is still visible source drift until reviewed');
});

test('a new project without a native feature is not given a fabricated feature or approval',t=>{
 const root=fixture(t,{feature:false}),before=stateBytes(root);
 const result=prepareProject(root,{apply:true});
 assert.equal(result.applied,false);assert.equal(result.status,'feature-required');assert.equal(stateBytes(root),before);
 assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
});

test('ambiguous native features require selection and cannot mutate configuration',t=>{
 const root=fixture(t);addFeature(root,'002-other');const before=stateBytes(root);
 const result=prepareProject(root,{apply:true});assert.equal(result.selection,'ambiguous-native-features');assert.equal(result.applied,false);assert.equal(stateBytes(root),before);
 const selected=prepareProject(root,{feature:'specs/002-other',apply:true});assert.equal(selected.feature.id,'002-other');assert.equal(selected.baseline.current,true);
});

test('BMAD prepares one active story and retains its native task progress',t=>{
 const root=bmadProject(t),statusPath=path.join(root,'_bmad-output/implementation-artifacts/sprint-status.yaml');
 fs.writeFileSync(statusPath,fs.readFileSync(statusPath,'utf8').replace('1-2-validate-fixture-export: in-progress','1-2-validate-fixture-export: backlog'));
 const plan=preparationPlan(root);
 assert.equal(plan.feature.id,'1-1-create-fixture-export');
 assert.equal(plan.selection,'single-active-bmad-story');
 assert.deepEqual(plan.feature.specPaths,[
  '_bmad-output/planning-artifacts/prd.md',
  '_bmad-output/planning-artifacts/architecture.md',
  '_bmad-output/planning-artifacts/epics.md'
 ]);
 assert.equal(plan.feature.taskPath,'_bmad-output/implementation-artifacts/1-1-create-fixture-export.md');
 assert.deepEqual(plan.tasks.pending,['Task 1','Subtask 1.1','Task 2']);
});

test('multiple active BMAD stories require an explicit story path or --spec',t=>{
 const root=bmadProject(t),plan=preparationPlan(root);
 assert.equal(plan.selection,'ambiguous-native-features');assert.equal(plan.feature,null);
 assert.equal(plan.candidates.length,2);
 const story='_bmad-output/implementation-artifacts/1-2-validate-fixture-export.md';
 const byFeature=preparationPlan(root,{feature:story});
 assert.equal(byFeature.feature.id,'1-2-validate-fixture-export');
 const bySpec=preparationPlan(root,{specs:[story]});
 assert.equal(bySpec.feature.id,'1-2-validate-fixture-export');
});

test('BMAD with no active story reports candidates and does not guess',t=>{
 const root=bmadProject(t),file=path.join(root,'_bmad-output/implementation-artifacts/sprint-status.yaml');
 const text=fs.readFileSync(file,'utf8').replace('1-1-create-fixture-export: ready-for-dev','1-1-create-fixture-export: backlog').replace('1-2-validate-fixture-export: in-progress','1-2-validate-fixture-export: backlog');
 fs.writeFileSync(file,text);
 const plan=preparationPlan(root);
 assert.equal(plan.selection,'no-ready-bmad-story');assert.equal(plan.feature,null);assert.equal(plan.candidates.length,2);
});

test('ambiguous native environment selector cannot fall back to a previous baseline',t=>{
 const root=fixture(t,{feature:false});addFeature(root,'001-example');addFeature(root,'002-example');
 prepareProject(root,{feature:'specs/001-example',apply:true});
 const prior=process.env.SPECIFY_FEATURE;process.env.SPECIFY_FEATURE='example';
 try{assert.equal(prepareProject(root).selection,'ambiguous-native-features');assert.equal(prepareProject(root).feature,null);}
 finally{if(prior===undefined)delete process.env.SPECIFY_FEATURE;else process.env.SPECIFY_FEATURE=prior;}
});

test('requirement discovery never maps FR-1 from a task for FR-10',t=>{
 const root=fixture(t,{feature:false});
 addFeature(root,'001-example',{spec:'- **FR-1**: First behavior\n- **FR-10**: Other behavior\n',tasks:'- [ ] T001 Implement FR-10 checks: test\n'});
 const plan=prepareProject(root,{apply:true});
 assert.equal(plan.readyForBaseline,false);assert.deepEqual(plan.requirements.find(r=>r.id==='FR-1').checks,[]);
 assert.deepEqual(plan.requirements.find(r=>r.id==='FR-10').checks,['test']);
 assert.ok(plan.blockers.some(b=>b.requirement==='FR-1'));assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
});

test('custom checks and stable mapping identities survive discovery and explicit mapping completion',t=>{
 const root=fixture(t,{feature:false});addFeature(root,'001-example',{spec:'- **FR-001**: Behave as specified.\n',tasks:'- [ ] T001 Implement FR-001\n'});
 const custom={name:'custom-regression',argv:['node','--test','test.mjs'],owner:'maintainer'};
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[custom],description:'Keep custom notes'});
 write(root,'.project-init/requirements.json',{schemaVersion:1,requirements:[{id:'CUSTOM-01',specPath:'specs/001-example/spec.md',checks:['custom-regression'],visualCases:[],note:'Keep identity'}]});
 write(root,'.project-init/mapping-input.json',{schemaVersion:1,requirements:[{id:'FR-001',specPath:'specs/001-example/spec.md',checks:['custom-regression'],visualCases:[]}]});
 const result=prepareProject(root,{mapping:'.project-init/mapping-input.json',apply:true});
 assert.equal(result.readyForBaseline,true);assert.deepEqual(result.checks.find(c=>c.name==='custom-regression'),custom);
 assert.equal(result.requirements.find(r=>r.id==='CUSTOM-01').note,'Keep identity');
 assert.equal(readJson(statePath(root,'config.json')).description,'Keep custom notes');
});

test('manual baseline cannot bypass unmapped native requirements in status or semantic gates',t=>{
 const root=fixture(t,{feature:false});addFeature(root,'001-example',{spec:'- **FR-1**: First behavior\n- **FR-2**: Other behavior\n'});
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'test',argv:['node','--test','test.mjs']}]});
 write(root,'.project-init/requirements.json',{schemaVersion:1,requirements:[{id:'FR-1',specPath:'specs/001-example/spec.md',checks:['test'],visualCases:[]}]});
 establishBaseline(root,['specs/001-example/spec.md']);accept(root);
 assert.equal(featureReadiness(root).configured,false);assert.ok(featureReadiness(root).missing.some(x=>x.includes('FR-2')));
 assert.equal(status(root).readyForImplementation,false);assert.equal(semanticPlan(root).complete,false);
});

test('changed check commands invalidate approval and preparation never replaces human acceptance',t=>{
 const root=fixture(t);prepareProject(root,{apply:true});accept(root);
 const oldApproval=fs.readFileSync(statePath(root,'approval.json'),'utf8');
 const config=readJson(statePath(root,'config.json'));config.checks[0].argv=['node','--test','test.mjs'];write(root,'.project-init/config.json',config);
 assert.equal(checkBaseline(root).current,false);
 const result=prepareProject(root,{apply:true});assert.equal(result.status,'review-required');assert.equal(result.approved,false);
 assert.equal(fs.readFileSync(statePath(root,'approval.json'),'utf8'),oldApproval,'old evidence preserved but stale');
});

test('checks execute in their configured package directory and reject nested worktree targets',async t=>{
 const root=fixture(t);prepareProject(root,{apply:true});
 write(root,'backend/verify.mjs',"if(!process.cwd().endsWith('backend'))process.exit(3);console.log('synthetic backend check');\n");
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'test',argv:['node','verify.mjs'],cwd:'backend'}]});
 establishBaseline(root,['specs/001-example/spec.md']);accept(root);
 const result=await runChecks(root,{execute:true});assert.equal(result.passed,true);assert.equal(result.checks[0].cwd,'backend');
 assert.equal(verifyGuard(root).testsCurrent,true);
 const receipt=readJson(statePath(root,'evidence/latest-checks.json'));
 for(const checks of [[{...receipt.checks[0],cwd:'.'}],[{...receipt.checks[0],argv:['node','--version']}],[...receipt.checks,...receipt.checks]]){
  write(root,'.project-init/evidence/latest-checks.json',{...receipt,checks});
  assert.equal(status(root).testEvidenceCurrent,false);
  assert.equal(verifyGuard(root).testsCurrent,false,'guard and status must reject a different command, working directory or incomplete check set');
 }
 write(root,'.project-init/evidence/latest-checks.json',receipt);
 write(root,'work/other/.git','gitdir: synthetic-other-checkout');write(root,'work/other/backend/verify.mjs','');
 assert.throws(()=>validateChecks(root,{schemaVersion:1,checks:[{name:'wrong-root',argv:['node','verify.mjs'],cwd:'work/other/backend'}]}),/another Git worktree/);
 assert.throws(()=>validateChecks(root,{schemaVersion:1,checks:[{name:'escape',argv:['node','--version'],cwd:'../'}]}),/Invalid working directory/);
});

test('Factory runtime updates and linked worktrees do not invalidate the parent source fingerprint',t=>{
 const root=fixture(t);git(root,'add','.');git(root,'commit','-qm','Synthetic baseline');
 const child=path.join(root,'work','tutor-v2');git(root,'worktree','add','-qb','synthetic-tutor',child);
 const before=sourceSnapshot(root).hash;
 write(root,'factory/board.json',{updated:'fixture',jobs:[]});write(root,'factory/jobs/001-example/log.txt','fixture runtime log');
 write(root,'factory/board.json.unique.tmp','fixture temporary state');write(child,'test.mjs','// another worktree change\n');
 assert.equal(sourceSnapshot(root).hash,before);
 write(root,'test.mjs','// actual source change\n');assert.notEqual(sourceSnapshot(root).hash,before);
});

test('registered worktree aliases identify the same checkout without excluding unrelated source',t=>{
 const root=fixture(t);git(root,'add','.');git(root,'commit','-qm','Synthetic alias baseline');
 const child=path.join(root,'work','tutor-v2');git(root,'worktree','add','-qb','synthetic-alias-tutor',child);
 const alias=directoryAlias(t,root);
 const metadata=path.resolve(child,git(child,'rev-parse','--git-dir'));
 // Model Git reporting another filesystem spelling of the same checkout, as
 // short/long Windows paths do. The scanned checkout itself is not a link.
 // Git metadata uses forward slashes, including on Windows. Backslashes here
 // can make Git report the .git file as the worktree instead of its directory.
 const registeredGitdir=path.join(alias,'work','tutor-v2','.git').split(path.sep).join('/');
 write(metadata,'gitdir',registeredGitdir+'\n');
 const listing=git(root,'worktree','list','--porcelain','-z');
 const context=worktreeContext(child);
 const failureContext=JSON.stringify({child,registeredGitdir,listing,otherWorktrees:context.otherWorktrees});
 const registeredPaths=listing.split('\0').filter(field=>field.startsWith('worktree ')).map(field=>field.slice(9));
 assert.equal(registeredPaths.length,2,`fixture must register exactly two checkouts: ${failureContext}`);
 for(const registered of registeredPaths)assert.ok(fs.statSync(registered).isDirectory(),`Git must report an existing checkout directory: ${failureContext}`);
 assert.equal(context.otherWorktrees.length,1,`the aliased current checkout must not be listed as another worktree: ${failureContext}`);
 const before=sourceSnapshot(root).hash;
 write(child,'test.mjs','// registered checkout change\n');
 assert.equal(sourceSnapshot(root).hash,before);
 write(root,'components/embedded/.git','gitdir: synthetic-unregistered-repository');
 write(root,'components/embedded/code.js','before');
 const embeddedBefore=sourceSnapshot(root).hash;
 write(root,'components/embedded/code.js','after');
 assert.notEqual(sourceSnapshot(root).hash,embeddedBefore,'an unrelated nested repository is still application source');
 assert.throws(()=>projectRoot(alias),/Symbolic-link\/reparse-point path refused/,'filesystem identity does not relax project-root link refusal');
});

test('state accepts another spelling of the same existing checkout and rejects an actual relocation',t=>{
 const root=fixture(t),alias=directoryAlias(t,root),state=readState(root);
 write(root,'.project-init/project.json',{...state,projectPath:alias});
 assert.equal(readState(root).projectPath,alias);
 const different=fixture(t);
 write(different,'.project-init/project.json',{...state,projectPath:alias});
 assert.throws(()=>readState(different),/Invalid or relocated Project Init/);
 assert.throws(()=>projectRoot(alias),/Symbolic-link\/reparse-point path refused/);
});

test('ordinary nested repositories remain in the source fingerprint',t=>{
 const root=fixture(t);write(root,'components/embedded/.git','gitdir: synthetic-submodule');write(root,'components/embedded/code.js','before');
 const before=sourceSnapshot(root).hash;write(root,'components/embedded/code.js','after');assert.notEqual(sourceSnapshot(root).hash,before);
});

test('tracked vendored source remains fingerprinted while generated dependency folders are excluded',t=>{
 const root=fixture(t);write(root,'vendor/product/worker.py','before');git(root,'add','vendor/product/worker.py');
 const before=sourceSnapshot(root).hash;write(root,'vendor/product/worker.py','after');assert.notEqual(sourceSnapshot(root).hash,before);
 const after=sourceSnapshot(root).hash;write(root,'node_modules/fixture/ignored.js','dependency output');assert.equal(sourceSnapshot(root).hash,after);
});

test('a check that changes source cannot claim passing evidence for its resulting source',async t=>{
 const root=fixture(t);prepareProject(root,{apply:true});
 write(root,'mutating-check.mjs',"import fs from 'node:fs';fs.writeFileSync('test.mjs','// changed during verification');\n");
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'test',argv:['node','mutating-check.mjs']}]});
 establishBaseline(root,['specs/001-example/spec.md']);
 const result=await runChecks(root,{execute:true});assert.equal(result.checks[0].exitCode,0);assert.equal(result.sourceChanged,true);assert.equal(result.passed,false);
 assert.equal(status(root).testEvidenceCurrent,false);
});

test('a failed check launch replaces old passing evidence with an explicit failure',async t=>{
 const root=fixture(t);prepareProject(root,{apply:true});
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'test',argv:['npm','--version']}]});
 establishBaseline(root,['specs/001-example/spec.md']);
 assert.equal((await runChecks(root,{execute:true})).passed,true);
 const prior=process.env.PATH;process.env.PATH='';
 try{const result=await runChecks(root,{execute:true});assert.equal(result.passed,false);assert.equal(result.checks[0].exitCode,127);}
 finally{process.env.PATH=prior;}
 assert.equal(status(root).testEvidenceCurrent,false);
});

test('an isolated worktree can prepare its own existing feature without inheriting approval',t=>{
 const root=fixture(t);prepareProject(root,{apply:true});accept(root);git(root,'add','.');git(root,'commit','-qm','Synthetic baseline');
 const child=path.join(root,'work','tutor-v2');git(root,'worktree','add','-qb','feature/example',child);
 const before=stateBytes(root);
 const preview=prepareProject(child);assert.equal(preview.initialized,false);assert.equal(preview.framework,'spec-kit');assert.equal(fs.existsSync(path.join(child,'.project-init')),false);
 const result=prepareProject(child,{apply:true});assert.equal(result.initialized,true);assert.equal(result.approved,false);assert.equal(result.status,'review-required');
 assert.equal(fs.existsSync(statePath(child,'approval.json')),false);assert.equal(stateBytes(root),before);
});

test('local native ownership wins over a different framework selected in another worktree',t=>{
 const root=fixture(t,{initialized:false});initProject(root,{mode:'Existing',ui:'no'});selectFramework(root,'none');
 git(root,'add','.');git(root,'commit','-qm','Synthetic baseline');
 const child=path.join(root,'work','tutor-v2');git(root,'worktree','add','-qb','feature/example',child);
 assert.equal(preparationPlan(child).framework,'spec-kit');
});

// Mirrors a Claude Code session worktree: Project Init, Spec Kit and Factory files are
// untracked in the initialized checkout, so a fresh linked worktree receives none of them.
function untrackedStateCheckout(t){
 const root=fixture(t,{feature:false});
 git(root,'add','.');git(root,'rm','-r','-q','--cached','.specify');git(root,'commit','-qm','Synthetic baseline');
 write(root,'factory/board.json',{jobs:[]});
 return root;
}

test('a stateless linked worktree is blocked and pointed at the initialized checkout',t=>{
 const root=untrackedStateCheckout(t);
 const child=path.join(root,'work','claude-session');git(root,'worktree','add','-qb','claude/session',child);
 const result=status(child);
 assert.equal(result.initialized,false);
 assert.equal(result.blocked?.reason,'linked-worktree-without-state');
 assert.ok(sameExistingPath(result.blocked.stateOrigin,root));
 assert.ok(sameExistingPath(result.blocked.factoryBoard,path.join(root,'factory','board.json')));
 assert.match(result.blocked.next.join('\n'),/Never copy, recreate or improvise/);
 const cli=spawnSync(process.execPath,[path.resolve('bin/project-init.mjs'),'status','--project',child,'--json'],{encoding:'utf8'});
 assert.equal(cli.status,1,cli.stderr);
 assert.equal(JSON.parse(cli.stdout).blocked.reason,'linked-worktree-without-state');
 assert.equal(fs.existsSync(path.join(child,'.project-init')),false);
});

test('registered Factory worktrees and repositories without an initialized checkout are not blocked',t=>{
 const root=untrackedStateCheckout(t);
 const worker=path.join(root,'.project-init','worktrees','001-example','claude');git(root,'worktree','add','-qb','factory/001-example-claude',worker);
 assert.equal(status(worker).blocked,null);
 const fresh=fixture(t,{initialized:false,feature:false});
 assert.equal(status(fresh).blocked,null);
});

test('a linked worktree that owns its native feature is not blocked',t=>{
 const root=fixture(t);git(root,'add','.');git(root,'commit','-qm','Synthetic baseline');
 const child=path.join(root,'work','tutor-v2');git(root,'worktree','add','-qb','feature/example',child);
 assert.equal(status(child).blocked,null);
});
