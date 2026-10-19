#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import {
 VERSION,projectRoot,discover,recommendation,initProject,readState,selectFramework,installPlan,applyInstall,
 establishBaseline,recordReview,approve,checkBaseline,status,workflow,runChecks,runCodex,validChecks,readJson,statePath,
 fail,reconcileSource
} from '../lib/core.mjs';
import { renderVisualReview } from '../lib/visual.mjs';
import {skillPlan} from '../lib/skills.mjs';
import {renderLean} from '../lib/lean.mjs';
import {visualPlan,captureVisual,compareVisual} from '../lib/visual-gate.mjs';
import {semanticPlan,importSemanticReview,verifyGuard} from '../lib/guard.mjs';

const usage=`Project Init ${VERSION} — local-first development orchestrator (preview)

Commands:
  inspect      --project PATH                                      Read-only source discovery
  recommend    --project PATH [--intent ...] [--complexity ...]   Rank OpenSpec / Spec Kit / BMAD / none
  init         --project PATH [--mode New|Existing] [--intent ...] [--ui yes|no|auto]
  status       --project PATH                                      Actual gate and evidence status
  select       --project PATH --framework openspec|spec-kit|bmad|none
  wire         --project PATH [--agent both|codex|claude] [--scope project|user] [--plugin] [--backup-conflicts] [--apply]  Install 7 descriptive project skills per agent
  install      --project PATH --version X.Y.Z [--agent codex|claude|both] [--apply]             Preview by default; vendor install is opt-in
  handoff      --project PATH [--phase planning|design|implementation|verification] [--task TEXT]
  render       --project PATH                                      Generate offline high-fidelity review HTML
  lean         --project PATH --input report.md --out .project-init/lean/report.html [--execute]   Built-in Lean Kit
  visual plan  --project PATH                                      List required screenshots and missing coverage
  visual capture --project PATH --id CASE --side reference|actual --url LOCAL_URL [--browser PATH] [--execute]
  visual compare --project PATH                                   Compare real PNG screenshots and write evidence
  semantic plan --project PATH                                    Check requirement-to-test/visual coverage
  semantic import --project PATH --file REVIEW.json --actor NAME --evidence REF   Record independent source review
  guard        --project PATH                                     Fail-closed evidence/drift acceptance gate
  baseline     --project PATH --spec FILE [--spec FILE]             Register framework-owned authoritative files
  check        --project PATH                                      Detect spec and UI-design baseline drift
  source-review --project PATH --actor NAME --evidence REF         Reconcile changed source after actual independent review
  review       --project PATH --actor NAME --evidence REF [--verdict pass|changes-requested]
  approve      --project PATH --actor NAME --evidence REF          Record explicit human design acceptance
  verify       --project PATH [--execute]                          Run configured deterministic checks
  run          --project PATH --phase PHASE --task TEXT [--allow PATH] [--execute]

All commands accept --json for machine-readable output. A missing --execute/--apply means no external process is run.
Real installation requires the selected native framework, the local prerequisites and an explicit version pin.
No automatic Git commit/push/merge/deployment. Audit records are local and not authenticated signatures.
`;
function parseArgs(argv){
 const [base,...tail]=argv;
 const command=['visual','semantic'].includes(base)&&tail[0]&&!tail[0].startsWith('--')?`${base} ${tail.shift()}`:base;
 const rest=tail;
 const options={};
 const multi=new Set(['spec','allow']);
 for(let i=0;i<rest.length;i++) {
   const token=rest[i];
   if(!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
   const key=token.slice(2);
   if(['json','execute','apply','plugin','backup-conflicts'].includes(key)) {options[key]=true;continue;}
   if(!['project','mode','intent','complexity','ui','framework','version','phase','task','actor','evidence','verdict','out','spec','allow','agent','scope','input','id','side','url','browser','file'].includes(key)) fail(`Unknown option: ${key}`);
   const value=rest[++i];
   if(value===undefined||value.startsWith('--')) fail(`Missing value after --${key}`);
   if(multi.has(key)){options[key]??=[];options[key].push(value);}
   else{if(key in options)fail(`Duplicate --${key}`);options[key]=value;}
 }
 return {command,options};
}
function present(data,json=false) {
 if(json){console.log(JSON.stringify(data,null,2));return;}
 if(typeof data==='string'){console.log(data);return;}
 console.log(JSON.stringify(data,null,2));
}
async function main(){
 const {command,options}=parseArgs(process.argv.slice(2));
 if(!command||command==='help'||command==='--help'||command==='-h'){console.log(usage);return;}
 if(command==='version'){console.log(VERSION);return;}
 const raw=options.project||process.cwd();
 const root=projectRoot(raw,command==='init');
 let result;
 switch(command){
 case 'inspect': result=discover(root);break;
 case 'recommend': result=recommendation(discover(root),options);break;
 case 'init': result=initProject(root,options);break;
 case 'status': result=status(root);break;
 case 'select':
  if(!options.framework) fail('Pass --framework openspec|spec-kit|bmad|none.');
  result=selectFramework(root,options.framework);break;
 case 'wire': result=skillPlan(root,{agent:options.agent||'both',scope:options.scope||'project',apply:!!options.apply,plugin:!!options.plugin,backupConflicts:!!options['backup-conflicts']});break;
 case 'install':
  result=await applyInstall(root,options.version,{apply:!!options.apply,agent:options.agent||'codex'});break;
 case 'handoff': result=workflow(root,options.phase||'planning',options.task||'');break;
 case 'render': result=renderVisualReview(root,options.out);break;
 case 'lean': result=renderLean(root,{input:options.input,out:options.out,execute:!!options.execute});break;
 case 'visual plan':result=visualPlan(root);break;
 case 'visual capture':result=captureVisual(root,{id:options.id,side:options.side,url:options.url,browser:options.browser,execute:!!options.execute});break;
 case 'visual compare':result=compareVisual(root);break;
 case 'semantic plan':result=semanticPlan(root);break;
 case 'semantic import':result=importSemanticReview(root,{file:options.file,actor:options.actor,evidence:options.evidence});break;
 case 'guard':result=verifyGuard(root);break;
 case 'baseline':result=establishBaseline(root,options.spec||[]);break;
 case 'check':result=checkBaseline(root);break;
 case 'source-review':result=reconcileSource(root,{actor:options.actor,evidence:options.evidence});break;
 case 'review':result=recordReview(root,{actor:options.actor,evidence:options.evidence,verdict:options.verdict||'pass'});break;
 case 'approve':result=approve(root,{actor:options.actor,evidence:options.evidence});break;
 case 'verify':result=await runChecks(root,{execute:!!options.execute});break;
 case 'run':result=await runCodex(root,{phase:options.phase||'planning',task:options.task||'',allowed:options.allow||[],execute:!!options.execute});break;
 default:fail(`Unknown command: ${command}. Use project-init help.`);
 }
 present(result,!!options.json);
 // Mutating/evidence commands return failure exit status when the attempted activity failed.
 if(command==='verify'&&options.execute&&!result.passed)process.exitCode=1;
 if(['visual compare','guard'].includes(command)&&!result.passed)process.exitCode=1;
 if(command==='lean'&&options.execute&&!result.passed)process.exitCode=1;
 if(command==='run'&&options.execute&&['failed','blocked-review'].includes(result.status))process.exitCode=1;
 if(command==='install'&&options.apply&&result.results?.some(x=>x.exitCode!==0))process.exitCode=1;
}
main().catch(error=>{console.error(`Project Init: ${error.message}`);process.exitCode=1;});
