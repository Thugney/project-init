import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertNotLink,fail,isWithin,projectFile,statePath,readState,readJson,atomicJson,audit,hashBytes} from './core.mjs';

const MAX_MANIFEST_BYTES=64*1024;
const MAX_PACK_BYTES=2*1024*1024;
const MAX_PACK_FILES=500;
const SECRET_FILE=/^(\.env($|\.)|id_rsa|id_ed25519|secrets?\.|credentials?\.|.*\.(pem|pfx|p12|key))$/i;
const PROVIDES_KEYS=new Set(['rules','skills','checks','hooks','review','mcp']);
const TOP_LEVEL_KEYS=new Set(['schemaVersion','name','version','description','appliesTo','provides']);
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const PACKS_DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','packs');

function safeRelative(value,label){
 if(typeof value!=='string'||!value.trim()||value.includes('\0'))fail(`${label} must be a nonempty relative path.`);
 const slash=value.replaceAll('\\','/');
 if(path.isAbsolute(value)||slash.startsWith('/')||/^[A-Za-z]:/.test(slash)||slash.split('/').includes('..'))fail(`${label} path is absolute or contains parent traversal: ${value}`);
 return slash;
}

function walkPack(root){
 const files=[];let totalBytes=0;
 function visit(directory){
  assertNotLink(directory);
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   const absolute=path.join(directory,entry.name),stat=fs.lstatSync(absolute);
   if(stat.isSymbolicLink())fail(`Symbolic links are not allowed in packs: ${path.relative(root,absolute)}`);
   const relative=path.relative(root,absolute).split(path.sep).join('/');
   if(SECRET_FILE.test(entry.name))fail(`Pack contains a file matching the secret-file pattern: ${relative}`);
   if(stat.isDirectory()){visit(absolute);continue;}
   if(!stat.isFile())fail(`Pack contains a non-regular file: ${relative}`);
   files.push(relative);totalBytes+=stat.size;
   if(files.length>MAX_PACK_FILES)fail(`Pack contains more than ${MAX_PACK_FILES} files.`);
   if(totalBytes>MAX_PACK_BYTES)fail('Pack exceeds the 2 MiB size limit.');
  }
 }
 visit(root);
 files.sort((a,b)=>a<b?-1:a>b?1:0);
 return {files,totalBytes};
}

function validateManifestPaths(root,manifest){
 const paths=[];
 const rules=manifest.provides.rules??[];
 if(!Array.isArray(rules))fail('provides.rules must be an array of relative paths.');
 for(const value of rules){
  const relative=safeRelative(value,'Rule');
  if(!relative.startsWith('rules/')||!relative.toLowerCase().endsWith('.md'))fail(`Rule path must point to a Markdown file under rules/: ${value}`);
  paths.push(relative);
 }
 const skills=manifest.provides.skills??[];
 if(!Array.isArray(skills))fail('provides.skills must be an array.');
 for(const skill of skills){
  if(!skill||typeof skill!=='object'||Array.isArray(skill)||typeof skill.name!=='string'||!/^\w[\w-]{0,63}$/.test(skill.name))fail('Each provided skill needs a valid name and relative path.');
  const relative=safeRelative(skill.path,'Skill');
  if(!relative.startsWith('skills/')||!relative.toLowerCase().endsWith('/skill.md'))fail(`Skill path must point to a SKILL.md file under skills/: ${skill.path}`);
  paths.push(relative);
 }
 const checks=manifest.provides.checks??[];
 if(!Array.isArray(checks))fail('provides.checks must be an array.');
 const checkNames=new Set();
 for(const check of checks){
  if(!check||typeof check!=='object'||Array.isArray(check)||typeof check.name!=='string'||!check.name.trim()||checkNames.has(check.name)||!Array.isArray(check.argv)||!check.argv.length||check.argv.some(arg=>typeof arg!=='string'||!arg.trim()))fail('Each provided check needs a unique name and nonempty argv string array.');
  checkNames.add(check.name);
  if(check.cwd!==undefined)safeRelative(check.cwd,`Check ${check.name} working directory`);
 }
 for(const key of ['hooks','review','mcp']){
  const values=manifest.provides[key]??[];
  if(!Array.isArray(values))fail(`provides.${key} must be an array.`);
  if(key==='review')for(const value of values)paths.push(safeRelative(value,'Review checklist'));
  if(key==='hooks')for(const hook of values){
   if(!hook||typeof hook!=='object'||Array.isArray(hook))fail('Each declared hook must be an object.');
   for(const field of ['path','cwd'])if(hook[field]!==undefined)safeRelative(hook[field],`Hook ${field}`);
   if(typeof hook.run==='string')safeRelative(hook.run,'Hook run');
   else if(hook.run&&typeof hook.run==='object'&&hook.run.path!==undefined)safeRelative(hook.run.path,'Hook run');
  }
  if(key==='mcp')for(const item of values)if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.name!=='string'||!item.name.trim())fail('Each MCP recommendation needs a name.');
 }
 for(const relative of paths){
  const absolute=path.resolve(root,...relative.split('/'));
  if(!isWithin(absolute,root))fail(`Pack path escapes its source directory: ${relative}`);
  assertNotLink(absolute);
  if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile())fail(`Declared pack file does not exist: ${relative}`);
 }
}

