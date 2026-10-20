// Opt-in live acceptance. Uses the host's authenticated Codex; never run by npm test.
// Each invocation requires a NEW disposable directory. No dependencies installed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initProject,selectFramework,establishBaseline,recordReview,approve,runCodex,statePath} from '../lib/core.mjs';

const root=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!process.argv.includes('--approved-disposable-test')) throw Error('Supply a new disposable directory and --approved-disposable-test after actual human approval of this specification.');
function required(name){const index=process.argv.indexOf(name);if(index<0||!process.argv[index+1]||process.argv[index+1].startsWith('--'))throw Error(`Supply ${name} with actual review/approval evidence`);return process.argv[index+1];}
const reviewer=required('--reviewer'),reviewEvidence=required('--review-evidence'),approver=required('--approver'),approvalEvidence=required('--approval-evidence');
assert.equal(fs.existsSync(root),false,'Refuse existing directory');
const write=(file,text)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);};
const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
initProject(root,{mode:'New',intent:'automation',complexity:'small',ui:'no'});
selectFramework(root,'none');
write('AGENTS.md','# Disposable acceptance fixture\nOnly implement src/add.mjs. Read specs/add.md. No other edits, installs, commits, network actions or delegation. The human approved this exact non-UI test specification in the parent session.\n');
write('specs/add.md','# REQ-ADD\nExport add(a,b) from src/add.mjs. Return the arithmetic sum for positive, negative and zero numeric inputs. No UI, dependencies or extra files. Tests are immutable.\n');
write('src/add.mjs',"export function add() { throw new Error('Not implemented'); }\n");
write('tests/add.test.mjs',"import {test} from 'node:test';\nimport assert from 'node:assert/strict';\nimport {add} from '../src/add.mjs';\ntest('positive',()=>assert.equal(add(2,3),5));\ntest('negative',()=>assert.equal(add(-2,-3),-5));\ntest('zero',()=>assert.equal(add(0,0),0));\n");
write('.gitignore','.project-init/\n');
write('.project-init/config.json',JSON.stringify({schemaVersion:1,checks:[{name:'addition',argv:['node','--test','tests/add.test.mjs']}]},null,2));
write('.project-init/requirements.json',JSON.stringify({schemaVersion:1,requirements:[{id:'REQ-ADD',specPath:'specs/add.md',checks:['addition'],visualCases:[]}]},null,2));
git('init','-b','test/disposable-addition');git('config','user.name','Project Init Acceptance Fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','test: establish disposable acceptance fixture');
const before=spawnSync(process.execPath,['--test','tests/add.test.mjs'],{cwd:root,encoding:'utf8'});
fs.writeFileSync(statePath(root,'before-tests.log'),before.stdout+before.stderr);
assert.equal(before.status,1,'Initial stub must fail the fixed tests');
establishBaseline(root,['specs/add.md']);
recordReview(root,{actor:reviewer,evidence:reviewEvidence,verdict:'pass'});
approve(root,{actor:approver,evidence:approvalEvidence});
const result=await runCodex(root,{phase:'implementation',task:'Implement the approved REQ-ADD in src/add.mjs only. Read specs/add.md and tests/add.test.mjs. Export add(a,b) returning a+b. Run the fixed tests. Do not edit other files or evidence. No delegation or external actions.',allowed:['src/add.mjs'],execute:true});
console.log(JSON.stringify({root,result},null,2));
assert.equal(result.status,'code-executed-unverified');
assert.deepEqual(result.changedFiles,['src/add.mjs']);
assert.deepEqual(result.unapprovedFiles,[]);
console.log('LIVE IMPLEMENTATION PASSED; independent source review and final evidence checks still required.');
