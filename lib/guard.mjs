// An evidence gate, not a model-generated declaration of semantic correctness.
import fs from 'node:fs';
import {readJson,readState,projectFile,statePath,checkBaseline,sourceSnapshot,status,configChecks,hashFile,hashBytes,utcNow,atomicJson,audit,fail} from './core.mjs';
import {visualPlan} from './visual-gate.mjs';
const REQ=/^[A-Z][A-Z0-9_-]{1,63}$/;
function requirements(root){const file=statePath(root,'requirements.json');const data=readJson(file,false)||{schemaVersion:1,requirements:[]};if(data.schemaVersion!==1||!Array.isArray(data.requirements))fail('Invalid requirements.json; expected schemaVersion 1 and requirements[]');return data;}
export function semanticPlan(root){
 const data=requirements(root),baseline=checkBaseline(root),checks=configChecks(root).map(c=>c.name),visual=visualPlan(root),ids=new Set(),missing=[];
 for(const r of data.requirements){
  if(!r||typeof r.id!=='string'||!REQ.test(r.id)||ids.has(r.id)||!Array.isArray(r.checks)||!Array.isArray(r.visualCases))fail('Each requirement needs a unique ID, checks[] and visualCases[]');ids.add(r.id);
  if(typeof r.specPath!=='string'||!baseline.specPaths?.includes(r.specPath)){missing.push({id:r.id,reason:'spec path not in approved native spec baseline'});continue;}
  if(!r.checks.length&&!r.visualCases.length)missing.push({id:r.id,reason:'no deterministic verification or visual acceptance case'});
  for(const name of r.checks)if(!checks.includes(name))missing.push({id:r.id,reason:`unconfigured test ${name}`});
  for(const id of r.visualCases)if(!visual.cases.some(c=>c.id===id))missing.push({id:r.id,reason:`unknown visual case ${id}`});
 }
 if(!data.requirements.length)missing.push({reason:'no requirement-to-evidence mappings; cannot claim semantic verification'});
 return {complete:missing.length===0,requirements:data.requirements.length,missing,items:data.requirements.map(r=>({id:r.id,specPath:r.specPath,checks:r.checks,visualCases:r.visualCases}))};
}
export function importSemanticReview(root,{file,actor,evidence}={}){
 if(!file||!actor?.trim()||!evidence?.trim())fail('Specify --file external reviewed JSON, --actor actual reviewer and --evidence verifiable review reference.');
 const current=status(root),baseline=checkBaseline(root),plan=semanticPlan(root);if(!current.approved||!baseline.current||!plan.complete)fail('Semantic review cannot be imported before a current approved baseline and complete verification mapping.');
 const filePath=projectFile(root,file);const supplied=readJson(filePath);
 if(!supplied||supplied.schemaVersion!==1||!Array.isArray(supplied.findings))fail('Semantic review JSON requires schemaVersion 1 and findings[]');
 const ids=new Set(),findings=[];
 for(const finding of supplied.findings){if(!finding||typeof finding.id!=='string'||ids.has(finding.id)||!['pass','fail','uncertain'].includes(finding.verdict)||!Array.isArray(finding.evidenceFiles)||!finding.evidenceFiles.length)fail('Each finding requires unique ID, verdict, and evidenceFiles[]');ids.add(finding.id);
  const evidencePaths=[];
  for(const item of finding.evidenceFiles){if(typeof item!=='string'||item.startsWith('.project-init/')||item.includes('..'))fail(`Unsafe semantic evidence file for ${finding.id}`);const source=projectFile(root,item);if(!fs.existsSync(source)||!fs.statSync(source).isFile())fail(`Missing semantic evidence file ${item}`);evidencePaths.push({path:item,sha256:hashFile(source)});}
  findings.push({id:finding.id,verdict:finding.verdict,evidenceFiles:evidencePaths,note:String(finding.note||'').slice(0,500)});
 }
 if(plan.items.some(r=>!ids.has(r.id))||ids.size!==plan.items.length)fail('Review must cover every mapped requirement exactly once.');
 const result={schemaVersion:1,reviewer:actor,evidence,recordedAt:utcNow(),baselineHash:baseline.actualHash,sourceHash:sourceSnapshot(root).hash,requirementsHash:hashFile(statePath(root,'requirements.json')),findings,limitation:'Human/agent-supplied review is an attestation, not machine proof. Source evidence and deterministic checks are separately enforced.'};
 fs.mkdirSync(statePath(root,'evidence'),{recursive:true});atomicJson(statePath(root,'evidence/semantic-review.json'),result);audit(root,'semantic-review-imported',{reviewer:actor,passed:findings.every(f=>f.verdict==='pass'),requirements:findings.length});return result;
}
export function verifyGuard(root){
 const s=status(root),baseline=checkBaseline(root),source=sourceSnapshot(root),plan=semanticPlan(root);
 const latest=readJson(statePath(root,'evidence/latest-checks.json'),false),visual=readJson(statePath(root,'evidence/latest-visual.json'),false),review=readJson(statePath(root,'evidence/semantic-review.json'),false);
 const failReasons=[];
 if(!baseline.current||!s.approved)failReasons.push('current approved specification and UI design required');
 if(!s.sourceAligned)failReasons.push('source changed since approved baseline; reconcile independent source review');
 const checkResults=Array.isArray(latest?.checks)?latest.checks:[];
 const testsCurrent=!!(latest?.passed&&checkResults.length&&latest.baselineHash===baseline.actualHash&&latest.sourceHash===source.hash);
 if(!testsCurrent)failReasons.push('current deterministic build/test evidence required');
 if(!plan.complete)failReasons.push('requirement-to-check coverage missing');
 let semanticCurrent=!!(review&&review.baselineHash===baseline.actualHash&&review.sourceHash===source.hash&&review.requirementsHash===hashFile(statePath(root,'requirements.json'))&&review.findings?.length===plan.items.length&&review.findings.every(f=>f.verdict==='pass'));
 if(semanticCurrent){
  for(const f of review.findings)for(const ev of f.evidenceFiles||[]){const p=projectFile(root,ev.path);if(!fs.existsSync(p)||hashFile(p)!==ev.sha256)semanticCurrent=false;}
  for(const r of plan.items)if(!r.checks.every(name=>checkResults.some(c=>c.name===name&&c.exitCode===0)))semanticCurrent=false;
 }
 if(!semanticCurrent)failReasons.push('complete, current semantic review and per-requirement test evidence required');
 const visualCurrent=!!(!s.uiRequired||(s.visualEvidenceCurrent&&visual?.passed&&visual.approved&&visual.coverageComplete&&visual.baselineHash===baseline.actualHash&&visual.sourceHash===source.hash));
 if(!visualCurrent)failReasons.push('approved screenshot comparisons for every required screen, viewport, theme and state are missing or failed');
 const execution=readJson(statePath(root,'evidence/latest-run.json'),false),executionValid=!!(execution&&execution.phase==='implementation'&&execution.status==='code-executed-unverified'&&execution.changedFiles?.length&&!execution.unapprovedFiles?.length&&execution.sourceHashAfter===source.hash);
 if(!executionValid)failReasons.push('actual bounded implementation run and recorded source change required');
 const result={schemaVersion:1,at:utcNow(),passed:!failReasons.length,baselineHash:baseline.actualHash||null,sourceHash:source.hash,testsCurrent,semanticCurrent,visualCurrent,executionValid,missing:failReasons,readyForHumanReleaseReview:!failReasons.length,releaseApproved:false,
  limitation:'Evidence readiness is not a human release authorization. Neither screenshot pixels nor reviewer assertions prove all behavior.'};
 fs.mkdirSync(statePath(root,'evidence'),{recursive:true});atomicJson(statePath(root,'evidence/latest-guard.json'),result);audit(root,'drift-guard',{passed:result.passed,missing:result.missing});return result;
}
