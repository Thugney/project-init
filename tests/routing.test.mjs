import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initProject,selectFramework,readJson,statePath,dataClass,status} from '../lib/core.mjs';
import {applyFactory,factoryPlan,routingStatus} from '../lib/factory.mjs';

const py=process.platform==='win32'?'python':'python3';
const cli=fileURLToPath(new URL('../bin/project-init.mjs',import.meta.url));
function childEnvironment(extra={}){const env={...process.env,...extra};delete env.NODE_TEST_CONTEXT;return env;}
function run(root,exe,args,env){return spawnSync(exe,args,{cwd:root,encoding:'utf8',timeout:30000,env:env||childEnvironment()});}
function ok(root,exe,args,env){const r=run(root,exe,args,env);assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout.trim();}
function repository(t){
 const base=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'pinit-routing-')),root=path.join(base,'repo');
 fs.mkdirSync(root);t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 ok(root,'git',['init','-q']);ok(root,'git',['config','user.name','Synthetic Fixture']);ok(root,'git',['config','user.email','fixture@example.invalid']);
 initProject(root,{mode:'Existing',ui:'no',intent:'automation'});selectFramework(root,'none');
 return {base,root};
}
const configFile=root=>path.join(root,'.claude/skills/factory/config.json');
const helper=(root,name)=>path.join(root,`.claude/skills/factory/scripts/${name}.py`);
function editConfig(root,change){const config=readJson(configFile(root));change(config);fs.writeFileSync(configFile(root),JSON.stringify(config,null,2));}
function resolve(root,role,client){const r=run(root,py,[helper(root,'routing'),'resolve',role,client]);return {...r,json:r.status===0?JSON.parse(r.stdout):null};}

test('config migration folds claude_model into claude.model and adds routing without losing a chosen value',t=>{
 const {root}=repository(t);applyFactory(root,{apply:true});
 const shipped=readJson(configFile(root));
 assert.equal(shipped.claude_model,undefined,'the legacy key is no longer shipped');
 assert.deepEqual(shipped.claude.approvedDataClasses,['public','internal']);
 assert.deepEqual(Object.values(shipped.routing.tiers).flatMap(tier=>Object.values(tier)),['','','','','',''],'no concrete models are shipped');
 editConfig(root,config=>{delete config.routing;delete config.claude.approvedDataClasses;config.claude_model='opus';config.claude.model='';config.codex.approvedDataClasses=['public'];config.max_fix_rounds=4;});
 const migrated=applyFactory(root,{apply:true}).configMigration;
 assert.deepEqual(migrated,{action:'added-defaults',added:['routing'],nested:['claude.approvedDataClasses'],claudeModel:{action:'moved',value:'opus'}});
 const after=readJson(configFile(root));
 assert.equal(after.claude.model,'opus');assert.equal('claude_model' in after,false);
 assert.deepEqual(after.codex.approvedDataClasses,['public'],'an existing approval list is never overwritten');
 assert.equal(after.max_fix_rounds,4);assert.equal(after.routing.roles.builder,'mid');
 editConfig(root,config=>{config.claude_model='sonnet';config.claude.model='opus';});
 assert.deepEqual(applyFactory(root,{apply:true}).configMigration.claudeModel,{action:'dropped-conflict',dropped:'sonnet',kept:'opus'});
 assert.equal(readJson(configFile(root)).claude.model,'opus');
 assert.equal(applyFactory(root,{apply:true}).configMigration.action,'current');
});