export function validatePack(directory){
 const root=path.resolve(directory);
 assertNotLink(root);
 if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())fail(`Pack directory not found: ${root}`);
 const manifestPath=path.join(root,'pack.json');
 assertNotLink(manifestPath);
 if(!fs.existsSync(manifestPath)||!fs.statSync(manifestPath).isFile())fail('Pack is missing pack.json.');
 const manifestBytes=fs.readFileSync(manifestPath);
 if(manifestBytes.byteLength>MAX_MANIFEST_BYTES)fail('Pack manifest exceeds 64 KiB.');
 let manifest;
 try{manifest=JSON.parse(manifestBytes.toString('utf8'));}
 catch(error){fail(`Invalid pack.json: ${error.message}`);}
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('Pack manifest must be a JSON object.');
 for(const key of Object.keys(manifest))if(!TOP_LEVEL_KEYS.has(key))fail(`Unknown top-level manifest key: ${key}`);
 if(manifest.schemaVersion!==1)fail('Pack manifest schemaVersion must be 1.');
 if(typeof manifest.name!=='string'||manifest.name.length<2||manifest.name.length>64||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name))fail('Pack name must be 2–64 lowercase kebab-case characters.');
 if(typeof manifest.version!=='string'||!SEMVER.test(manifest.version))fail('Pack version must be an exact SemVer version.');
 if(typeof manifest.description!=='string'||!manifest.description.trim())fail('Pack description must be a nonempty string.');
 if(!Array.isArray(manifest.appliesTo)||manifest.appliesTo.some(item=>typeof item!=='string'||!item.trim()))fail('Pack appliesTo must be an array of glob patterns.');
 for(const pattern of manifest.appliesTo)safeRelative(pattern,'appliesTo glob');
 if(!manifest.provides||typeof manifest.provides!=='object'||Array.isArray(manifest.provides))fail('Pack provides must be an object.');
 for(const key of Object.keys(manifest.provides))if(!PROVIDES_KEYS.has(key))fail(`Unknown provides entry: ${key}`);
 validateManifestPaths(root,manifest);
 const inventory=walkPack(root);
 if(!inventory.files.includes('pack.json'))fail('Pack manifest is not a regular file.');
 return {root,manifest,files:inventory.files,totalBytes:inventory.totalBytes};
}

export function packHash(directory){
 const pack=validatePack(directory),hash=crypto.createHash('sha256');
 for(const relative of pack.files){
  const filename=path.join(pack.root,...relative.split('/'));
  const rel=Buffer.from(relative,'utf8'),bytes=fs.readFileSync(filename);
  const length=Buffer.alloc(8);length.writeBigUInt64BE(BigInt(rel.length));
  hash.update(length);hash.update(rel);hash.update(bytes);
 }
 return hash.digest('hex');
}

