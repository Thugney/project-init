import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validatePack,packHash,loadPackSource} from '../lib/packs.mjs';
import {discover,recommendation,initProject,selectFramework,establishBaseline,checkBaseline,status} from '../lib/core.mjs';
import {packPlan,applyPack,listPacks,removePlan,applyRemove} from '../lib/packs.mjs';
import {preparationPlan} from '../lib/prepare.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function fixture(t,manifest={}){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-pack-'));
 const dir=path.join(base,'pack');
 fs.mkdirSync(dir,{recursive:true});
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 writeManifest(dir,manifest);
 return dir;
}

function rulePack(t,name,text){
 const dir=fixture(t,{name,provides:{rules:['rules/rule.md']}});
 fs.mkdirSync(path.join(dir,'rules'),{recursive:true});
 fs.writeFileSync(path.join(dir,'rules','rule.md'),text);
 return dir;
}

function writeManifest(dir,overrides={}){
 const manifest={schemaVersion:1,name:'sample-pack',version:'1.2.3',description:'Synthetic test pack',appliesTo:[],provides:{},...overrides};
 fs.writeFileSync(path.join(dir,'pack.json'),JSON.stringify(manifest,null,2)+'\n');
}

function project(t){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-pack-project-'));
 const root=path.join(base,'project');fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,'package.json'),'{"name":"fixture","scripts":{"test":"node --test"}}\n');
 initProject(root,{mode:'Existing',intent:'feature',complexity:'small',ui:'no'});
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 return root;
}

function snapshot(root){
 const result=new Map();
 function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const absolute=path.join(directory,entry.name),relative=path.relative(root,absolute).split(path.sep).join('/');
  if(entry.isDirectory())visit(absolute);else result.set(relative,fs.readFileSync(absolute));
 }}
 visit(root);return result;
}

function gitRun(args,cwd,env={}){
 const result=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,...env}});
 if(result.error||result.status!==0)throw new Error(`git ${args.join(' ')} failed: ${result.error?.message||result.stderr}`);
 return (result.stdout||'').trim();
}

function cli(args,root){
 return spawnSync(process.execPath,[path.join(repoRoot,'bin','project-init.mjs'),...args,'--project',root,'--json'],{cwd:repoRoot,encoding:'utf8',windowsHide:true,timeout:30000});
}

function barePack(t,{submodule=false}={}){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-git-pack-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const bare=path.join(base,'origin.git'),work=path.join(base,'work');
 gitRun(['init','--bare',bare],base);
 fs.mkdirSync(work);
 gitRun(['init',work],base);
 gitRun(['config','user.name','Pack Fixture'],work);
 gitRun(['config','user.email','pack-fixture@example.invalid'],work);
 writeManifest(work);
 fs.mkdirSync(path.join(work,'rules'));
 fs.writeFileSync(path.join(work,'rules','example.md'),'fixture rule\n');
 if(submodule){
  const subBare=path.join(base,'sub.git'),subWork=path.join(base,'sub-work');
  gitRun(['init','--bare',subBare],base);fs.mkdirSync(subWork);
  gitRun(['init',subWork],base);
  gitRun(['config','user.name','Pack Fixture'],subWork);
  gitRun(['config','user.email','pack-fixture@example.invalid'],subWork);
  fs.writeFileSync(path.join(subWork,'payload.txt'),'submodule payload');
  gitRun(['add','.'],subWork);gitRun(['commit','-m','submodule fixture'],subWork);
  gitRun(['remote','add','origin',subBare],subWork);gitRun(['push','origin','HEAD:main'],subWork);
  gitRun(['--git-dir',subBare,'symbolic-ref','HEAD','refs/heads/main'],base);
  const subUrl=pathToFileURL(subBare).href;
  gitRun(['-c','protocol.file.allow=always','submodule','add',subUrl,'deps/sub'],work);
 }
 gitRun(['add','.'],work);gitRun(['commit','-m','pack fixture'],work);
 const commit=gitRun(['rev-parse','HEAD'],work);
 gitRun(['branch','-M','main'],work);gitRun(['tag','v1.0.0'],work);
 gitRun(['remote','add','origin',bare],work);
 gitRun(['push','origin','main','--tags'],work);
 return {base,bare,work,commit,url:pathToFileURL(bare).href};
}

