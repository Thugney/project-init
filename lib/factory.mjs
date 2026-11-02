import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readState,readJson,projectFile,audit,fail,assertNotLink,discover} from './core.mjs';

const bundledFactoryRoot=fileURLToPath(new URL('../vendor/factory/',import.meta.url));
const bundledCodexSkillsRoot=path.join(bundledFactoryRoot,'codex','skills');
// `factory` is the Codex orchestrator skill; it is inert unless config.json selects Codex.
const codexSkills=['factory','factory-worker','factory-audit'];
const orchestrators=new Set(['claude','codex']);
const gitignoreLines=['factory/jobs/','factory/board.json','factory/board.json.tmp','factory/board.json.*.tmp','.project-init/worktrees/','.project-init/factory-worktrees/'];
const boardStages=new Set(['spec','building','integrating','review','fixing','decision','merged','needs-human','failed']);
// Mirrors routing.py. The orchestrator tier is advisory: shown, never enforced.
const routedRoles=['spec-writer','builder','code-reviewer','security-reviewer','ux-reviewer','ui-reviewer','approver'];
const clients=['claude','codex'];
const dataClasses=['public','internal','personal','restricted'];
const modelPattern=/^[A-Za-z0-9][A-Za-z0-9._:/@\[\]-]{0,127}$/;

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

// Routing state per role, the advisory orchestrator tier, the project data class and
// any client in use that is not approved for it. Read-only; never writes config.
export function routingStatus(root){
 let config;
 try{
  const file=projectFile(root,'.claude/skills/factory/config.json');
  if(!fs.existsSync(file))return {state:'missing-config'};
  config=JSON.parse(text(file));
 }catch(error){return {state:'unreadable',error:error.message};}
 const roles={};
 for(const role of ['orchestrator',...routedRoles]){
  const entry={tier:config.routing?.roles?.[role]??null};
  for(const client of clients){
   let model;
   try{model=routedModel(config.routing,role,client)??'not-configured';}catch{model='invalid';}
   entry[client]=model;
  }
  if(role==='orchestrator')entry.advisory=true;
  roles[role]=entry;
 }
 const configured=routedRoles.some(role=>clients.some(client=>!['not-configured','invalid'].includes(roles[role][client])));
 let dataClass=null;
 try{
  const state=readJson(projectFile(root,'.project-init/project.json'),false);
  if(state)dataClass=state.dataClass??'internal';
 }catch{}
 const orchestrator=orchestrators.has(config.orchestrator)?config.orchestrator:'claude';
 const inUse=[...new Set(['claude',...(config.workers?.codex===false?[]:['codex']),orchestrator])];
 const unapprovedClients=dataClass===null?[]:inUse.filter(client=>{
  const approved=config[client]?.approvedDataClasses;
  return !Array.isArray(approved)||!approved.includes(dataClass);
 });
 return {state:configured?'configured':'not-configured',roles,dataClass,unapprovedClients,
  ...(dataClass===null?{next:'No readable Project Init state: Factory refuses jobs until the project data class can be read.'}:
   unapprovedClients.length?{next:`Factory refuses jobs: data class ${dataClass} is not approved for ${unapprovedClients.join(', ')}. Add it to <client>.approvedDataClasses in .claude/skills/factory/config.json.`}:{})};
}