function git(source,args,cwd,hooksPath){
 const result=spawnSync('git',['-c',`core.hooksPath=${hooksPath}`,...args],{
  cwd,encoding:'utf8',windowsHide:true,timeout:60000,
  env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'}
 });
 if(result.error)fail(`Git source operation could not start: ${result.error.message}`);
 if(result.status!==0)fail(`Git source operation failed for ${source}: ${(result.stderr||result.stdout||'unknown Git error').trim()}`);
 return (result.stdout||'').trim();
}

function sanitizedGitSource(url,ref){
 try{const parsed=new URL(url);parsed.username='';parsed.password='';return `git+${parsed.href}#${ref}`;}
 catch{return `git+${url}#${ref}`;}
}

function loadGitSource(source){
 const separator=source.lastIndexOf('#');
 if(!source.startsWith('git+')||separator<5||separator===source.length-1)fail('Git pack source must be git+<url>#<tag-or-full-commit-sha>.');
 const url=source.slice(4,separator),requestedRef=source.slice(separator+1);
 if(!url||requestedRef.includes('#'))fail('Git pack source has an invalid URL or ref.');
 const tempRoot=fs.realpathSync(os.tmpdir()),temp=fs.mkdtempSync(path.join(tempRoot,'project-init-pack-git-'));
 const checkout=path.join(temp,'checkout'),hooksPath=path.join(temp,'disabled-hooks');
 fs.mkdirSync(checkout);fs.mkdirSync(hooksPath);
 try{
  git(source,['init',checkout],temp,hooksPath);
  git(source,['remote','add','origin',url],checkout,hooksPath);
  if(/^[a-f0-9]{40}$/i.test(requestedRef)){
   git(source,['fetch','--depth=1','--no-recurse-submodules','origin',requestedRef],checkout,hooksPath);
  }else{
   const format=spawnSync('git',['check-ref-format',`refs/tags/${requestedRef}`],{encoding:'utf8',windowsHide:true,timeout:10000});
   if(format.error||format.status!==0)fail('Git pack ref must be a tag name or a full 40-character commit SHA; branches are not accepted.');
   const available=git(source,['ls-remote','--tags','--refs','origin',`refs/tags/${requestedRef}`],checkout,hooksPath);
   const tagRef=available.split(/\r?\n/).some(line=>line.split(/\s+/)[1]===`refs/tags/${requestedRef}`);
   if(!tagRef)fail(`Git pack tag not found: ${requestedRef}`);
   git(source,['fetch','--depth=1','--no-recurse-submodules','origin',`refs/tags/${requestedRef}`],checkout,hooksPath);
  }
  git(source,['checkout','--no-recurse-submodules','--detach','FETCH_HEAD'],checkout,hooksPath);
  const resolved=git(source,['rev-parse','HEAD'],checkout,hooksPath).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(resolved))fail('Git pack ref did not resolve to a commit.');
  const pack=validatePack(checkout);
  return {directory:checkout,manifest:pack.manifest,source:sanitizedGitSource(url,resolved),ref:resolved,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
 }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
}

export function loadPackSource(root,source){
 if(typeof source!=='string'||!source.trim())fail('Pack source is required.');
 if(source.startsWith('git+'))return loadGitSource(source);
 const bundled=path.join(PACKS_DIR,source);
 if(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source)&&fs.existsSync(bundled)){
  const pack=validatePack(bundled);
  return {directory:pack.root,manifest:pack.manifest,source:`bundled:${pack.manifest.name}`,ref:null,cleanup:()=>{}};
 }
 const directory=path.resolve(root,source);
 assertNotLink(directory);
 const pack=validatePack(directory);
 const relative=path.relative(path.resolve(root),directory);
 const stored=relative===''||isWithin(directory,path.resolve(root))?`local:${relative.split(path.sep).join('/')||'.'}`:`local:${directory}`;
 return {directory:pack.root,manifest:pack.manifest,source:stored,ref:null,cleanup:()=>{}};
}