test('bundled example pack validates and exposes its manifest and files',()=>{
 const result=validatePack(path.join(repoRoot,'packs','example'));
 assert.equal(result.manifest.name,'example');
 assert.ok(result.files.includes('pack.json'));
 assert.ok(result.files.includes('rules/example.md'));
 assert.ok(result.files.includes('skills/hello/SKILL.md'));
});

test('manifest validation rejects unknown top-level keys',t=>{
 const dir=fixture(t,{unexpected:true});
 assert.throws(()=>validatePack(dir),/unknown.*unexpected/i);
});

test('manifest validation rejects names outside lowercase kebab-case',t=>{
 const dir=fixture(t,{name:'Bad_Name'});
 assert.throws(()=>validatePack(dir),/name/i);
});

test('manifest validation rejects non-exact SemVer versions',t=>{
 const dir=fixture(t,{version:'^1.2.3'});
 assert.throws(()=>validatePack(dir),/version/i);
});

test('manifest validation rejects symlinks inside a pack',t=>{
 const dir=fixture(t,{provides:{hooks:[{id:'example',run:'vendor/link.md'}]}});
 const outside=path.join(path.dirname(dir),'outside');
 const link=path.join(dir,'vendor');
 fs.mkdirSync(outside,{recursive:true});
 fs.writeFileSync(path.join(outside,'link.md'),'outside');
 try{fs.symlinkSync(outside,link,process.platform==='win32'?'junction':'dir');}
 catch(error){
  if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`symlink creation unavailable: ${error.code}`);return;}
  throw error;
 }
 assert.throws(()=>validatePack(dir),/symbolic.link|symlink|reparse/i);
});

test('manifest validation rejects paths containing parent traversal',t=>{
 const dir=fixture(t,{provides:{rules:['../outside.md']}});
 assert.throws(()=>validatePack(dir),/path|\.\./i);
});

test('manifest validation rejects POSIX and Windows absolute paths',t=>{
 for(const absolute of ['/outside.md','C:\\outside.md']){
  const dir=fixture(t,{provides:{rules:[absolute]}});
  assert.throws(()=>validatePack(dir),/path|absolute/i);
  fs.rmSync(path.dirname(dir),{recursive:true,force:true});
 }
});

test('manifest validation rejects files matching the secret-file pattern',t=>{
 const dir=fixture(t);
 fs.writeFileSync(path.join(dir,'id_rsa'),'fake fixture data');
 assert.throws(()=>validatePack(dir),/secret|id_rsa/i);
});

test('manifest validation rejects a manifest larger than 64 KiB',t=>{
 const dir=fixture(t,{description:'x'.repeat(65*1024)});
 assert.throws(()=>validatePack(dir),/manifest.*64|64.*manifest|too large/i);
});

test('manifest validation rejects packs larger than 2 MiB',t=>{
 const dir=fixture(t);
 fs.writeFileSync(path.join(dir,'large.bin'),Buffer.alloc(2*1024*1024+1));
 assert.throws(()=>validatePack(dir),/2\s*MiB|2\s*mb|size limit|too large/i);
});

test('manifest validation rejects packs with more than 500 files',t=>{
 const dir=fixture(t);
 for(let i=0;i<500;i++)fs.writeFileSync(path.join(dir,`file-${i}.txt`),'');
 assert.throws(()=>validatePack(dir),/500 files|file count|too many files/i);
});

test('packHash is stable when files are created in a different order',t=>{
 const a=fixture(t),b=fixture(t);
 for(const [name,value] of [['z.txt','z'],['nested/a.txt','a'],['m.txt','m']]){
  fs.mkdirSync(path.dirname(path.join(a,name)),{recursive:true});
  fs.writeFileSync(path.join(a,name),value);
 }
 for(const [name,value] of [['m.txt','m'],['nested/a.txt','a'],['z.txt','z']]){
  fs.mkdirSync(path.dirname(path.join(b,name)),{recursive:true});
  fs.writeFileSync(path.join(b,name),value);
 }
 assert.equal(packHash(a),packHash(b));
});

