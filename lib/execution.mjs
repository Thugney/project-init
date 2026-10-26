// Local execution evidence is auditable, not a cryptographic assertion of agent identity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
 readState,readJson,statePath,projectFile,checkBaseline,sourceSnapshot,hashFile,
 atomicJson,audit,utcNow,fail,runChecks,configChecks,assertNotLink,isRuntimePath,nativeTextRepresentation
} from './core.mjs';
import {featureReadiness} from './prepare.mjs';
import {sameExistingPath,isWithinExistingPath} from './paths.mjs';

const SHA=/^[0-9a-f]{40,64}$/;
const HASH=/^[0-9a-f]{64}$/;
const SLUG=/^\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIMIT='Local records are not authenticated signatures. Integration observes real Git operations; it does not authenticate which person or agent authored a commit. Independent source, semantic, visual and human approval gates remain required.';
const runtimePath=file=>file==='.project-init'||file.startsWith('.project-init/')||file==='.factory-context'||file.startsWith('.factory-context/')||isRuntimePath(file);
function contractHash(content){
 return crypto.createHash('sha256').update(content.replaceAll('\r\n','\n').replace(/^(\s*- )\[[ xX]\]( T\d+ \[(?:CODEX|CLAUDE)\])/gm,'$1[ ]$2')).digest('hex');
}