const RULES_START='<!-- project-init:pack-rules:start -->';
const RULES_END='<!-- project-init:pack-rules:end -->';

function readPackLock(root){
 const lock=readJson(statePath(root,'packs.json'),false)||{schemaVersion:1,packs:[]};
 if(lock.schemaVersion!==1||!Array.isArray(lock.packs))fail('Invalid .project-init/packs.json schema.');
 const names=new Set();
 for(const pack of lock.packs){
  if(!pack||typeof pack.name!=='string'||names.has(pack.name)||typeof pack.version!=='string'||typeof pack.source!=='string'||!/^([a-f0-9]{64})$/.test(pack.sha256)||!Array.isArray(pack.installed))fail('Invalid pack entry in .project-init/packs.json.');
  names.add(pack.name);
  for(const item of pack.installed)if(!item||typeof item.path!=='string'||!/^([a-f0-9]{64})$/.test(item.sha256))fail(`Invalid installed-file record for pack ${pack.name}.`);
 }
 return lock;
}

function storedPack(root,name){
 const directory=projectFile(root,`.project-init/packs/${name}`);
 if(!fs.existsSync(directory)||!fs.statSync(directory).isDirectory())fail(`Stored pack content is missing: ${name}`);
 return validatePack(directory);
}

function managedBlock(current){
 const starts=current.split(RULES_START).length-1,ends=current.split(RULES_END).length-1;
 if(starts===0&&ends===0)return {start:-1,end:-1,conflict:null};
 if(starts!==1||ends!==1)return {start:-1,end:-1,conflict:'Malformed or duplicated pack-rules markers.'};
 const start=current.indexOf(RULES_START),end=current.indexOf(RULES_END);
 if(end<start)return {start,end,conflict:'Pack-rules end marker appears before start marker.'};
 return {start,end,conflict:null};
}

function renderRulesBlock(entries,newline){
 const lines=[RULES_START];
 for(const item of [...entries].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const manifest=item.manifest;
  const rules=manifest.provides.rules||[];
  if(!rules.length)continue;
  lines.push(`## ${manifest.name} ${manifest.version}`,'');
  for(const relative of rules){
   const file=path.join(item.directory,...relative.split('/'));
   const text=fs.readFileSync(file,'utf8').replace(/\r\n|\r/g,'\n');
   lines.push(...text.replace(/\n$/,'').split('\n'),'');
  }
 }
 lines.push(RULES_END);
 return lines.join(newline);
}

function rulesFilePlan(root,relative,entries){
 let target;
 try{target=projectFile(root,relative);}catch(error){return {path:relative,next:null,changed:false,conflict:error.message};}
 const exists=fs.existsSync(target);
 if(exists&&!fs.statSync(target).isFile())return {path:relative,next:null,changed:false,conflict:`${relative} is not a regular file.`};
 const current=exists?fs.readFileSync(target,'utf8'):'';
 const block=managedBlock(current);
 if(block.conflict)return {path:relative,next:null,changed:false,conflict:block.conflict};
 const newline=current.includes('\r\n')?'\r\n':'\n';
 const rendered=entries.length?renderRulesBlock(entries,newline):'';
 let next;
 if(block.start>=0){
  const end=block.end+RULES_END.length;
  next=current.slice(0,block.start)+rendered+current.slice(end);
 }else if(rendered){
  next=current?`${current}${current.endsWith('\n')?'':newline}${newline}${rendered}${newline}`:`${rendered}${newline}`;
 }else next=current;
 return {path:relative,target,next,changed:next!==current,conflict:null};
}

