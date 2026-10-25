import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 initProject,selectFramework,establishBaseline,checkBaseline,recordReview,approve,
 statePath,hashBytes,sourceSnapshot,nativeTextRepresentation
} from '../lib/core.mjs';

const specPath='specs/existing-feature.md';
const mode='utf8-crlf-lf-v1';
function write(root,file,value){
 const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,typeof value==='string'||value instanceof Uint8Array?value:JSON.stringify(value,null,2)+'\n');
}
function fixture(t,{ui=false}={}){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-native-text-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 initProject(root,{mode:'New',ui:ui?'yes':'no'});selectFramework(root,'none');
 const lf=Buffer.from('# Existing native feature\n- **FR-001**: Preserve the approved behavior.\n');
 const crlf=Buffer.from(lf.toString('utf8').replaceAll('\n','\r\n'));
 write(root,specPath,lf);
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'fixture-check',argv:['node','--version']}]});
 write(root,'.project-init/requirements.json',{schemaVersion:1,requirements:[{id:'FR-001',specPath,checks:['fixture-check'],visualCases:[]}]});
 if(ui){
  write(root,'.project-init/ui-design.json',JSON.parse(fs.readFileSync(new URL('../examples/ui-design.example.json',import.meta.url),'utf8')));
  write(root,'.project-init/visual-cases.json',{schemaVersion:1,cases:[{id:'fixture-reference',reference:'.project-init/visual/baselines/fixture-reference.png'}]});
  write(root,'.project-init/visual/baselines/fixture-reference.png',Buffer.from([137,80,78,71,13,10,26,10]));
 }
 const baseline=establishBaseline(root,[specPath]);
 recordReview(root,{actor:'SYNTHETIC_REVIEWER',evidence:'Synthetic independent fixture review'});
 approve(root,{actor:'SYNTHETIC_OWNER',evidence:'Synthetic baseline approval'});
 const proof={path:specPath,mode,approvedSha256:hashBytes(lf),actualSha256:hashBytes(crlf)};
 const origin={schemaVersion:1,project:root,job:'001-synthetic-fixture',baselineHash:baseline.hash,nativeTextRepresentations:[proof]};
 return {root,lf,crlf,baseline,proof,origin};
}

test('native text proofs cover only exact valid UTF-8 LF and CRLF representations',()=>{
 const lf=Buffer.from('\uFEFF# Café and 日本語\n\tKeep spaces  \n');
 const crlf=Buffer.from(lf.toString('utf8').replaceAll('\n','\r\n'));
 for(const extension of ['md','markdown','txt','MD']){
  const file=`specs/feature.${extension}`;
  assert.deepEqual(nativeTextRepresentation(file,crlf,hashBytes(lf)),{path:file,mode,approvedSha256:hashBytes(lf),actualSha256:hashBytes(crlf)});
  assert.deepEqual(nativeTextRepresentation(file,lf,hashBytes(crlf)),{path:file,mode,approvedSha256:hashBytes(crlf),actualSha256:hashBytes(lf)});
  assert.equal(nativeTextRepresentation(file,lf,hashBytes(lf)),null);
 }
});

test('native text proofs reject unsupported bytes, lone CR, mixed line endings and real content changes',()=>{
 const lf=Buffer.from('# Approved\nKeep text  \n'),approved=hashBytes(lf);
 const invalid=[
  Buffer.from('# Approved\nChanged text  \n'),
  Buffer.from('# Approved\nKeep text\n'),
  Buffer.from('# Approved\nKeep text  '),
  Buffer.from('\uFEFF# Approved\nKeep text  \n'),
  Buffer.from('# Approved\rKeep text  \r'),
  Buffer.from('# Approved\r\nKeep text  \n'),
  Buffer.from('# Approved\r\nKeep text\0  \r\n'),
  Buffer.from([0x23,0x20,0xc3,0x28,0x0d,0x0a])
 ];
 for(const bytes of invalid)assert.equal(nativeTextRepresentation(specPath,bytes,approved),null);
 const crlf=Buffer.from(lf.toString('utf8').replaceAll('\n','\r\n'));
 for(const file of ['source.js','state.json','image.png'])assert.equal(nativeTextRepresentation(file,crlf,approved),null);
 assert.equal(nativeTextRepresentation(specPath,crlf,'invalid-sha'),null);
});

test('native newline changes stay stale without exact Factory provenance',t=>{
 const {root,crlf}=fixture(t);write(root,specPath,crlf);
 const result=checkBaseline(root);
 assert.equal(result.current,false);assert.deepEqual(result.modified,[specPath]);
 assert.deepEqual(result.nativeTextRepresentations,[]);
 assert.equal(fs.existsSync(statePath(root,'factory-origin.json')),false);
});