function git(root,args,{raw=false}={}){
 const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});
 if(r.status!==0)fail(`Factory evidence Git check failed: ${r.stderr?.trim()||r.error?.message||args.join(' ')}`);
 return raw?r.stdout:r.stdout.trim();
}
function head(root){return git(root,['rev-parse','HEAD']);}
function clean(root,{untracked=true}={}){return !git(root,['status','--porcelain=v1',`--untracked-files=${untracked?'all':'no'}`,'--','.',':(exclude).project-init',':(exclude).factory-context']);}
function allowedPaths(root,allowed){
 if(!Array.isArray(allowed)||!allowed.length)fail('Execution evidence requires one or more explicit --allow paths.');
 return [...new Set(allowed.map(value=>{
  if(typeof value!=='string'||!value||path.isAbsolute(value)||value.split(/[\\/]/).includes('..'))fail('Invalid allowed-change path.');
  const relative=path.relative(root,projectFile(root,value)).split(path.sep).join('/').replace(/\/$/,'');
  if(!relative||runtimePath(relative))fail('Execution scope cannot include runtime state or the whole repository.');
  return relative;
 }))];
}
function outside(files,allowed){return files.filter(file=>!allowed.some(scope=>file===scope||file.startsWith(scope+'/')));}
function changed(root,before,after){return git(root,['diff','--name-only','--no-renames','-z',before,after,'--'],{raw:true}).split('\0').filter(Boolean);}
function currentApproval(root){
 const baseline=checkBaseline(root),review=readJson(statePath(root,'review.json'),false),approval=readJson(statePath(root,'approval.json'),false);
 if(!baseline.current||review?.verdict!=='pass'||review.baselineHash!==baseline.actualHash||approval?.baselineHash!==baseline.actualHash){
  const reason=!baseline.current
   ? baseline.reason||(baseline.modified?.length?`Changed baseline artifacts: ${baseline.modified.join(', ')}.`:'The baseline fingerprint changed.')
   : review?.verdict!=='pass'||review.baselineHash!==baseline.actualHash?'The independent baseline review is missing or stale.':'The explicit baseline approval is missing or stale.';
  fail(`Execution evidence requires the current reviewed and explicitly approved native baseline. ${reason}`);
 }
 return {baseline,review,approval};
}
function observedFile(root,relative){
 const file=projectFile(root,relative);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Missing Factory execution evidence: ${relative}`);
 return {path:relative,sha256:hashFile(file)};
}
function verifyObserved(root,observation){
 if(!observation||typeof observation.path!=='string'||!HASH.test(observation.sha256||''))fail('Malformed Factory evidence reference.');
 const current=observedFile(root,observation.path);
 if(current.sha256!==observation.sha256)fail(`Factory execution evidence changed: ${observation.path}`);
 return projectFile(root,observation.path);
}
function assertAncestor(root,before,after){git(root,['merge-base','--is-ancestor',before,after]);}

function factoryContext(root,job){
 if(!SLUG.test(job||''))fail('Provide an actual Factory job slug with --job; a job is never invented.');
 const board=readJson(projectFile(root,'factory/board.json'));
 const record=Array.isArray(board.jobs)?board.jobs.find(item=>item.id===job):null;
 if(!record)fail(`No registered Factory job ${job} in ${root}.`);
 const metadataPath=`.project-init/factory-worktrees/${job}.json`;
 const meta=readJson(projectFile(root,metadataPath));
 if(meta.schemaVersion!==1||meta.slug!==job||!SHA.test(meta.base||''))fail('Malformed Factory worktree metadata.');
 if(record.notes?.base_commit!==meta.base)fail('Factory board and worktree base commit do not agree.');
 const executionContext=meta.executionContext;
 if(!executionContext||!HASH.test(executionContext.baselineHash||'')||!Array.isArray(executionContext.specPaths)||!executionContext.specPaths.length)
  fail('Factory worktrees were not started against a recorded approved native baseline. Verify historical existing code explicitly.');
 if(record.source!==executionContext.jobSource)fail('Factory job source changed after dispatch.');
 const specPath=`factory/jobs/${job}/spec.md`,specText=fs.readFileSync(projectFile(root,specPath),'utf8');
 if(specText.match(/^Job:\s*(.+)$/m)?.[1].trim()!==job||specText.match(/^Source:\s*(.+)$/m)?.[1].trim()!==record.source)
  fail('Factory Job/Source headers do not agree with the registered job.');
 const jobContractHash=contractHash(specText);
 if(jobContractHash!==executionContext.jobContractHash)fail('Factory execution contract changed after dispatch; reassignment/scope changes require explicit review and a new execution context.');
 if(record.source?.startsWith('speckit:')){
  const directory=record.source.slice('speckit:'.length).replaceAll('\\','/').replace(/\/$/,'');
  projectFile(root,directory);
  if(!directory||directory.split('/').includes('..')||
     !executionContext.specPaths.some(file=>file.startsWith(directory+'/'))||
     (executionContext.feature?.directory&&executionContext.feature.directory!==directory))
   fail('Factory Spec Kit source does not match the prepared native feature.');
 }
 const integration=meta.paths?.integration;
 if(typeof integration!=='string'||!path.isAbsolute(integration))
  fail('Factory integration worktree must be the registered isolated checkout.');
 assertNotLink(integration);
 const expectedIntegration=statePath(root,`worktrees/${job}/integration`);
 if(!isWithinExistingPath(integration,statePath(root,'worktrees'))||!sameExistingPath(integration,expectedIntegration))
  fail('Factory integration worktree must be the registered isolated checkout.');
 const branch=`factory/${job}/integration`;
 if(meta.branches?.integration!==branch||git(integration,['rev-parse','--abbrev-ref','HEAD'])!==branch)
  fail('Factory integration branch does not match its registered worktree.');
 const common=dir=>path.resolve(dir,git(dir,['rev-parse','--git-common-dir']));
 if(!sameExistingPath(common(root),common(integration)))fail('Factory integration belongs to a different Git repository.');
 const finalRevision=head(integration);
 if(!Array.isArray(meta.integrations)||!meta.integrations.length)fail('No actual Factory integration command receipts exist. Historical summaries cannot be imported as execution.');
 if(meta.latestIntegration!==meta.integrations.at(-1))fail('The latest Factory integration attempt failed or is incomplete.');
 const observations=[],operations=[];
 let previous=meta.base;
 for(const relative of meta.integrations){
  if(typeof relative!=='string'||relative.split(/[\\/]/).includes('..')||!relative.startsWith(`factory/jobs/${job}/integration/`))fail('Unsafe Factory integration receipt path.');
  const observation=observedFile(root,relative),op=readJson(projectFile(root,relative));
  if(op.schemaVersion!==1||op.job!==job||!['codex','claude'].includes(op.worker)||op.exitCode!==0||
    op.beforeRevision!==previous||!SHA.test(op.afterRevision||'')||!SHA.test(op.workerRevision||'')||
    typeof op.cwd!=='string'||!path.isAbsolute(op.cwd)||!sameExistingPath(op.cwd,integration)||!Array.isArray(op.command)||
    JSON.stringify(op.command)!==JSON.stringify(['git','merge','--no-ff','--no-edit',`factory/${job}/${op.worker}`]))
   fail('Failed, mismatched or incomplete Factory integration receipt.');
  assertNotLink(op.cwd);
  assertAncestor(integration,op.beforeRevision,op.afterRevision);
  assertAncestor(integration,op.workerRevision,op.afterRevision);
  verifyObserved(root,op.log);
  // Codex always runs as a process. Claude does when Codex orchestrates through claude_worker.py;
  // an interactive Claude commit carries no process evidence and claims none.
  if(op.worker==='codex'||op.workerEvidenceKind==='claude-process'){
   const label=op.worker==='codex'?'Codex':'Claude';
   const workerFile=verifyObserved(root,op.workerEvidence),worker=readJson(workerFile);
   if(worker.schemaVersion!==1||worker.job!==job||worker.worker!==op.worker||worker.exitCode!==0||worker.status!=='done'||
      worker.afterRevision!==op.workerRevision||!SHA.test(worker.beforeRevision||''))fail(`Successful ${label} process evidence is missing or mismatched.`);
   for(const log of worker.logs||[])verifyObserved(root,log);
   if(!Array.isArray(worker.logs)||worker.logs.length!==3)fail(`${label} process logs are incomplete.`);
  }
  previous=op.afterRevision;observations.push(observation);operations.push(op);
 }
 for(const [name,label] of [['codex','Codex'],['claude','Claude']]){
  const last=operations.findLast(op=>op.worker===name&&op.workerEvidence);
  if(!last)continue;
  const latest=readJson(projectFile(root,`factory/jobs/${job}/${name}/latest-execution.json`));
  if(latest.path!==last.workerEvidence.path)fail(`The latest ${label} result has not been successfully integrated.`);
 }
 if(previous!==finalRevision)fail('Factory receipts do not describe the current integrated HEAD.');
 const spec={path:specPath,sha256:jobContractHash,hashMode:'factory-contract-v1'};
 return {record,meta,metadataPath,integration,finalRevision,observations,operations,spec};
}

function nativeRepresentationPlan(root,integration){
 const baseline=readJson(statePath(root,'baseline.json'));
 const representations=[];
 for(const relative of baseline.specPaths){
  const approved=baseline.files.find(entry=>entry.path===relative);
  if(!HASH.test(approved?.sha256||''))fail(`Missing approved native specification digest: ${relative}`);
  const file=projectFile(integration,relative);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Missing integrated native specification: ${relative}`);
  const bytes=fs.readFileSync(file);
  if(crypto.createHash('sha256').update(bytes).digest('hex')===approved.sha256)continue;
  const representation=nativeTextRepresentation(relative,bytes,approved.sha256);
  if(!representation)fail(`Integrated native specification differs from the approved baseline: ${relative}`);
  representations.push(representation);
 }
 return representations;
}