function installedSkillFiles(root,manifest,sourceDir,oldEntry,conflicts,changes){
 const installed=[];
 const desired=new Map();
 for(const skill of manifest.provides.skills||[]){
  const bytes=fs.readFileSync(path.join(sourceDir,...skill.path.replaceAll('\\','/').split('/')));
  for(const agentDir of ['.agents/skills','.claude/skills']){
   const relative=`${agentDir}/pack-${manifest.name}-${skill.name}/SKILL.md`;
   desired.set(relative,bytes);
  }
 }
 const previous=new Map((oldEntry?.installed||[]).map(item=>[item.path,item.sha256]));
 for(const [relative,bytes] of desired){
  let target;
  try{target=projectFile(root,relative);}catch(error){conflicts.push({path:relative,reason:error.message});continue;}
  if(fs.existsSync(target)){
   const oldHash=previous.get(relative);
   if(!oldHash||hashBytes(fs.readFileSync(target))!==oldHash){conflicts.push({path:relative,reason:'An unrelated or modified skill file already exists.'});continue;}
  }
  const sha256=hashBytes(bytes);installed.push({path:relative,sha256});
  if(!fs.existsSync(target)||hashBytes(fs.readFileSync(target))!==sha256)changes.push(relative);
 }
 for(const [relative,oldHash] of previous){
  if(desired.has(relative))continue;
  let target;
  try{target=projectFile(root,relative);}catch(error){conflicts.push({path:relative,reason:error.message});continue;}
  if(fs.existsSync(target)){
   if(hashBytes(fs.readFileSync(target))!==oldHash)conflicts.push({path:relative,reason:'Previously installed skill was modified and cannot be removed during an update.'});
   else changes.push(relative);
  }
 }
 return {installed,desired,previous};
}

function requireProjectInit(root){
 const stateFile=statePath(root,'project.json');
 if(!fs.existsSync(stateFile))fail('Project Init setup has not been applied for this project. From its root, run `project-init init --project . --apply` before adding or removing packs.');
 return readState(root);
}

function buildPackPlan(root,source){
 requireProjectInit(root);
 const loaded=loadPackSource(root,source);
 try{
  const pack=validatePack(loaded.directory),sha256=packHash(pack.root),lock=readPackLock(root);
  const oldEntry=lock.packs.find(item=>item.name===pack.manifest.name)||null;
  const storedDirectory=projectFile(root,`.project-init/packs/${pack.manifest.name}`);
  const conflicts=[],changes=[];
  if(oldEntry){
   if(!fs.existsSync(storedDirectory))conflicts.push({path:`.project-init/packs/${pack.manifest.name}`,reason:'Installed pack content is missing.'});
   else{
    try{if(packHash(storedDirectory)!==oldEntry.sha256)conflicts.push({path:`.project-init/packs/${pack.manifest.name}`,reason:'Installed pack content was modified.'});}
    catch(error){conflicts.push({path:`.project-init/packs/${pack.manifest.name}`,reason:error.message});}
   }
  }else if(fs.existsSync(storedDirectory))conflicts.push({path:`.project-init/packs/${pack.manifest.name}`,reason:'Pack storage exists without a matching lock entry.'});
  if(!oldEntry||oldEntry.sha256!==sha256){
   for(const relative of pack.files)changes.push(`.project-init/packs/${pack.manifest.name}/${relative}`);
  }
  const skill=installedSkillFiles(root,pack.manifest,pack.root,oldEntry,conflicts,changes);
  const nextLockPacks=lock.packs.filter(item=>item.name!==pack.manifest.name);
  const nextEntry={name:pack.manifest.name,version:pack.manifest.version,source:loaded.source,ref:loaded.ref,sha256,installed:skill.installed};
  nextLockPacks.push(nextEntry);nextLockPacks.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  const nextLock={...lock,packs:nextLockPacks};
  const rulesEntries=[];
  for(const item of nextLockPacks){
   if(item.name===pack.manifest.name)rulesEntries.push({name:item.name,manifest:pack.manifest,directory:pack.root});
   else{const stored=storedPack(root,item.name);rulesEntries.push({name:item.name,manifest:stored.manifest,directory:stored.root});}
  }
  const rulesFiles=['AGENTS.md','CLAUDE.md'].map(relative=>rulesFilePlan(root,relative,rulesEntries));
  for(const item of rulesFiles){if(item.conflict)conflicts.push({path:item.path,reason:item.conflict});else if(item.changed)changes.push(item.path);}
  const lockPath='.project-init/packs.json',oldLock=readJson(statePath(root,'packs.json'),false);
  const lockChanged=JSON.stringify(oldLock)!==JSON.stringify(nextLock);
  if(lockChanged)changes.push(lockPath);
  const changed=!!changes.length;
  return {loaded,pack,lock,nextLock,oldEntry,skill,rulesFiles,plan:{name:pack.manifest.name,version:pack.manifest.version,source:loaded.source,ref:loaded.ref,sha256,changes:[...new Set(changes)],conflicts,applied:false,changed}};
 }catch(error){loaded.cleanup();throw error;}
}

