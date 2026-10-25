import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {initProject,selectFramework,statePath,readJson,recordReview,approve} from '../lib/core.mjs';
import {prepareProject} from '../lib/prepare.mjs';

const specPath='specs/001-existing/spec.md';
const custom={name:'focused-regression',argv:['node','--test','test.mjs'],owner:'maintainer'};
const requirement=check=>({id:'FR-001',specPath,checks:[check],visualCases:[]});
function write(root,file,data){
 fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
 fs.writeFileSync(path.join(root,file),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
}
function fixture(t,{nativeCheck}={}){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-check-overrides-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const initialized=spawnSync('git',['init','-q'],{cwd:root,encoding:'utf8'});
 assert.equal(initialized.status,0,initialized.stderr||initialized.error?.message);
 write(root,'package.json',{name:'synthetic-override-fixture',private:true,packageManager:'pnpm@10.0.0',scripts:{'test:all':'pnpm -r run test',build:'node --check implementation.mjs'}});
 write(root,'.specify/memory/constitution.md','# Synthetic fixture\n');
 write(root,specPath,`# Existing feature\n- **FR-001**: Existing required behavior.${nativeCheck?' checks: '+nativeCheck:''}\n`);
 write(root,'test.mjs',"import {test} from 'node:test';test('synthetic behavior',()=>{});\n");
 write(root,'implementation.mjs','export const fixture = true;\n');
 initProject(root,{mode:'Existing',intent:'feature',ui:'no'});selectFramework(root,'spec-kit');
 return root;
}
function configure(root,check=custom){
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[check],description:'Preserve this custom configuration'});
 write(root,'.project-init/requirements.json',{schemaVersion:1,requirements:[requirement(check.name)]});
}
function stateBytes(root){
 const base=statePath(root,'.'),files=[];
 const visit=folder=>{for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())visit(file);else files.push([path.relative(base,file),fs.readFileSync(file,'utf8')]);}};
 visit(base);return JSON.stringify(files.sort(([a],[b])=>a.localeCompare(b)));
}

test('mapped manual checks resolve unsupported aggregate discovery without replacing custom configuration',t=>{
 const root=fixture(t);configure(root);
 const before=stateBytes(root),preview=prepareProject(root);
 assert.equal(preview.readyForBaseline,true);assert.equal(preview.discoveryResolutions.length,1);
 assert.deepEqual(preview.discoveryResolutions[0].checks,[custom.name]);
 assert.equal(stateBytes(root),before,'preview cannot persist command provenance or configuration');
 const applied=prepareProject(root,{apply:true});
 assert.equal(applied.status,'review-required');assert.equal(applied.baseline.current,true);
 const config=readJson(statePath(root,'config.json'));
 assert.deepEqual(config.checks.find(check=>check.name===custom.name),custom);
 assert.equal(config.description,'Preserve this custom configuration');
 assert.deepEqual(readJson(statePath(root,'preparation.json')).automaticChecks,[{name:'build',argv:['pnpm','run','build'],cwd:'.'}]);
});

test('supplied mapped check commands are explicit alternatives and remain explicit on resume',t=>{
 const root=fixture(t);
 write(root,'.project-init/mapping-input.json',{schemaVersion:1,checks:[custom],requirements:[requirement(custom.name)]});
 const first=prepareProject(root,{mapping:'.project-init/mapping-input.json',apply:true});
 assert.equal(first.readyForBaseline,true);assert.equal(first.baseline.current,true);
 assert.deepEqual(first.discoveryResolutions[0].checks,[custom.name]);
 const second=prepareProject(root,{apply:true});
 assert.equal(second.readyForBaseline,true);assert.deepEqual(second.changed,[]);
 assert.deepEqual(second.discoveryResolutions[0].checks,[custom.name]);
});

