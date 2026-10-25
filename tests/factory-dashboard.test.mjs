import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initProject,selectFramework,statePath} from '../lib/core.mjs';
import {applyFactory,factoryPlan,factoryRuntimeStatus} from '../lib/factory.mjs';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const boardHelper=path.join(sourceRoot,'vendor/factory/claude/skill/scripts/board.py');
const dashboardSource=fs.readFileSync(path.join(sourceRoot,'vendor/factory/runtime/dashboard.html'),'utf8');
const python=process.platform==='win32'?'python':'python3';

function fixture(t){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-factory-board-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'repo');
 initProject(root,{mode:'New',ui:'no',intent:'automation'});
 selectFramework(root,'none');
 const git=spawnSync('git',['init','-q'],{cwd:root,encoding:'utf8'});
 assert.equal(git.status,0,git.stderr||git.error?.message);
 return {root,boardPath:path.join(root,'factory','board.json')};
}

function fixtureJob(){
 return {id:'001-synthetic-regression-job',title:'Synthetic test fixture; no real worker ran',source:'idea',stage:'spec',round:0,risk:null,risk_files:[],reviews:{},rounds:[],workers:{codex:{state:'pending'},claude:{state:'pending'}},notes:{},created:'2026-01-01T00:00:00Z',updated:'2026-01-01T00:00:00Z'};
}
function boardBytes(jobs=[]){return JSON.stringify({updated:'2026-01-01T00:00:00Z',jobs,fixture:'synthetic regression data'},null,4)+'\n';}
function writeBoard(file,content){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
function helper(root,...args){return spawnSync(python,[boardHelper,...args],{cwd:root,encoding:'utf8'});}
function assertBoardLocation(stdout,root){
 const reported=stdout.match(/^board=(.+?) state=(missing|empty) checkout=(.+)$/m);
 assert.ok(reported,`Missing board/checkout location in status output: ${stdout}`);
 const reportedBoard=reported[1],reportedRoot=reported[3];
 const expectedRoot=fs.realpathSync(root);
 const detail=JSON.stringify({reportedRoot,reportedBoard,expectedRoot,stdout});
 assert.equal(path.isAbsolute(reportedRoot),true,detail);
 assert.equal(path.isAbsolute(reportedBoard),true,detail);
 assert.equal(path.relative(expectedRoot,fs.realpathSync(reportedRoot)),'',`Status identifies a different checkout: ${detail}`);
 assert.equal(path.relative(expectedRoot,reportedRoot),'',`Status must report the canonical checkout path: ${detail}`);
 assert.equal(path.relative(reportedRoot,reportedBoard),path.join('factory','board.json'),`Board is not under the reported checkout: ${detail}`);
 if(fs.existsSync(reportedBoard))assert.equal(path.relative(fs.realpathSync(path.join(root,'factory','board.json')),fs.realpathSync(reportedBoard)),'',`Status identifies a different board file: ${detail}`);
}

test('Factory preview and runtime inspection identify an absent board without writing state',t=>{
 const {root,boardPath}=fixture(t);
 const before=fs.readFileSync(statePath(root,'audit.jsonl'),'utf8');
 const plan=factoryPlan(root);
 assert.equal(plan.ready,true,'a missing board is an installation action, not an invalid kit');
 assert.equal(plan.runtimeBoard.state,'missing');
 assert.equal(plan.runtimeBoard.boardPath,boardPath);
 assert.equal(plan.runtimeBoard.jobCount,null,'missing is not a verified empty board');
 assert.equal(applyFactory(root).applied,false);
 assert.equal(factoryRuntimeStatus(root).state,'missing');
 assert.equal(fs.existsSync(path.join(root,'factory')),false);
 assert.equal(fs.readFileSync(statePath(root,'audit.jsonl'),'utf8'),before);
});

test('explicit Factory apply creates an empty board and repeated apply preserves it byte for byte',t=>{
 const {root,boardPath}=fixture(t);
 const installed=applyFactory(root,{apply:true});
 assert.equal(installed.boardInitialization.created,true);
 assert.equal(installed.runtimeBoard.state,'empty');
 assert.equal(installed.runtimeBoard.jobCount,0);
 assert.deepEqual(JSON.parse(fs.readFileSync(boardPath,'utf8')).jobs,[]);
 assert.deepEqual(fs.readdirSync(path.join(root,'factory','jobs')),[]);
 const before=fs.readFileSync(boardPath,'utf8'),mtime=fs.statSync(boardPath).mtimeMs;
 const repeated=applyFactory(root,{apply:true});
 assert.equal(repeated.boardInitialization.created,false);
 assert.equal(repeated.boardInitialization.action,'preserved');
 assert.equal(fs.readFileSync(boardPath,'utf8'),before);
 assert.equal(fs.statSync(boardPath).mtimeMs,mtime);
 assert.deepEqual(fs.readdirSync(path.dirname(boardPath)).filter(name=>name.endsWith('.tmp')),[]);
});

test('Factory upgrade preserves populated board history and unknown user fields',t=>{
 const {root,boardPath}=fixture(t);
 const original=boardBytes([fixtureJob()]);
 writeBoard(boardPath,original);
 const installed=applyFactory(root,{apply:true});
 assert.equal(installed.boardInitialization.action,'preserved');
 assert.equal(installed.runtimeBoard.state,'ready');
 assert.equal(installed.runtimeBoard.jobCount,1);
 assert.equal(fs.readFileSync(boardPath,'utf8'),original);
});

test('Factory apply never replaces a board created after its initial inspection',t=>{
 const {root,boardPath}=fixture(t);
 const original=boardBytes([fixtureJob()]),link=fs.linkSync;
 t.mock.method(fs,'linkSync',(source,target)=>{
  if(target===boardPath)fs.writeFileSync(boardPath,original,{flag:'wx'});
  return link(source,target);
 });
 const installed=applyFactory(root,{apply:true});
 assert.equal(installed.boardInitialization.created,false);
 assert.equal(installed.runtimeBoard.jobCount,1);
 assert.equal(fs.readFileSync(boardPath,'utf8'),original);
 assert.deepEqual(fs.readdirSync(path.dirname(boardPath)).filter(name=>name.endsWith('.tmp')),[]);
});

test('malformed existing boards block apply before tooling writes and remain intact',t=>{
 const {root,boardPath}=fixture(t);
 for(const original of ['{broken',JSON.stringify({jobs:{}}),JSON.stringify({jobs:[null]}),JSON.stringify({jobs:[{...fixtureJob(),id:"001-job');alert(1)//"}]}),JSON.stringify({jobs:[fixtureJob(),fixtureJob()]})]){
  writeBoard(boardPath,original);
  const state=factoryRuntimeStatus(root);
  assert.equal(state.state,'invalid');
  assert.equal(state.blocksApply,true);
  assert.equal(factoryPlan(root).ready,false);
  assert.throws(()=>applyFactory(root,{apply:true}),/(Cannot read Factory board|invalid jobs schema)/);
  assert.equal(fs.readFileSync(boardPath,'utf8'),original);
  assert.equal(fs.existsSync(path.join(root,'.claude')),false);
 }
});

test('a directory at the board path is reported without replacement',t=>{
 const {root,boardPath}=fixture(t);
 fs.mkdirSync(boardPath,{recursive:true});
 assert.equal(factoryRuntimeStatus(root).state,'invalid');
 assert.throws(()=>applyFactory(root,{apply:true}),/not a regular file/);
 assert.equal(fs.statSync(boardPath).isDirectory(),true);
});

test('board helper status reports the local path without creating or changing board state',t=>{
 const {root,boardPath}=fixture(t);
 const missing=helper(root,'status');
 assert.equal(missing.status,0,missing.stderr||missing.error?.message);
 assert.match(missing.stdout,/no jobs/);
 assert.match(missing.stdout,/state=missing/);
 assertBoardLocation(missing.stdout,root);
 assert.equal(fs.existsSync(boardPath),false);
 applyFactory(root,{apply:true});
 const bytes=fs.readFileSync(boardPath,'utf8');
 const empty=helper(root,'status');
 assert.equal(empty.status,0,empty.stderr);
 assert.match(empty.stdout,/state=empty/);
 assertBoardLocation(empty.stdout,root);
 assert.equal(fs.readFileSync(boardPath,'utf8'),bytes);
});

test('board helper canonicalizes a filesystem alias returned by Git before reporting state',t=>{
 const {root,boardPath}=fixture(t);
 const alias=path.join(path.dirname(root),'checkout-alias');
 fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
 const probe=`import runpy, subprocess, sys
from unittest.mock import patch
with patch('subprocess.run', return_value=subprocess.CompletedProcess([], 0, stdout=sys.argv[2] + '\\n', stderr='')):
    module = runpy.run_path(sys.argv[1], run_name='factory_board_fixture')
module['cmd_status']([])
`;
 const result=spawnSync(python,['-c',probe,boardHelper,alias],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.error?.message);
 assertBoardLocation(result.stdout,root);
 assert.equal(fs.existsSync(boardPath),false,'status remains read-only while resolving the checkout identity');
});

test('board helper registers a real fixture job and refuses corrupt existing state',t=>{
 const {root,boardPath}=fixture(t);
 applyFactory(root,{apply:true});
 const created=helper(root,'init','Synthetic regression fixture');
 assert.equal(created.status,0,created.stderr||created.error?.message);
 assert.match(created.stdout,/^001-synthetic-regression-fixture\s*$/);
 assert.equal(factoryRuntimeStatus(root).jobCount,1);
 assert.equal(factoryRuntimeStatus(root).state,'ready');
 const original='{broken';fs.writeFileSync(boardPath,original);
 const refused=helper(root,'init','Must not replace history');
 assert.notEqual(refused.status,0);
 assert.match(refused.stdout,/Cannot read Factory board/);
 assert.equal(fs.readFileSync(boardPath,'utf8'),original);
});

async function dashboard(initialResponse){
 const elements=new Map();
 for(const id of ['live','meta','notice','board','panel','ptitle','ptabs','pbody']){
  const classes=new Set();
  elements.set(id,{textContent:'',innerHTML:'',className:'',dataset:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}});
 }
 let response=initialResponse,interval;
 const context=vm.createContext({
  document:{getElementById:id=>elements.get(id),addEventListener:()=>{}},
  fetch:async()=>{if(response instanceof Error)throw response;return response;},
  setInterval:(fn,ms)=>{interval={fn,ms};}
 });
 const script=dashboardSource.match(/<script>([\s\S]*?)<\/script>/)[1];
 vm.runInContext(script,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {elements,interval,async poll(next){response=next;await context.poll();}};
}
const jsonResponse=data=>({ok:true,status:200,json:async()=>data});

test('dashboard renders an installed empty board without inventing worker progress',async()=>{
 const ui=await dashboard(jsonResponse({jobs:[],updated:'test-fixture'}));
 assert.equal(ui.elements.get('notice').dataset.state,'empty');
 assert.match(ui.elements.get('notice').textContent,/No Factory jobs registered/);
 assert.match(ui.elements.get('meta').textContent,/0 jobs/);
 assert.match(ui.elements.get('board').innerHTML,/Parallel build/);
 assert.equal(ui.interval.ms,3000);
});

test('dashboard distinguishes missing board, access errors, server failures and connection failure',async()=>{
 const ui=await dashboard({ok:false,status:404});
 assert.equal(ui.elements.get('notice').dataset.state,'missing');
 assert.match(ui.elements.get('notice').textContent,/server is responding/);
 assert.match(ui.elements.get('notice').textContent,/worktree/);
 assert.doesNotMatch(ui.elements.get('notice').textContent,/http\.server/);
 await ui.poll({ok:false,status:403});
 assert.equal(ui.elements.get('notice').dataset.state,'http');
 assert.match(ui.elements.get('notice').textContent,/denied \(HTTP 403\)/);
 await ui.poll({ok:false,status:500});
 assert.match(ui.elements.get('notice').textContent,/HTTP 500/);
 await ui.poll(new Error('synthetic connection failure'));
 assert.equal(ui.elements.get('notice').dataset.state,'connection');
 assert.match(ui.elements.get('notice').textContent,/Unable to connect/);
});

test('dashboard hides stale jobs on failed or malformed refresh and recovers on a valid board',async()=>{
 const data={jobs:[fixtureJob()],updated:'test-fixture'};
 const ui=await dashboard(jsonResponse(data));
 assert.equal(ui.elements.get('notice').dataset.state,'ready');
 assert.match(ui.elements.get('board').innerHTML,/Synthetic test fixture/);
 await ui.poll({ok:false,status:404});
 assert.equal(ui.elements.get('board').innerHTML,'');
 assert.equal(ui.elements.get('live').className,'dot off');
 await ui.poll({ok:true,status:200,json:async()=>{throw new SyntaxError('synthetic malformed JSON');}});
 assert.equal(ui.elements.get('notice').dataset.state,'invalid');
 assert.match(ui.elements.get('notice').textContent,/Preserve the file/);
 await ui.poll(jsonResponse({jobs:[{...fixtureJob(),rounds:'invalid'}]}));
 assert.equal(ui.elements.get('notice').dataset.state,'invalid');
 await ui.poll(jsonResponse(data));
 assert.equal(ui.elements.get('notice').dataset.state,'ready');
 assert.match(ui.elements.get('board').innerHTML,/001-synthetic-regression-job/);
});