export function packPlan(root,source){
 const result=buildPackPlan(root,source);
 result.loaded.cleanup();
 return result.plan;
}

function atomicFile(target,bytes){
 assertNotLink(target);fs.mkdirSync(path.dirname(target),{recursive:true});
 const temporary=`${target}.${crypto.randomUUID()}.tmp`;
 try{fs.writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});fs.renameSync(temporary,target);}
 finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}

export function applyPack(root,source){
 const result=buildPackPlan(root,source),{plan,loaded,pack,oldEntry,skill,rulesFiles,nextLock}=result;
 if(plan.conflicts.length){loaded.cleanup();return {...plan,applied:false,refused:true};}
 if(!plan.changed){loaded.cleanup();return {...plan,applied:true,refused:false};}
 const rootPath=path.resolve(root),statePacks=projectFile(rootPath,'.project-init/packs');
 const lockFile=statePath(rootPath,'packs.json'),lockBackup=fs.existsSync(lockFile)?fs.readFileSync(lockFile):null;
 fs.mkdirSync(statePacks,{recursive:true});
 const target=projectFile(rootPath,`.project-init/packs/${pack.manifest.name}`);
 const stage=projectFile(rootPath,`.project-init/packs/.${pack.manifest.name}-${crypto.randomUUID()}.tmp`);
 const backup=projectFile(rootPath,`.project-init/packs/.${pack.manifest.name}-${crypto.randomUUID()}.bak`);
 let movedOld=false,movedNew=false;
 const fileBackups=new Map();
 try{
  fs.mkdirSync(stage,{recursive:false});
  for(const relative of pack.files){
   const from=path.join(pack.root,...relative.split('/')),to=path.join(stage,...relative.split('/'));
   fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
  }
  if(fs.existsSync(target)){fs.renameSync(target,backup);movedOld=true;}
  fs.renameSync(stage,target);movedNew=true;
  for(const [relative,bytes] of skill.desired){
   const file=projectFile(rootPath,relative),exists=fs.existsSync(file);
   fileBackups.set(file,exists?fs.readFileSync(file):null);
   atomicFile(file,bytes);
  }
  for(const [relative] of skill.previous){
   if(skill.desired.has(relative))continue;
   const file=projectFile(rootPath,relative);
   if(fs.existsSync(file)){fileBackups.set(file,fs.readFileSync(file));fs.unlinkSync(file);}
  }
  for(const item of rulesFiles){
   if(!item.changed)continue;
   const file=projectFile(rootPath,item.path),exists=fs.existsSync(file);
   fileBackups.set(file,exists?fs.readFileSync(file):null);
   atomicFile(file,Buffer.from(item.next,'utf8'));
  }
  atomicJson(lockFile,nextLock);
  audit(rootPath,'pack-added',{name:pack.manifest.name,version:pack.manifest.version,source:loaded.source,sha256:plan.sha256});
  if(movedOld)fs.rmSync(backup,{recursive:true,force:true});
  loaded.cleanup();
  return {...plan,applied:true,refused:false};
 }catch(error){
  if(lockBackup===null)fs.rmSync(lockFile,{force:true});else atomicFile(lockFile,lockBackup);
  for(const [file,bytes] of [...fileBackups].reverse()){
   if(bytes===null)fs.rmSync(file,{force:true});else atomicFile(file,bytes);
  }
  if(movedNew)fs.rmSync(target,{recursive:true,force:true});
  if(movedOld&&fs.existsSync(backup))fs.renameSync(backup,target);
  fs.rmSync(stage,{recursive:true,force:true});
  loaded.cleanup();
  throw error;
 }
}