// State is local to the orchestration checkout, not inferred from GitHub PRs.
export function factoryRuntimeStatus(root){
 return {...factoryBoardStatus(root),routing:routingStatus(root)};
}
function factoryBoardStatus(root){
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
// Git may check managed files out with CRLF; a line-ending difference is not a content change.
const lf=value=>value.replaceAll('\r\n','\n');
function sameContent(file,content){return fs.existsSync(file)&&lf(text(file))===lf(content);}
// Every bundled Codex Factory skill, in every released version, names itself and says
// "Project Init Factory" in its description, so an earlier copy is updated in place;
// any other content at that path is a protected conflict.
function managedCodexSkill(content,name){
 return new RegExp(`^name:\\s*${name}\\s*$`,'m').test(content)&&/^description:.*Project Init Factory/m.test(content);
}
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
  // Python bytecode caches appear next to imported helpers and are never Factory content.
  if(entry.name==='__pycache__'||/\.py[co]$/i.test(entry.name)) continue;
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
  const action=!fs.existsSync(target)?'create':sameContent(target,content)?'unchanged':managedCodexSkill(text(target),name)?'update':'conflict';
  return {name,source,target,path:path.relative(root,target).split(path.sep).join('/'),action,content};
 });
}
// `content` is the rendered file when it differs from the shipped source (routed agents).
function mappedEntry(root,source,targetRelative,mode='replace',content){
 const target=projectFile(root,targetRelative);
 const action=mode==='preserve-existing'&&fs.existsSync(target)?'preserve':!fs.existsSync(target)?'create':sameContent(target,content??text(source))?'unchanged':'replace';
 return {source,target,mode,path:path.relative(root,target).split(path.sep).join('/'),action,...(content===undefined?{}:{content})};
}
function installedConfig(root){
 try{return JSON.parse(text(projectFile(root,'.claude/skills/factory/config.json')));}catch{return null;}
}
function routedModel(routing,role,client){
 const tier=routing?.roles?.[role],model=routing?.tiers?.[tier]?.[client];
 if(model===undefined||model===null||model==='')return null;
 if(typeof model!=='string'||!modelPattern.test(model))fail(`Invalid model identifier in Factory routing tier ${tier} for ${client}.`);
 return model;
}
// Only a configured model rewrites the frontmatter; otherwise the shipped agent stays as is.
function renderAgent(content,model){
 if(!model)return content;
 const match=content.match(/^---(\r?\n)([\s\S]*?)\r?\n---/);
 if(!match)return content;
 const [block,eol,body]=match;
 const updated=/^model:.*$/m.test(body)?body.replace(/^model:.*$/m,`model: ${model}`):`${body}${eol}model: ${model}`;
 return content.replace(block,block.replace(body,updated));
}
function bundledFactoryEntries(root,sourceRoot){
 const required=[
  'claude/skill/SKILL.md',
  'claude/skill/config.json',
  'claude/skill/scripts/board.py',
  'claude/skill/scripts/codex_worker.py',
  'claude/skill/scripts/claude_worker.py',
  'claude/skill/scripts/routing.py',
  'claude/skill/scripts/worktree.py',
  'runtime/dashboard.html',
  'runtime/backlog.md'
 ];
 for(const rel of required){const file=path.join(sourceRoot,rel);assertNotLink(file);if(!fs.existsSync(file))fail(`Bundled Factory missing required file: ${rel}`);}
 const files=[];
 const routing=(installedConfig(root)??JSON.parse(text(path.join(sourceRoot,'claude','skill','config.json')))).routing;
 const agentRoot=path.join(sourceRoot,'claude','agents');
 for(const rel of walkFiles(agentRoot)) if(/^factory-.*\.md$/i.test(path.basename(rel))){
  const source=path.join(agentRoot,rel),role=path.basename(rel,'.md').slice('factory-'.length);
  const model=routedRoles.includes(role)?routedModel(routing,role,'claude'):null;
  files.push(mappedEntry(root,source,path.join('.claude','agents',rel),'replace',model?renderAgent(text(source),model):undefined));
 }
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
 if(current?.workers?.mode==='parallel-worktrees'){
  // Add settings introduced after this config was written; never overwrite a chosen value.
  const added=['orchestrator','claude','routing'].filter(key=>current[key]===undefined);
  for(const key of added) current[key]=defaults[key];
  const nested=addNestedDefaults(current,defaults);
  const claudeModel=moveClaudeModel(current);
  if(!added.length&&!nested.length&&!claudeModel) return {action:'current'};
  fs.writeFileSync(target,JSON.stringify(current,null,2)+'\n','utf8');
  return {action:'added-defaults',added,...(nested.length?{nested}:{}),...(claudeModel?{claudeModel}:{})};
 }
 const merged={...defaults,...current,
  workers:defaults.workers,
  worktrees:defaults.worktrees,
  codex:{...defaults.codex,...(current.codex||{})}
 };
 delete merged.backend_engine;
 delete merged.backend_paths;
 if(merged.codex) delete merged.codex.fallback_to_claude_after_failures;
 addNestedDefaults(merged,defaults);
 const claudeModel=moveClaudeModel(merged);
 fs.writeFileSync(target,JSON.stringify(merged,null,2)+'\n','utf8');
 return {action:'migrated-legacy',preserved:['base_branch','max_fix_rounds','claude_model','codex','reviewers','merge_mode','auto_merge_low_risk','high_risk_paths','test_command','spec_kit_dir','constitution'],...(claudeModel?{claudeModel}:{})};
}
function addNestedDefaults(config,defaults){
 const nested=[];
 for(const client of clients){
  if(config[client]&&typeof config[client]==='object'&&config[client].approvedDataClasses===undefined){
   config[client].approvedDataClasses=[...defaults[client].approvedDataClasses];
   nested.push(`${client}.approvedDataClasses`);
  }
 }
 return nested;
}
// claude.model is the one headless Claude setting; the legacy top-level claude_model is folded into it.
function moveClaudeModel(config){
 if(config.claude_model===undefined)return null;
 const legacy=config.claude_model;delete config.claude_model;
 config.claude??={};
 if(!legacy)return {action:'removed-empty'};
 if(!config.claude.model){config.claude.model=legacy;return {action:'moved',value:legacy};}
 if(config.claude.model===legacy)return {action:'removed-duplicate',value:legacy};
 return {action:'dropped-conflict',dropped:legacy,kept:config.claude.model};
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

function configuredOrchestrator(root){
 try{
  const value=JSON.parse(text(projectFile(root,'.claude/skills/factory/config.json'))).orchestrator;
  return orchestrators.has(value)?value:'claude';
 }catch{return 'claude';}
}
function setOrchestrator(root,orchestrator){
 const target=projectFile(root,'.claude/skills/factory/config.json');
 const current=JSON.parse(text(target)),previous=current.orchestrator??null;
 if(previous===orchestrator) return {action:'unchanged',orchestrator};
 current.orchestrator=orchestrator;
 fs.writeFileSync(target,JSON.stringify(current,null,2)+'\n','utf8');
 return {action:'set',orchestrator,previous};
}

export function factoryPlan(root,{kit,previewState,orchestrator}={}){
 // A bootstrap preview may inspect an uninitialized repository without writing
 // state. applyFactory never forwards this planning-only override.
 if(!previewState)readState(root);
 if(orchestrator!==undefined&&!orchestrators.has(orchestrator)) fail('--orchestrator must be claude or codex.');
 const discovery=discover(root);
 if(!discovery.git.available) fail('Factory requires a Git repository. Initialize Git before installing the factory.');
 const source=sourceFor(kit);
 const bridgeCheck=bridgeInspection(source.bridge);
 const skills=codexSkillEntries(root).map(({content,...entry})=>entry);
 const files=factoryEntries(root,source).map(({content,...entry})=>entry);
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
  orchestrator:{current:configuredOrchestrator(root),requested:orchestrator??null},
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

export function applyFactory(root,{kit,apply=false,orchestrator}={}){
 const source=sourceFor(kit);
 const plan=factoryPlan(root,{kit,orchestrator});
 if(!apply) return {...plan,applied:false};
 if(!plan.bridgeCheck.ok) fail(`Factory bridge contract mismatch: ${plan.bridgeCheck.missing.join(', ')}`);
 if(plan.conflicts.length) fail(`Existing Codex factory skill content differs: ${plan.conflicts.join(', ')}. Back it up or remove it before applying.`);
 if(plan.runtimeBoard.blocksApply) fail(`${plan.runtimeBoard.error} Board: ${plan.runtimeBoard.boardPath}`);
 const copied=[];
 for(const item of factoryEntries(root,source)){
  if(item.action==='preserve'||item.action==='unchanged') continue;
  fs.mkdirSync(path.dirname(item.target),{recursive:true});
  if(item.content!==undefined)fs.writeFileSync(item.target,item.content,'utf8');
  else fs.copyFileSync(item.source,item.target);
  if(item.path.endsWith('.sh')) fs.chmodSync(item.target,0o755);
  copied.push(item.path);
 }
 ensureRuntimeIgnore(root);
 const boardInitialization=initializeFactoryBoard(root);
 const configMigration=migrateBundledConfig(root,source);
 const orchestratorSetting=orchestrator?setOrchestrator(root,orchestrator):{action:'unchanged',orchestrator:configuredOrchestrator(root)};
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
 return {...verified,applied:true,copiedFactoryFiles:copied,installedCodexSkills:created,installedBridgeCheck,configMigration,orchestratorSetting,legacyCleanup,boardInitialization};
}