test('validated Factory representation preserves exact approval, baseline, native bytes and raw source hashing',t=>{
 const {root,lf,crlf,origin,proof}=fixture(t);
 const originalSource=sourceSnapshot(root).hash;
 const baselineBytes=fs.readFileSync(statePath(root,'baseline.json'));
 const approvalBytes=fs.readFileSync(statePath(root,'approval.json'));
 write(root,specPath,crlf);write(root,'.project-init/factory-origin.json',origin);
 const crlfSource=sourceSnapshot(root).hash;
 assert.notEqual(crlfSource,originalSource,'source hashing must remain byte-exact');
 const result=checkBaseline(root);
 assert.equal(result.current,true);assert.deepEqual(result.modified,[]);
 assert.deepEqual(result.nativeTextRepresentations,[proof]);
 assert.deepEqual(fs.readFileSync(path.join(root,specPath)),crlf);
 assert.deepEqual(fs.readFileSync(statePath(root,'baseline.json')),baselineBytes);
 assert.deepEqual(fs.readFileSync(statePath(root,'approval.json')),approvalBytes);
 assert.equal(sourceSnapshot(root).hash,crlfSource);
 // An old proof is unnecessary once the original approved bytes return.
 write(root,specPath,lf);
 const restored=checkBaseline(root);
 assert.equal(restored.current,true);assert.deepEqual(restored.nativeTextRepresentations,[]);
 assert.equal(sourceSnapshot(root).hash,originalSource);
});

test('wrong baseline, path, digest, mode or duplicate records cannot grant an exception',t=>{
 const {root,crlf,origin,proof}=fixture(t);write(root,specPath,crlf);
 const changes=[
  {schemaVersion:2},
  {baselineHash:'a'.repeat(64)},
  {nativeTextRepresentations:[{...proof,path:'specs/not-approved.md'}]},
  {nativeTextRepresentations:[{...proof,approvedSha256:'b'.repeat(64)}]},
  {nativeTextRepresentations:[{...proof,actualSha256:'c'.repeat(64)}]},
  {nativeTextRepresentations:[{...proof,mode:'unknown-text-mode'}]},
  {nativeTextRepresentations:[{...proof,unreviewed:true}]},
  {nativeTextRepresentations:[proof,proof]},
  {nativeTextRepresentations:[]}
 ];
 for(const change of changes){
  write(root,'.project-init/factory-origin.json',{...origin,...change});
  const result=checkBaseline(root);
  assert.equal(result.current,false,JSON.stringify(change));
  assert.deepEqual(result.modified,[specPath]);assert.deepEqual(result.nativeTextRepresentations,[]);
 }
});

test('updating a provenance digest cannot excuse a real native specification change',t=>{
 const {root,crlf,origin,proof}=fixture(t);
 const changed=Buffer.from(crlf.toString('utf8').replace('approved behavior','different behavior'));
 write(root,specPath,changed);
 for(const record of [proof,{...proof,actualSha256:hashBytes(changed)}]){
  write(root,'.project-init/factory-origin.json',{...origin,nativeTextRepresentations:[record]});
  const result=checkBaseline(root);
  assert.equal(result.current,false);assert.deepEqual(result.modified,[specPath]);
  assert.deepEqual(result.nativeTextRepresentations,[]);
 }
});

test('Factory text provenance does not relax UI, requirement, configuration or image checks',t=>{
 const {root,crlf,origin,proof,baseline}=fixture(t,{ui:true});
 write(root,specPath,crlf);write(root,'.project-init/factory-origin.json',origin);
 assert.equal(checkBaseline(root).current,true);
 for(const file of ['.project-init/ui-design.json','.project-init/requirements.json','.project-init/visual-cases.json','.project-init/visual/baselines/fixture-reference.png']){
  const original=fs.readFileSync(path.join(root,file));
  const changed=file.endsWith('.png')?Buffer.concat([original,Buffer.from([0])]):Buffer.from(original.toString('utf8').replaceAll('\n','\r\n'));
  write(root,file,changed);
  const forged={path:file,mode,approvedSha256:baseline.files.find(item=>item.path===file).sha256,actualSha256:hashBytes(changed)};
  write(root,'.project-init/factory-origin.json',{...origin,nativeTextRepresentations:[proof,forged]});
  const result=checkBaseline(root);
  assert.equal(result.current,false,file);assert.ok(result.modified.includes(file));
  assert.deepEqual(result.nativeTextRepresentations,[proof]);
  write(root,file,original);
 }
 write(root,'.project-init/factory-origin.json',origin);
 write(root,'.project-init/config.json',{schemaVersion:1,checks:[{name:'fixture-check',argv:['node','--help']}]});
 assert.equal(checkBaseline(root).current,false,'changed check argv must invalidate the approved manifest');
});