export function packCheckProposals(root){
 const lock=readPackLock(root),proposals=[];
 for(const entry of lock.packs){
  const stored=storedPack(root,entry.name);
  if(packHash(stored.root)!==entry.sha256)continue;
  for(const check of stored.manifest.provides.checks||[]){
   proposals.push({name:`${entry.name}:${check.name}`,argv:[...check.argv],...(check.cwd===undefined?{}:{cwd:check.cwd})});
  }
 }
 return proposals;
}

export function listPacks(root){
 const lock=readPackLock(root);
 return lock.packs.map(entry=>{
  try{
   const stored=storedPack(root,entry.name),actual=packHash(stored.root);
   return {name:entry.name,version:entry.version,source:entry.source,ref:entry.ref??null,sha256:entry.sha256,status:actual===entry.sha256?'current':'modified',mcp:stored.manifest.provides.mcp||[],...(actual===entry.sha256?{}:{reason:'Stored content hash differs from the lock file.'})};
  }catch(error){
   return {name:entry.name,version:entry.version,source:entry.source,ref:entry.ref??null,sha256:entry.sha256,status:'modified',mcp:[],reason:error.message};
  }
 });
}

function buildRemovePlan(root,name){
 requireProjectInit(root);
 const lock=readPackLock(root),entry=lock.packs.find(item=>item.name===name);
 if(!entry)return {plan:{name,changes:[],conflicts:[{path:'.project-init/packs.json',reason:'Pack is not installed.'}],changed:false,applied:false},lock,entry:null};
 const conflicts=[],changes=[],removeSkills=[];
 for(const item of entry.installed){
  const target=projectFile(root,item.path);
  if(!fs.existsSync(target))continue;
  const bytes=fs.readFileSync(target);
  if(hashBytes(bytes)===item.sha256){removeSkills.push({path:item.path,target,bytes});changes.push(item.path);}
  else conflicts.push({path:item.path,reason:'Installed skill was modified and was kept.'});
 }
 const storedDirectory=projectFile(root,`.project-init/packs/${entry.name}`);
 let removeStored=false;
 if(fs.existsSync(storedDirectory)){
  try{
   if(packHash(storedDirectory)===entry.sha256){removeStored=true;changes.push(`.project-init/packs/${entry.name}`);}
   else conflicts.push({path:`.project-init/packs/${entry.name}`,reason:'Stored pack content was modified and was kept.'});
  }catch(error){conflicts.push({path:`.project-init/packs/${entry.name}`,reason:`Stored pack content was kept: ${error.message}`});}
 }
 const remaining=lock.packs.filter(item=>item.name!==entry.name),rulesEntries=[];
 try{
  for(const item of remaining){const stored=storedPack(root,item.name);rulesEntries.push({name:item.name,manifest:stored.manifest,directory:stored.root});}
 }catch(error){conflicts.push({path:'.project-init/packs',reason:error.message});}
 const rulesFiles=['AGENTS.md','CLAUDE.md'].map(relative=>rulesFilePlan(root,relative,rulesEntries));
 for(const item of rulesFiles){if(item.conflict)conflicts.push({path:item.path,reason:item.conflict});else if(item.changed)changes.push(item.path);}
 const nextLock={...lock,packs:remaining};
 changes.push('.project-init/packs.json');
 return {entry,lock,nextLock,removeSkills,removeStored,storedDirectory,rulesFiles,plan:{name:entry.name,version:entry.version,source:entry.source,sha256:entry.sha256,changes:[...new Set(changes)],conflicts,changed:true,applied:false}};
}