function seedIntegration(root,integration,context,nativeTextRepresentations){
 const sourceState=readState(root);
 const copies=['config.json','requirements.json','ui-design.json','visual-cases.json','baseline.json','review.json','approval.json'];
 const baseline=readJson(statePath(root,'baseline.json'));
 for(const entry of baseline.files||[]){
  if(entry.path.startsWith('.project-init/visual/baselines/'))copies.push(entry.path.slice('.project-init/'.length));
 }
 const planned=[];
 for(const relative of copies){
  const source=statePath(root,relative);
  if(!fs.existsSync(source))continue;
  const target=statePath(integration,relative);
  if(fs.existsSync(target)){
   if(hashFile(target)!==hashFile(source))fail(`Integration state differs at ${relative}; review it explicitly. Existing state was not overwritten.`);
  }else planned.push({source,target});
 }
 const stateFile=statePath(integration,'project.json');
 if(fs.existsSync(stateFile)){
  const current=readState(integration);
  if(current.framework!==sourceState.framework||current.uiRequired!==sourceState.uiRequired)fail('Integration methodology/design selection differs from the approved coordinator state.');
 }
 const preparation=readJson(statePath(root,'preparation.json'),false),preparationFile=statePath(integration,'preparation.json');
 const existingPreparation=readJson(preparationFile,false);
 if(preparation&&existingPreparation&&(
   existingPreparation.framework!==preparation.framework||existingPreparation.feature?.id!==preparation.feature?.id||
   JSON.stringify(existingPreparation.feature?.specPaths)!==JSON.stringify(preparation.feature?.specPaths)||
   existingPreparation.taskPath!==preparation.taskPath))
  fail('Integration feature/task context differs; existing preparation state was not overwritten.');
 // All conflicts are checked before creating any state. Approval actors and times are copied unchanged.
 for(const {source,target} of planned){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);}
 if(!fs.existsSync(stateFile))atomicJson(stateFile,{...sourceState,projectPath:integration});
 if(preparation&&!existingPreparation)atomicJson(preparationFile,{...preparation,branch:git(integration,['branch','--show-current'])});
 atomicJson(statePath(integration,'factory-origin.json'),{schemaVersion:1,project:root,job:context.meta.slug,baselineHash:baseline.hash,nativeTextRepresentations,at:utcNow(),notice:'Exact approved records copied with provenance; any listed native text representation changes preserve the approved LF/CRLF content. No new review or approval was granted.'});
 const copied=currentApproval(integration);
 if(copied.baseline.actualHash!==baseline.hash)fail('The integrated native specification does not match the approved coordinator baseline.');
}

