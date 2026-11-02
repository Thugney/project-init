import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bmadLayout,bmadStories,bmadTaskIds} from '../lib/bmad.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=path.join(repoRoot,'tests','fixtures','bmad-v6.12.0');

function project(t){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-bmad-'));
 const root=path.join(base,'project');
 fs.cpSync(fixture,root,{recursive:true});
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 return root;
}

test('bmadLayout resolves the installed v6 manifest and configured artifact folders',t=>{
 const root=project(t),layout=bmadLayout(root);
 assert.equal(layout.adapter,'v6');
 assert.equal(layout.version,'6.12.0');
 assert.equal(layout.planningDir,'_bmad-output/planning-artifacts');
 assert.equal(layout.implementationDir,'_bmad-output/implementation-artifacts');
 assert.equal(layout.sprintStatusFile,'_bmad-output/implementation-artifacts/sprint-status.yaml');
});

test('bmadLayout refuses missing or ambiguous installed configuration',t=>{
 const root=project(t);
 fs.rmSync(path.join(root,'_bmad','_config','manifest.yaml'));
 assert.throws(()=>bmadLayout(root),/BMAD installation manifest is missing/i);
 const second=project(t),config=path.join(second,'_bmad','bmm','config.yaml');
 fs.appendFileSync(config,'planning_artifacts: "{project-root}/elsewhere"\n');
 assert.throws(()=>bmadLayout(second),/duplicate planning_artifacts/i);
});

test('bmadLayout refuses unsupported BMAD major versions and unresolved paths',t=>{
 const root=project(t),manifest=path.join(root,'_bmad','_config','manifest.yaml');
 fs.writeFileSync(manifest,fs.readFileSync(manifest,'utf8').replaceAll('6.12.0','7.0.0'));
 assert.throws(()=>bmadLayout(root),/BMAD v7 is not supported/i);
 const second=project(t),config=path.join(second,'_bmad','bmm','config.yaml');
 fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace('_bmad-output/planning-artifacts','../outside'));
 assert.throws(()=>bmadLayout(second),/must be a project-root-relative path/i);
});

test('bmadStories maps planning records to sprint state and story task files',t=>{
 const root=project(t),stories=bmadStories(root);
 assert.equal(stories.length,2);
 assert.equal(stories[0].id,'1-1-create-fixture-export');
 assert.equal(stories[0].status,'ready-for-dev');
 assert.deepEqual(stories[0].specPaths,[
  '_bmad-output/planning-artifacts/prd.md',
  '_bmad-output/planning-artifacts/architecture.md',
  '_bmad-output/planning-artifacts/epics.md'
 ]);
 assert.equal(stories[0].taskPath,'_bmad-output/implementation-artifacts/1-1-create-fixture-export.md');
 assert.deepEqual(stories[0].taskIds,['Task 1','Subtask 1.1','Task 2']);
 assert.equal(stories[1].status,'in-progress');
});

test('BMAD task IDs follow the installed v6 story checkbox format',()=>{
 const text=['## Tasks / Subtasks','- [x] Task 1 (AC: #1)','  - [ ] Subtask 1.1','- [ ] Task 2 (AC: #2)'].join('\n');
 assert.deepEqual(bmadTaskIds(text),['Task 1','Subtask 1.1','Task 2']);
});

test('bmadStories rejects inconsistent sprint status rather than guessing',t=>{
 const root=project(t),file=path.join(root,'_bmad-output','implementation-artifacts','sprint-status.yaml');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('1-1-create-fixture-export: ready-for-dev','1-1-create-fixture-export: unknown'));
 assert.throws(()=>bmadStories(root),/unsupported BMAD story status/i);
});