export function removePlan(root,name){
 const result=buildRemovePlan(root,name);
 return result.plan;
}

export function applyRemove(root,name){
 const result=buildRemovePlan(root,name),{plan}=result;
 if(!result.entry)return {...plan,applied:false,refused:true};
 if(plan.conflicts.some(item=>item.path==='AGENTS.md'||item.path==='CLAUDE.md'||item.path==='.project-init/packs'))return {...plan,applied:false,refused:true};
 const rootPath=path.resolve(root),lockFile=statePath(rootPath,'packs.json'),lockBackup=fs.existsSync(lockFile)?fs.readFileSync(lockFile):null;
 const fileBackups=new Map(),backup=`${result.storedDirectory}.${crypto.randomUUID()}.tmp`;
 let movedStored=false;
 try{
  if(result.removeStored){fs.renameSync(result.storedDirectory,backup);movedStored=true;}
  for(const item of result.removeSkills){
   fileBackups.set(item.target,item.bytes);fs.unlinkSync(item.target);
  }
  for(const item of result.rulesFiles){
   if(!item.changed)continue;
   const file=projectFile(rootPath,item.path),exists=fs.existsSync(file);
   fileBackups.set(file,exists?fs.readFileSync(file):null);
   if(item.next)atomicFile(file,Buffer.from(item.next,'utf8'));else fs.rmSync(file,{force:true});
  }
  atomicJson(lockFile,result.nextLock);
  audit(rootPath,'pack-removed',{name:result.entry.name,version:result.entry.version,source:result.entry.source,sha256:result.entry.sha256});
  if(movedStored)fs.rmSync(backup,{recursive:true,force:true});
  for(const item of result.removeSkills){
   let directory=path.dirname(item.target);
   while(directory!==rootPath&&isWithin(directory,rootPath)){
    try{fs.rmdirSync(directory);}catch{break;}
    directory=path.dirname(directory);
   }
  }
  return {...plan,applied:true,refused:false};
 }catch(error){
  for(const [file,bytes] of [...fileBackups].reverse()){
   if(bytes===null)fs.rmSync(file,{force:true});else atomicFile(file,bytes);
  }
  if(lockBackup===null)fs.rmSync(lockFile,{force:true});else atomicFile(lockFile,lockBackup);
  if(movedStored&&fs.existsSync(backup))fs.renameSync(backup,result.storedDirectory);
  throw error;
 }
}

function globRegex(pattern){
 let expression='^';
 for(let i=0;i<pattern.length;i++){
  const char=pattern[i];
  if(char==='*'&&pattern[i+1]==='*'){
   i++;
   if(pattern[i+1]==='/'){expression+='(?:.*/)?';i++;}
   else expression+='.*';
  }else if(char==='*')expression+='[^/]*';
  else if(char==='?')expression+='[^/]';
  else expression+=char.replace(/[|\\{}()[\]^$+?.]/g,'\\$&');
 }
 return new RegExp(`${expression}$`,'i');
}

export function suggestPacks(root,discovery){
 const files=Array.isArray(discovery?.files)?discovery.files:[];
 if(!fs.existsSync(PACKS_DIR))return [];
 const suggestions=[];
 for(const entry of fs.readdirSync(PACKS_DIR,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink())continue;
  const directory=path.join(PACKS_DIR,entry.name),pack=validatePack(directory);
  const matches=[];
  for(const pattern of pack.manifest.appliesTo){
   const regex=globRegex(pattern);
   for(const file of files)if(regex.test(file))matches.push({pattern,file});
  }
  if(matches.length)suggestions.push({name:pack.manifest.name,version:pack.manifest.version,source:`bundled:${pack.manifest.name}`,matches,reason:matches.map(item=>`${item.pattern} matched ${item.file}`).join('; ')});
 }
 return suggestions.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