export async function factoryEvidence(root,{job,allowed=[],execute=false}={}){
 const scope=allowedPaths(root,allowed),approval=currentApproval(root),context=factoryContext(root,job);
 if(context.meta.executionContext.baselineHash!==approval.baseline.actualHash||
    JSON.stringify([...context.meta.executionContext.specPaths].sort())!==JSON.stringify([...approval.baseline.specPaths].sort()))
  fail('The Factory job was dispatched for a different native baseline. Do not import another feature\'s execution.');
 if(head(root)!==context.meta.base||!clean(root,{untracked:false}))fail('The orchestration checkout must still match the recorded clean tracked Factory base.');
 if(!clean(context.integration))fail('The integration worktree has uncommitted source changes; record the actual integration first.');
 const sourceBefore=sourceSnapshot(root),files=changed(context.integration,context.meta.base,context.finalRevision),unapproved=outside(files,scope);
 const sourceReview=readJson(statePath(root,'source-review.json'),false);
 if(approval.approval.sourceHash!==sourceBefore.hash&&!(sourceReview?.sourceHash===sourceBefore.hash&&sourceReview.baselineHash===approval.baseline.actualHash&&sourceReview.recordedAt>=approval.approval.recordedAt))
  fail('The orchestration source changed since approval; reconcile its actual independent source review before importing Factory evidence.');
 if(!files.length)fail('Factory integration contains no source changes. Use execution existing for independently reviewed pre-existing code.');
 if(files.some(runtimePath))fail('Factory runtime state is not an implementation change; preserve it outside the source commits.');
 if(unapproved.length)fail(`Factory integration changed paths outside the explicit scope: ${unapproved.join(', ')}`);
 const nativeTextRepresentations=nativeRepresentationPlan(root,context.integration);
 if(!execute)return {executed:false,passed:false,job,integrationProject:context.integration,changedFiles:files,allowedPaths:scope,nativeTextRepresentations,commands:configChecks(root),notice:'Preview only. --execute copies the exact approved baseline, records any shown native LF/CRLF checkout representations, runs checks in the integration worktree, and records observed integration evidence.'};
 const sourceAfter=sourceSnapshot(context.integration);
 if(sourceAfter.hash===sourceBefore.hash)fail('Factory integration has no fingerprinted source change. Use execution existing for independently reviewed pre-existing code.');
 seedIntegration(root,context.integration,context,nativeTextRepresentations);
 const startedAt=utcNow();
 const checks=await runChecks(context.integration,{execute:true});
 const current=checkBaseline(context.integration),unchanged=sourceSnapshot(context.integration).hash===sourceAfter.hash&&head(context.integration)===context.finalRevision;
 const receipt={schemaVersion:2,runner:'factory',phase:'implementation',runId:crypto.randomUUID(),task:context.record.title,job,
  status:checks.passed&&unchanged&&current.current?'code-executed-unverified':'failed',exitCode:checks.passed&&unchanged&&current.current?0:1,
  startedAt,finishedAt:utcNow(),baselineHash:approval.baseline.actualHash,sourceHashBefore:sourceBefore.hash,sourceHashAfter:sourceAfter.hash,
  initialRevision:context.meta.base,finalRevision:context.finalRevision,changedFiles:files,allowedPaths:scope,unapprovedFiles:[],
  factory:{project:root,job,metadataPath:context.metadataPath,integrationProject:context.integration,operations:context.observations,spec:context.spec},
  checkReceiptHash:hashFile(statePath(context.integration,'evidence/latest-checks.json')),limitation:LIMIT};
 atomicJson(statePath(context.integration,'evidence/latest-run.json'),receipt);
 audit(context.integration,'factory-execution-observed',{job,runId:receipt.runId,status:receipt.status,sourceHash:sourceAfter.hash,initialRevision:receipt.initialRevision,finalRevision:receipt.finalRevision});
 return {executed:true,passed:receipt.exitCode===0,integrationProject:context.integration,receipt,checks};
}

