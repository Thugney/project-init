import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  initProject, readState, selectFramework, installPlan, applyInstall,
  eccInstallPlan, applyEcc, discover, fail, statePath, atomicJson, audit,
  projectRoot, recommendation
} from './core.mjs';
import {factoryPlan, applyFactory} from './factory.mjs';
import {prepareProject,preparationPlan} from './prepare.mjs';
import {skillPlan} from './skills.mjs';
import {prerequisitePlan,activateManagedTools,prepareVendorRuntimeEnvironment,installManagedUv,installPythonWindows,repairNpx,installGitWindows,installCodexCli,authenticateCodexCli,repairCodexRuntime,installClaudeCodeCli,authenticateClaudeCodeCli,UV_VERSION} from './prerequisites.mjs';

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

function gitPlan(root,inspection){
  const d=inspection||discover(root);
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

function selectFactoryFramework(root,requested,{state=readState(root),inspection,apply=true}={}){
  if(state.framework){
    if(requested&&requested!==state.framework) fail(`Project already selected ${state.framework}; guided init will not silently switch to ${requested}.`);
    if(state.framework!=='spec-kit') fail(`Guided Factory init currently requires spec-kit, but this project is pinned to ${state.framework}. Use the individual Project Init commands for a non-Factory methodology.`);
    return {id:state.framework,reason:'existing-project-selection',changed:false};
  }
  if(requested&&requested!=='spec-kit') fail('Guided Factory init currently supports --framework spec-kit only. Use recommend/select/install directly for OpenSpec, BMAD or none.');
  const d=inspection||discover(root);
  const active=Object.entries(d.footprints).filter(([,present])=>present).map(([id])=>id);
  if(active.length&&!(active.length===1&&active[0]==='spec-kit')) {
    fail(`Existing methodology footprint(s): ${active.join(', ')}. Guided Factory init will not create a competing Spec Kit source of truth.`);
  }
  if(apply)selectFramework(root,'spec-kit');
  return {id:'spec-kit',reason:active.includes('spec-kit')?'existing-spec-kit-footprint':'factory-profile-default',changed:apply,planned:!apply};
}

function summarizePlan(root,{specKitVersion,eccVersion,previewState,inspection}){
  activateManagedTools();
  const specKit=installPlan(root,specKitVersion,'both',{previewState,inspection});
  const ecc=eccInstallPlan(root,eccVersion,{agent:'both',scope:'local',previewState});
  const projectSkills=skillPlan(root,{agent:'both',scope:'project',previewState});
  const git=gitPlan(root,inspection);
  const prerequisites=prerequisitePlan({
    needUv:specKit.steps.some(step=>step.kind==='tool'&&step.cmd==='uv'),
    needEcc:true,
    needFactory:true
  });
  const factory=git.available?factoryPlan(root,{previewState}):{
    ready:false,
    deferredUntilGitInit:true,
    source:'project-init-bundled-factory',
    workers:{codex:{role:'general',worktree:'isolated'},claude:{role:'general',worktree:'isolated'},integration:{worktree:'isolated'},assignment:'balanced-independent-work-units',parallel:true},
    note:'Factory validation will run after Project Init initializes Git during --apply.'
  };
  return {git,prerequisites,specKit,ecc,factory,projectSkills};
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
    }else if(item.id==='codex-native-runtime'){
      const reason='Factory shell-less Codex execution requires the native Windows codex.exe payload, not only the npm codex.cmd shim.';
      if(!(await accepted(confirm,`${reason} Repair/update the official Codex CLI now?`))) return {ready:false,declined:item.id,actions,plan:current};
      emit(progress,'Repairing Codex runtime for shell-less worker execution...');
      const outcome=repairCodexRuntime();actions.push(outcome);emit(progress,`✓ Codex native runtime ready${outcome.nativeExecutable?' · '+outcome.nativeExecutable:''}`);
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
  if(factory.runtimeBoard?.state==='missing') return true;
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
  feature,
  specs=[],
  mapping,
  version=DEFAULT_SPEC_KIT_VERSION,
  eccVersion=DEFAULT_ECC_VERSION,
  orchestrator,
  userHome,
  apply=false,
  confirm,
  progress
}={}){
  root=projectRoot(root,true);
  let initialized=false;
  let resumed=false;
  let initialization;
  const inspection=fs.existsSync(root)?discover(root):{
    projectPath:root,mode:'New',exists:false,fileCount:0,scanTruncated:false,
    indicators:{node:false,python:false,powershell:false,frontend:false,tests:false,priorV1:false,leanKitDetected:false,existingAgentRules:false},
    footprints:{openspec:false,'spec-kit':false,bmad:false},
    git:{available:false,clean:null,revision:null,root:null,atRepoRoot:false},examples:[]
  };
  const selection=recommendation(inspection,{intent,complexity,ui});
  const existing=hasState(root);
  let plannedState;
  if(existing){
    resumed=true;
    plannedState=readState(root);
    initialization={state:plannedState,notice:'Existing Project Init state inspected; no state files were overwritten.'};
  }else{
    const inferredMode=mode||inspection.mode;
    if(!['New','Existing'].includes(inferredMode))fail('Mode must be New or Existing.');
    if(inferredMode==='New'&&inspection.mode==='Existing')fail('New mode refuses nonempty or Git project. Use Existing.');
    if(inferredMode==='Existing'&&inspection.mode==='New')fail('Existing mode requires application files or Git state. Use New.');
    plannedState={projectPath:root,mode:inferredMode,intent,complexity,uiRequired:selection.uiRequired,framework:null};
    initialization={state:plannedState,planned:true,notice:'Preview only. Project directories, state, framework selection and application files remain unchanged.'};
  }
  // Validate the existing methodology before creating any state. The same
  // selection is persisted only in the explicit apply path below.
  let selected=selectFactoryFramework(root,framework,{state:plannedState,inspection,apply:false});
  if(apply){
    if(!existing){
      const created=initProject(root,{mode:plannedState.mode,intent,complexity,ui});
      initialization={state:created.state,notice:created.notice};
      initialized=true;
    }
    selected=selectFactoryFramework(root,framework);
    plannedState=readState(root);
    initialization.state=plannedState;
  }else plannedState={...plannedState,framework:selected.id};
  const preview=summarizePlan(root,{specKitVersion:version,eccVersion,previewState:apply?undefined:plannedState,inspection:apply?undefined:inspection});
  const result={
    profile:'factory',
    project:root,
    initialized,
    resumed,
    inspection:apply?discover(root):inspection,
    initialization,
    framework:selected,
    architecture:{
      projectInit:'bootstrap / inspect / install / wire / feature preparation',
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

  const preparationOptions={feature,specs,mapping};
  if(!apply){
    const preparation=fs.existsSync(root)?preparationPlan(root,preparationOptions):{
      project:root,initialized:false,feature:null,status:'feature-required',applied:false,
      readyForBaseline:false,approved:false,baseline:{exists:false,current:false},
      blockers:[{id:'feature',owner:'agent',message:'The project directory does not exist yet. Apply tooling setup, then use the native framework to define the first feature.'}],
      next:[],executesCommands:false,createsNativeSpecs:false
    };
    return {...result,preparation};
  }

  const stateProgress=bootstrapState(root);
  const applied={prerequisites:null,git:null,specKit:null,ecc:null,factory:null,wire:null};

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
    emit(progress,`Installing Spec Kit ${version} for Codex + Claude... existing-repo merge confirmation is pre-authorized by your Project Init approval.`);
    applied.specKit=await applyInstall(root,version,{apply:true,agent:'both',streamOutput:false});
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
    const eccPreview=eccInstallPlan(root,eccVersion,{agent:'both',scope:'local'});
    const channelSummary=`Claude=${eccPreview.channels.claude} · Codex=${eccPreview.channels.codex}`;
    if(!(await accepted(confirm,`Install ECC ${eccVersion} now? ${channelSummary}`))) return stopped(result,'ecc','ECC installation was declined.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    const vendorRuntime=prepareVendorRuntimeEnvironment();
    emit(progress,`Installing ECC ${eccVersion} · ${channelSummary}`);
    if(vendorRuntime.codexNative) emit(progress,`Codex worker native runtime: ${vendorRuntime.codexNative}`);
    applied.ecc=await applyEcc(root,eccVersion,{apply:true,agent:'both',scope:'local',env:vendorRuntime.env});
    if(stepFailed(applied.ecc)||applied.ecc.applied===false){
      stateProgress.steps.ecc={status:'failed',at:new Date().toISOString(),version:eccVersion};
      writeBootstrapState(root,stateProgress);
      return {...result,plan:summarizePlan(root,{specKitVersion:version,eccVersion}),applied:false,status:'failed',failedStep:'ecc',execution:applied};
    }
    emit(progress,`✓ ECC ${eccVersion} installed and verified`);
    stateProgress.steps.ecc={status:'completed',at:new Date().toISOString(),version:eccVersion};
    writeBootstrapState(root,stateProgress);
  }

  const currentFactory=factoryPlan(root,{orchestrator});
  if(factoryNeedsApply(currentFactory)||(orchestrator&&currentFactory.orchestrator.current!==orchestrator)){
    if(!(await accepted(confirm,`Install/update the bundled Factory for parallel Codex + Claude isolated worktrees (orchestrator: ${orchestrator||currentFactory.orchestrator.current}) now?`))) return stopped(result,'factory','Factory installation was declined.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    emit(progress,'Installing Factory parallel-worktree tooling...');
    applied.factory=applyFactory(root,{apply:true,orchestrator});
    emit(progress,'✓ Factory installed and verified');
  }else{
    applied.factory={applied:false,skipped:true,reason:'Factory already current.'};
    emit(progress,'✓ Factory already current');
  }
  stateProgress.steps.factory={status:'completed',at:new Date().toISOString(),source:'project-init-bundled-factory'};
  writeBootstrapState(root,stateProgress);

  const wirePreview=skillPlan(root,{agent:'both',scope:'project'});
  const wireChanges=wirePreview.skills.filter(item=>item.action!=='unchanged');
  if(wireChanges.length){
    const conflicts=wireChanges.filter(item=>item.action==='conflict');
    let backupConflicts=false;
    let question='Install the Project Init workflow skills for Codex + Claude in this project now?';
    if(conflicts.length){
      const backupPlan=skillPlan(root,{agent:'both',scope:'project',backupConflicts:true});
      emit(progress,`Project Init skill backup plan: ${conflicts.map(item=>item.path).join(', ')} -> ${backupPlan.backupDirectory}`);
      question=`Project Init workflow skills differ at ${conflicts.map(item=>item.path).join(', ')}. Back up those skill directories under ${backupPlan.backupDirectory} and install the current workflow skills now?`;
      backupConflicts=true;
    }
    if(!(await accepted(confirm,question)))return stopped(result,'project-skills','Project Init workflow skill installation/update was declined. Existing skills were preserved.',applied,summarizePlan(root,{specKitVersion:version,eccVersion}));
    applied.wire=skillPlan(root,{agent:'both',scope:'project',apply:true,backupConflicts});
    emit(progress,'✓ Project Init workflow skills installed; reload Codex/Claude skills to use them');
  }else{
    applied.wire={applied:false,skipped:true,reason:'Project Init workflow skills already current.'};
    emit(progress,'✓ Project Init workflow skills already current');
  }
  stateProgress.steps.wire={status:'completed',at:new Date().toISOString(),scope:'project',agents:['codex','claude']};

  // Project skills sit in untracked folders that fresh linked worktrees (for example Claude
  // Code session worktrees) never receive. User-scope rules and skills reach every agent
  // session. Only the CLI supplies userHome, so library callers never touch a real profile.
  if(userHome){
    const userPlan=skillPlan(root,{agent:'both',scope:'user',userHome});
    const userConflicts=userPlan.skills.filter(item=>item.action==='conflict');
    const userChanges=[...userPlan.skills,...userPlan.rules].filter(item=>item.action!=='unchanged');
    if(userConflicts.length){
      applied.wireUser={applied:false,skipped:true,reason:'User-wide skills differ and were not generated by Project Init.',conflicts:userConflicts.map(item=>item.path)};
      emit(progress,`! User-wide Project Init skills not installed: ${userConflicts.map(item=>item.path).join(', ')} differ. Review with: project-init wire --scope user --backup-conflicts`);
    }else if(!userChanges.length){
      applied.wireUser={applied:false,skipped:true,reason:'User-wide Project Init rules and skills already current.'};
      emit(progress,'✓ User-wide Project Init rules and skills already current');
    }else if(await accepted(confirm,'Install Project Init rules and skills for Codex + Claude for this user, so every agent session (including fresh worktrees) follows Project Init and the Factory board?')){
      applied.wireUser=skillPlan(root,{agent:'both',scope:'user',userHome,apply:true});
      emit(progress,'✓ User-wide Project Init rules and skills installed; restart Codex/Claude sessions to load them');
    }else{
      applied.wireUser={applied:false,skipped:true,reason:'Declined; agent sessions in fresh worktrees will not see Project Init rules.'};
      emit(progress,'! User-wide Project Init rules declined; fresh worktree sessions will not see them');
    }
    stateProgress.steps.wireUser={status:'completed',at:new Date().toISOString(),scope:'user',agents:['codex','claude']};
    writeBootstrapState(root,stateProgress);
  }
  writeBootstrapState(root,stateProgress);

  const finalPlan=summarizePlan(root,{specKitVersion:version,eccVersion});
  const toolingGates={
    prerequisites:finalPlan.prerequisites.ready,
    specKit:finalPlan.specKit.installed||finalPlan.specKit.steps.length===0,
    factory:finalPlan.factory.ready,
    parallelWorktrees:finalPlan.factory.workers?.parallel===true,
    projectSkills:finalPlan.projectSkills.skills.every(item=>item.action==='unchanged')
  };
  const ready=Object.values(toolingGates).every(Boolean);
  let preparation;
  try{
    preparation=ready?prepareProject(root,{...preparationOptions,apply:true}):preparationPlan(root,preparationOptions);
  }catch(error){
    // Tool installation can succeed while existing feature state requires a
    // repair. Preserve it and return the concrete blocker instead of claiming
    // that the feature is ready or discarding state to make initialization pass.
    preparation={project:root,status:'preparation-required',applied:false,readyForBaseline:false,approved:false,
      baseline:{exists:fs.existsSync(statePath(root,'baseline.json')),current:false},
      blockers:[{id:'preparation',owner:'agent',message:error.message}],next:[{id:'preparation',owner:'agent',message:error.message}]};
  }
  const readiness={...toolingGates,tooling:ready,
    feature:!!(preparation.readyForBaseline&&preparation.baseline.current),
    approval:!!preparation.approved};
  if(ready){
    emit(progress,'✓ TOOLING READY for Codex + Claude');
    emit(progress,`Feature preparation: ${preparation.status}`);
  }
  return {
    ...result,
    plan:finalPlan,
    applied:ready,
    status:ready?'ready':'failed',
    failedStep:ready?null:'readiness',
    readiness,
    readyScope:'tooling',
    preparation,
    execution:applied,
    next:ready?`Tooling setup is complete. Feature: ${preparation.status}. ${preparation.next?.[0]?.message||'Inspect project-init status before implementation; execution, verification and release approval remain separate gates.'}`:'Bootstrap completed steps but final tooling readiness verification failed; inspect the returned plan.'
  };
}