test('packHash changes when a path or file bytes change',t=>{
 const dir=fixture(t);
 const target=path.join(dir,'rules','rule.md');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,'first');
 const first=packHash(dir);
 fs.writeFileSync(target,'second');
 assert.notEqual(packHash(dir),first);
 fs.renameSync(target,path.join(path.dirname(target),'renamed.md'));
 assert.notEqual(packHash(dir),first);
});

test('bundled-name source resolves to the package pack with a stable source ID',t=>{
 const loaded=loadPackSource(repoRoot,'example');t.after(loaded.cleanup);
 assert.equal(loaded.source,'bundled:example');
 assert.equal(loaded.ref,null);
 assert.equal(loaded.manifest.name,'example');
 assert.equal(validatePack(loaded.directory).manifest.name,'example');
});

test('local directory source accepts relative and absolute paths',t=>{
 const project=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-local-source-'));
 t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 const local=path.join(project,'local-pack');fs.mkdirSync(path.join(local,'rules'),{recursive:true});
 writeManifest(local);fs.writeFileSync(path.join(local,'rules','rule.md'),'local');
 const relative=loadPackSource(project,'local-pack');
 const absolute=loadPackSource(project,local);
 assert.equal(relative.source,'local:local-pack');
 assert.equal(absolute.directory,local);
 assert.equal(validatePack(relative.directory).manifest.name,'sample-pack');
});

test('local source must be a valid pack directory',t=>{
 const project=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-invalid-source-'));
 t.after(()=>fs.rmSync(project,{recursive:true,force:true}));
 assert.throws(()=>loadPackSource(project,'missing'),/pack.json|directory/i);
});

test('Git sources accept an exact tag and resolve it to a commit',t=>{
 const fixture=barePack(t),loaded=loadPackSource(repoRoot,`git+${fixture.url}#v1.0.0`);
 t.after(loaded.cleanup);
 assert.equal(loaded.ref,fixture.commit);
 assert.equal(loaded.source,`git+${fixture.url}#${fixture.commit}`);
 assert.ok(fs.existsSync(path.join(loaded.directory,'rules','example.md')));
});

test('Git sources accept a full commit SHA',t=>{
 const fixture=barePack(t),loaded=loadPackSource(repoRoot,`git+${fixture.url}#${fixture.commit}`);
 t.after(loaded.cleanup);
 assert.equal(loaded.ref,fixture.commit);
});

test('Git sources refuse branch names and missing refs',t=>{
 const fixture=barePack(t);
 assert.throws(()=>loadPackSource(repoRoot,`git+${fixture.url}#main`),/tag not found|tag name/i);
 assert.throws(()=>loadPackSource(repoRoot,`git+${fixture.url}#v9.9.9`),/tag not found/i);
});

test('Git sources do not fetch submodules',t=>{
 const fixture=barePack(t,{submodule:true});
 const loaded=loadPackSource(repoRoot,`git+${fixture.url}#v1.0.0`);t.after(loaded.cleanup);
 assert.equal(fs.existsSync(path.join(loaded.directory,'deps','sub','payload.txt')),false);
});

test('Git checkout disables hooks from the configured global hooks path',t=>{
 const fixture=barePack(t),hooks=path.join(fixture.base,'hooks');fs.mkdirSync(hooks);
 const hook=path.join(hooks,'post-checkout');
 fs.writeFileSync(hook,'#!/bin/sh\nprintf ran > .git/hook-ran\n');fs.chmodSync(hook,0o755);
 const globalConfig=path.join(fixture.base,'gitconfig');
 fs.writeFileSync(globalConfig,`[core]\n\thooksPath = ${hooks.replaceAll('\\','/')}\n`);
 const previous=process.env.GIT_CONFIG_GLOBAL;process.env.GIT_CONFIG_GLOBAL=globalConfig;
 let loaded;
 try{loaded=loadPackSource(repoRoot,`git+${fixture.url}#v1.0.0`);}
 finally{if(previous===undefined)delete process.env.GIT_CONFIG_GLOBAL;else process.env.GIT_CONFIG_GLOBAL=previous;}
 t.after(loaded.cleanup);
 assert.equal(fs.existsSync(path.join(loaded.directory,'.git','hook-ran')),false);
});

