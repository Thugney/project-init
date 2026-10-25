import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  initProject, readState, selectFramework, installPlan, applyInstall,
  eccInstallPlan, applyEcc, discover, fail, statePath, atomicJson, audit
} from './core.mjs';
import {factoryPlan, applyFactory} from './factory.mjs';

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
  const specKit=installPlan(root,specKitVersion,'both');
  const ecc=eccInstallPlan(root,eccVersion,{agent:'both',scope:'local'});
  const git=gitPlan(root);
  const factory=git.available?factoryPlan(root):{
    ready:false,
    deferredUntilGitInit:true,
    source:'project-init-bundled-factory',
    defaults:{backend:'codex',frontend:'claude'},
    note:'Factory validation will run after Project Init initializes Git during --apply.'
  };
  return {git,specKit,ecc,factory};
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
  apply=false
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
      backendDefault:'codex',
      frontendDefault:'claude',
      approval:'human'
    },
    versions:{specKit:version,ecc:eccVersion},
    plan:preview,
    applied:false,
    status:'preview',
    next:apply?null:'Review this one Factory bootstrap plan, then re-run project-init init --project . --apply. The select/install/ecc/factory commands are advanced controls, not required steps.'
  };

  if(!apply) return result;

  const progress=bootstrapState(root);
  const applied={git:null,specKit:null,ecc:null,factory:null};

  applied.git=ensureGit(root);
  progress.steps.git={status:'completed',at:new Date().toISOString(),created:applied.git.created};
  writeBootstrapState(root,progress);

  applied.specKit=await applyInstall(root,version,{apply:true,agent:'both'});
  if(stepFailed(applied.specKit)){
    progress.steps.specKit={status:'failed',at:new Date().toISOString()};
    writeBootstrapState(root,progress);
    return {...result,applied:false,status:'failed',failedStep:'spec-kit',execution:applied};
  }
  progress.steps.specKit={status:'completed',at:new Date().toISOString(),version};
  writeBootstrapState(root,progress);

  const eccDone=progress.steps.ecc?.status==='completed'&&progress.steps.ecc?.version===eccVersion;
  if(eccDone){
    applied.ecc={applied:false,skipped:true,reason:'Previously completed by this Factory bootstrap with the same version.'};
  }else{
    applied.ecc=await applyEcc(root,eccVersion,{apply:true,agent:'both',scope:'local'});
    if(stepFailed(applied.ecc)||applied.ecc.applied===false){
      progress.steps.ecc={status:'failed',at:new Date().toISOString(),version:eccVersion};
      writeBootstrapState(root,progress);
      return {...result,applied:false,status:'failed',failedStep:'ecc',execution:applied};
    }
    progress.steps.ecc={status:'completed',at:new Date().toISOString(),version:eccVersion};
    writeBootstrapState(root,progress);
  }

  applied.factory=applyFactory(root,{apply:true});
  progress.steps.factory={status:'completed',at:new Date().toISOString(),source:applied.factory.source};
  writeBootstrapState(root,progress);

  const finalPlan=summarizePlan(root,{specKitVersion:version,eccVersion});
  return {
    ...result,
    plan:finalPlan,
    applied:true,
    status:'ready',
    execution:applied,
    next:'Factory profile bootstrap complete. Spec Kit owns requirements/spec/tasks; Factory routes execution to Codex and Claude; human approval remains the release gate.'
  };
}
