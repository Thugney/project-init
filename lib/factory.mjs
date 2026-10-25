import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readState,projectFile,audit,fail,assertNotLink,discover} from './core.mjs';

const bundledFactoryRoot=fileURLToPath(new URL('../vendor/factory/',import.meta.url));
const bundledCodexSkillsRoot=path.join(bundledFactoryRoot,'codex','skills');
const codexSkills=['backend-factory','backend-audit'];
const gitignoreLines=['factory/jobs/','factory/board.json','factory/board.json.tmp'];

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
  ['factory-job-spec',/factory\/jobs\/\$SLUG|JOB="factory\/jobs\/\$SLUG"/],
  ['backend-build-scope',/tasks tagged \[BACKEND\]|\[BACKEND\] tasks/i],
  ['frontend-exclusion',/Do not edit frontend\/UI files|nothing tagged \[FRONTEND\]/i],
  ['binding-api-contract',/API Contract.*binding|binding.*API Contract/is],
  ['report-md',/report\.md/],
  ['done-prefix',/BACKEND: DONE/],
  ['blocked-prefix',/BACKEND: BLOCKED/],
  ['contract-issue',/CONTRACT_ISSUE/],
  ['no-git-commit',/Do not run git commit|Never.*git commit/is],
  ['resume-session',/resume/]
 ];
 const missing=checks.filter(([,pattern])=>!pattern.test(body)).map(([name])=>name);
 return {ok:missing.length===0,bridge,missing};
}
function bundledSource(){
 const root=ensurePlainDir(bundledFactoryRoot,'Bundled Factory');
 return {
  kind:'bundled',root,
  bridge:path.join(root,'claude','skill','scripts','codex_backend.sh')
 };
}
function overrideSource(kit){
 const root=ensurePlainDir(kit,'Factory kit');
 return {
  kind:'override',root,
  bridge:path.join(root,'.claude','skills','factory','scripts','codex_backend.sh')
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
  'claude/skill/scripts/codex_backend.sh',
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
  '.claude/skills/factory/scripts/codex_backend.sh',
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
function ensureRuntimeIgnore(root){
 fs.mkdirSync(projectFile(root,'factory/jobs'),{recursive:true});
 const gi=projectFile(root,'.gitignore');
 const current=fs.existsSync(gi)?text(gi):'';
 const lines=new Set(current.split(/\r?\n/).filter(Boolean));
 let changed=false;
 for(const line of gitignoreLines) if(!lines.has(line)){lines.add(line);changed=true;}
 if(changed||!fs.existsSync(gi)) fs.writeFileSync(gi,[...lines].join('\n')+'\n','utf8');
}

export function factoryPlan(root,{kit}={}){
 readState(root);
 const discovery=discover(root);
 if(!discovery.git.available) fail('Factory requires a Git repository. Initialize Git before installing the factory.');
 const source=sourceFor(kit);
 const bridgeCheck=bridgeInspection(source.bridge);
 const skills=codexSkillEntries(root).map(({content,...entry})=>entry);
 const files=factoryEntries(root,source);
 const conflicts=skills.filter(x=>x.action==='conflict').map(x=>x.path);
 return {
  ready:bridgeCheck.ok&&conflicts.length===0,
  source:source.kind==='bundled'?'project-init-bundled-factory':source.root,
  override:source.kind==='override',
  bridgeCheck,
  factoryFiles:files,
  codexSkills:skills,
  conflicts,
  defaults:{backend:'codex',frontend:'claude'},
  interchangeability:{claudeBackendFallback:true,codexFrontendBridge:false,note:'Current Claude orchestrator can fall back to Claude for backend work. The supplied bridge does not route frontend work to Codex; adding that requires an orchestrator/bridge change, not a backend skill change.'},
  applyRequired:true
 };
}

export function applyFactory(root,{kit,apply=false}={}){
 const source=sourceFor(kit);
 const plan=factoryPlan(root,{kit});
 if(!apply) return {...plan,applied:false};
 if(!plan.bridgeCheck.ok) fail(`Factory bridge contract mismatch: ${plan.bridgeCheck.missing.join(', ')}`);
 if(plan.conflicts.length) fail(`Existing Codex factory skill content differs: ${plan.conflicts.join(', ')}. Back it up or remove it before applying.`);
 const d=discover(root);
 if(d.git.clean===false) fail('Uncommitted source changes detected; refusing factory installation. Commit or back up changes first.');
 const copied=[];
 for(const item of factoryEntries(root,source)){
  if(item.action==='preserve'||item.action==='unchanged') continue;
  fs.mkdirSync(path.dirname(item.target),{recursive:true});
  fs.copyFileSync(item.source,item.target);
  if(item.path.endsWith('.sh')) fs.chmodSync(item.target,0o755);
  copied.push(item.path);
 }
 ensureRuntimeIgnore(root);
 const created=[];
 for(const entry of codexSkillEntries(root)){
  if(entry.action==='unchanged') continue;
  fs.mkdirSync(path.dirname(entry.target),{recursive:true});
  fs.writeFileSync(entry.target,entry.content,'utf8');
  created.push(entry.path);
 }
 const installedBridge=projectFile(root,'.claude/skills/factory/scripts/codex_backend.sh');
 const installedBridgeCheck=bridgeInspection(installedBridge);
 if(!installedBridgeCheck.ok) fail(`Installed Factory bridge contract mismatch: ${installedBridgeCheck.missing.join(', ')}`);
 audit(root,'factory-installed',{source:plan.source,override:plan.override,copiedFactoryFiles:copied.length,codexSkills:created});
 const verified=factoryPlan(root,{kit});
 return {...verified,applied:true,copiedFactoryFiles:copied,installedCodexSkills:created,installedBridgeCheck};
}