test('routing resolves configured, unconfigured and partially configured roles; the orchestrator is advisory',t=>{
 const {root}=repository(t);applyFactory(root,{apply:true});
 editConfig(root,config=>{config.routing.tiers.mid.claude='claude-sonnet-5';config.claude.model='opus';});
 const builder=resolve(root,'builder','claude').json;
 assert.deepEqual([builder.tier,builder.model,builder.routing,builder.passedModel],['mid','claude-sonnet-5','configured','claude-sonnet-5']);
 const codexBuilder=resolve(root,'builder','codex').json;
 assert.deepEqual([codexBuilder.tier,codexBuilder.model,codexBuilder.routing,codexBuilder.passedModel],['mid',null,'not-configured',null],'an unconfigured client keeps its own default');
 const security=resolve(root,'security-reviewer','claude').json;
 assert.deepEqual([security.tier,security.routing,security.passedModel],['top','not-configured','opus'],'unconfigured tier falls back to claude.model');
 const orchestrator=resolve(root,'orchestrator','claude').json;
 assert.equal(orchestrator.advisory,true);assert.equal(orchestrator.tier,'top');
 const unknown=resolve(root,'summarizer','claude');
 assert.equal(unknown.status,1);assert.match(unknown.stdout,/ROUTING REFUSED unknown Factory role summarizer/);
 editConfig(root,config=>{config.routing.tiers.mid.claude='bad model; rm';});
 const invalid=resolve(root,'builder','claude');
 assert.equal(invalid.status,1);assert.match(invalid.stdout,/invalid model identifier/);
});

test('agent frontmatter is rendered from routing and a second preview reports it unchanged',t=>{
 const {root}=repository(t);applyFactory(root,{apply:true});
 const agent=name=>fs.readFileSync(path.join(root,`.claude/agents/factory-${name}.md`),'utf8');
 assert.match(agent('builder'),/^model: opus$/m,'unconfigured routing keeps the shipped agent');
 assert.ok(factoryPlan(root).factoryFiles.filter(f=>f.path.startsWith('.claude/agents/')).every(f=>f.action==='unchanged'));
 editConfig(root,config=>{config.routing.tiers.mid.claude='claude-sonnet-5';});
 const preview=factoryPlan(root).factoryFiles.filter(f=>f.path.startsWith('.claude/agents/'));
 assert.equal(preview.find(f=>f.path.endsWith('factory-builder.md')).action,'replace');
 assert.equal(preview.find(f=>f.path.endsWith('factory-security-reviewer.md')).action,'unchanged');
 assert.equal('content' in preview[0],false,'rendered content stays out of the plan output');
 applyFactory(root,{apply:true});
 assert.match(agent('builder'),/^model: claude-sonnet-5$/m);assert.match(agent('code-reviewer'),/^model: claude-sonnet-5$/m);
 assert.match(agent('security-reviewer'),/^model: opus$/m,'a role whose tier has no model keeps its frontmatter');
 assert.equal(agent('builder').match(/^model:/gm).length,1);
 assert.ok(factoryPlan(root).factoryFiles.filter(f=>f.path.startsWith('.claude/agents/')).every(f=>f.action==='unchanged'),'no churn on the next preview');
 editConfig(root,config=>{config.routing.tiers.mid.claude='bad model';});
 assert.throws(()=>factoryPlan(root),/Invalid model identifier/);
});

test('Factory install never copies Python bytecode caches from the bundled helpers',t=>{
 // Importing routing.py from the source tree writes a __pycache__ beside it, as board.py does.
 const scripts=fileURLToPath(new URL('../vendor/factory/claude/skill/scripts/',import.meta.url));
 const imported=spawnSync(py,['-c',`import sys; sys.path.insert(0, ${JSON.stringify(scripts)}); import routing`],{encoding:'utf8',env:childEnvironment({PYTHONDONTWRITEBYTECODE:''})});
 assert.equal(imported.status,0,imported.stderr);
 assert.ok(fs.existsSync(path.join(scripts,'__pycache__')),'the fixture precondition: a bytecode cache exists in the source');
 const {root}=repository(t);
 const plan=factoryPlan(root);
 assert.equal(plan.factoryFiles.some(f=>/__pycache__|\.pyc$/.test(f.path)),false);
 applyFactory(root,{apply:true});
 assert.equal(fs.existsSync(path.join(root,'.claude/skills/factory/scripts/__pycache__')),false);
});

