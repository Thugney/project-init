import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import {prepareVendorRuntimeEnvironment,eccHarnessCapabilities,installLegacyCodexEcc} from './prerequisites.mjs';
import {featureReadiness,preparationPlan,worktreeStateGate} from './prepare.mjs';
import {factoryRuntimeStatus} from './factory.mjs';
import {executionEvidence} from './execution.mjs';
import {existingPathIdentity,sameExistingPath} from './paths.mjs';
import {suggestPacks,listPacks} from './packs.mjs';
import {BMAD_DEFAULT_VERSION} from './bmad.mjs';

export const VERSION = '2.1.0-preview.18';
export const STATE_DIR = '.project-init';
const SKIP_DIRS = new Set(['.git', '.project-init', '.factory-context', 'node_modules', '.venv', 'venv', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage', '.cache', 'vendor', '__pycache__', '.turbo']);
const SECRET_FILE = /^(\.env($|\.)|id_rsa|id_ed25519|secrets?\.|credentials?\.|.*\.(pem|pfx|p12|key))$/i;
const VALID_FRAMEWORKS = new Set(['openspec', 'spec-kit', 'bmad', 'none']);
const VALID_INTENTS = new Set(['unknown', 'feature', 'bugfix', 'new-product', 'automation', 'migration']);
const VALID_COMPLEXITIES = new Set(['unknown', 'small', 'medium', 'large']);
const allowedChecks = new Set(['npm','pnpm','yarn','node','python','python3','pytest','uv','dotnet','pwsh','powershell','go','cargo']);

export function fail(message) { throw new Error(message); }
export function hashBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function hashFile(file) { return hashBytes(fs.readFileSync(file)); }
export function nativeTextRepresentation(relative,bytes,approvedSha256) {
  if(typeof relative!=='string'||!/(?:\.md|\.markdown|\.txt)$/i.test(relative)||!/^[a-f0-9]{64}$/.test(approvedSha256||'')||!(bytes instanceof Uint8Array))return null;
  const buffer=Buffer.from(bytes),actualSha256=hashBytes(buffer);
  if(actualSha256===approvedSha256||buffer.includes(0))return null;
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);}catch{return null;}
  if(/\r(?!\n)/.test(text))return null;
  const lf=text.replaceAll('\r\n','\n');
  const lfHash=hashBytes(Buffer.from(lf,'utf8')),crlfHash=hashBytes(Buffer.from(lf.replaceAll('\n','\r\n'),'utf8'));
  // Only the complete LF and CRLF byte representations qualify. Preserve BOM,
  // whitespace, Unicode and final-newline content; mixed or other changes fail.
  if(![lfHash,crlfHash].includes(actualSha256)||![lfHash,crlfHash].includes(approvedSha256))return null;
  return {path:relative,mode:'utf8-crlf-lf-v1',approvedSha256,actualSha256};
}
export function utcNow() { return new Date().toISOString(); }
export function isWithin(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative));
}
export function assertNotLink(file) {
  let cursor = path.resolve(file);
  while (true) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail(`Symbolic-link/reparse-point path refused: ${cursor}`);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}
export function projectRoot(raw, allowMissing = false) {
  const root = path.resolve(raw || process.cwd());
  assertNotLink(root);
  if (fs.existsSync(root) && !fs.statSync(root).isDirectory()) fail(`Not a directory: ${root}`);
  if (!fs.existsSync(root) && !allowMissing) fail(`Project directory not found: ${root}`);
  return root;
}
export function projectFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0')) fail('Artifact path must be a nonempty relative path.');
  const absolute = path.resolve(root, relative);
  if (!isWithin(absolute, root)) fail(`Path outside project refused: ${relative}`);
  assertNotLink(absolute);
  return absolute;
}
export function atomicJson(file, value) {
  assertNotLink(file);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(value, null, 2)+'\n', {encoding:'utf8',flag:'wx',mode:0o600}); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
export function readJson(file, required=true) {
  if (!fs.existsSync(file)) { if (required) fail(`File not found: ${file}`); return null; }
  assertNotLink(file);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`Invalid JSON (${file}): ${error.message}`); }
}
export function statePath(root, file) { return projectFile(root, path.join(STATE_DIR,file)); }
export function readState(root) {
  const state = readJson(statePath(root, 'project.json'));
  if (state.schemaVersion !== 2 || typeof state.projectPath !== 'string' || !sameExistingPath(state.projectPath,root)) fail('Invalid or relocated Project Init v2 state. Review the project path; migration is not automatic.');
  if (!VALID_FRAMEWORKS.has(state.framework ?? 'none')) fail('Unknown selected framework in project state.');
  if (state.dataClass !== undefined && !DATA_CLASSES.includes(state.dataClass)) fail(`Invalid dataClass in project state. Use one of: ${DATA_CLASSES.join(', ')}.`);
  return state;
}
export const DATA_CLASSES=['public','internal','personal','restricted'];
// The only writer of dataClass. Absent means internal; a change needs --apply.
export function dataClass(root,{set,apply=false}={}) {
  const state=readState(root),current=state.dataClass??'internal',declared=state.dataClass!==undefined;
  if(set===undefined){
    if(apply) fail('Pass --set <class> with --apply.');
    return {dataClass:current,declared,allowed:DATA_CLASSES};
  }
  if(!DATA_CLASSES.includes(set)) fail(`--set must be one of: ${DATA_CLASSES.join(', ')}.`);
  if(!apply) return {applied:false,from:current,to:set,declared,notice:'Preview only. Pass --apply to write .project-init/project.json and record an audit event.'};
  atomicJson(statePath(root,'project.json'),{...state,dataClass:set,updatedAt:utcNow()});
  audit(root,'data-class-set',{from:current,to:set,previouslyDeclared:declared});
  return {applied:true,from:current,to:set};
}
export function updateState(root, changes, action='state-update') {
  const state = readState(root);
  const updated = {...state,...changes,updatedAt:utcNow()};
  atomicJson(statePath(root,'project.json'),updated);
  audit(root,action,{fields:Object.keys(changes)});
  return updated;
}
export function audit(root, action, details={}) {
  const filepath=statePath(root,'audit.jsonl');
  fs.mkdirSync(path.dirname(filepath),{recursive:true});
  const row={when:utcNow(),action,details};
  fs.appendFileSync(filepath,JSON.stringify(row)+'\n',{mode:0o600});
}
export function resolveWindowsCommand(command,searchPath=process.env.PATH||'') {
  if(process.platform!=='win32'||path.isAbsolute(command)||path.extname(command)) return command;
  for(const raw of searchPath.split(path.delimiter)) {
    const dir=raw.replace(/^"|"$/g,'');if(!dir||!path.isAbsolute(dir))continue;
    for(const ext of ['.exe','.com','.cmd','.bat']) {
      const candidate=path.join(dir,command+ext);
      if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())
        return candidate;
    }
  }
  return command;
}
export function commandInvocation(command,args=[]) {
  command=resolveWindowsCommand(command);
  if(process.platform!=='win32'||! /\.(cmd|bat)$/i.test(command)) return {command,args,options:{}};
  // Batch scripts require cmd.exe. Fail closed on expansion/control characters;
  // normal paths (including spaces) and arguments are always quoted.
  const quote=value=>{
    if(/["%\r\n!^&|<>\0]/.test(value)) fail('Unsafe Windows batch argument; use a native executable for this command.');
    return '"'+value+'"';
  };
  const line=[command,...args].map(quote).join(' ');
  return {command:path.join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe'),args:['/d','/v:off','/s','/c','"'+line+'"'],options:{windowsVerbatimArguments:true}};
}
function probe(exe,args=[],cwd=process.cwd(),timeout=5000) {
  try {
    const invocation=commandInvocation(exe,args);
    const result=spawnSync(invocation.command,invocation.args,{cwd,encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024,...invocation.options});
    return {found:!result.error,ok:result.status===0,stdout:result.stdout||'',version:result.stdout?.trim().split('\n')[0]||'',error:result.error?.message||result.stderr?.trim()||null};
  } catch (error) { return {found:false,ok:false,version:'',error:error.message}; }
}
function activateUvToolBin(cwd=process.cwd()){
  const found=probe('uv',['tool','dir','--bin'],cwd);
  if(!found.ok||!found.version) return null;
  const dir=found.version.trim();
  if(!fs.existsSync(dir)) return null;
  const parts=(process.env.PATH||'').split(path.delimiter);
  if(!parts.some(p=>{try{return path.resolve(p||'.')===path.resolve(dir);}catch{return false;}})) process.env.PATH=dir+path.delimiter+(process.env.PATH||'');
  return dir;
}

export function isRuntimePath(relative){
  return relative==='factory/jobs'||relative.startsWith('factory/jobs/')||/^factory\/board\.json(?:\..*tmp)?$/.test(relative);
}
function linkedWorktrees(root){
  const r=spawnSync('git',['worktree','list','--porcelain','-z'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:1024*1024});
  const identities=new Set(),current=existingPathIdentity(root);
  if(r.status===0)for(const field of r.stdout.split('\0')){
    if(!field.startsWith('worktree '))continue;
    try{
      const identity=existingPathIdentity(field.slice(9));
      if(identity&&identity!==current)identities.add(identity);
    }catch{/* Stale/prunable registrations do not identify an existing checkout. */}
  }
  return identities;
}
function trackedDirectories(root){
  const r=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:8*1024*1024});
  const dirs=new Set();
  if(r.status===0)for(const file of r.stdout.split('\0')){
    const parts=file.split('/');parts.pop();
    while(parts.length){dirs.add(parts.join('/'));parts.pop();}
  }
  return dirs;
}
function skipDirectory(filename,relative,name,worktrees,tracked=new Set()){
  const state=['.git','.project-init','.factory-context'].includes(name);
  return state||(SKIP_DIRS.has(name)&&!tracked.has(relative))||SECRET_FILE.test(name)||isRuntimePath(relative)||(worktrees.size>0&&worktrees.has(existingPathIdentity(filename)));
}
export function sourceSnapshot(root,limit=10000) {
  const entries=[],stack=[root],excluded=[],worktrees=linkedWorktrees(root),tracked=trackedDirectories(root);
  while(stack.length) {
    const dir=stack.pop();
    for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const filename=path.join(dir,e.name);
      const relative=path.relative(root,filename).split(path.sep).join('/');
      if(e.name==='.git'){excluded.push(relative);continue;}
      if(isRuntimePath(relative)){excluded.push(relative);continue;}
      if(e.isSymbolicLink()){entries.push({path:relative,kind:'link',target:fs.readlinkSync(filename)});continue;}
      if(e.isDirectory()){if(skipDirectory(filename,relative,e.name,worktrees,tracked)){excluded.push(relative);continue;}stack.push(filename);continue;}
      if(!e.isFile())continue;
      if(SECRET_FILE.test(e.name)){excluded.push(relative);continue;}
      if(entries.length>=limit) fail(`Source snapshot exceeds ${limit} files; cannot prove source alignment with incomplete scan.`);
      const prior=fs.statSync(filename),hasher=crypto.createHash('sha256');
      const fd=fs.openSync(filename,'r');const buffer=Buffer.alloc(64*1024);
      try {let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hasher.update(buffer.subarray(0,n));}
      finally {fs.closeSync(fd);}
      const current=fs.statSync(filename);
      if(current.size!==prior.size||current.mtimeMs!==prior.mtimeMs) fail(`Source changed during fingerprint: ${relative}`);
      entries.push({path:relative,kind:'file',sha256:hasher.digest('hex')});
    }
  }
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return {hash:hashBytes(JSON.stringify(entries)),fileCount:entries.length,excludedCount:excluded.length,limitation:'Local content hash excluding dependencies, generated files and secret-pattern entries; not a semantic review.'};
}

