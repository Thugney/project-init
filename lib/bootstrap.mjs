import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  initProject, readState, selectFramework, installPlan, applyInstall,
  eccInstallPlan, applyEcc, discover, fail, statePath, atomicJson, audit
} from './core.mjs';
import {factoryPlan, applyFactory} from './factory.mjs';
import {prerequisitePlan,activateManagedTools,installManagedUv,installPythonWindows,repairNpx,installGitWindows,installCodexCli,authenticateCodexCli,installClaudeCodeCli,authenticateClaudeCodeCli,UV_VERSION} from './prerequisites.mjs';

export const DEFAULT_SPEC_KIT_VERSION='1.2.3';
export const DEFAULT_ECC_VERSION='2.2.3';

function hasState(root){
  return fs.existsSync(path.join(root,'.project-init','project.json'));
}

function bootstrapState(root){
  const file=statePath(root,'bootstrap.json');
  if(!fs.existsSync(file)) return {schemaVersion:1,profile:'factory',steps:{}};
  try{
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    if(value?.schemaVersion!==1||value?.profile!=='factory'||typeof value.steps!=='object') return {schemaVersion:1,profile:'factory',steps:{}};
    return value;
  }catch{
    return {schemaVersion:1,profile:'factory',steps:{}};
  }
}

function writeBootstrapState(root,value){
  atomicJson(statePath(root,'bootstrap.json'),{...value,updatedAt:new Date().toISOString()});
}

function gitPlan(root){
  const d=discover(root);
  if(d.git.available) return {available:true,action:'none',atRepoRoot:d.git.atRepoRoot,root:d.git.root};
  return {available:false,action:'init',atRepoRoot:false,root:null};
}