function workerFixture(t){
 const {base,root}=repository(t);
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/feature.mjs'),'export const value = 1;\n');
 fs.writeFileSync(path.join(root,'.gitignore'),'.project-init/\n.factory-context/\n');
 applyFactory(root,{apply:true});
 const claude=path.join(base,process.platform==='win32'?'fake-claude.cmd':'fake-claude');
 fs.writeFileSync(claude,process.platform==='win32'?`@"${process.execPath}" "%FAKE_CLAUDE_SCRIPT%" %*\r\n`:`#!/bin/sh\nexec "${process.execPath}" "$FAKE_CLAUDE_SCRIPT" "$@"\n`);
 if(process.platform!=='win32')fs.chmodSync(claude,0o755);
 editConfig(root,config=>{config.codex.executable=process.execPath;config.claude.executable=claude;config.routing.tiers.mid.claude='claude-sonnet-5';config.routing.tiers.mid.codex='synthetic-codex-model';});
 applyFactory(root,{apply:true});
 ok(root,'git',['add','.']);ok(root,'git',['commit','-qm','Synthetic routing fixture']);
 const slug=ok(root,py,[helper(root,'board'),'init','Synthetic routing job']);
 ok(root,py,[helper(root,'board'),'note',slug,'base_commit',ok(root,'git',['rev-parse','HEAD'])]);
 fs.writeFileSync(path.join(root,`factory/jobs/${slug}/spec.md`),`# Synthetic fixture\nJob: ${slug}\nSource: idea\n- [ ] T001 [CODEX] Synthetic\n- [ ] T002 [CLAUDE] Synthetic\n`);
 ok(root,py,[helper(root,'worktree'),'init',slug]);
 return {base,root,slug};
}
function fakeCodex(base,argvFile){
 const filename=path.join(base,'synthetic-codex.cjs');
 fs.writeFileSync(filename,`
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),cwd=args[args.indexOf('--cd')+1],last=args[args.indexOf('-o')+1];
fs.writeFileSync(${JSON.stringify(argvFile)},JSON.stringify(args));
fs.writeFileSync(last,'WORKER: DONE\\nSynthetic fixture; no authenticated agent was used.\\n');
fs.writeFileSync(path.join(cwd,'src/feature.mjs'),'export const value = 2;\\n');
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:40,output_tokens:7,reasoning_output_tokens:0}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:0,output_tokens:3,reasoning_output_tokens:2}}));
process.exit(0);
`);
 return childEnvironment({NODE_OPTIONS:`--require ${JSON.stringify(filename)}`});
}
function fakeClaude(base,argvFile,promptFile,{usage=true}={}){
 const filename=path.join(base,'synthetic-claude.cjs');
 fs.writeFileSync(filename,`
const fs=require('fs'),path=require('path');
fs.writeFileSync(${JSON.stringify(argvFile)},JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(${JSON.stringify(promptFile)},fs.readFileSync(0,'utf8'));
if(fs.existsSync(path.join(process.cwd(),'src')))fs.writeFileSync(path.join(process.cwd(),'src/feature.mjs'),'export const value = 3;\\n');
console.log(JSON.stringify({type:'system',subtype:'init'}));
console.log(JSON.stringify({type:'result',result:'WORKER: DONE\\nSynthetic fixture; no authenticated agent was used.'${usage?",usage:{input_tokens:50,output_tokens:5,cache_read_input_tokens:20,cache_creation_input_tokens:0}":''}}));
process.exit(0);
`);
 return childEnvironment({FAKE_CLAUDE_SCRIPT:filename});
}