test('persisting a partial automatic proposal never resolves unsupported routing on a later apply',t=>{
 const root=fixture(t,{nativeCheck:'build'});
 for(let i=0;i<3;i++){
  const result=prepareProject(root,{apply:true});
  assert.equal(result.readyForBaseline,false);assert.equal(result.discoveryResolutions.length,0);
  assert.ok(result.blockers.some(item=>item.id==='check-discovery'&&item.message.includes('aggregate routing')));
  assert.deepEqual(result.automaticChecks,[{name:'build',argv:['pnpm','run','build'],cwd:'.'}]);
  assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
 }
 // A deliberate selection of the same discovered command is distinct from
 // silently adopting it just because the previous partial apply wrote it.
 write(root,'.project-init/mapping-input.json',{schemaVersion:1,checks:[{name:'build',argv:['pnpm','run','build'],cwd:'.'}],requirements:[requirement('build')]});
 const explicit=prepareProject(root,{mapping:'.project-init/mapping-input.json',apply:true});
 assert.equal(explicit.readyForBaseline,true);assert.deepEqual(explicit.automaticChecks,[]);
 assert.equal(prepareProject(root,{apply:true}).readyForBaseline,true);
});

test('an unmapped manual command does not resolve an unsupported aggregate',t=>{
 const root=fixture(t,{nativeCheck:'build'});
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[custom]});
 const result=prepareProject(root,{apply:true});
 assert.equal(result.readyForBaseline,false);assert.equal(result.discoveryResolutions.length,0);
 assert.ok(result.blockers.some(item=>item.id==='check-discovery'));
});

test('relabeling the unresolved aggregate is not an explicit alternative command',t=>{
 const root=fixture(t);configure(root,{name:'renamed-aggregate',argv:['pnpm','run','test:all','--','--ci']});
 const result=prepareProject(root,{apply:true});
 assert.equal(result.readyForBaseline,false);assert.equal(result.discoveryResolutions.length,0);
 assert.ok(result.blockers.some(item=>item.id==='check-discovery'));
 assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
});

test('explicit alternatives never override package-manager and lockfile conflicts',t=>{
 const root=fixture(t);configure(root);write(root,'yarn.lock','# Synthetic conflicting manager\n');
 write(root,'.project-init/mapping-input.json',{schemaVersion:1,checks:[custom],requirements:[requirement(custom.name)]});
 for(const options of [{mapping:'.project-init/mapping-input.json',apply:true},{apply:true}]){
  const result=prepareProject(root,options);
  assert.equal(result.readyForBaseline,false);
  assert.ok(result.blockers.some(item=>item.id==='check-discovery'&&item.message.includes('conflicting packageManager/lockfiles')));
  assert.equal(fs.existsSync(statePath(root,'baseline.json')),false);
 }
});

test('conflicting explicit commands fail before mutating an existing same-name check or mapping',t=>{
 const root=fixture(t);configure(root);
 write(root,'.project-init/mapping-input.json',{schemaVersion:1,checks:[{name:custom.name,argv:['node','--test','other.mjs']}],requirements:[requirement(custom.name)]});
 const before=stateBytes(root);
 assert.throws(()=>prepareProject(root,{mapping:'.project-init/mapping-input.json',apply:true}),/Explicit check focused-regression conflicts with its configured command/);
 assert.equal(stateBytes(root),before);
});

test('resolved explicit discovery selection preserves current review, approval and state bytes',t=>{
 const root=fixture(t);configure(root);prepareProject(root,{apply:true});
 recordReview(root,{actor:'SYNTHETIC_REVIEWER',evidence:'Synthetic independent fixture review'});
 approve(root,{actor:'SYNTHETIC_OWNER',evidence:'Synthetic fixture baseline approval'});
 const before=stateBytes(root),result=prepareProject(root,{apply:true});
 assert.equal(result.status,'prepared');assert.equal(result.approved,true);
 assert.deepEqual(result.changed,[]);assert.equal(stateBytes(root),before);
});
