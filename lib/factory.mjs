import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readState,projectFile,audit,fail,assertNotLink,discover} from './core.mjs';

const bundledFactoryRoot=fileURLToPath(new URL('../vendor/factory/',import.meta.url));
const bundledCodexSkillsRoot=path.join(bundledFactoryRoot,'codex','skills');
const codexSkills=['factory-worker','factory-audit'];
const gitignoreLines=['factory/jobs/','factory/board.json','factory/board.json.tmp','factory/board.json.*.tmp','.project-init/worktrees/','.project-init/factory-worktrees/'];
const boardStages=new Set(['spec','building','integrating','review','fixing','decision','merged','needs-human','failed']);

function validBoard(board){
 if(!board||typeof board!=='object'||Array.isArray(board)||!Array.isArray(board.jobs)) return false;
 if(board.updated!==undefined&&typeof board.updated!=='string') return false;
 const ids=new Set();
 const reviews=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,verdict])=>/^[a-zA-Z0-9_-]+$/.test(key)&&['pending','PASS','CHANGES'].includes(verdict));
 for(const job of board.jobs){
  if(!job||typeof job!=='object'||Array.isArray(job)||typeof job.id!=='string'||!/^\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.id)||ids.has(job.id)||typeof job.title!=='string'||!boardStages.has(job.stage)||!Number.isInteger(job.round)||job.round<0) return false;
  if(!reviews(job.reviews)||!Array.isArray(job.rounds)||job.rounds.some(round=>!round||!Number.isInteger(round.round)||round.round<0||!reviews(round.reviews))) return false;
  ids.add(job.id);
 }
 return true;
}

// State is local to the orchestration checkout, not inferred from GitHub PRs.
export function factoryRuntimeStatus(root){
 const boardPath=path.resolve(root,'factory','board.json');
 const result={projectRoot:path.resolve(root),boardPath,jobsPath:path.resolve(root,'factory','jobs'),dashboardPath:path.resolve(root,'factory','dashboard.html'),state:'missing',exists:false,jobCount:null,updated:null,blocksApply:false};
 try{
  projectFile(root,'factory/board.json');
  if(!fs.existsSync(boardPath)) return {...result,next:'No Factory board in this checkout. Apply Factory setup here, or use the checkout that owns the existing job.'};
  result.exists=true;
  if(!fs.statSync(boardPath).isFile()) return {...result,state:'invalid',blocksApply:true,error:'Factory board path is not a regular file; existing state was preserved.'};
  let board;
  try{board=JSON.parse(fs.readFileSync(boardPath,'utf8'));}
  catch(error){return {...result,state:error instanceof SyntaxError?'invalid':'unreadable',blocksApply:true,error:`Cannot read Factory board: ${error.message}. Existing state was preserved.`};}
  if(!validBoard(board)) return {...result,state:'invalid',blocksApply:true,error:'Factory board has an invalid jobs schema. Preserve it and inspect the actual orchestration checkout before repairing state.'};
  return {...result,state:board.jobs.length?'ready':'empty',jobCount:board.jobs.length,updated:board.updated||null,next:board.jobs.length?'Resume the existing job using its actual slug.':'No Factory jobs registered in this checkout. Existing PRs and ordinary agent sessions are not automatically Factory jobs.'};
 }catch(error){return {...result,state:'unreadable',blocksApply:true,error:`Cannot access Factory board: ${error.message}. Existing state was preserved.`};}
}