test('headless Codex and Claude workers pass routed models and record tier, client, model and usage',t=>{
 const {base,root,slug}=workerFixture(t);
 const codexArgv=path.join(base,'codex-argv.json');
 assert.match(ok(root,py,[helper(root,'codex_worker'),'build',slug],fakeCodex(base,codexArgv)),/^CODEX DONE/);
 const codexArgs=JSON.parse(fs.readFileSync(codexArgv,'utf8'));
 assert.equal(codexArgs[codexArgs.indexOf('-m')+1],'synthetic-codex-model');
 const codexReceipt=readJson(path.join(root,readJson(path.join(root,`factory/jobs/${slug}/codex/latest-execution.json`)).path));
 assert.deepEqual([codexReceipt.schemaVersion,codexReceipt.role,codexReceipt.client,codexReceipt.tier,codexReceipt.model],[2,'builder','codex','mid','synthetic-codex-model']);

 const claudeArgv=path.join(base,'claude-argv.json'),prompt=path.join(base,'claude-prompt.txt');
 assert.match(ok(root,py,[helper(root,'claude_worker'),'build',slug],fakeClaude(base,claudeArgv,prompt)),/^CLAUDE DONE/);
 const claudeArgs=JSON.parse(fs.readFileSync(claudeArgv,'utf8'));
 assert.equal(claudeArgs[claudeArgs.indexOf('--model')+1],'claude-sonnet-5');
 const claudeReceipt=readJson(path.join(root,readJson(path.join(root,`factory/jobs/${slug}/claude/latest-execution.json`)).path));
 assert.deepEqual([claudeReceipt.schemaVersion,claudeReceipt.client,claudeReceipt.tier,claudeReceipt.model],[2,'claude','mid','claude-sonnet-5']);

 // The security reviewer's tier (top) has no model: it keeps today's claude.model fallback.
 editConfig(root,config=>{config.claude.model='opus';});
 const integration=ok(root,py,[helper(root,'worktree'),'path',slug,'integration']);
 fs.mkdirSync(path.join(integration,'.project-init/evidence'),{recursive:true});
 fs.writeFileSync(path.join(integration,'.project-init/evidence/latest-checks.json'),JSON.stringify({executed:true,passed:true,checks:[]}));
 assert.match(ok(root,py,[helper(root,'claude_worker'),'agent',slug,'factory-security-reviewer','1'],fakeClaude(base,claudeArgv,prompt,{usage:false})),/^CLAUDE AGENT DONE/);
 const agentArgs=JSON.parse(fs.readFileSync(claudeArgv,'utf8'));
 assert.equal(agentArgs[agentArgs.indexOf('--model')+1],'opus');
 assert.match(fs.readFileSync(prompt,'utf8'),/Deterministic check results: .*latest-checks\.json/);

 const record=readJson(path.join(root,`factory/jobs/${slug}/routing.json`));
 assert.deepEqual(record.roles.map(r=>[r.role,r.client,r.tier,r.model,r.mode]),[
  ['builder','codex','mid','synthetic-codex-model','headless-build'],
  ['builder','claude','mid','claude-sonnet-5','headless-build'],
  ['security-reviewer','claude','top','not-configured','headless-agent']
 ]);
 assert.deepEqual(record.roles[0].usage,{input_tokens:110,cached_input_tokens:40,output_tokens:10,reasoning_output_tokens:2});
 assert.deepEqual(record.roles[1].usage,{input_tokens:50,output_tokens:5,cache_read_input_tokens:20,cache_creation_input_tokens:0});
 assert.equal(record.roles[2].usage,'not-reported');assert.equal(record.roles[2].passedModel,'opus');

 ok(root,py,[helper(root,'routing'),'record',slug,'code-reviewer']);
 const interactive=readJson(path.join(root,`factory/jobs/${slug}/routing.json`)).roles.at(-1);
 assert.deepEqual([interactive.role,interactive.model,interactive.mode,interactive.usage],['code-reviewer','claude-sonnet-5','interactive-subagent','not-reported'],'an interactive subagent records its rendered frontmatter model');
});

