// Prepare the selected native feature. This module never authors a second spec,
// runs project commands, or records a reviewer's or owner's approval.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
 readState,readJson,statePath,projectFile,atomicJson,audit,fail,initProject,
 selectFramework,discover,checkBaseline,establishBaseline,validateChecks,
 validUIDesign
} from './core.mjs';
import {discoverProjectChecks} from './check-discovery.mjs';
import {visualPlan} from './visual-gate.mjs';
import {sameExistingPath} from './paths.mjs';

const REQUIREMENT=/^[A-Z][A-Z0-9_-]{1,63}$/;
const nativeRoots={'spec-kit':'specs',openspec:'openspec/changes',bmad:'_bmad-output'};
const slash=value=>value.replaceAll('\\','/');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=values=>[...new Set(values)];

function relativeFile(root,value){
 if(typeof value!=='string'||!value.trim())fail('Expected an existing project-relative native artifact path.');
 const rel=slash(value).replace(/^\.\//,'').replace(/\/$/,'');
 if(rel==='.project-init'||rel.startsWith('.project-init/')||/^[a-z]:/i.test(rel))fail('Native feature artifacts must stay in their framework-owned project paths.');
 const file=projectFile(root,rel);
 if(!fs.existsSync(file))fail(`Native artifact not found in this checkout: ${rel}`);
 return {relative:slash(path.relative(root,file)),file};
}
function optional(root,relative){return readJson(projectFile(root,relative),false);}
function git(root,args){
 const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:1024*1024});
 return r.status===0?r.stdout.trim():null;
}
export function worktreeContext(root){
 const actual=git(root,['rev-parse','--show-toplevel']);
 const listing=git(root,['worktree','list','--porcelain','-z']);
 const paths=listing?listing.split('\0').filter(field=>field.startsWith('worktree ')).map(field=>field.slice(9)):[];
 return {project:root,gitRoot:actual,branch:git(root,['branch','--show-current']),
  otherWorktrees:paths.filter(p=>!sameExistingPath(p,root)).slice(0,30),
  stateDirectory:path.join(root,'.project-init'),factoryBoard:path.join(root,'factory','board.json')};
}

function stateContext(root,context){
 if(fs.existsSync(statePath(root,'project.json')))return {state:readState(root),initialized:true,origin:root};
 const d=discover(root),owners=Object.entries(d.footprints).filter(([,v])=>v).map(([k])=>k);
 if(!owners.length&&fs.existsSync(path.join(root,'specs'))){
  const dirs=fs.readdirSync(path.join(root,'specs'),{withFileTypes:true});
  if(dirs.some(e=>e.isDirectory()&&!e.isSymbolicLink()&&/^\d+-/.test(e.name)&&fs.existsSync(path.join(root,'specs',e.name,'spec.md'))))owners.push('spec-kit');
 }
 if(owners.length)return {state:{framework:owners.length===1?owners[0]:null,uiRequired:d.indicators.frontend},initialized:false,origin:root};
 // Local native ownership takes precedence. A linked worktree may reuse one
 // unambiguous methodology, never another feature's approval or run evidence.
 const related=[];
 for(const other of context.otherWorktrees){
  try{const state=readState(path.resolve(other));if(state.framework)related.push({framework:state.framework,origin:other});}
  catch{ /* Other worktrees can be absent, uninitialized, or stale. */ }
 }
 const frameworks=unique(related.map(item=>item.framework));
 return {state:{framework:frameworks.length===1?frameworks[0]:null,uiRequired:d.indicators.frontend},initialized:false,origin:frameworks.length===1?related[0].origin:null};
}