function reviewedExisting(root,{task,actor,evidence}={}){
 if(!task?.trim()||!actor?.trim()||!evidence?.trim())fail('Existing-code verification requires the actual task, independent reviewer and review evidence reference.');
 const {baseline,approval}=currentApproval(root),source=sourceSnapshot(root),review=readJson(statePath(root,'source-review.json'),false);
 const feature=featureReadiness(root);
 if(!feature.configured)fail(`Existing-code verification requires complete requirement coverage: ${feature.missing.join('; ')}`);
 if(!review||review.actor!==actor||review.sourceHash!==source.hash||review.baselineHash!==baseline.actualHash||review.recordedAt<approval.recordedAt)
  fail('Record an actual independent source-review of this exact existing code and baseline before verifying existing implementation.');
 const checks=readJson(statePath(root,'evidence/latest-checks.json'),false),configured=configChecks(root);
 if(!checks?.passed||!configured.length||checks.sourceHash!==source.hash||checks.baselineHash!==baseline.actualHash||
    !configured.every(check=>checks.checks?.some(result=>result.name===check.name&&result.exitCode===0&&
      (result.cwd||'.')===(check.cwd||'.')&&JSON.stringify(result.argv)===JSON.stringify(check.argv))))
  fail('Current passing configured checks are required for existing-code verification.');
 const semantic=readJson(statePath(root,'evidence/semantic-review.json'),false),requirements=readJson(statePath(root,'requirements.json'));
 if(!requirements.requirements?.length||!semantic||semantic.sourceHash!==source.hash||semantic.baselineHash!==baseline.actualHash||
    semantic.requirementsHash!==hashFile(statePath(root,'requirements.json'))||semantic.findings?.length!==requirements.requirements.length||
    !requirements.requirements.every(requirement=>semantic.findings.some(f=>f.id===requirement.id&&f.verdict==='pass')))
  fail('A complete current independent semantic review is required for existing-code verification.');
 for(const finding of semantic.findings){
  if(!Array.isArray(finding.evidenceFiles)||!finding.evidenceFiles.length)fail('Existing-code semantic evidence is incomplete.');
  for(const observed of finding.evidenceFiles)verifyObserved(root,observed);
 }
 return {baseline,source,review,checks,semantic};
}

export function verifyExisting(root,{task,actor,evidence,execute=false}={}){
 const context=reviewedExisting(root,{task,actor,evidence});
 if(!execute)return {executed:false,passed:false,mode:'existing-code',task,sourceHash:context.source.hash,notice:'Preview only. --execute records reviewed existing code. It does not claim any implementation process ran.'};
 const receipt={schemaVersion:2,runner:'existing-code',phase:'verification',status:'existing-code-reviewed',runId:crypto.randomUUID(),task,actor,evidence,
  finishedAt:utcNow(),baselineHash:context.baseline.actualHash,sourceHashAfter:context.source.hash,
  sourceReviewHash:hashFile(statePath(root,'source-review.json')),semanticReviewHash:hashFile(statePath(root,'evidence/semantic-review.json')),
  checkReceiptHash:hashFile(statePath(root,'evidence/latest-checks.json')),implementationExecuted:false,limitation:'Explicit local attestation for already implemented code. No implementation run, author identity, or release approval is inferred.'};
 atomicJson(statePath(root,'evidence/latest-run.json'),receipt);
 audit(root,'existing-code-verified',{task,actor,runId:receipt.runId,sourceHash:receipt.sourceHashAfter});
 return {executed:true,passed:true,mode:'existing-code',receipt};
}