test('packPlan previews source, hash, file changes, and conflicts without writing',t=>{
 const root=project(t),before=snapshot(root),plan=packPlan(root,'example');
 assert.equal(plan.name,'example');
 assert.equal(plan.version,'1.0.0');
 assert.equal(plan.source,'bundled:example');
 assert.match(plan.sha256,/^[a-f0-9]{64}$/);
 assert.ok(plan.changes.includes('.project-init/packs/example/pack.json'));
 assert.ok(plan.changes.includes('.agents/skills/pack-example-hello/SKILL.md'));
 assert.deepEqual(plan.conflicts,[]);
 assert.deepEqual(snapshot(root),before);
});

test('packPlan reports conflicts for unrelated existing skill files',t=>{
 const root=project(t),target=path.join(root,'.agents','skills','pack-example-hello','SKILL.md');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'user-owned skill\n');
 const before=snapshot(root),plan=packPlan(root,'example');
 assert.ok(plan.conflicts.some(item=>item.path==='.agents/skills/pack-example-hello/SKILL.md'));
 assert.deepEqual(snapshot(root),before);
});

test('applyPack stores the pack, locks hashes, installs rules and skills, and audits once',t=>{
 const root=project(t),result=applyPack(root,'example');
 assert.equal(result.applied,true);
 const lock=JSON.parse(fs.readFileSync(path.join(root,'.project-init','packs.json'),'utf8'));
 assert.equal(lock.schemaVersion,1);
 assert.equal(lock.packs.length,1);
 assert.equal(lock.packs[0].name,'example');
 assert.equal(lock.packs[0].source,'bundled:example');
 assert.equal(lock.packs[0].sha256,packHash(path.join(root,'.project-init','packs','example')));
 assert.deepEqual(lock.packs[0].installed.map(item=>item.path).sort(),[
  '.agents/skills/pack-example-hello/SKILL.md',
  '.claude/skills/pack-example-hello/SKILL.md'
 ].sort());
 for(const target of ['AGENTS.md','CLAUDE.md']){
  const content=fs.readFileSync(path.join(root,target),'utf8');
  assert.ok(content.includes('<!-- project-init:pack-rules:start -->'));
  assert.ok(content.includes('This fragment is an example.'));
  assert.ok(content.includes('<!-- project-init:pack-rules:end -->'));
 }
 const audit=fs.readFileSync(path.join(root,'.project-init','audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(audit.filter(item=>item.action==='pack-added').length,1);
});

test('applyPack rolls back lock and installed files when audit writing fails',t=>{
 const root=project(t),auditPath=path.join(root,'.project-init','audit.jsonl');
 fs.unlinkSync(auditPath);fs.mkdirSync(auditPath);
 const before=snapshot(root);
 assert.throws(()=>applyPack(root,'example'));
 assert.deepEqual(snapshot(root),before);
 assert.equal(fs.existsSync(path.join(root,'.project-init','packs.json')),false);
});

test('re-applying the same pack is a no-op and writes no second audit event',t=>{
 const root=project(t);applyPack(root,'example');
 const before=snapshot(root),result=applyPack(root,'example');
 assert.equal(result.applied,true);assert.equal(result.changed,false);assert.deepEqual(result.changes,[]);
 assert.deepEqual(snapshot(root),before);
 const audit=fs.readFileSync(path.join(root,'.project-init','audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(audit.filter(item=>item.action==='pack-added').length,1);
});

test('managed rules append to existing instructions and preserve outside bytes',t=>{
 const root=project(t),prefix='# Project instructions\n\nUser-owned text stays here.\n';
 fs.writeFileSync(path.join(root,'AGENTS.md'),prefix);
 const result=applyPack(root,'example');
 assert.equal(result.applied,true);
 const content=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
 assert.ok(content.startsWith(prefix));
 assert.ok(content.includes('<!-- project-init:pack-rules:start -->'));
 assert.ok(content.endsWith('<!-- project-init:pack-rules:end -->\n'));
});

test('managed rules update keeps CRLF content outside markers byte-identical',t=>{
 const root=project(t),prefix='before user bytes\r\n';
 const suffix='\r\nafter user bytes\r\n';
 const original=`${prefix}<!-- project-init:pack-rules:start -->\r\nold managed content\r\n<!-- project-init:pack-rules:end -->${suffix}`;
 fs.writeFileSync(path.join(root,'AGENTS.md'),original);
 const result=applyPack(root,'example');
 assert.equal(result.applied,true);
 const content=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
 const start=content.indexOf('<!-- project-init:pack-rules:start -->');
 const end=content.indexOf('<!-- project-init:pack-rules:end -->')+'<!-- project-init:pack-rules:end -->'.length;
 assert.equal(content.slice(0,start),prefix);
 assert.equal(content.slice(end),suffix);
 assert.ok(content.slice(start,end).includes('\r\n'));
 assert.equal(content.slice(start,end).replaceAll('\r\n','').includes('\n'),false);
});

test('updating managed rules sorts packs by name while preserving surrounding text',t=>{
 const root=project(t),prefix='User prefix\n',suffix='\nUser suffix\n';
 const marker=`<!-- project-init:pack-rules:start -->\nold\n<!-- project-init:pack-rules:end -->`;
 fs.writeFileSync(path.join(root,'AGENTS.md'),`${prefix}${marker}${suffix}`);
 const zeta=rulePack(t,'zeta-pack','zeta rule\n');
 const alpha=rulePack(t,'alpha-pack','alpha rule\n');
 assert.equal(applyPack(root,zeta).applied,true);
 assert.equal(applyPack(root,alpha).applied,true);
 const content=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
 assert.ok(content.startsWith(prefix));assert.ok(content.endsWith(suffix));
 assert.ok(content.indexOf('## alpha-pack')<content.indexOf('## zeta-pack'));
});

test('malformed or duplicated managed markers refuse add without changing files',t=>{
 for(const content of [
  '<!-- project-init:pack-rules:start -->\nno end marker\n',
  '<!-- project-init:pack-rules:start --><!-- project-init:pack-rules:start --><!-- project-init:pack-rules:end -->'
 ]){
  const root=project(t);fs.writeFileSync(path.join(root,'AGENTS.md'),content);
  const before=snapshot(root),result=applyPack(root,'example');
  assert.equal(result.applied,false);assert.equal(result.refused,true);
  assert.ok(result.conflicts.some(item=>item.path==='AGENTS.md'));
  assert.deepEqual(snapshot(root),before);
 }
});

test('applyPack refuses an unrelated skill file without overwriting it',t=>{
 const root=project(t),target=path.join(root,'.claude','skills','pack-example-hello','SKILL.md');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'user-authored skill\n');
 const before=snapshot(root),result=applyPack(root,'example');
 assert.equal(result.applied,false);assert.equal(result.refused,true);
 assert.deepEqual(snapshot(root),before);
 assert.equal(fs.readFileSync(target,'utf8'),'user-authored skill\n');
});

test('adding, editing, and removing the pack lock invalidates the baseline',t=>{
 const root=project(t);selectFramework(root,'spec-kit');
 fs.mkdirSync(path.join(root,'specs'),{recursive:true});
 fs.writeFileSync(path.join(root,'specs','feature.md'),'approved source');
 establishBaseline(root,['specs/feature.md']);
 const lock=path.join(root,'.project-init','packs.json');
 fs.writeFileSync(lock,JSON.stringify({schemaVersion:1,packs:[]}));
 let result=checkBaseline(root);
 assert.equal(result.current,false);assert.ok(result.modified.includes('.project-init/packs.json'));
 establishBaseline(root,['specs/feature.md']);
 fs.writeFileSync(lock,JSON.stringify({schemaVersion:1,packs:[{name:'example'}]}));
 result=checkBaseline(root);
 assert.equal(result.current,false);assert.ok(result.modified.includes('.project-init/packs.json'));
 establishBaseline(root,['specs/feature.md']);
 fs.rmSync(lock);
 result=checkBaseline(root);
 assert.equal(result.current,false);assert.ok(result.modified.includes('.project-init/packs.json'));
});

test('pack check proposals merge into feature preparation with pack-prefixed names',t=>{
 const root=project(t);selectFramework(root,'spec-kit');
 const feature=path.join(root,'specs','001-pack-mechanism');fs.mkdirSync(feature,{recursive:true});
 fs.writeFileSync(path.join(feature,'spec.md'),'# Pack feature\n- **FR-009**: Pack checks are proposed.\n');
 fs.writeFileSync(path.join(feature,'plan.md'),'# Plan\n');
 fs.writeFileSync(path.join(feature,'tasks.md'),'- [ ] T012 Add pack check proposals.\n');
 applyPack(root,'example');
 const plan=preparationPlan(root,{feature:'specs/001-pack-mechanism'});
 const proposal=plan.checks.find(check=>check.name==='example:example-smoke');
 assert.deepEqual(proposal,{name:'example:example-smoke',argv:['npm','run','smoke']});
 assert.ok(plan.automaticChecks.some(check=>check.name==='example:example-smoke'));
});

test('inspect and recommend include matching bundled packs without changing rank scores or adding them',t=>{
 const match=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-pack-match-'));
 const noMatch=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'project-init-pack-no-match-'));
 t.after(()=>fs.rmSync(match,{recursive:true,force:true}));t.after(()=>fs.rmSync(noMatch,{recursive:true,force:true}));
 fs.writeFileSync(path.join(match,'notes.example'),'example input');
 fs.writeFileSync(path.join(noMatch,'README.md'),'ordinary project');
 const inspected=discover(match),suggestion=inspected.packs.find(pack=>pack.name==='example');
 assert.ok(suggestion);
 assert.ok(suggestion.reason.includes('**/*.example matched notes.example'));
 const recommended=recommendation(inspected,{intent:'bugfix',complexity:'medium'});
 const baseline=recommendation(discover(noMatch),{intent:'bugfix',complexity:'medium'});
 assert.deepEqual(recommended.ranking.map(item=>[item.id,item.score]),baseline.ranking.map(item=>[item.id,item.score]));
 assert.ok(recommended.packs.some(pack=>pack.name==='example'));
 assert.equal(fs.existsSync(path.join(match,'.project-init','packs.json')),false);
});

test('listPacks and status report current and modified content plus MCP recommendations',t=>{
 const root=project(t);applyPack(root,'example');
 let packs=listPacks(root);
 assert.equal(packs[0].status,'current');
 assert.equal(packs[0].name,'example');
 assert.ok(packs[0].mcp.some(item=>item.name==='Context7'));
 assert.equal(status(root).packs[0].status,'current');
 fs.writeFileSync(path.join(root,'.project-init','packs','example','rules','example.md'),'hand-edited');
 packs=listPacks(root);
 assert.equal(packs[0].status,'modified');
 assert.equal(status(root).packs[0].status,'modified');
});

test('removePlan previews pack file, skill, rules, and lock removal without writing',t=>{
 const root=project(t);applyPack(root,'example');
 const before=snapshot(root),plan=removePlan(root,'example');
 assert.equal(plan.name,'example');assert.equal(plan.version,'1.0.0');
 assert.ok(plan.changes.includes('.project-init/packs/example'));
 assert.ok(plan.changes.includes('.agents/skills/pack-example-hello/SKILL.md'));
 assert.ok(plan.changes.includes('.project-init/packs.json'));
 assert.deepEqual(plan.conflicts,[]);
 assert.deepEqual(snapshot(root),before);
});

test('applyRemove deletes unmodified content, skills, rules and lock, then audits',t=>{
 const root=project(t);applyPack(root,'example');
 const result=applyRemove(root,'example');
 assert.equal(result.applied,true);assert.deepEqual(result.conflicts,[]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.project-init','packs.json'),'utf8')).packs.length,0);
 assert.equal(fs.existsSync(path.join(root,'.project-init','packs','example')),false);
 assert.equal(fs.existsSync(path.join(root,'.agents','skills','pack-example-hello','SKILL.md')),false);
 for(const target of ['AGENTS.md','CLAUDE.md']){
  const content=fs.readFileSync(path.join(root,target),'utf8');
  assert.equal(content.includes('<!-- project-init:pack-rules:start -->'),false);
  assert.equal(content.includes('<!-- project-init:pack-rules:end -->'),false);
 }
 const audit=fs.readFileSync(path.join(root,'.project-init','audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(audit.filter(item=>item.action==='pack-removed').length,1);
});

test('remove keeps and reports an edited installed skill while removing other pack files',t=>{
 const root=project(t);applyPack(root,'example');
 const edited=path.join(root,'.claude','skills','pack-example-hello','SKILL.md');
 fs.writeFileSync(edited,'user edits to installed skill');
 const result=applyRemove(root,'example');
 assert.equal(result.applied,true);
 assert.ok(result.conflicts.some(item=>item.path==='.claude/skills/pack-example-hello/SKILL.md'));
 assert.equal(fs.readFileSync(edited,'utf8'),'user edits to installed skill');
 assert.equal(fs.existsSync(path.join(root,'.agents','skills','pack-example-hello','SKILL.md')),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.project-init','packs.json'),'utf8')).packs.length,0);
});

test('remove updates the rules block for remaining packs',t=>{
 const root=project(t);applyPack(root,'example');
 const alpha=rulePack(t,'alpha-pack','Alpha remains.\n');applyPack(root,alpha);
 const result=applyRemove(root,'example');
 assert.equal(result.applied,true);
 const content=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
 assert.ok(content.includes('## alpha-pack'));
 assert.equal(content.includes('## example '),false);
 assert.ok(content.includes('<!-- project-init:pack-rules:start -->'));
});

test('remove refuses malformed markers without changing files',t=>{
 const root=project(t);applyPack(root,'example');
 const agents=path.join(root,'AGENTS.md');fs.appendFileSync(agents,'<!-- project-init:pack-rules:start -->');
 const before=snapshot(root),result=applyRemove(root,'example');
 assert.equal(result.applied,false);assert.equal(result.refused,true);
 assert.deepEqual(snapshot(root),before);
});

test('pack CLI lists, previews, applies, and removes without writing during preview',t=>{
 const root=project(t);
 let result=cli(['pack','list'],root);
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).packs,[]);
 const before=snapshot(root);
 result=cli(['pack','add','example'],root);
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).name,'example');
 assert.deepEqual(snapshot(root),before);
 result=cli(['pack','add','example','--apply'],root);
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).applied,true);
 result=cli(['pack','list'],root);
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).packs[0].status,'current');
 const installed=snapshot(root);
 result=cli(['pack','remove','example'],root);
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).name,'example');
 assert.deepEqual(snapshot(root),installed);
 result=cli(['pack','remove','example','--apply'],root);
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).applied,true);
 assert.deepEqual(JSON.parse(cli(['pack','list'],root).stdout).packs,[]);
});

test('pack CLI returns exit code 1 when an applied add is refused',t=>{
 const root=project(t),target=path.join(root,'.agents','skills','pack-example-hello','SKILL.md');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'user file');
 const before=snapshot(root),result=cli(['pack','add','example','--apply'],root);
 assert.equal(result.status,1);
 assert.equal(JSON.parse(result.stdout).refused,true);
 assert.deepEqual(snapshot(root),before);
});