test('data-class shows the default, previews a change and writes only with --apply and an audit event',t=>{
 const {root}=repository(t);
 assert.deepEqual(dataClass(root),{dataClass:'internal',declared:false,allowed:['public','internal','personal','restricted']});
 const preview=dataClass(root,{set:'restricted'});
 assert.equal(preview.applied,false);assert.equal(readJson(statePath(root,'project.json')).dataClass,undefined,'preview writes nothing');
 assert.throws(()=>dataClass(root,{set:'secret'}),/--set must be one of/);
 assert.throws(()=>dataClass(root,{apply:true}),/Pass --set/);
 const viaCli=run(root,process.execPath,[cli,'data-class','--project',root,'--set','restricted','--apply','--json']);
 assert.equal(viaCli.status,0,viaCli.stderr);assert.deepEqual(JSON.parse(viaCli.stdout),{applied:true,from:'internal',to:'restricted'});
 assert.equal(readJson(statePath(root,'project.json')).dataClass,'restricted');
 const audit=fs.readFileSync(statePath(root,'audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.deepEqual(audit.at(-1).details,{from:'internal',to:'restricted',previouslyDeclared:false});
 assert.deepEqual(dataClass(root),{dataClass:'restricted',declared:true,allowed:['public','internal','personal','restricted']});
});

test('board init refuses a client not approved for the data class and fails closed',t=>{
 const {root}=repository(t);applyFactory(root,{apply:true});
 const init=title=>run(root,py,[helper(root,'board'),'init',title]);
 const board=()=>fs.readFileSync(path.join(root,'factory/board.json'),'utf8');
 const before=board();
 dataClass(root,{set:'restricted',apply:true});
 const restricted=init('Restricted job');
 assert.notEqual(restricted.status,0);
 assert.match(restricted.stdout,/job refused: data class restricted is not approved for: .*builder on codex.*orchestrator on claude/);
 assert.match(restricted.stdout,/add "restricted" to claude\.approvedDataClasses; add "restricted" to codex\.approvedDataClasses/);
 assert.match(run(root,py,[helper(root,'routing'),'check']).stdout,/^ROUTING REFUSED/);
 assert.equal(board(),before,'a refused job writes nothing');
 editConfig(root,config=>{config.claude.approvedDataClasses.push('restricted');config.codex.approvedDataClasses.push('restricted');});
 assert.equal(init('Approved restricted job').status,0);
 dataClass(root,{set:'public',apply:true});
 editConfig(root,config=>{config.codex.approvedDataClasses=[];});
 assert.match(init('Empty approval list').stdout,/not approved for: builder on codex/,'an empty list approves nothing');
 editConfig(root,config=>{delete config.codex.approvedDataClasses;});
 assert.match(init('Missing approval list').stdout,/not approved for: builder on codex/,'a missing list approves nothing');
 editConfig(root,config=>{config.workers.codex=false;});
 assert.equal(init('Codex worker disabled').status,0,'a disabled worker does not need approval');
 fs.writeFileSync(statePath(root,'project.json'),'{not json');
 assert.match(init('Unreadable state').stdout,/job refused: cannot read Project Init state/);
});

test('status reports routing per role, the advisory orchestrator and unapproved clients',t=>{
 const {root}=repository(t);applyFactory(root,{apply:true});
 const initial=status(root).factory.routing;
 assert.equal(initial.state,'not-configured');assert.equal(initial.dataClass,'internal');assert.deepEqual(initial.unapprovedClients,[]);
 assert.deepEqual(initial.roles.builder,{tier:'mid',claude:'not-configured',codex:'not-configured'});
 assert.equal(initial.roles.orchestrator.advisory,true);
 editConfig(root,config=>{config.routing.tiers.top.claude='claude-opus-5-5';});
 dataClass(root,{set:'personal',apply:true});
 const configured=routingStatus(root);
 assert.equal(configured.state,'configured');
 assert.equal(configured.roles['security-reviewer'].claude,'claude-opus-5-5');assert.equal(configured.roles.orchestrator.claude,'claude-opus-5-5');
 assert.deepEqual(configured.unapprovedClients,['claude','codex']);assert.match(configured.next,/data class personal is not approved for claude, codex/);
 const uninstalled=repository(t).root;
 assert.equal(routingStatus(uninstalled).state,'missing-config');
});