function initializeFactoryBoard(root){
 const before=factoryRuntimeStatus(root);
 if(before.blocksApply) fail(`${before.error} Board: ${before.boardPath}`);
 if(before.exists) return {created:false,action:'preserved',...before};
 fs.mkdirSync(path.dirname(before.boardPath),{recursive:true});
 const temporary=`${before.boardPath}.${crypto.randomUUID()}.tmp`;
 let created=false;
 try{
  // Linking a complete same-directory file publishes it atomically without
  // replacing a board that an orchestrator created after the preview.
  fs.writeFileSync(temporary,JSON.stringify({updated:new Date().toISOString(),jobs:[]},null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  try{fs.linkSync(temporary,before.boardPath);created=true;}
  catch(error){if(error.code!=='EEXIST') throw error;}
 }finally{if(fs.existsSync(temporary)) fs.unlinkSync(temporary);}
 const after=factoryRuntimeStatus(root);
 if(after.blocksApply) fail(`${after.error} Board: ${after.boardPath}`);
 if(after.state==='missing') fail(`Factory board disappeared during setup: ${after.boardPath}. Check the orchestration checkout; no replacement history was written.`);
 if(created) audit(root,'factory-board-initialized',{boardPath:'factory/board.json',jobs:0});
 return {created,action:created?'created':'preserved',...after};
}

function text(file){assertNotLink(file);return fs.readFileSync(file,'utf8');}
function sameContent(file,content){return fs.existsSync(file)&&text(file)===content;}
function ensurePlainDir(dir,label){
 const resolved=path.resolve(dir);
 assertNotLink(resolved);
 if(!fs.existsSync(resolved)||!fs.statSync(resolved).isDirectory()) fail(`${label} directory not found: ${resolved}`);
 return resolved;
}
function walkFiles(root,relative=''){
 const base=path.join(root,relative);assertNotLink(base);
 const output=[];
 for(const entry of fs.readdirSync(base,{withFileTypes:true})){
  const rel=path.join(relative,entry.name);
  if(entry.isSymbolicLink()) fail(`Factory source symbolic link refused: ${rel}`);
  if(entry.isDirectory()) output.push(...walkFiles(root,rel));
  else if(entry.isFile()) output.push(rel);
 }
 return output;
}
function bridgeInspection(bridge){
 if(!fs.existsSync(bridge)) return {ok:false,bridge,missing:['bridge-file']};
 const body=text(bridge);
 const checks=[
  ['isolated-worktree',/isolated Git worktree|worktree_path|--cd/i],
  ['dynamic-codex-assignment',/tasks tagged \[CODEX\]|\[CODEX\].*assignment/is],
  ['no-backend-ownership',/NOT backend\/frontend roles|not a backend role/i],
  ['binding-contract',/API Contract.*binding|binding.*API Contract/is],
  ['worker-done-prefix',/WORKER: DONE/],
  ['worker-blocked-prefix',/WORKER: BLOCKED/],
  ['bridge-owned-git',/Factory bridge owns Git integration|commit_changes/i]
 ];
 const missing=checks.filter(([,pattern])=>!pattern.test(body)).map(([name])=>name);
 return {ok:missing.length===0,bridge,missing};
}
function bundledSource(){
 const root=ensurePlainDir(bundledFactoryRoot,'Bundled Factory');
 return {
  kind:'bundled',root,
  bridge:path.join(root,'claude','skill','scripts','codex_worker.py')
 };
}
function overrideSource(kit){
 const root=ensurePlainDir(kit,'Factory kit');
 return {
  kind:'override',root,
  bridge:path.join(root,'.claude','skills','factory','scripts','codex_worker.py')
 };
}
function sourceFor(kit){return kit?overrideSource(kit):bundledSource();}
function codexSkillEntries(root){
 return codexSkills.map(name=>{
  const source=path.join(bundledCodexSkillsRoot,name,'SKILL.md');
  const content=text(source);
  const target=projectFile(root,path.join('.agents','skills',name,'SKILL.md'));
  const action=!fs.existsSync(target)?'create':sameContent(target,content)?'unchanged':'conflict';
  return {name,source,target,path:path.relative(root,target).split(path.sep).join('/'),action,content};
 });
}
function mappedEntry(root,source,targetRelative,mode='replace'){
 const target=projectFile(root,targetRelative);
 const action=mode==='preserve-existing'&&fs.existsSync(target)?'preserve':!fs.existsSync(target)?'create':sameContent(target,text(source))?'unchanged':'replace';
 return {source,target,mode,path:path.relative(root,target).split(path.sep).join('/'),action};
}
function bundledFactoryEntries(root,sourceRoot){
 const required=[
  'claude/skill/SKILL.md',
  'claude/skill/config.json',
  'claude/skill/scripts/board.py',
  'claude/skill/scripts/codex_worker.py',
  'claude/skill/scripts/worktree.py',
  'runtime/dashboard.html',
  'runtime/backlog.md'
 ];
 for(const rel of required){const file=path.join(sourceRoot,rel);assertNotLink(file);if(!fs.existsSync(file))fail(`Bundled Factory missing required file: ${rel}`);}
 const files=[];
 const agentRoot=path.join(sourceRoot,'claude','agents');
 for(const rel of walkFiles(agentRoot)) if(/^factory-.*\.md$/i.test(path.basename(rel))) files.push(mappedEntry(root,path.join(agentRoot,rel),path.join('.claude','agents',rel),'replace'));
 const skillRoot=path.join(sourceRoot,'claude','skill');
 for(const rel of walkFiles(skillRoot)) files.push(mappedEntry(root,path.join(skillRoot,rel),path.join('.claude','skills','factory',rel),rel==='config.json'?'preserve-existing':'replace'));
 files.push(mappedEntry(root,path.join(sourceRoot,'runtime','dashboard.html'),'factory/dashboard.html','replace'));
 files.push(mappedEntry(root,path.join(sourceRoot,'runtime','backlog.md'),'factory/backlog.md','preserve-existing'));
 return files;
}
function overrideFactoryEntries(root,kitRoot){
 const required=[
  '.claude/skills/factory/SKILL.md',
  '.claude/skills/factory/config.json',
  '.claude/skills/factory/scripts/board.py',
  '.claude/skills/factory/scripts/codex_worker.py',
  '.claude/skills/factory/scripts/worktree.py',
  'factory/dashboard.html',
  'factory/backlog.md'
 ];
 for(const rel of required){const file=path.join(kitRoot,rel);assertNotLink(file);if(!fs.existsSync(file))fail(`Factory kit missing required file: ${rel}`);}
 const files=[];
 const agentRoot=path.join(kitRoot,'.claude','agents');
 if(fs.existsSync(agentRoot)) for(const rel of walkFiles(agentRoot)) if(/^factory-.*\.md$/i.test(path.basename(rel))) files.push(mappedEntry(root,path.join(agentRoot,rel),path.join('.claude','agents',rel),'replace'));
 const skillRoot=path.join(kitRoot,'.claude','skills','factory');
 for(const rel of walkFiles(skillRoot)) files.push(mappedEntry(root,path.join(skillRoot,rel),path.join('.claude','skills','factory',rel),rel==='config.json'?'preserve-existing':'replace'));
 files.push(mappedEntry(root,path.join(kitRoot,'factory','dashboard.html'),'factory/dashboard.html','replace'));
 files.push(mappedEntry(root,path.join(kitRoot,'factory','backlog.md'),'factory/backlog.md','preserve-existing'));
 return files;
}
function factoryEntries(root,source){return source.kind==='bundled'?bundledFactoryEntries(root,source.root):overrideFactoryEntries(root,source.root);}
const legacyManaged=[
 {path:'.claude/skills/factory/scripts/codex_backend.sh',marker:'Codex bridge: runs Codex CLI headless for the [BACKEND] part'},
 {path:'.agents/skills/backend-factory/SKILL.md',marker:'name: backend-factory'},
 {path:'.agents/skills/backend-audit/SKILL.md',marker:'name: backend-audit'}
];
function legacyPlan(root){
 return legacyManaged.map(item=>{
  const target=projectFile(root,item.path);
  if(!fs.existsSync(target)) return {...item,target,action:'absent'};
  return {...item,target,action:text(target).includes(item.marker)?'remove-managed':'preserve-custom'};
 });
}
function migrateBundledConfig(root,source){
 if(source.kind!=='bundled') return {action:'not-applicable'};
 const target=projectFile(root,'.claude/skills/factory/config.json');
 const sourceFile=path.join(source.root,'claude','skill','config.json');
 const defaults=JSON.parse(text(sourceFile));
 if(!fs.existsSync(target)) return {action:'created-by-copy'};
 let current;
 try{current=JSON.parse(text(target));}catch{return {action:'preserve-invalid-json'};}
 if(current?.workers?.mode==='parallel-worktrees') return {action:'current'};
 const merged={...defaults,...current,
  workers:defaults.workers,
  worktrees:defaults.worktrees,
  codex:{...defaults.codex,...(current.codex||{})}
 };
 delete merged.backend_engine;
 delete merged.backend_paths;
 if(merged.codex) delete merged.codex.fallback_to_claude_after_failures;
 fs.writeFileSync(target,JSON.stringify(merged,null,2)+'\n','utf8');
 return {action:'migrated-legacy',preserved:['base_branch','max_fix_rounds','claude_model','codex','reviewers','merge_mode','auto_merge_low_risk','high_risk_paths','test_command','spec_kit_dir','constitution']};
}
function removeManagedLegacy(root){
 const actions=legacyPlan(root);
 const removed=[];
 for(const item of actions){
  if(item.action!=='remove-managed') continue;
  fs.rmSync(item.target,{force:true});
  try{fs.rmdirSync(path.dirname(item.target));}catch{}
  removed.push(item.path);
 }
 return {removed,preservedCustom:actions.filter(x=>x.action==='preserve-custom').map(x=>x.path)};
}

function ensureRuntimeIgnore(root){
 fs.mkdirSync(projectFile(root,'factory/jobs'),{recursive:true});
 const gi=projectFile(root,'.gitignore');
 const current=fs.existsSync(gi)?text(gi):'';
 const lines=new Set(current.split(/\r?\n/).filter(Boolean));
 let changed=false;
 for(const line of gitignoreLines) if(!lines.has(line)){lines.add(line);changed=true;}
 if(changed||!fs.existsSync(gi)) fs.writeFileSync(gi,[...lines].join('\n')+'\n','utf8');
}

export function factoryPlan(root,{kit,previewState}={}){
 // A bootstrap preview may inspect an uninitialized repository without writing
 // state. applyFactory never forwards this planning-only override.
 if(!previewState)readState(root);
 const discovery=discover(root);
 if(!discovery.git.available) fail('Factory requires a Git repository. Initialize Git before installing the factory.');
 const source=sourceFor(kit);
 const bridgeCheck=bridgeInspection(source.bridge);
 const skills=codexSkillEntries(root).map(({content,...entry})=>entry);
 const files=factoryEntries(root,source);
 const conflicts=skills.filter(x=>x.action==='conflict').map(x=>x.path);
 const runtimeBoard=factoryRuntimeStatus(root);
 return {
  ready:bridgeCheck.ok&&conflicts.length===0&&!runtimeBoard.blocksApply,
  source:source.kind==='bundled'?'project-init-bundled-factory':source.root,
  override:source.kind==='override',
  bridgeCheck,
  factoryFiles:files,
  codexSkills:skills,
  conflicts,
  runtimeBoard,
  legacy:legacyPlan(root),
  workers:{
    codex:{role:'general',worktree:'isolated'},
    claude:{role:'general',worktree:'isolated'},
    integration:{worktree:'isolated'},
    assignment:'balanced-independent-work-units',
    parallel:true
  },
  applyRequired:true
 };
}

export function applyFactory(root,{kit,apply=false}={}){
 const source=sourceFor(kit);
 const plan=factoryPlan(root,{kit});
 if(!apply) return {...plan,applied:false};
 if(!plan.bridgeCheck.ok) fail(`Factory bridge contract mismatch: ${plan.bridgeCheck.missing.join(', ')}`);
 if(plan.conflicts.length) fail(`Existing Codex factory skill content differs: ${plan.conflicts.join(', ')}. Back it up or remove it before applying.`);
 if(plan.runtimeBoard.blocksApply) fail(`${plan.runtimeBoard.error} Board: ${plan.runtimeBoard.boardPath}`);
 const copied=[];
 for(const item of factoryEntries(root,source)){
  if(item.action==='preserve'||item.action==='unchanged') continue;
  fs.mkdirSync(path.dirname(item.target),{recursive:true});
  fs.copyFileSync(item.source,item.target);
  if(item.path.endsWith('.sh')) fs.chmodSync(item.target,0o755);
  copied.push(item.path);
 }
 ensureRuntimeIgnore(root);
 const boardInitialization=initializeFactoryBoard(root);
 const configMigration=migrateBundledConfig(root,source);
 const legacyCleanup=removeManagedLegacy(root);
 const created=[];
 for(const entry of codexSkillEntries(root)){
  if(entry.action==='unchanged') continue;
  fs.mkdirSync(path.dirname(entry.target),{recursive:true});
  fs.writeFileSync(entry.target,entry.content,'utf8');
  created.push(entry.path);
 }
 const installedBridge=projectFile(root,'.claude/skills/factory/scripts/codex_worker.py');
 const installedBridgeCheck=bridgeInspection(installedBridge);
 if(!installedBridgeCheck.ok) fail(`Installed Factory bridge contract mismatch: ${installedBridgeCheck.missing.join(', ')}`);
 audit(root,'factory-installed',{source:plan.source,override:plan.override,copiedFactoryFiles:copied.length,codexSkills:created});
 const verified=factoryPlan(root,{kit});
 return {...verified,applied:true,copiedFactoryFiles:copied,installedCodexSkills:created,installedBridgeCheck,configMigration,legacyCleanup,boardInitialization};
}