function ensureGit(root){
  const current=discover(root);
  if(current.git.available) return {created:false,root:current.git.root};
  const probe=spawnSync('git',['--version'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(probe.status!==0) fail('Git is required for the Factory profile but was not found on PATH.');
  const result=spawnSync('git',['init'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(result.status!==0) fail(`git init failed: ${result.stderr?.trim()||'unknown error'}`);
  audit(root,'bootstrap-git-init',{});
  const after=discover(root);
  if(!after.git.available||!after.git.atRepoRoot) fail('Git initialization completed but the project root was not detected as a Git repository.');
  return {created:true,root:after.git.root};
}

function selectFactoryFramework(root,requested){
  const state=readState(root);
  if(state.framework){
    if(requested&&requested!==state.framework) fail(`Project already selected ${state.framework}; guided init will not silently switch to ${requested}.`);
    if(state.framework!=='spec-kit') fail(`Guided Factory init currently requires spec-kit, but this project is pinned to ${state.framework}. Use the individual Project Init commands for a non-Factory methodology.`);
    return {id:state.framework,reason:'existing-project-selection',changed:false};
  }
  if(requested&&requested!=='spec-kit') fail('Guided Factory init currently supports --framework spec-kit only. Use recommend/select/install directly for OpenSpec, BMAD or none.');
  const d=discover(root);
  const active=Object.entries(d.footprints).filter(([,present])=>present).map(([id])=>id);
  if(active.length&&!(active.length===1&&active[0]==='spec-kit')) {
    fail(`Existing methodology footprint(s): ${active.join(', ')}. Guided Factory init will not create a competing Spec Kit source of truth.`);
  }
  selectFramework(root,'spec-kit');
  return {id:'spec-kit',reason:active.includes('spec-kit')?'existing-spec-kit-footprint':'factory-profile-default',changed:true};
}

function summarizePlan(root,{specKitVersion,eccVersion}){
  activateManagedTools();
  const specKit=installPlan(root,specKitVersion,'both');
  const ecc=eccInstallPlan(root,eccVersion,{agent:'both',scope:'local'});
  const git=gitPlan(root);
  const prerequisites=prerequisitePlan({
    needUv:specKit.steps.some(step=>step.kind==='tool'&&step.cmd==='uv'),
    needEcc:true,
    needFactory:true
  });
  const factory=git.available?factoryPlan(root):{
    ready:false,
    deferredUntilGitInit:true,
    source:'project-init-bundled-factory',
    workers:{codex:{role:'general',worktree:'isolated'},claude:{role:'general',worktree:'isolated'},integration:{worktree:'isolated'},assignment:'balanced-independent-work-units',parallel:true},
    note:'Factory validation will run after Project Init initializes Git during --apply.'
  };
  return {git,prerequisites,specKit,ecc,factory};
}


async function accepted(confirm,message){
  if(!confirm) return true;
  return !!(await confirm(message));
}
function emit(progress,message){if(progress)progress(message);}
function stopped(result,at,reason,execution=null,plan=result.plan){
  return {...result,plan,applied:false,status:'stopped',stoppedAt:at,stopReason:reason,execution,
    next:'Bootstrap stopped by user choice. Re-run project-init init --project . --apply when you want to continue; completed verified steps are resumed.'};
}
async function satisfyPrerequisites(plan,{confirm,progress}={}){
  activateManagedTools();
  const options={
    needUv:plan.specKit.steps.some(step=>step.kind==='tool'&&step.cmd==='uv'),
    needEcc:true,
    needFactory:true
  };
  let current=prerequisitePlan(options);
  const actions=[];
  let safety=0;
  while(!current.ready){
    if(++safety>20) throw new Error('Bootstrap prerequisite resolution exceeded the safety limit.');
    const item=current.checks.find(x=>!x.ready);
    if(!item) break;
    if(!item.installable){
      throw new Error(`${item.id} is required by ${item.requiredBy} and Project Init cannot safely install it automatically on this platform.`);
    }

    if(item.id==='uv'){
      if(!(await accepted(confirm,`Spec Kit requires uv ${UV_VERSION}. Install a Project Init-managed user copy now?`))) return {ready:false,declined:'uv',actions,plan:current};
      emit(progress,`Installing uv ${UV_VERSION} for Spec Kit...`);
      const outcome=await installManagedUv();actions.push(outcome);emit(progress,`✓ ${outcome.version} installed and verified`);
    }else if(item.id==='python'){
      if(!(await accepted(confirm,'Factory worktree helpers require Python. Install Python 3.13 for this user now?'))) return {ready:false,declined:'python',actions,plan:current};
      emit(progress,'Installing Python 3.13 for Factory...');
      const outcome=installPythonWindows();actions.push(outcome);emit(progress,`✓ ${outcome.version} installed and verified`);
    }else if(item.id==='npx'){
      if(!(await accepted(confirm,`ECC requires npx, but this npm installation is missing it. Repair npm ${current.checks.find(x=>x.id==='npm')?.version||''} now?`))) return {ready:false,declined:'npx',actions,plan:current};
      emit(progress,'Repairing npm/npx for ECC...');
      const outcome=repairNpx();actions.push(outcome);emit(progress,`✓ npx ${outcome.version} available`);
    }else if(item.id==='git'){
      if(!(await accepted(confirm,'Project Init, Factory, and Claude Code require Git. Install Git for this Windows user now?'))) return {ready:false,declined:'git',actions,plan:current};
      emit(progress,'Installing Git...');
      const outcome=installGitWindows();actions.push(outcome);emit(progress,`✓ ${outcome.version} installed and verified`);
    }else if(item.id==='codex-cli'){
      if(!(await accepted(confirm,'Factory requires the Codex CLI executable. Install the official @openai/codex CLI with npm now?'))) return {ready:false,declined:'codex-cli',actions,plan:current};
      emit(progress,'Installing Codex CLI...');
      const outcome=installCodexCli();actions.push(outcome);emit(progress,`✓ Codex CLI ${outcome.version} installed and verified`);
    }else if(item.id==='codex-auth'){
      if(!(await accepted(confirm,'Codex CLI is installed but not signed in. Sign in with your ChatGPT account now?'))) return {ready:false,declined:'codex-auth',actions,plan:current};
      emit(progress,'Starting Codex CLI sign-in...');
      const outcome=authenticateCodexCli();actions.push(outcome);emit(progress,'✓ Codex CLI authentication verified');
    }else if(item.id==='claude-code'){
      if(!(await accepted(confirm,'Factory requires the Claude Code CLI executable. Install the official @anthropic-ai/claude-code CLI with npm now?'))) return {ready:false,declined:'claude-code',actions,plan:current};
      emit(progress,'Installing Claude Code CLI...');
      const outcome=installClaudeCodeCli();actions.push(outcome);emit(progress,`✓ Claude Code ${outcome.version} installed and verified`);
    }else if(item.id==='claude-auth'){
      if(!(await accepted(confirm,'Claude Code CLI is installed but not signed in. Sign in with your Claude account now?'))) return {ready:false,declined:'claude-auth',actions,plan:current};
      emit(progress,'Starting Claude Code CLI sign-in...');
      const outcome=authenticateClaudeCodeCli();actions.push(outcome);emit(progress,'✓ Claude Code authentication verified');
    }else{
      throw new Error(`Unsupported bootstrap prerequisite: ${item.id}`);
    }

    activateManagedTools();
    current=prerequisitePlan(options);
  }
  return {ready:current.ready,actions,plan:current};
}
function factoryNeedsApply(factory){
  if(factory.deferredUntilGitInit) return true;
  if(factory.factoryFiles?.some(x=>['create','replace'].includes(x.action))) return true;
  if(factory.codexSkills?.some(x=>x.action!=='unchanged')) return true;
  if(factory.legacy?.some(x=>x.action==='remove-managed')) return true;
  return false;
}

function stepFailed(result){
  return result?.results?.some(x=>x.exitCode!==0)||result?.result?.exitCode!==undefined&&result.result.exitCode!==0;
}

export async function bootstrapProject(root,{
  mode,
  intent='unknown',
  complexity='unknown',
  ui='auto',
  framework,
  version=DEFAULT_SPEC_KIT_VERSION,
  eccVersion=DEFAULT_ECC_VERSION,
  apply=false,
  confirm,
  progress
}={}){
  let initialized=false;
  let resumed=false;
  let initialization;

  if(hasState(root)){
    resumed=true;
    initialization={state:readState(root),notice:'Existing Project Init state resumed; no state files were overwritten.'};
  }else{
    const inferredMode=mode||(fs.existsSync(root)?discover(root).mode:'New');
    const created=initProject(root,{mode:inferredMode,intent,complexity,ui});
    initialization={state:created.state,notice:created.notice};
    initialized=true;
  }

  const selected=selectFactoryFramework(root,framework);
  const preview=summarizePlan(root,{specKitVersion:version,eccVersion});
  const result={
    profile:'factory',
    project:root,
    initialized,
    resumed,
    inspection:discover(root),
    initialization,
    framework:selected,
    architecture:{
      projectInit:'bootstrap / inspect / install / wire',
      specOwner:'spec-kit',
      engineeringToolbox:'ecc',
      execution:'factory',
      workers:['codex','claude'],
      workerModel:'parallel-isolated-git-worktrees',
      approval:'human'
    },
    versions:{specKit:version,ecc:eccVersion},
    plan:preview,
    applied:false,
    status:'preview',
    next:apply?null:'Review this one Factory bootstrap plan, then re-run the same init command with --apply: project-init init --project . --apply. The select/install/ecc/factory commands are advanced controls, not required steps.'
  };

  if(!apply) return result;

  const stateProgress=bootstrapState(root);
  const applied={prerequisites:null,git:null,specKit:null,ecc:null,factory:null};

  const prereqs=await satisfyPrerequisites(preview,{confirm,progress});
  applied.prerequisites=prereqs;
  if(!prereqs.ready) return stopped(result,`prerequisite:${prereqs.declined}`,`Installation of ${prereqs.declined} was declined.`,applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
  stateProgress.steps.prerequisites={status:'completed',at:new Date().toISOString(),actions:prereqs.actions.map(x=>x.id)};
  writeBootstrapState(root,stateProgress);

  applied.git=ensureGit(root);
  stateProgress.steps.git={status:'completed',at:new Date().toISOString(),created:applied.git.created};
  writeBootstrapState(root,stateProgress);

  const specPreview=installPlan(root,version,'both');
  if(specPreview.steps.length){
    if(!(await accepted(confirm,`Install Spec Kit ${version} for Codex + Claude now?`))) return stopped(result,'spec-kit','Spec Kit installation was declined.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    emit(progress,`Installing Spec Kit ${version} for Codex + Claude...`);
    applied.specKit=await applyInstall(root,version,{apply:true,agent:'both'});
    if(stepFailed(applied.specKit)||applied.specKit.applied===false){
      stateProgress.steps.specKit={status:'failed',at:new Date().toISOString()};
      writeBootstrapState(root,stateProgress);
      return {...result,plan:summarizePlan(root,{specKitVersion:version,eccVersion}),applied:false,status:'failed',failedStep:'spec-kit',execution:applied};
    }
    emit(progress,`✓ Spec Kit ${version} installed and verified`);
  }else{
    applied.specKit={applied:false,skipped:true,reason:'Spec Kit already installed for both agents.'};
    emit(progress,`✓ Spec Kit ${version} already ready`);
  }
  stateProgress.steps.specKit={status:'completed',at:new Date().toISOString(),version};
  writeBootstrapState(root,stateProgress);

  const eccDone=stateProgress.steps.ecc?.status==='completed'&&stateProgress.steps.ecc?.version===eccVersion;
  if(eccDone){
    applied.ecc={applied:false,skipped:true,reason:'Previously completed by this Factory bootstrap with the same version.'};
    emit(progress,`✓ ECC ${eccVersion} already ready`);
  }else{
    if(!(await accepted(confirm,`Install ECC ${eccVersion} for Codex + Claude now?`))) return stopped(result,'ecc','ECC installation was declined.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    emit(progress,`Installing ECC ${eccVersion} for Codex + Claude...`);
    applied.ecc=await applyEcc(root,eccVersion,{apply:true,agent:'both',scope:'local'});
    if(stepFailed(applied.ecc)||applied.ecc.applied===false){
      stateProgress.steps.ecc={status:'failed',at:new Date().toISOString(),version:eccVersion};
      writeBootstrapState(root,stateProgress);
      return {...result,plan:summarizePlan(root,{specKitVersion:version,eccVersion}),applied:false,status:'failed',failedStep:'ecc',execution:applied};
    }
    emit(progress,`✓ ECC ${eccVersion} installed and verified`);
    stateProgress.steps.ecc={status:'completed',at:new Date().toISOString(),version:eccVersion};
    writeBootstrapState(root,stateProgress);
  }

  const currentFactory=factoryPlan(root);
  if(factoryNeedsApply(currentFactory)){
    if(!(await accepted(confirm,'Install/update the bundled Factory for parallel Codex + Claude isolated worktrees now?'))) return stopped(result,'factory','Factory installation was declined.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    emit(progress,'Installing Factory parallel-worktree tooling...');
    applied.factory=applyFactory(root,{apply:true});
    emit(progress,'✓ Factory installed and verified');
  }else{
    applied.factory={applied:false,skipped:true,reason:'Factory already current.'};
    emit(progress,'✓ Factory already current');
  }
  stateProgress.steps.factory={status:'completed',at:new Date().toISOString(),source:'project-init-bundled-factory'};
  writeBootstrapState(root,stateProgress);

  const finalPlan=summarizePlan(root,{specKitVersion:version,eccVersion});
  const readiness={
    prerequisites:finalPlan.prerequisites.ready,
    specKit:finalPlan.specKit.installed||finalPlan.specKit.steps.length===0,
    factory:finalPlan.factory.ready,
    parallelWorktrees:finalPlan.factory.workers?.parallel===true
  };
  const ready=Object.values(readiness).every(Boolean);
  if(ready) emit(progress,'✓ PROJECT READY for Codex + Claude');
  return {
    ...result,
    plan:finalPlan,
    applied:ready,
    status:ready?'ready':'failed',
    failedStep:ready?null:'readiness',
    readiness,
    execution:applied,
    next:ready?'Project bootstrap complete. Codex and Claude are ready to execute approved Factory work in isolated parallel worktrees.':'Bootstrap completed steps but final readiness verification failed; inspect the returned plan.'
  };
}
