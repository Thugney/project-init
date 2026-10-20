import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initProject,selectFramework,establishBaseline,checkBaseline,statePath,hashFile} from '../lib/core.mjs';
import {renderVisualReview} from '../lib/visual.mjs';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'pinit-review-context-'));initProject(root,{mode:'New',ui:'no'});selectFramework(root,'none');fs.mkdirSync(path.join(root,'specs'));fs.writeFileSync(path.join(root,'specs','counter.md'),'# Counter\nIn-memory count; no network or accounts.\n');return root;}
test('modern review context carries source provenance and its edits invalidate acceptance baseline',()=>{
 const root=fixture();
 try{
  const context={schemaVersion:1,specPaths:['specs/counter.md'],journeys:[{id:'increment',label:'Increment',nodes:[{label:'Activate Increment'},{label:'Count increases'}]}],components:[{id:'browser',label:'Browser',responsibility:'Holds in-memory count'}],permissions:[{role:'Local user',scope:'No accounts or remote data',enforcedAt:'Browser document'}]};
  fs.writeFileSync(statePath(root,'review-context.json'),JSON.stringify(context));
  const baseline=establishBaseline(root,['specs/counter.md']);assert.ok(baseline.files.some(f=>f.path==='.project-init/review-context.json'));
  const rendered=renderVisualReview(root),html=fs.readFileSync(rendered.output,'utf8');
  const data=JSON.parse(html.match(/<script type="application\/json" id="review-data">(.*?)<\/script>/s)[1]);
  assert.equal(data.legacyArchitecture,null);assert.equal(data.reviewArchitecture.components[0].label,'Browser');assert.equal(data.reviewArchitecture.sourceSpecs[0].sha256,hashFile(path.join(root,'specs/counter.md')));
  assert.equal(checkBaseline(root).current,true);
  context.permissions[0].scope='Unexpected remote data';fs.writeFileSync(statePath(root,'review-context.json'),JSON.stringify(context));assert.equal(checkBaseline(root).current,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('review context refuses absent, escaping and unregistered specification sources',()=>{
 const root=fixture();const file=statePath(root,'review-context.json');
 try{
  for(const specPaths of [[],['missing.md'],['../outside.md']]){fs.writeFileSync(file,JSON.stringify({schemaVersion:1,specPaths}));assert.throws(()=>renderVisualReview(root),/specPaths|missing|outside project/i);}
  fs.writeFileSync(path.join(root,'specs','other.md'),'# Unregistered spec');fs.writeFileSync(file,JSON.stringify({schemaVersion:1,specPaths:['specs/other.md']}));assert.throws(()=>establishBaseline(root,['specs/counter.md']),/registered authoritative/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('render never overwrites its authored reference input',()=>{
 const root=fixture();
 try{
  const file=statePath(root,'ui-design.json'),design=JSON.parse(fs.readFileSync(file,'utf8'));design.referenceMockup='.project-init/review.html';fs.writeFileSync(file,JSON.stringify(design));fs.writeFileSync(statePath(root,'review.html'),'<html>Preserve reference</html>');
  assert.throws(()=>renderVisualReview(root),/must not overwrite/);assert.equal(fs.readFileSync(statePath(root,'review.html'),'utf8'),'<html>Preserve reference</html>');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('review flow rejects duplicate components and dangling or unlabeled handoffs',()=>{
 const root=fixture(),file=statePath(root,'review-context.json');
 try{
  const component={id:'browser',label:'Browser'},base={schemaVersion:1,specPaths:['specs/counter.md']};
  for(const context of [
   {...base,components:[component,component]},
   {...base,components:[component],edges:[{from:'browser',to:'missing',label:'Invented destination'}]},
   {...base,components:[component],edges:[{from:'browser',to:'browser'}]}
  ]){fs.writeFileSync(file,JSON.stringify(context));assert.throws(()=>renderVisualReview(root),/component|handoff/i);}
  fs.writeFileSync(file,JSON.stringify({...base,components:[component],edges:[{from:'browser',to:'browser',label:'Update in-memory state'}]}));assert.ok(fs.existsSync(renderVisualReview(root).output));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