export function gitInfo(root) {
  const inside=probe('git',['rev-parse','--show-toplevel'],root);
  if (!inside.ok) return {available:false,clean:null,revision:null,root:null};
  const repo=path.resolve(inside.version);
  const rev=probe('git',['rev-parse','HEAD'],root);
  // Ask Git whether cwd is the repository root. Comparing Git paths with Node paths
  // is unreliable on some Windows installations (drive case, separators and aliases).
  const prefix=probe('git',['rev-parse','--show-prefix'],root);
  const status=spawnSync('git',['status','--porcelain=v1','--untracked-files=all','--','.',':(exclude).project-init'],{cwd:root,encoding:'utf8',timeout:8000});
  return {available:true,atRepoRoot:prefix.ok && prefix.version==='',clean:status.status===0 && !status.stdout.trim(),revision:rev.ok?rev.version:null,root:repo,changed:status.stdout?.trim().slice(0,2000)||'',statusError:status.status!==0 ? status.stderr : null};
}
export function discover(raw) {
  const root=projectRoot(raw);
  const files=[];
  let inspected=0,truncated=false,uiHint=false,scriptHint=false,testHint=false;
  const queue=[root],worktrees=linkedWorktrees(root);
  while(queue.length && inspected<2500) {
    const dir=queue.shift();
    let entries;
    try { entries=fs.readdirSync(dir,{withFileTypes:true}); }
    catch (error) { fail(`Cannot inspect directory ${dir}: ${error.message}`); }
    for(const entry of entries) {
      if(inspected>=2500){truncated=true;break;}
      if(entry.isSymbolicLink()) continue;
      const candidate=path.join(dir,entry.name),candidateRelative=path.relative(root,candidate).split(path.sep).join('/');
      if(isRuntimePath(candidateRelative))continue;
      if(entry.isDirectory()) { if(!skipDirectory(candidate,candidateRelative,entry.name,worktrees) && !entry.name.startsWith('.')) queue.push(candidate); continue; }
      if(!entry.isFile()||SECRET_FILE.test(entry.name)) continue;
      const rel=path.relative(root,path.join(dir,entry.name)).split(path.sep).join('/');
      inspected++;
      files.push(rel);
      if(/\.(tsx|jsx|html|vue|svelte|css|scss)$/i.test(rel)||/(^|\/)(app|pages|components)\//i.test(rel)) uiHint=true;
      if(/\.ps1$/i.test(rel)) scriptHint=true;
      if(/(^|\/)(__tests__|tests?)\/|\.(test|spec)\./i.test(rel)) testHint=true;
    }
  }
  if(queue.length) truncated=true;
  const footprints={openspec:fs.existsSync(path.join(root,'openspec')),
    'spec-kit':fs.existsSync(path.join(root,'.specify')),
    bmad:fs.existsSync(path.join(root,'_bmad'))};
  const git=gitInfo(root);
  const indicators={node:fs.existsSync(path.join(root,'package.json')),
    python:files.some(f=>/^(pyproject\.toml|requirements\.txt)$/i.test(f)),
    powershell:scriptHint,
    frontend:uiHint,
    tests:testHint,
    priorV1:fs.existsSync(path.join(root,'planning','architecture','design.json')),
    leanKitDetected:fs.existsSync(path.join(root,'.agents','skills','codex-lean-kit','SKILL.md')) || fs.existsSync(path.join(os.homedir(),'.codex','skills','codex-lean-kit','SKILL.md')),
    existingAgentRules:fs.existsSync(path.join(root,'AGENTS.md'))};
  const result={projectPath:root,mode:(files.length||git.available)?'Existing':'New',fileCount:files.length,scanTruncated:truncated,indicators,footprints,git,examples:files.slice(0,25)};
  result.packs=suggestPacks(root,{files});
  return result;
}
export function recommendation(discovery,{intent='unknown',complexity='unknown',ui='auto'}={}) {
  if(!VALID_INTENTS.has(intent)||!VALID_COMPLEXITIES.has(complexity)||!['auto','yes','no'].includes(ui)) fail('Invalid recommendation input.');
  const existing=discovery.mode==='Existing';
  const uiRequired=ui==='auto'?discovery.indicators.frontend:ui==='yes';
  const ranks=[
    {id:'openspec',score:38,reasons:['Change-oriented specifications fit ongoing codebase maintenance.']},
    {id:'spec-kit',score:34,reasons:['Structured specification, planning and task convergence.']},
    {id:'bmad',score:24,reasons:['Product discovery and multi-stage implementation workflows.']},
    {id:'none',score:7,reasons:['Minimal process for a narrowly scoped change.']}
  ];
  const add=(id,points,reason)=>{const r=ranks.find(x=>x.id===id);r.score+=points;r.reasons.push(reason);};
  if(existing) add('openspec',25,'Existing codebase detected.');
  else add('spec-kit',25,'Blank/new project detected.');
  if(intent==='bugfix') {add('openspec',24,'Bug-fix and delta workflow.');add('none',25,'A bounded fix may need no external methodology.');}
  if(intent==='feature') {add('openspec',15,'Incremental feature change.');add('spec-kit',13,'Feature specification and convergence.');}
  if(intent==='new-product') {add('bmad',31,'Product discovery and long-lived roadmap.');add('spec-kit',13,'Greenfield requirements.');}
  if(intent==='automation') {add('none',40,'A small utility should not inherit a product workflow.');add('openspec',12,'Focused automation requirements.');}
  if(intent==='migration') {add('openspec',18,'Controlled changes to existing implementation.');add('spec-kit',9,'Acceptance-driven migration plan.');}
  if(complexity==='small') add('none',34,'Small scope makes overhead important.');
  if(complexity==='large') {add('bmad',23,'Multiple coordinated workstreams.');add('spec-kit',8,'Formal planning useful at large scale.');}
  if(uiRequired&&intent==='new-product') add('bmad',12,'UI-heavy product needs UX process.');
  if(discovery.footprints.openspec) add('openspec',35,'OpenSpec already initialized; prefer existing methodology.');
  if(discovery.footprints['spec-kit']) add('spec-kit',35,'Spec Kit already initialized; avoid converting plans.');
  if(discovery.footprints.bmad) add('bmad',35,'BMAD already initialized; avoid duplicate workflows.');
  ranks.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  if(ranks[0]?.id==='bmad') ranks[0].reasons.push('BMAD is the heavier process, best suited to new products and large scope.');
  return {intent,complexity,uiRequired,ranking:ranks,confidence:complexity==='unknown'||intent==='unknown'?'provisional':'contextual',packs:discovery.packs||suggestPacks(discovery.projectPath,discovery),notice:'Ranking is heuristic. It does not inspect product intent inside source files; user selects the methodology.'};
}
export function initProject(raw,{mode,intent='unknown',complexity='unknown',ui='auto'}={}) {
  if(!VALID_INTENTS.has(intent)||!VALID_COMPLEXITIES.has(complexity)||!['auto','yes','no'].includes(ui)) fail('Invalid initialization option.');
  const root=projectRoot(raw,true);
  if(!fs.existsSync(root)) { if(mode!=='New') fail('Missing project: pass --mode New to create an empty directory.'); fs.mkdirSync(root,{recursive:true}); }
  const found=discover(root);
  const actual=mode||found.mode;
  if(!['New','Existing'].includes(actual)) fail('Mode must be New or Existing.');
  if(actual==='New' && found.mode==='Existing') fail('New mode refuses nonempty or Git project. Use Existing.');
  if(actual==='Existing' && found.mode==='New') fail('Existing mode requires application files or Git state. Use New.');
  if(fs.existsSync(path.join(root,STATE_DIR))) fail('Project Init state already exists; run status or resume. Never overwrite.');
  const selection=recommendation(found,{intent,complexity,ui});
  const now=utcNow();
  const state={schemaVersion:2,version:VERSION,projectPath:root,mode:actual,intent,complexity,uiRequired:selection.uiRequired,
    framework:null,installation:{state:'not-selected'},createdAt:now,updatedAt:now,
    initialSource:{revision:found.git.revision,gitClean:found.git.clean,discoveredFiles:found.fileCount,existingV1Review:found.indicators.priorV1}};
  const stateDir=path.join(root,STATE_DIR);
  fs.mkdirSync(stateDir,{recursive:false,mode:0o700});
  try {
    atomicJson(statePath(root,'project.json'),state);
    atomicJson(statePath(root,'config.json'),{schemaVersion:1,checks:[],description:'Configure explicit argv checks here; nothing runs automatically.'});
    atomicJson(statePath(root,'ui-design.json'),{schemaVersion:1,project:path.basename(root),status:'draft',theme:{primary:'#2868bb',sidebar:'#16253e',font:'system-ui'},screens:[]});
    atomicJson(statePath(root,'visual-cases.json'),{schemaVersion:1,cases:[]});
    atomicJson(statePath(root,'requirements.json'),{schemaVersion:1,requirements:[]});
    audit(root,'init',{mode:actual,intent,complexity,uiRequired:selection.uiRequired,sourceRevision:found.git.revision});
  } catch(error) { // The new state directory contains only our own files at this point.
    fs.rmSync(stateDir,{recursive:true,force:true});
    throw error;
  }
  return {state,recommendation:selection,notice:'No application files, Git commits, framework installers or API calls were run.'};
}
export function selectFramework(root,framework) {
  if(!VALID_FRAMEWORKS.has(framework)) fail('Choose openspec, spec-kit, bmad or none.');
  const state=readState(root);
  if(state.framework&&state.framework!==framework) fail(`Framework already pinned to ${state.framework}; migration requires a separately reviewed plan. No automatic switch.`);
  if(state.framework===framework) return {...state,idempotent:true};
  const discovery=discover(root);
  const active=Object.entries(discovery.footprints).filter(([,v])=>v).map(([id])=>id);
  if(active.length && framework!=='none' && active.some(x=>x!==framework)) fail(`Existing framework footprint(s): ${active.join(', ')}. Refusing conflicting installation or duplicate methodology.`);
  return updateState(root,{framework,installation:{state:framework==='none'?'not-needed':'selected',selectedAt:utcNow()}},'framework-selected');
}
export function nativeFootprint(root, framework) {
  if(framework==='none') return true;
  return !!discover(root).footprints[framework];
}
// A native CLI may print a banner before its version. `specify version` draws
// ASCII art and then a bordered table, so the first stdout line is decoration,
// not a version. Strip decoration, prefer an explicitly labelled version, and
// fall back to the first version-shaped token.
const VERSION_TOKEN=/\b\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?\b/;
export function extractCliVersion(stdout){
  if(typeof stdout!=='string'||!stdout.trim()) return null;
  const lines=stdout
    .replace(/\u001B\[[0-9;?]*[ -\/]*[@-~]/g,'')
    .split(/\r?\n/)
    .map(line=>line.replace(/[\u2500-\u259F]/g,' ').trim())
    .filter(Boolean);
  const labelled=lines.find(line=>/version\b/i.test(line)&&VERSION_TOKEN.test(line));
  const match=(labelled||lines.find(line=>VERSION_TOKEN.test(line))||"").match(VERSION_TOKEN);
  return match?match[0]:null;
}
// A folder alone must not make an uninstalled native framework look executable.
// BMAD v6 is project-scaffolded, not a persistent global CLI; its check remains structural.
export function frameworkCheck(root,framework) {
  if(framework==='none') return {detected:true,ready:true,check:'not-needed'};
  if(!framework) return {detected:false,ready:false,check:'not-selected'};
  if(!nativeFootprint(root,framework)) return {detected:false,ready:false,check:'missing-native-files'};
  projectFile(root, framework==='openspec'?'openspec':framework==='spec-kit'?'.specify':'_bmad'); // refuse linked vendor directories
  if(framework==='bmad') {
    const base=projectFile(root,'_bmad');
    const hasFiles=fs.statSync(base).isDirectory() && fs.readdirSync(base,{withFileTypes:true}).some(e=>e.isDirectory()||e.isFile());
    return {detected:true,ready:hasFiles,check:hasFiles?'structural-only-vendor-runtime-unverified':'empty-native-scaffold'};
  }
  const argv=framework==='openspec'?['openspec',['--version']]:['specify',['version']];
  const result=probe(argv[0],argv[1],root);
  return {detected:true,ready:result.ok,check:result.ok?'cli-executable':'native-cli-not-available',version:result.ok?extractCliVersion(result.stdout):null,error:result.ok?null:result.error};
}
export function installPlan(root,version,agent='codex',{previewState,inspection}={}) {
  if(!['codex','claude','both'].includes(agent)) fail('Unknown framework target; use codex, claude or both.');
  // In-memory context is for a read-only bootstrap preview. applyInstall always
  // calls this without overrides and validates the persisted project state.
  const state=previewState||readState(root);
  if(!state.framework) fail('Select a framework first.');
  const d=inspection||discover(root); const f=state.framework;
  let probeRoot=root;
  while(!fs.existsSync(probeRoot)&&path.dirname(probeRoot)!==probeRoot)probeRoot=path.dirname(probeRoot);
  const installed=previewState?!!d.footprints?.[f]:nativeFootprint(root,f);
  const safeEmpty=d.mode==='New' || (d.fileCount===0 && !d.git.available);
  if(f==='none') return {framework:f,state:'not-needed',steps:[],safeToApply:true};
  const commands=[];
  if(f==='openspec') {
    if(!probe('openspec',['--version'],probeRoot).ok) commands.push({kind:'tool',cmd:'npm',args:['install','-g',`@fission-ai/openspec@${version||'<PIN_REQUIRED>'}`]});
    if(!installed) commands.push({kind:'project',cmd:'openspec',args:['init','--tools',agent==='both'?'codex,claude':agent]});
  }
  if(f==='spec-kit') {
    const scriptType=process.platform==='win32'?'ps':'sh';
    if(!probe('specify',['version'],probeRoot).ok) commands.push({kind:'tool',cmd:'uv',args:['tool','install','specify-cli','--from',`git+https://github.com/github/spec-kit.git@v${version||'<PIN_REQUIRED>'}`]});
    const codexInstalled=fs.existsSync(path.join(root,'.agents','skills'))&&fs.readdirSync(path.join(root,'.agents','skills')).some(x=>x.startsWith('speckit-'));
    const claudeInstalled=fs.existsSync(path.join(root,'.claude','skills'))&&fs.readdirSync(path.join(root,'.claude','skills')).some(x=>x.startsWith('speckit-'));
    if(!installed) {
      const first=agent==='both'?'codex':agent;
      const initArgs=['init','--here','--integration',first,'--script',scriptType,'--ignore-agent-tools'];
      if(state.mode==='Existing') commands.push({kind:'project',cmd:'specify',args:initArgs,input:'y\n',preservesExisting:true,reason:'Spec Kit existing-project merge without --force preserves existing files and adds missing scaffold.'});
      else commands.push({kind:'project',cmd:'specify',args:[...initArgs,'--non-interactive']});
      if(agent==='both') commands.push({kind:'project',cmd:'specify',args:['integration','install','claude','--script',scriptType]});
    } else {
      if((agent==='codex'||agent==='both')&&!codexInstalled) commands.push({kind:'project',cmd:'specify',args:['integration','install','codex','--script',scriptType]});
      if((agent==='claude'||agent==='both')&&!claudeInstalled) commands.push({kind:'project',cmd:'specify',args:['integration','install','claude','--script',scriptType]});
    }
  }
  if(f==='bmad') {
    const selectedVersion=version||BMAD_DEFAULT_VERSION;
    if(!/^6\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(selectedVersion))
      fail(`BMAD supports explicit v6 versions only; v7 is not supported. Received ${selectedVersion}.`);
    if(!installed) commands.push({kind:'project',cmd:'npx',args:['--yes',`bmad-method@${selectedVersion}`,'install','--directory','.','--modules','bmm','--tools','claude-code,codex'],interactive:true,supervised:true});
    version=selectedVersion;
  }
  const requiresVersion=commands.some(c=>c.args.some(a=>a.includes('<PIN_REQUIRED>')));
  const existing=state.mode==='Existing';
  const safeToApply=f==='spec-kit' ? true : (!existing || installed || (d.fileCount===0 && (!d.git.available || d.git.clean)));
  return {framework:f,agent,installed,mode:state.mode,steps:commands,requiresVersion,safeToApply,preflight:{gitClean:d.git.clean,sourceFiles:d.fileCount},
    warning:!safeToApply?'Existing nonempty projects require a human-run native setup after reviewing its file changes; automatic vendor scaffolding is refused.':
      f==='spec-kit'&&existing?'Existing project detected. Project Init uses Spec Kit\'s preserve-merge path (no --force); unrelated working-tree changes are allowed and existing files are preserved.':
      'Native installers execute third-party code. Explicit --apply consent and a version pin are required; no overwrites are silently authorized.'};
}
function exactVersion(version) { return typeof version==='string'&&/^(?:\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)$/.test(version); }
async function spawnLogged(command,args,{cwd,logFile,input='',timeoutMs=45*60*1000,streamOutput=false,env=process.env}={}) {
  const invocation=commandInvocation(command,args);
  assertNotLink(cwd);
  return new Promise((resolve,reject)=>{
    const log=logFile?fs.createWriteStream(logFile,{flags:'wx',mode:0o600}):null;
    const child=spawn(invocation.command,invocation.args,{cwd,env,windowsHide:true,...invocation.options,stdio:['pipe','pipe','pipe']});
    let errors='', bytes=0, stopped=false;
    const timeout=setTimeout(()=>{stopped=true;child.kill();},timeoutMs);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(log&&bytes<10*1024*1024)log.write(chunk);if(streamOutput)process.stdout.write(chunk);});
    child.stderr.on('data',chunk=>{errors+=(String(chunk)).slice(0,2048);if(log&&bytes<10*1024*1024)log.write(chunk);if(streamOutput)process.stderr.write(chunk);});
    child.on('error',error=>{clearTimeout(timeout);log?.end();reject(error);});
    child.on('close',code=>{clearTimeout(timeout);log?.end();resolve({exitCode:stopped?124:code??1,stderrTail:errors.slice(-1200),capturedBytes:Math.min(bytes,10*1024*1024),timedOut:stopped});});
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}
export async function applyInstall(root,version,{apply=false,agent='codex',streamOutput=true}={}) {
  activateUvToolBin(root);
  const plan=installPlan(root,version,agent);
  if(!apply||!plan.steps.length) return {...plan,applied:false};
  if(!plan.safeToApply) fail(plan.warning);
  if(plan.requiresVersion || !exactVersion(version)) fail('An explicit immutable semver pin (--version X.Y.Z) is required for external installation.');
  if(plan.steps.some(s=>s.interactive)) fail('This vendor installer requires an interactive terminal. Review the displayed command and run it directly after backup; Project Init will never pipe an empty response or pretend an interactive install succeeded.');
  if(plan.steps.some(s=>s.kind==='tool'&&s.cmd==='uv')&&!probe('uv',['--version'],root).ok) fail('Spec Kit requires uv; install it separately and retry.');
  const results=[];
  for(const step of plan.steps) {
    if(step.kind==='project'&&plan.mode==='Existing'&&!nativeFootprint(root,plan.framework)&&plan.framework!=='spec-kit') {
      audit(root,'install-blocked',{framework:plan.framework,reason:'Vendor project init on nonempty existing repository requires direct human review'});
      return {...plan,applied:false,results,blocked:'Vendor project scaffolding refused on existing repository. Run the native installer manually after reviewing changes.'};
    }
    const logName=`install-${Date.now()}-${results.length}.log`;
    fs.mkdirSync(statePath(root,'runs'),{recursive:true});
    const receipt={when:utcNow(),kind:step.kind,command:[step.cmd,...step.args],status:'running'};
    audit(root,'install-start',{framework:plan.framework,kind:step.kind,command:receipt.command});
    const outcome=await spawnLogged(step.cmd,step.args,{cwd:root,logFile:statePath(root,path.join('runs',logName)),input:step.input||'',streamOutput,timeoutMs:15*60*1000});
    const item={...receipt,...outcome,log:`runs/${logName}`,status:outcome.exitCode===0?'completed':'failed'};
    results.push(item);audit(root,'install-step',item);
    if(outcome.exitCode!==0) {updateState(root,{installation:{state:'failed',framework:plan.framework,steps:results}},'install-failed');return {...plan,applied:false,results};}
    if(step.cmd==='uv'&&step.args[0]==='tool') activateUvToolBin(root);
  }
  const footprint=nativeFootprint(root,plan.framework);
  updateState(root,{installation:{state:footprint?'installed':'unverified',framework:plan.framework,version,steps:results,verifiedAt:utcNow()}},'install-finished');
  return {...plan,applied:footprint,results,verifiedFootprint:footprint};
}
export function eccInstallPlan(root,version='2.2.3',{agent='both',scope='local',previewState}={}) {
  // Only read-only planning can supply a proposed state before initialization.
  if(!previewState)readState(root);
  if(!['codex','claude','both'].includes(agent)) fail('ECC target must be codex, claude or both.');
  if(!['local','project','user'].includes(scope)) fail('ECC Claude scope must be local, project or user.');
  if(!exactVersion(version)) fail('ECC requires an explicit immutable semver pin, for example --version 2.2.3.');

  const capabilities=eccHarnessCapabilities(root);
  const requested=agent==='both'?['claude','codex']:[agent];
  const steps=[];

  if(requested.includes('claude')){
    if(capabilities.claude.channel==='native-plugin'){
      const args=['--yes',`ecc-universal@${version}`,'install','--guided',
        '--harness','claude','--claude-scope',scope,'--claude-hooks','standard','--yes'];
      steps.push({
        id:'claude',
        channel:'native-plugin',
        command:['npx',...args],
        dryRunCommand:['npx',...args,'--dry-run'],
        note:'Claude uses ECC native plugin lifecycle because the installed Claude Code exposes plugin inventory APIs.'
      });
    }else{
      const args=['--yes',`ecc-universal@${version}`,'install',
        '--profile','core','--target','claude-project','--enable-hooks'];
      steps.push({
        id:'claude',
        channel:'managed-project',
        command:['npx',...args],
        dryRunCommand:['npx',...args,'--dry-run'],
        note:'Claude plugin APIs are unavailable, so ECC uses its supported project-local managed adapter with hooks enabled.'
      });
    }
  }

  if(requested.includes('codex')){
    if(capabilities.codex.channel==='native-plugin'){
      const args=['--yes',`ecc-universal@${version}`,'install','--guided',
        '--harness','codex','--yes'];
      steps.push({
        id:'codex',
        channel:'native-plugin',
        command:['npx',...args],
        dryRunCommand:['npx',...args,'--dry-run'],
        note:'Codex uses ECC native marketplace/plugin lifecycle because the installed Codex CLI exposes plugin inventory APIs.'
      });
    }else if(capabilities.codex.channel==='legacy-sync'){
      steps.push({
        id:'codex',
        channel:'legacy-sync',
        internal:'legacy-codex-sync',
        command:['project-init-internal','ecc-legacy-codex-sync',version],
        dryRunCommand:null,
        note:`Codex plugin APIs are unavailable and CODEX_HOME is custom (${capabilities.codex.activeHome}), so Project Init uses ECC's documented compatibility sync that honors CODEX_HOME.`
      });
    }else{
      const args=['--yes',`ecc-universal@${version}`,'install',
        '--profile','core','--target','codex'];
      steps.push({
        id:'codex',
        channel:'managed-home',
        command:['npx',...args],
        dryRunCommand:['npx',...args,'--dry-run'],
        note:'Codex native plugin APIs are unavailable, so ECC uses its supported managed Codex home adapter.'
      });
    }
  }

  return {
    version,agent,scope,capabilities,steps,
    channels:Object.fromEntries(steps.map(step=>[step.id,step.channel])),
    commands:steps.map(step=>step.command),
    dryRunCommands:steps.map(step=>step.dryRunCommand).filter(Boolean),
    note:'ECC chooses one supported channel per harness. It never stacks native-plugin and managed installs for the same harness.'
  };
}
export async function applyEcc(root,version='2.2.3',{agent='both',scope='local',apply=false,env}={}) {
  const plan=eccInstallPlan(root,version,{agent,scope});
  if(!apply) return {...plan,applied:false};

  const runtime=env?{env}:{...prepareVendorRuntimeEnvironment()};
  fs.mkdirSync(statePath(root,'runs'),{recursive:true});
  const results=[];

  for(const step of plan.steps){
    const logName=`ecc-install-${Date.now()}-${step.id}.log`;
    audit(root,'ecc-install-start',{
      version,agent,scope,harness:step.id,channel:step.channel,
      command:step.command,codexNative:runtime.codexNative||null
    });

    if(step.internal==='legacy-codex-sync'){
      try{
        const internal=installLegacyCodexEcc(version,{env:runtime.env});
        const result={id:step.id,channel:step.channel,exitCode:0,timedOut:false,internal,log:null};
        results.push(result);
        audit(root,'ecc-install-finished',{version,agent,scope,...result});
        continue;
      }catch(error){
        const result={id:step.id,channel:step.channel,exitCode:1,timedOut:false,stderrTail:String(error?.message||error),log:null};
        results.push(result);
        audit(root,'ecc-install-finished',{version,agent,scope,...result});
        return {...plan,applied:false,failedHarness:step.id,failedChannel:step.channel,results};
      }
    }

    const outcome=await spawnLogged(step.command[0],step.command.slice(1),{
      cwd:root,env:runtime.env,
      logFile:statePath(root,path.join('runs',logName)),
      streamOutput:true,timeoutMs:20*60*1000
    });
    const result={id:step.id,channel:step.channel,...outcome,log:`runs/${logName}`};
    results.push(result);
    audit(root,'ecc-install-finished',{version,agent,scope,...result});
    if(outcome.exitCode!==0){
      return {...plan,applied:false,failedHarness:step.id,failedChannel:step.channel,results};
    }
  }

  return {...plan,applied:true,results};
}

export function artifactPaths(root) {
  const baseline=readJson(statePath(root,'baseline.json'),false);
  return baseline?.specPaths||[];
}
export function validUIDesign(root,strict=false) {
  const design=readJson(statePath(root,'ui-design.json'),false);
  if(!design||design.schemaVersion!==1||!Array.isArray(design.screens)) fail('UI design must have schemaVersion 1 and a screens array.');
  const ids=new Set();
  for(const s of design.screens) {
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)) fail('UI screen IDs must be unique and nonempty.');
    ids.add(s.id);
    if(strict && (!s.title||!Array.isArray(s.navigation)||!s.navigation.length||!Array.isArray(s.sections)||!s.sections.length||!Array.isArray(s.actions))) fail(`UI screen ${s.id} must specify title, navigation, content sections and an actions array before approval.`);
    if(strict){
      if(s.navigation.some(item=>!(typeof item==='string'?item:item?.label)?.trim())) fail(`UI screen ${s.id} has a navigation entry without a label.`);
      if(s.actions.some(item=>!item?.label?.trim())) fail(`UI screen ${s.id} has an unnamed button/action.`);
      if(!Array.isArray(s.states)||!s.states.length||s.states.some(item=>typeof item!=='string'||!item.trim())) fail(`UI screen ${s.id} needs explicit non-default component/loading/empty/error state labels for meaningful visual review.`);
      if(s.sections.some(section=>!section?.title?.trim() || (!section.description && !(Array.isArray(section.columns)&&section.columns.length)))) fail(`UI screen ${s.id} contains an incomplete content section.`);
      if(Array.isArray(s.metrics)&&s.metrics.some(metric=>!metric?.label||metric.value===undefined)) fail(`UI screen ${s.id} has an incomplete metric definition.`);
    }
  }
  if(strict&&!design.screens.length) fail('UI review requires at least one actual designed screen. Generic placeholders are not approvable.');
  if(strict&&(!/^#[0-9a-fA-F]{6}$/.test(design.theme?.primary||'')||!/^#[0-9a-fA-F]{6}$/.test(design.theme?.sidebar||'')||!design.theme?.font)) fail('UI design must specify valid primary/sidebar colors and font tokens before approval.');
  return design;
}
export function validateChecks(root,config) {
  if(config.schemaVersion!==1 || !Array.isArray(config.checks)) fail('Invalid check configuration schema.');
  const names=new Set();
  for (const check of config.checks) {
    if(!check||typeof check.name!=='string'||!check.name||names.has(check.name)||!Array.isArray(check.argv)||check.argv.length<1||check.argv.some(x=>typeof x!=='string'||!x)) fail('Each check needs unique name and nonempty argv string array.');
    names.add(check.name);
    if(!allowedChecks.has(check.argv[0])) fail(`Executable not on approved check runner list: ${check.argv[0]}`);
    if(check.cwd!==undefined){
      if(typeof check.cwd!=='string'||!check.cwd||path.isAbsolute(check.cwd)||/^[a-z]:/i.test(check.cwd)||check.cwd.replaceAll('\\','/').split('/').includes('..'))fail(`Invalid working directory for check ${check.name}`);
      const cwd=projectFile(root,check.cwd.replaceAll('\\','/'));
      if(!fs.existsSync(cwd)||!fs.statSync(cwd).isDirectory())fail(`Check working directory not found: ${check.cwd}`);
      for(let cursor=cwd;path.resolve(cursor)!==path.resolve(root);cursor=path.dirname(cursor)){
        if(fs.existsSync(path.join(cursor,'.git')))fail(`Check ${check.name} targets another Git worktree; prepare and verify that checkout separately.`);
      }
    }
    if(process.platform==='win32'&&check.argv.some(x=>/[&|<>^%!\r\n]/.test(x))) fail('Shell metacharacters are not permitted in Windows check argv. Use a package script with a plain script name.');
  }
  return config;
}
export function validChecks(root) {return validateChecks(root,readJson(statePath(root,'config.json')));}
function manifestFingerprint(root,paths,nativeTextRepresentations=[]) {
  const state=readState(root), config=validChecks(root);
  const acceptedRepresentations=[];
  const entries=paths.map(rel=>{
    const filepath=projectFile(root,rel);
    if(!fs.existsSync(filepath)||!fs.statSync(filepath).isFile()) fail(`Missing approved spec: ${rel}`);
    const relative=rel.replaceAll('\\','/'),actualSha256=hashFile(filepath);
    const representation=nativeTextRepresentations.find(item=>item.path===relative&&item.actualSha256===actualSha256);
    if(representation)acceptedRepresentations.push(representation);
    return {path:relative,sha256:representation?representation.approvedSha256:actualSha256};
  });
  if(state.uiRequired) {
    validUIDesign(root,true);
    entries.push({path:`${STATE_DIR}/ui-design.json`,sha256:hashFile(statePath(root,'ui-design.json'))});
    const casesFile=statePath(root,'visual-cases.json');
    if(fs.existsSync(casesFile)) {
      const cases=readJson(casesFile);
      if(cases.schemaVersion!==1||!Array.isArray(cases.cases))fail('Invalid visual-cases.json');
      entries.push({path:`${STATE_DIR}/visual-cases.json`,sha256:hashFile(casesFile)});
      for(const item of cases.cases){
        if(!item||!/^[a-z0-9][a-z0-9_-]{0,70}$/.test(item.id)||item.reference!==`${STATE_DIR}/visual/baselines/${item.id}.png`)fail('Invalid approved screenshot reference');
        const file=projectFile(root,item.reference);if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Missing visual reference: ${item.reference}`);
        entries.push({path:item.reference,sha256:hashFile(file)});
      }
    }
  }
  const reqFile=statePath(root,'requirements.json');
  if(fs.existsSync(reqFile)){readJson(reqFile);entries.push({path:`${STATE_DIR}/requirements.json`,sha256:hashFile(reqFile)});}
  const packsFile=statePath(root,'packs.json');
  if(fs.existsSync(packsFile)){readJson(packsFile);entries.push({path:`${STATE_DIR}/packs.json`,sha256:hashFile(packsFile)});}
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  const fingerprint=hashBytes(JSON.stringify({framework:state.framework,uiRequired:state.uiRequired,checks:config.checks,files:entries}));
  return {fingerprint,entries,nativeTextRepresentations:acceptedRepresentations};
}
export function establishBaseline(root,paths) {
  const state=readState(root);
  if(!state.framework) fail('Select the framework before registering authoritative specs.');
  const clean=[...new Set(paths)].map(p=>p.replaceAll('\\','/'));
  if(!clean.length) fail('Provide at least one existing authoritative specification file using --spec. No duplicate Project Init PRD is generated.');
  for (const p of clean) {
    if(p.startsWith(`${STATE_DIR}/`)) fail('Native specification paths must be owned by the selected framework, not Project Init internal state.');
    if(p.split('/').some(part=>SECRET_FILE.test(part))) fail('Credentials and secret files may not be registered as specification artifacts.');
  }
  const baseline=manifestFingerprint(root,clean);
  const prior=readJson(statePath(root,'baseline.json'),false);
  if(prior?.hash===baseline.fingerprint&&JSON.stringify([...prior.specPaths].sort())===JSON.stringify([...clean].sort()))return {...prior,unchanged:true};
  const result={schemaVersion:1,framework:state.framework,specPaths:clean,hash:baseline.fingerprint,files:baseline.entries,recordedAt:utcNow(),sourceRevision:gitInfo(root).revision};
  atomicJson(statePath(root,'baseline.json'),result);
  audit(root,'baseline-registered',{specPaths:clean,hash:result.hash});
  return result;
}
function approvedFactoryTextRepresentations(root,baseline){
  const origin=readJson(statePath(root,'factory-origin.json'),false);
  if(origin?.schemaVersion!==1||origin.baselineHash!==baseline.hash||!Array.isArray(origin.nativeTextRepresentations))return [];
  const fields=['path','mode','approvedSha256','actualSha256'],accepted=[];
  for(const record of origin.nativeTextRepresentations){
    if(!record||typeof record!=='object'||Object.keys(record).length!==fields.length||!fields.every(key=>Object.hasOwn(record,key)))continue;
    if(record.mode!=='utf8-crlf-lf-v1'||typeof record.path!=='string'||record.path.startsWith(`${STATE_DIR}/`)||!baseline.specPaths.includes(record.path))continue;
    if(origin.nativeTextRepresentations.filter(item=>item?.path===record.path).length!==1)continue;
    const approved=baseline.files.find(item=>item.path===record.path);
    if(!approved||record.approvedSha256!==approved.sha256)continue;
    const bytes=fs.readFileSync(projectFile(root,record.path));
    if(record.actualSha256!==hashBytes(bytes))continue;
    const proof=nativeTextRepresentation(record.path,bytes,approved.sha256);
    if(proof&&fields.every(key=>proof[key]===record[key]))accepted.push(proof);
  }
  return accepted;
}
export function checkBaseline(root) {
  const baseline=readJson(statePath(root,'baseline.json'),false);
  if(!baseline) return {exists:false,current:false,reason:'No baseline registered'};
  try {
    const current=manifestFingerprint(root,baseline.specPaths,approvedFactoryTextRepresentations(root,baseline));
    const before=new Map(baseline.files.map(item=>[item.path,item.sha256])),after=new Map(current.entries.map(item=>[item.path,item.sha256]));
    const modified=[...new Set([...before.keys(),...after.keys()])].filter(file=>before.get(file)!==after.get(file)).sort();
    return {exists:true,current:current.fingerprint===baseline.hash,approvedHash:baseline.hash,actualHash:current.fingerprint,
      modified,
      specPaths:baseline.specPaths,nativeTextRepresentations:current.nativeTextRepresentations};
  } catch(error) {return {exists:true,current:false,reason:error.message,specPaths:baseline.specPaths};}
}
export function recordReview(root,{actor,evidence,verdict='pass'}={}) {
  if(!actor?.trim()||!evidence?.trim()) fail('Real reviewer name and evidence reference required; do not fabricate identity or review.');
  if(!['pass','changes-requested'].includes(verdict)) fail('Review verdict must be pass or changes-requested.');
  const baseline=checkBaseline(root);
  if(!baseline.current) fail(`Cannot record review against stale/missing baseline: ${baseline.reason||baseline.modified?.join(',')}`);
  const review={schemaVersion:1,actor,evidence,verdict,baselineHash:baseline.actualHash,recordedAt:utcNow(),limitation:'Local self-attestation; identity and semantic review are not independently authenticated.'};
  atomicJson(statePath(root,'review.json'),review);audit(root,'review-recorded',{actor,verdict,baselineHash:review.baselineHash});
  return review;
}
export function approve(root,{actor,evidence}={}) {
  if(!actor?.trim()||!evidence?.trim()) fail('Explicit user approval actor and actual quote/reference required. Never infer approval from chat context.');
  const baseline=checkBaseline(root),review=readJson(statePath(root,'review.json'),false);
  if(!baseline.current||!review||review.verdict!=='pass'||review.baselineHash!==baseline.actualHash) fail('A current, independent passing review of the exact baseline is required before approval.');
  const source=sourceSnapshot(root);
  const receipt={schemaVersion:1,actor,evidence,baselineHash:baseline.actualHash,sourceHash:source.hash,sourceFiles:source.fileCount,recordedAt:utcNow(),scope:'Design approval only. Not application execution, merge or deployment authorization.',limitation:'Local user-supplied attestation is not an authenticated signature.'};
  atomicJson(statePath(root,'approval.json'),receipt);audit(root,'design-approved',{actor,baselineHash:receipt.baselineHash});return receipt;
}

export function reconcileSource(root,{actor,evidence}={}) {
  if(!actor?.trim()||!evidence?.trim()) fail('Source reconciliation requires an actual independent reviewer and evidence reference.');
  const baseline=checkBaseline(root),approval=readJson(statePath(root,'approval.json'),false);
  if(!baseline.current||!approval||approval.baselineHash!==baseline.actualHash) fail('Cannot reconcile source against stale or unapproved design/spec baseline.');
  const source=sourceSnapshot(root);
  const receipt={schemaVersion:1,actor,evidence,sourceHash:source.hash,sourceFiles:source.fileCount,baselineHash:baseline.actualHash,recordedAt:utcNow(),
    limitation:'Independent source/architecture impact must be reviewed externally. This local record does not prove semantic match.'};
  atomicJson(statePath(root,'source-review.json'),receipt);
  audit(root,'source-reconciled',{actor,sourceHash:source.hash,baselineHash:baseline.actualHash});
  return receipt;
}

export function status(root) {
  if(!fs.existsSync(statePath(root,'project.json'))){
    const preparation=preparationPlan(root);
    return {project:root,initialized:false,readyForImplementation:false,releaseReady:false,blocked:worktreeStateGate(root,preparation),preparation,factory:factoryRuntimeStatus(root)};
  }
  const state=readState(root), baseline=checkBaseline(root), review=readJson(statePath(root,'review.json'),false), approval=readJson(statePath(root,'approval.json'),false);
  const approved=!!(baseline.current&&review?.verdict==='pass'&&review.baselineHash===baseline.actualHash&&approval?.baselineHash===baseline.actualHash);
  const currentSource=sourceSnapshot(root);
  const sourceReview=readJson(statePath(root,'source-review.json'),false);
  const sourceAligned=!!(approval && (approval.sourceHash===currentSource.hash || (sourceReview?.sourceHash===currentSource.hash && sourceReview.baselineHash===baseline.actualHash && sourceReview.recordedAt>=approval.recordedAt)));
  const framework=frameworkCheck(root,state.framework);
  const frameworkDetected=framework.detected;
  const checks=readJson(statePath(root,'evidence/latest-checks.json'),false);
  const configured=configChecks(root);
  const checksCurrent=!!(checks?.passed&&configured.length&&checks.checks?.length===configured.length&&checks.baselineHash===baseline.actualHash&&checks.sourceHash===currentSource.hash&&configured.every(c=>checks.checks.some(r=>r.name===c.name&&r.exitCode===0&&JSON.stringify(r.argv)===JSON.stringify(c.argv)&&(r.cwd||'.')===(c.cwd||'.'))));
  const execution=readJson(statePath(root,'evidence/latest-run.json'),false);
  const visual=readJson(statePath(root,'evidence/latest-visual.json'),false);
  const guard=readJson(statePath(root,'evidence/latest-guard.json'),false);
  let visualCurrent=!state.uiRequired;
  if(state.uiRequired&&visual?.passed&&visual.baselineHash===baseline.actualHash&&visual.sourceHash===currentSource.hash){
    try {const cases=readJson(statePath(root,'visual-cases.json'));
      visualCurrent=!!(visual.manifestHash===hashFile(statePath(root,'visual-cases.json'))&&cases.cases?.length&&cases.cases.every(c=>{
        const result=visual.results?.find(r=>r.id===c.id);return result?.passed&&fs.existsSync(projectFile(root,c.actual))&&fs.existsSync(projectFile(root,c.reference))&&result.actualHash===hashFile(projectFile(root,c.actual))&&result.referenceHash===hashFile(projectFile(root,c.reference));
      }));
    }catch{visualCurrent=false;}
  }
  // A cached PASS cannot remain current if an actual screenshot, review file or execution receipt changes.
  // The guard still performs the full cross-requirement validation when explicitly run.
  const semantic=readJson(statePath(root,'evidence/semantic-review.json'),false);
  const requirementsPath=statePath(root,'requirements.json');
  let semanticReceiptCurrent=!!(semantic?.baselineHash===baseline.actualHash &&
    semantic?.sourceHash===currentSource.hash && semantic?.requirementsHash===hashFile(requirementsPath) &&
    semantic?.findings?.length && semantic.findings.every(f=>f.verdict==='pass'));
  if(semanticReceiptCurrent){
    try{for(const finding of semantic.findings)for(const ev of finding.evidenceFiles||[]){
      const p=projectFile(root,ev.path);
      if(!fs.existsSync(p)||hashFile(p)!==ev.sha256) semanticReceiptCurrent=false;
    }}catch{semanticReceiptCurrent=false;}
  }
  const executionState=executionEvidence(root,{sourceHash:currentSource.hash,baselineHash:baseline.actualHash});
  const executionCurrent=executionState.valid;
  const feature=featureReadiness(root);
  const factory=factoryRuntimeStatus(root);
  const guardCurrent=!!(guard?.passed && guard.baselineHash===baseline.actualHash && guard.sourceHash===currentSource.hash &&
    approved && sourceAligned && checksCurrent && visualCurrent && semanticReceiptCurrent && executionCurrent);
  return {project:root,mode:state.mode,framework:state.framework,frameworkDetected:!!frameworkDetected,uiRequired:state.uiRequired,packs:listPacks(root),
    frameworkCheck:framework,baseline,sourceAligned,sourceFingerprint:currentSource.hash,reviewCurrent:!!(baseline.current&&review?.verdict==='pass'&&review.baselineHash===baseline.actualHash),approved,
    latestExecution:execution?{phase:execution.phase,status:execution.status,runId:execution.runId,at:execution.finishedAt}:null,
    feature,executionEvidence:{valid:executionState.valid,mode:executionState.mode,reason:executionState.reason},factory,
    testEvidenceCurrent:checksCurrent,leanKitBundled:true,leanKitDetected:discover(root).indicators.leanKitDetected,visualEvidenceCurrent:visualCurrent,driftGuardCurrent:guardCurrent,releaseCandidateReady:guardCurrent,
    readyForImplementation:!!(approved&&sourceAligned&&framework.ready&&feature.configured),
    readiness:{tooling:framework.ready,featureConfiguration:feature.configured,baseline:baseline.current,review:!!(baseline.current&&review?.verdict==='pass'&&review.baselineHash===baseline.actualHash),approval:approved,executionEvidence:executionCurrent,checks:checksCurrent,acceptance:guardCurrent},
    releaseReady:false,
    note:'Design approval is not deployment authorization. Visual and semantic evidence gates must pass; any passed gate is still subject to human release review.'};
}
export function workflow(root,phase='planning',task='') {
  const state=readState(root);
  if(!state.framework) fail('Select a framework first.');
  if(!['planning','design','implementation','verification'].includes(phase)) fail('Unknown phase.');
  const workflows={
    openspec:{planning:'Use the native OpenSpec explore/propose workflow ($openspec-explore or $openspec-propose as installed). Keep proposal/specs/design/tasks in openspec/.',
      design:'Develop specs and architecture in the active OpenSpec change. Produce actual screen data in .project-init/ui-design.json for UI projects.',
      implementation:'Use the installed $openspec-apply-change workflow for the agreed change. Implement working code and relevant tests.',
      verification:'Use $openspec-verify-change for completeness/correctness, then report findings. Do not archive until separate Project Init gates pass.'},
    'spec-kit':{planning:'Use installed $speckit-constitution (only if needed), $speckit-specify, $speckit-clarify and $speckit-plan. Keep native artifacts in specs/.',
      design:'Use native Spec Kit specs and plan as authority. Produce actual screen data in .project-init/ui-design.json before design approval.',
      implementation:'Reuse the existing native tasks.md and its remaining task IDs for the approved scoped feature. Use the installed $speckit-implement workflow; regenerate tasks only if the native task breakdown is missing or the approved scope changed.',
      verification:'Use $speckit-converge to identify missing work and re-run $speckit-implement as needed; project verification gates remain separate.'},
    bmad:{planning:'Use the installed BMAD help/setup and appropriate PRD, UX, architecture and story workflows. Version-specific workflow names must be read from installed BMAD skills, not guessed.',
      design:'Use BMAD native UX/architecture process. Put high-fidelity visual screen representation in .project-init/ui-design.json and seek explicit review.',
      implementation:'Follow installed BMAD build/story workflow (e.g. bmad-build if available). Codex writes application code and tests.',
      verification:'Follow installed BMAD native review/test workflow. Project Init independently gates acceptance.'},
    none:{planning:'Use one scoped task brief as the authoritative change statement. Avoid parallel specs or a backlog.',
      design:'Produce relevant high-fidelity UI design before coding if this is a UI project.',
      implementation:'Implement the approved bounded change and relevant tests. Do not invent work.',
      verification:'Run explicit configured tests and independent acceptance checks.'}
  };
  const rootText=`PROJECT INIT ${VERSION}\nProject: ${root}\nMethodology: ${state.framework}\nMode: ${state.mode}\nStage: ${phase}\n\n`;
  const governance=`\nRules:\n- Read the actual source, installed framework instructions and existing AGENTS.md before changing files.\n- The selected framework owns PRD, specification, architecture decisions and tasks. Project Init does not create duplicate documents.\n- Preserve working functionality and untouched areas. No speculative features, redesign, dependency additions or external actions.\n- Review visual UI in the supplied native spec and .project-init/ui-design.json, and obtain explicit user approval before implementation.\n- No fabricated tests, review records, approvals, installation success, releases or background-progress claims.\n- No automatic commit, merge, push, deployment, credentials or infrastructure mutation.\n- Report changed files, actual test commands and results, unresolved blockers and rollback.\n- Lean Kit is bundled: use project-init lean --input SOURCE --out .project-init/lean/REPORT.html --execute for human-facing reports; no second installation.
- Release candidate requires project-init visual compare, project-init semantic plan, independent reviewed per-requirement evidence, project-init verify --execute, and project-init guard. Never equate screenshot pixels or AI assertions with full functional proof.\n`;
  const prepared=preparationPlan(root);
  const handoff=`\nExisting feature context:\n${JSON.stringify({feature:prepared.feature,tasks:prepared.tasks.path,remainingTasks:prepared.tasks.pending,selection:prepared.selection,readiness:prepared.status,next:prepared.next,worktree:prepared.context,ci:prepared.ci},null,2)}\n\nUse project-init prepare --project . to inspect this scope, then prepare --apply for authorized local preparation. Reuse native files and task IDs. Resolve agent-owned mapping/check gaps from the code; request human input only for real scope or approval decisions. A new chat/session must carry this context and update the same native tasks. No native spec is generated by preparation.\n`;
  return rootText+(task?`Approved bounded task or current user request:\n${task}\n\n`:'')+workflows[state.framework][phase]+handoff+governance;
}
export function configChecks(root) {return validChecks(root).checks;}
export async function runChecks(root,{execute=false}={}) {
  const checks=configChecks(root),baseline=checkBaseline(root);
  if(!checks.length) return {executed:false,passed:false,reason:'No explicit verification commands configured; no tests were assumed.',preparation:preparationPlan(root),next:'Run project-init prepare --project .; use --apply to configure the actual discovered checks before reviewing the baseline.'};
  if(!execute) return {executed:false,commands:checks.map(c=>({name:c.name,argv:c.argv,cwd:c.cwd||'.'})),reason:'Dry run only. Pass --execute to run project commands.'};
  if(!baseline.current) fail('Cannot verify with changed/missing approved spec/design baseline.');
  const results=[];
  const before=sourceSnapshot(root);
  fs.mkdirSync(statePath(root,'runs'),{recursive:true});
  atomicJson(statePath(root,'evidence/latest-checks.json'),{executed:true,passed:false,status:'running',baselineHash:baseline.actualHash,sourceHash:before.hash,checks:[],at:utcNow()});
  for(const check of checks){
    const file=`check-${Date.now()}-${check.name.replace(/[^a-z0-9_-]/gi,'_')}.log`;
    const startedAt=utcNow();
    const cwd=check.cwd?projectFile(root,check.cwd.replaceAll('\\','/')):root;
    audit(root,'check-start',{name:check.name,argv:check.argv,cwd:check.cwd||'.'});
    let outcome;
    try{outcome=await spawnLogged(check.argv[0],check.argv.slice(1),{cwd,logFile:statePath(root,`runs/${file}`),timeoutMs:15*60*1000,streamOutput:true});}
    catch(error){outcome={exitCode:127,timedOut:false,error:error.message};audit(root,'check-launch-failed',{name:check.name,error:error.message});}
    results.push({name:check.name,argv:check.argv,cwd:check.cwd||'.',startedAt,finishedAt:utcNow(),exitCode:outcome.exitCode,timedOut:outcome.timedOut,...(outcome.error?{error:outcome.error}:{}),log:`runs/${file}`});
    audit(root,'check-finish',{name:check.name,exitCode:outcome.exitCode});
    if(outcome.exitCode!==0)break;
  }
  const after=checkBaseline(root);
  const source=sourceSnapshot(root);
  const receipt={executed:true,passed:results.length===checks.length&&results.every(x=>x.exitCode===0)&&after.current&&after.actualHash===baseline.actualHash&&source.hash===before.hash,baselineHash:after.actualHash||null,sourceHash:source.hash,sourceHashBefore:before.hash,sourceChanged:source.hash!==before.hash,
    checks:results,at:utcNow(),limitation:'Passing checks do not themselves prove semantic requirements, complete UI fidelity, or release readiness.'};
  fs.mkdirSync(statePath(root,'evidence'),{recursive:true});
  atomicJson(statePath(root,'evidence/latest-checks.json'),receipt);audit(root,'checks-result',{passed:receipt.passed,checks:results.map(r=>({name:r.name,exitCode:r.exitCode}))});
  return receipt;
}
function scopePaths(after,allow) {
  const paths=[...new Set(after)];
  return {changed:paths,unapproved:paths.filter(p=>!allow.some(a=>p===a||p.startsWith(a.endsWith('/')?a:a+'/')))};
}
function gitChangedPaths(root){
  const out=spawnSync('git',['status','--porcelain=v1','--untracked-files=all','-z','--','.',':(exclude).project-init'],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:8*1024*1024});
  if(out.status!==0) fail(`Git status failed: ${out.stderr}`);
  const rows=out.stdout.split('\0');const result=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];if(!row)continue;
    const status=row.slice(0,2);let file=row.slice(3).replaceAll('\\','/');
    if(file)result.push(file);
    if(status.includes('R')||status.includes('C')) {i++;if(rows[i])result.push(rows[i].replaceAll('\\','/'));}
  }
  return result;
}
export async function runCodex(root,{phase='planning',task='',allowed=[],execute=false}={}) {
  const state=readState(root);
  const prompt=workflow(root,phase,task);
  if(phase==='implementation') {
    const s=status(root);
    if(!s.readyForImplementation) fail(`Implementation blocked: a current approved baseline, configured feature checks/mappings, aligned source and runnable native framework are required.${s.feature?.missing?.length?' Missing: '+s.feature.missing.join('; ')+'. Use project-init prepare --project . to resolve preparation.':''}`);
    if(!task?.trim()) fail('Bounded implementation task is mandatory.');
    if(!allowed.length) fail('Implementation requires one or more --allow path scopes.');
  }
  if(!execute) return {executed:false,phase,prompt,allowed,notice:'Dry run. Codex was not launched.'};
  const runtime=frameworkCheck(root,state.framework);
  if(!runtime.ready) fail(`Selected native framework is not runnable: ${runtime.check}. Complete and validate native setup first.`);
  if(!probe('codex',['login','status'],root,10000).ok) fail('Codex CLI not signed in. Run codex login using your existing ChatGPT account.');
  const git=gitInfo(root);
  // Git's own prefix check is portable; a nested directory cannot impersonate
  // the repository root even when its displayed path differs from Node's path.
  const sameRoot=git.available && git.atRepoRoot===true;
  if(!git.available||!sameRoot||!git.clean) {
    const reason=!git.available?'git-not-found':!sameRoot?'git-root-mismatch':'git-worktree-not-clean';
    fail(`Automated Codex execution requires a clean Git repository rooted at the project (${reason}). Existing changes are never discarded or overwritten.`);
  }
  const normalized=allowed.map(a=>{
    if(path.isAbsolute(a)||a.includes('..')||a.startsWith('.project-init'))fail('Invalid allowed-change path');
    const p=projectFile(root,a);return path.relative(root,p).split(path.sep).join('/');
  });
  const runId=crypto.randomUUID();
  fs.mkdirSync(statePath(root,'runs'),{recursive:true});fs.mkdirSync(statePath(root,'evidence'),{recursive:true});
  const filename=`runs/codex-${runId}.jsonl`;
  const initialRevision=git.revision;
  const baselineHash=checkBaseline(root).actualHash||null;
  const sourceHashBefore=sourceSnapshot(root).hash;
  const startedAt=utcNow();audit(root,'codex-start',{runId,phase,promptHash:hashBytes(prompt),allowed:normalized,initialRevision});
  atomicJson(statePath(root,'evidence/latest-run.json'),{schemaVersion:2,runner:'codex',runId,phase,status:'running',baselineHash,sourceHashBefore,allowedPaths:normalized,startedAt});
  let outcome;
  try{outcome=await spawnLogged('codex',['exec','--json','--sandbox','workspace-write','-'],{cwd:root,input:prompt,logFile:statePath(root,filename),timeoutMs:45*60*1000});}
  catch(error){outcome={exitCode:127,error:error.message};}
  const finalRevision=gitInfo(root).revision;
  const changed=gitChangedPaths(root);
  if(finalRevision!==initialRevision) {
    const committed=spawnSync('git',['diff','--name-only','-z',initialRevision,finalRevision,'--','.',':(exclude).project-init'],{cwd:root,encoding:'utf8',timeout:15000});
    if(committed.status===0)changed.push(...committed.stdout.split('\0').filter(Boolean));
    else changed.push('UNVERIFIED_GIT_HISTORY_CHANGE');
  }
  const scope=scopePaths(changed,normalized);
  const specCurrent=checkBaseline(root).current;
  const planningPrefixes=['openspec/','specs/','.specify/','_bmad/','.agents/skills/'];
  const outOfPhase=phase!=='implementation'&&scope.changed.filter(x=>!planningPrefixes.some(prefix=>x.startsWith(prefix)));
  const scopeViolation=phase==='implementation'&&scope.unapproved.length>0;
  const approvalDrift=phase==='implementation'&&!specCurrent;
  const receipt={schemaVersion:2,runner:'codex',runId,phase,baselineHash,sourceHashBefore,allowedPaths:normalized,status:outcome.exitCode!==0?'failed':(scopeViolation||approvalDrift||outOfPhase.length)?'blocked-review':'code-executed-unverified',
    command:'codex exec --json --sandbox workspace-write -',startedAt,finishedAt:utcNow(),exitCode:outcome.exitCode,...(outcome.error?{error:outcome.error}:{}),promptHash:hashBytes(prompt),
    initialRevision,finalRevision,changedFiles:scope.changed,unapprovedFiles:phase==='implementation'?scope.unapproved:outOfPhase,baselineCurrent:specCurrent,
    evidenceLog:filename,sourceHashAfter:sourceSnapshot(root).hash,limitation:'Codex process success is not acceptance. Changed files need review; tests and UI fidelity not inferred.'};
  atomicJson(statePath(root,'evidence/latest-run.json'),receipt);audit(root,'codex-finish',{runId,status:receipt.status,exitCode:receipt.exitCode,unapprovedFiles:receipt.unapprovedFiles});
  return receipt;
}

// Legacy single-skill helper retained for v2.0 API compatibility; new CLI uses lib/skills.mjs.
export function codexSkillPlan(root,{apply=false}={}) {
  const state=readState(root);
  const rel='.agents/skills/project-init/SKILL.md';
  const file=projectFile(root,rel);
  const existing=fs.existsSync(file);
  const content=`---\nname: project-init\ndescription: Start or resume Project Init 2.1; one native framework plus bundled Lean Kit and evidence-based drift gates.\n---\n\n# Project Init 2.1 — legacy single-skill compatibility\n\nThis project uses a local-first development orchestrator. The exact project context is in \`.project-init/project.json\`.\n\n- Run \`project-init status --project .\` first. If no state exists, run \`project-init inspect --project .\` and \`project-init recommend --project .\`; do not initialize without the user's authorization.\n- Read and preserve the repository's existing AGENTS.md. Do not rewrite it.\n- Project Init owns discovery, framework selection, visual review and recorded acceptance gates. The selected spec framework owns its native PRD/specifications, architecture planning and implementation tasks. Do not create competing copies.\n- Run \`project-init handoff --project . --phase planning\` to obtain the current native workflow handoff, then follow the installed framework skills in the correct order.\n- For graphical applications, author realistic screens in \`.project-init/ui-design.json\`; run \`project-init render --project .\` and present \`.project-init/review.html\` for human feedback.\n- Register approved authoritative spec paths with \`project-init baseline --spec <native-path>\`. Request an independent review and real human design approval. Never record fabricated identities or evidence.\n- Before any implementation, check \`project-init status\`. A design approval is not permission to deploy or alter unrelated source.\n- Run actual code/tests through Codex, capture their receipts, and do not claim passing tests without test output. Drift detection using hashes and Git scope is not semantic correctness proof.\n- No automatic production changes, Git commit/push/merge or external API actions. Stop and report unexpected drift, missing review evidence, or a failed check.\n- Lean Kit is bundled: run project-init lean --project . --input docs/report.md --out .project-init/lean/report.html --execute. No separate Lean Kit installation or API key is required.
- Run real configured test commands, independent semantic review, visual screenshot comparisons and project-init guard before requesting human release approval.\n`;
  if(existing) return {path:rel,state:'already-exists',applied:false,reason:'Existing project skill preserved byte-for-byte; update requires an explicit manual migration.'};
  if(!apply)return {path:rel,state:'ready-to-add',applied:false};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,content,{encoding:'utf8',flag:'wx',mode:0o600});
  audit(root,'codex-skill-created',{path:rel,framework:state.framework});
  return {path:rel,state:'created',applied:true};
}