export function executionEvidence(root,{sourceHash,baselineHash}={}){
 try{
  sourceHash??=sourceSnapshot(root).hash;baselineHash??=checkBaseline(root).actualHash;
  const receipt=readJson(statePath(root,'evidence/latest-run.json'),false);
  if(!receipt)return {valid:false,mode:null,reason:'No implementation or explicitly reviewed existing-code evidence.'};
  const mode=receipt.runner||'codex';
  if(!baselineHash||receipt.baselineHash!==baselineHash)return {valid:false,mode,reason:'Execution baseline is stale or unbound. Reverify legacy existing code explicitly; do not invent a new run.'};
  if(receipt.sourceHashAfter!==sourceHash)return {valid:false,mode,reason:'Execution evidence is stale for the current source.'};
  if(mode==='existing-code'){
   if(receipt.phase!=='verification'||receipt.status!=='existing-code-reviewed'||receipt.implementationExecuted!==false)fail('Malformed existing-code attestation.');
   reviewedExisting(root,receipt);
   for(const [file,field] of [['source-review.json','sourceReviewHash'],['evidence/semantic-review.json','semanticReviewHash'],['evidence/latest-checks.json','checkReceiptHash']])
    if(hashFile(statePath(root,file))!==receipt[field])fail('Existing-code review or check evidence changed; record verification again.');
   return {valid:true,mode,receipt};
  }
  if(!['codex','factory'].includes(mode)||receipt.phase!=='implementation'||receipt.status!=='code-executed-unverified'||receipt.exitCode!==0||
     !HASH.test(receipt.sourceHashBefore||'')||!Array.isArray(receipt.changedFiles)||!receipt.changedFiles.length||
     !Array.isArray(receipt.unapprovedFiles)||receipt.unapprovedFiles.length)fail('Actual successful bounded implementation evidence is required.');
  const scope=allowedPaths(root,receipt.allowedPaths);
  if(receipt.changedFiles.some(file=>typeof file!=='string'||runtimePath(file))||outside(receipt.changedFiles,scope).length)fail('Execution receipt includes out-of-scope or runtime changes.');
  if(receipt.sourceHashBefore===receipt.sourceHashAfter)fail('No fingerprinted implementation change was recorded; verify existing code explicitly.');
  if(mode==='factory'){
   if(!receipt.factory||typeof receipt.factory.integrationProject!=='string'||!path.isAbsolute(receipt.factory.integrationProject)||
      !sameExistingPath(receipt.factory.integrationProject,root))fail('Factory evidence is bound to another integration worktree.');
   assertNotLink(receipt.factory.integrationProject);
   const origin=receipt.factory.project,context=factoryContext(origin,receipt.job);
   if(context.meta.executionContext.baselineHash!==receipt.baselineHash||context.meta.base!==receipt.initialRevision||context.finalRevision!==receipt.finalRevision||
      JSON.stringify(context.observations)!==JSON.stringify(receipt.factory.operations)||
      JSON.stringify(context.spec)!==JSON.stringify(receipt.factory.spec)||
      JSON.stringify(changed(root,receipt.initialRevision,receipt.finalRevision))!==JSON.stringify(receipt.changedFiles)||!clean(root))
    fail('Factory job, source scope, or integration evidence changed.');
  }else{
   if(typeof receipt.evidenceLog!=='string'||!receipt.evidenceLog.startsWith('runs/'))fail('Codex process log is missing.');
   const log=statePath(root,receipt.evidenceLog);
   if(!fs.existsSync(log)||!fs.statSync(log).isFile())fail('Codex process log is missing.');
  }
  return {valid:true,mode,receipt};
 }catch(error){return {valid:false,mode:null,reason:error.message};}
}