function candidates(root,framework){
 const base=nativeRoots[framework];
 if(!base||!fs.existsSync(projectFile(root,base)))return [];
 const dirs=fs.readdirSync(projectFile(root,base),{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink());
 const found=[];
 for(const e of dirs.sort((a,b)=>a.name.localeCompare(b.name))){
  const folder=`${base}/${e.name}`;
  const names=framework==='spec-kit'?['spec.md','plan.md']:framework==='openspec'?['proposal.md','design.md']:['prd.md','architecture.md'];
  const specs=names.map(name=>`${folder}/${name}`).filter(file=>fs.existsSync(projectFile(root,file)));
  if(framework==='openspec'){
   const changes=projectFile(root,`${folder}/specs`);
   if(fs.existsSync(changes))for(const child of fs.readdirSync(changes,{withFileTypes:true})){
    if(child.isDirectory()&&!child.isSymbolicLink()){
     const file=`${folder}/specs/${child.name}/spec.md`;
     if(fs.existsSync(projectFile(root,file)))specs.push(file);
    }
   }
  }
  if(specs.length)found.push({id:e.name,directory:folder,specPaths:specs,taskPath:fs.existsSync(projectFile(root,`${folder}/tasks.md`))?`${folder}/tasks.md`:null});
 }
 return found;
}

function chooseFeature(root,state,{feature,specs=[]},context){
 const found=candidates(root,state.framework);
 if(specs.length){
  const paths=unique(specs.map(p=>relativeFile(root,p).relative));
  if(paths.some(p=>!fs.statSync(projectFile(root,p)).isFile()))fail('--spec must reference existing files.');
  const matching=found.find(c=>paths.includes(c.specPaths[0]));
  return {selected:matching?{...matching,specPaths:paths}:{id:'explicit-native-scope',directory:null,specPaths:paths,taskPath:null},candidates:found,reason:'explicit-specs'};
 }
 if(feature){
  const target=relativeFile(root,feature);
  if(fs.statSync(target.file).isFile())return chooseFeature(root,state,{specs:[target.relative]},context);
  const match=found.find(c=>c.directory===target.relative);
  if(!match)fail(`No supported native feature documents in ${target.relative}; use --spec for the existing authoritative files.`);
  return {selected:match,candidates:found,reason:'explicit-feature'};
 }
 const recorded=optional(root,'.project-init/preparation.json');
 const recordedScope=recorded?.framework===state.framework&&recorded.branch===context.branch&&Array.isArray(recorded.feature?.specPaths)&&recorded.feature.specPaths.length?recorded.feature:null;
 const retainScope=candidate=>recordedScope?.directory===candidate.directory?{...candidate,specPaths:recordedScope.specPaths.map(p=>relativeFile(root,p).relative)}:candidate;
 const requested=process.env.SPECIFY_FEATURE||context.branch;
 const branchName=requested?.split('/').at(-1);
 const byBranch=found.filter(c=>c.id===branchName||c.id.replace(/^\d+-/,'')===branchName);
 if(process.env.SPECIFY_FEATURE){
  if(byBranch.length!==1)return {selected:null,candidates:found,reason:byBranch.length?'ambiguous-native-features':'native-feature-environment-not-found'};
  if(recordedScope&&recordedScope.directory!==byBranch[0].directory)return {selected:null,candidates:found,reason:'native-feature-environment-conflicts-with-recorded-scope'};
  return {selected:retainScope(byBranch[0]),candidates:found,reason:'native-feature-environment'};
 }
 if(recordedScope){
  const match=found.find(c=>c.directory===recordedScope.directory);
  if(match)return {selected:retainScope(match),candidates:found,reason:'recorded-feature'};
  if(!recordedScope.directory)return {selected:{...recordedScope,specPaths:recordedScope.specPaths.map(p=>relativeFile(root,p).relative)},candidates:found,reason:'recorded-feature'};
 }
 if(byBranch.length===1)return {selected:byBranch[0],candidates:found,reason:'current-branch'};
 if(byBranch.length>1)return {selected:null,candidates:found,reason:'ambiguous-native-features'};
 const baseline=optional(root,'.project-init/baseline.json');
 if(baseline?.specPaths?.length){
  const matches=found.filter(c=>c.specPaths.some(file=>baseline.specPaths.includes(file)));
  if(matches.length===1)return {selected:{...matches[0],specPaths:baseline.specPaths.map(p=>relativeFile(root,p).relative)},candidates:found,reason:'registered-baseline'};
  if(!matches.length&&baseline.specPaths.every(file=>fs.existsSync(projectFile(root,file))))return {selected:{id:'registered-native-scope',directory:null,specPaths:baseline.specPaths,taskPath:null},candidates:found,reason:'registered-baseline'};
 }
 return {selected:found.length===1?found[0]:null,candidates:found,reason:found.length===1?'only-native-feature':found.length?'ambiguous-native-features':'no-native-feature'};
}

function parseTasks(root,taskPath){
 if(!taskPath)return {path:null,total:0,complete:0,pending:[],items:[]};
 const text=fs.readFileSync(projectFile(root,taskPath),'utf8'),items=[];
 for(const line of text.split(/\r?\n/)){
  const match=line.match(/^\s*[-*]\s+\[([ xX])\]\s+(T\d+)\b(.*)$/);
  if(match)items.push({id:match[2],complete:match[1].toLowerCase()==='x',text:match[3].trim()});
 }
 return {path:taskPath,total:items.length,complete:items.filter(t=>t.complete).length,pending:items.filter(t=>!t.complete).map(t=>t.id),items};
}

function nativeRequirements(root,paths){
 const items=new Map(),duplicateIds=[];
 for(const specPath of paths){
  // Tasks are execution progress, not requirement definitions or an approval baseline.
  if(/(^|\/)tasks\.md$/.test(specPath))continue;
  const text=fs.readFileSync(projectFile(root,specPath),'utf8');
  for(const line of text.split(/\r?\n/)){
   const match=line.match(/^\s*(?:[-*|]\s*)?(?:\*\*)?([A-Z][A-Z0-9_]*-\d+[A-Z0-9_-]*)(?:\*\*)?\s*(?::|\||[-–—])/);
   if(!match)continue;
   const id=match[1];
   if(items.has(id)&&items.get(id).specPath!==specPath){duplicateIds.push(id);continue;}
   items.set(id,{id,specPath,line});
  }
 }
 return {items:[...items.values()],duplicateIds:unique(duplicateIds)};
}

function explicitReferences(text,label){
 const rx=new RegExp(`\\b${label}\\s*:\\s*([^\\n;)]+)`,'ig');
 const found=[];
 for(const match of text.matchAll(rx)){
  for(const value of match[1].replace(/[\[\]"'`*]/g,'').split(/[\s,]+/))if(value)found.push(value);
 }
 return unique(found);
}

function requireMap(data){
 if(data?.schemaVersion!==1||!Array.isArray(data.requirements))fail('Requirement mapping requires schemaVersion:1 and requirements:[].');
 const ids=new Set();
 for(const r of data.requirements){
  if(!r||!REQUIREMENT.test(r.id)||ids.has(r.id)||typeof r.specPath!=='string'||!Array.isArray(r.checks)||!Array.isArray(r.visualCases)||[...r.checks,...r.visualCases].some(x=>typeof x!=='string'||!x))fail('Each mapping needs a unique requirement ID, specPath, checks[] and visualCases[].');
  ids.add(r.id);
 }
 return data;
}

export function preparationPlan(root,{feature,specs=[],mapping}={}){
 const context=worktreeContext(root),stateInfo=stateContext(root,context),state=stateInfo.state;
 const choice=chooseFeature(root,state,{feature,specs},context),selected=choice.selected;
 const discovery=discoverProjectChecks(root);
 const config=stateInfo.initialized?validateChecks(root,readJson(statePath(root,'config.json'))):{schemaVersion:1,checks:[]};
 const mappings=requireMap(stateInfo.initialized?readJson(statePath(root,'requirements.json')):{schemaVersion:1,requirements:[]});
 const supplied=mapping?readJson(projectFile(root,mapping)):null;
 if(supplied){requireMap(supplied);if(supplied.checks)validateChecks(root,{schemaVersion:1,checks:supplied.checks});}
 const checks=config.checks.map(c=>({...c})),warnings=[...discovery.warnings],blockers=[];
 const key=c=>JSON.stringify([slash(c.cwd||'.').replace(/^\.\//,'').replace(/\/$/,'')||'.',c.argv]);
 const recorded=stateInfo.initialized?optional(root,'.project-init/preparation.json'):null;
 const previousAutomatic=Array.isArray(recorded?.automaticChecks)?recorded.automaticChecks:[];
 const automatic=new Map(),explicit=new Set();
 for(const check of checks){
  if(previousAutomatic.some(old=>old?.name===check.name&&key(old)===key(check)))automatic.set(check.name,key(check));
  else explicit.add(check.name);
 }
 for(const check of supplied?.checks||[]){
  const old=checks.find(c=>c.name===check.name);
  if(old&&key(old)!==key(check))fail(`Explicit check ${check.name} conflicts with its configured command. Existing configuration was preserved; review and change it explicitly before applying this mapping.`);
  if(!old){
   const duplicate=checks.find(c=>key(c)===key(check));
   if(duplicate)fail(`Explicit check ${check.name} duplicates configured check ${duplicate.name}. Reference ${duplicate.name} in the mapping instead of creating a command alias.`);
   checks.push(check);
  }
  explicit.add(check.name);automatic.delete(check.name);
 }
 for(const check of discovery.checks){
  const old=checks.find(c=>c.name===check.name);
  if(old){if(key(old)!==key(check))warnings.push(`Preserved custom check ${old.name}; discovered command differs. Review before changing it.`);continue;}
  if(!checks.some(c=>key(c)===key(check))){checks.push(check);automatic.set(check.name,key(check));}
 }
 const automaticChecks=checks.filter(check=>automatic.get(check.name)===key(check)).map(check=>({name:check.name,argv:[...check.argv],cwd:check.cwd||'.'}));
 const proposedConfig={...config,checks};validateChecks(root,proposedConfig);
 if(!state.framework)blockers.push({id:'framework',owner:'agent',message:'Select the repository’s existing native framework before preparing a feature.'});
 if(!selected)blockers.push({id:'feature',owner:'agent',message:choice.reason==='ambiguous-native-features'?'Select the active existing feature with --feature; multiple native features exist.':'No unambiguous native feature is available in this checkout. Reuse the existing specification with --spec, or follow the selected native planning workflow.'});
 if(!checks.length)blockers.push({id:'checks',owner:'agent',message:'No runnable project checks found. Inspect the project and supply real checks through --mapping or config.json.'});
 const tasks=parseTasks(root,selected?.taskPath);
 const native=selected?nativeRequirements(root,selected.specPaths):{items:[],duplicateIds:[]};
 for(const id of native.duplicateIds)blockers.push({id:'requirement-id',owner:'agent',message:`Requirement ${id} is defined in multiple selected native files; reconcile the authoritative definition.`});
 const items=new Map(mappings.requirements.map(r=>[r.id,{...r,checks:[...r.checks],visualCases:[...r.visualCases]}]));
 for(const entry of native.items){
  if(items.has(entry.id))continue;
  const token=new RegExp(`(?:^|[^A-Za-z0-9_-])${entry.id}(?=$|[^A-Za-z0-9_-])`);
  const relevant=[entry.line,...tasks.items.filter(t=>token.test(t.text)).map(t=>t.text)].join('\n');
  items.set(entry.id,{id:entry.id,specPath:entry.specPath,checks:explicitReferences(relevant,'checks?'),visualCases:explicitReferences(relevant,'visualCases?')});
 }
 for(const entry of supplied?.requirements||[]){
  const old=items.get(entry.id);
  if(old&&old.specPath!==entry.specPath)fail(`Mapping ${entry.id} already references ${old.specPath}; resolve the scope explicitly instead of replacing its identity.`);
  items.set(entry.id,{...old,...entry,checks:unique([...(old?.checks||[]),...entry.checks]),visualCases:unique([...(old?.visualCases||[]),...entry.visualCases])});
 }
 const proposedMappings={...mappings,requirements:[...items.values()]};
 // Unsupported aggregate routing can be replaced by deliberately selected,
 // mapped commands. Merely persisting an automatic partial proposal must not
 // turn it into an explicit resolution on the next invocation.
 const mappedExplicit=checks.filter(check=>explicit.has(check.name)&&proposedMappings.requirements.some(r=>selected?.specPaths.includes(r.specPath)&&r.checks.includes(check.name)));
 const invokesSame=(check,blocked)=>{
  if(key({...check,argv:[]})!==key({...blocked,argv:[]}))return false;
  if(blocked.argv.every((arg,i)=>check.argv[i]===arg))return true;
  const script=c=>['npm','pnpm','yarn'].includes(c.argv[0])?(['run','run-script'].includes(c.argv[1])?c.argv[2]:c.argv[1]):null;
  return check.argv[0]===blocked.argv[0]&&script(blocked)&&script(check)===script(blocked);
 };
 const discoveryResolutions=[];
 for(const diagnostic of discovery.blockedDiagnostics){
  const alternatives=diagnostic.resolution==='explicit-check-selection'?mappedExplicit.filter(check=>!diagnostic.checks.some(blocked=>invokesSame(check,blocked))):[];
  if(alternatives.length){
   const resolution={message:diagnostic.message,checks:alternatives.map(check=>check.name)};
   discoveryResolutions.push(resolution);
   warnings.push(`Discovery selection resolved by explicitly configured and mapped checks: ${resolution.checks.join(', ')}. ${diagnostic.message}`);
  }else blockers.push({id:'check-discovery',owner:'agent',message:diagnostic.message});
 }
 const visual=stateInfo.initialized?optional(root,'.project-init/visual-cases.json'):{cases:[]};
 for(const r of proposedMappings.requirements){
  if(!selected?.specPaths.includes(r.specPath))blockers.push({id:'mapping-scope',requirement:r.id,owner:'agent',message:`${r.id} references ${r.specPath}, outside the selected baseline. Existing mappings were preserved; reconcile the feature scope.`});
  if(!r.checks.length&&!r.visualCases.length)blockers.push({id:'requirement-evidence',requirement:r.id,owner:'agent',message:`Map ${r.id} to actual checks or visual cases after inspecting the implementation and tests. No coverage is assumed.`});
  for(const name of r.checks)if(!checks.some(c=>c.name===name))blockers.push({id:'unknown-check',requirement:r.id,owner:'agent',message:`${r.id} references an unconfigured check: ${name}`});
  for(const id of r.visualCases)if(!visual?.cases?.some(c=>c.id===id))blockers.push({id:'unknown-visual',requirement:r.id,owner:'agent',message:`${r.id} references an unknown visual case: ${id}`});
 }
 if(!proposedMappings.requirements.length)blockers.push({id:'requirements',owner:'agent',message:'No stable requirement IDs or explicit mappings found. Read the existing native acceptance criteria and supply an evidence mapping; do not invent a replacement spec.'});
 if(state.uiRequired){
  if(!stateInfo.initialized)blockers.push({id:'design',owner:'agent',message:'Prepare the applicable design and screenshot references in this worktree before baselining.'});
  else try{
   validUIDesign(root,true);
   const plan=visualPlan(root);
   if(!plan.complete)blockers.push({id:'visual-coverage',owner:'agent',message:'Complete the required screen/theme/viewport/state reference matrix before baselining.'});
   for(const c of plan.cases)if(!c.referenceExists)blockers.push({id:'visual-reference',owner:'agent',message:`Missing approved design reference for visual case ${c.id}`});
  }catch(error){blockers.push({id:'design',owner:'agent',message:error.message});}
 }
 const baseline=stateInfo.initialized?checkBaseline(root):{exists:false,current:false};
 const review=stateInfo.initialized?optional(root,'.project-init/review.json'):null;
 const approval=stateInfo.initialized?optional(root,'.project-init/approval.json'):null;
 const configChanged=!same(config,proposedConfig),mappingsChanged=!same(mappings,proposedMappings);
 const baselineSame=baseline.current&&same([...baseline.specPaths].sort(),[...(selected?.specPaths||[])].sort())&&!configChanged&&!mappingsChanged;
 const reviewCurrent=!!(baselineSame&&review?.baselineHash===baseline.actualHash&&review?.verdict==='pass');
 const approved=!!(reviewCurrent&&approval?.baselineHash===baseline.actualHash);
 const readyForBaseline=blockers.length===0;
 const next=[...blockers];
 if(readyForBaseline&&!baselineSame)next.push({id:'baseline',owner:'tool',message:'Apply preparation to register the native specification after check and mapping configuration is complete.'});
 if(readyForBaseline&&!reviewCurrent)next.push({id:'review',owner:'independent-reviewer',message:'Obtain and record an actual independent review of the prepared baseline.'});
 if(readyForBaseline&&!approved)next.push({id:'approval',owner:'human',message:'Record actual human approval for this exact baseline; preparation never approves on the user’s behalf.'});
 return {project:root,context,framework:state.framework,initialized:stateInfo.initialized,stateOrigin:stateInfo.origin,
  feature:selected,selection:choice.reason,candidates:choice.candidates,tasks,checks:proposedConfig.checks,automaticChecks,discoveryResolutions,
  requirements:proposedMappings.requirements,configurationChanges:{checks:configChanged,requirements:mappingsChanged},
  proposedConfig,proposedMappings,ci:discovery.ci,warnings,blockers,readyForBaseline,baseline:{...baseline,current:!!baselineSame},reviewCurrent,approved,
  status:!selected?'feature-required':!readyForBaseline?'preparation-required':!baselineSame?'baseline-required':!reviewCurrent?'review-required':!approved?'approval-required':'prepared',
  next,applied:false,executesCommands:false,createsNativeSpecs:false};
}

function writeChanged(file,value){
 const current=readJson(file,false);
 if(current&&same(current,value))return false;
 atomicJson(file,value);return true;
}

export function prepareProject(root,options={}){
 let plan=preparationPlan(root,options);
 if(!options.apply)return plan;
 // Never attach a feature or alter existing configuration on an ambiguous choice.
 if(!plan.feature||!plan.framework)return {...plan,applied:false};
 const changed=[];
 if(!plan.initialized){
  const d=discover(root),origin=plan.stateOrigin;
  initProject(root,{mode:d.mode,intent:'feature',ui:d.indicators.frontend?'yes':'no'});
  selectFramework(root,plan.framework);
  changed.push('.project-init/project.json');
  audit(root,'worktree-feature-state-initialized',{methodologySource:origin,approvalInherited:false});
  plan=preparationPlan(root,options);
 }
 if(writeChanged(statePath(root,'config.json'),plan.proposedConfig))changed.push('.project-init/config.json');
 if(writeChanged(statePath(root,'requirements.json'),plan.proposedMappings))changed.push('.project-init/requirements.json');
 const prepared={schemaVersion:1,framework:plan.framework,branch:plan.context.branch,feature:plan.feature,
  taskPath:plan.tasks.path,remainingTasks:plan.tasks.pending,checks:plan.checks.map(c=>c.name),automaticChecks:plan.automaticChecks,requirementIds:plan.requirements.map(r=>r.id)};
 if(writeChanged(statePath(root,'preparation.json'),prepared))changed.push('.project-init/preparation.json');
 // Recheck after all configuration writes: these inputs are part of the hash.
 plan=preparationPlan(root,options);
 if(plan.readyForBaseline&&!plan.baseline.current){
  establishBaseline(root,plan.feature.specPaths);
  changed.push('.project-init/baseline.json');
 }
 if(changed.length)audit(root,'feature-prepared',{feature:plan.feature.id,changed,approvalRecorded:false});
 return {...preparationPlan(root,options),applied:true,changed};
}

export function featureReadiness(root){
 // Actual configured state, not a discovery proposal. Safe for status/guard.
 const config=validateChecks(root,readJson(statePath(root,'config.json')));
 const mapping=requireMap(readJson(statePath(root,'requirements.json')));
 const baseline=checkBaseline(root),context=optional(root,'.project-init/preparation.json');
 const visual=optional(root,'.project-init/visual-cases.json');
 const missing=[];
 if(!config.checks.length)missing.push('no configured checks');
 if(!mapping.requirements.length)missing.push('no requirement mappings');
 if(baseline.specPaths?.length){
  try{
   const native=nativeRequirements(root,baseline.specPaths);
   for(const item of native.items)if(!mapping.requirements.some(r=>r.id===item.id&&r.specPath===item.specPath))missing.push(`${item.id}: native requirement is not mapped`);
   for(const id of native.duplicateIds)missing.push(`${id}: duplicate native requirement definition`);
  }catch(error){missing.push(`cannot read native requirements: ${error.message}`);}
 }
 for(const r of mapping.requirements){
  if(!baseline.specPaths?.includes(r.specPath))missing.push(`${r.id}: specification not in baseline`);
  if(!r.checks.length&&!r.visualCases.length)missing.push(`${r.id}: no evidence mapping`);
  for(const name of r.checks)if(!config.checks.some(c=>c.name===name))missing.push(`${r.id}: unknown check ${name}`);
  for(const id of r.visualCases)if(!visual?.cases?.some(c=>c.id===id))missing.push(`${r.id}: unknown visual case ${id}`);
 }
 return {configured:missing.length===0,feature:context?.feature||null,taskPath:context?.taskPath||null,
  checks:config.checks.map(c=>c.name),requirements:mapping.requirements.length,missing,
  next:missing.length?'project-init prepare --project . (preview), then --apply after inspecting the selected feature':null};
}
