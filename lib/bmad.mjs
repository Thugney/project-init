import fs from 'node:fs';
import path from 'node:path';

export const BMAD_DEFAULT_VERSION='6.12.0';

const fail=message=>{throw new Error(message);};
const slash=value=>value.replaceAll('\\','/');

function readText(file,label){
 try{return fs.readFileSync(file,'utf8');}
 catch(error){if(error.code==='ENOENT')fail(`${label} is missing: ${file}`);throw error;}
}

function uniqueScalar(text,key,label){
 const matches=[];
 const pattern=new RegExp(`^[ \\t]*${key}[ \\t]*:[ \\t]*(.*?)[ \\t]*(?:#.*)?$`,'gm');
 for(const match of text.matchAll(pattern))matches.push(match[1].trim());
 if(matches.length>1)fail(`${label} has duplicate ${key} values.`);
 if(matches.length===0)fail(`${label} is missing ${key}.`);
 const value=matches[0].replace(/^(?:"([^"]*)"|'([^']*)')$/,'$1$2').trim();
 if(!value)fail(`${label} has an empty ${key} value.`);
 return value;
}

function installationVersion(manifest){
 const section=manifest.match(/^installation:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/m)?.[1];
 if(!section)fail('BMAD installation manifest is missing its installation section.');
 const version=uniqueScalar(section,'version','BMAD installation manifest');
 if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))fail(`BMAD installation version is invalid: ${version}`);
 if(Number(version.split('.')[0])!==6)fail(`BMAD v${version.split('.')[0]} is not supported; install a v6 release.`);
 const modules=manifest.match(/^modules:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/m)?.[1]||'';
 if(!/^\s*-\s+name:\s*bmm\s*$/m.test(modules))fail('BMAD installation manifest does not list the BMM module.');
 return version;
}

function configuredDirectory(root,config,key){
 const configured=uniqueScalar(config,key,'BMAD BMM configuration');
 const match=configured.match(/^\{project-root\}\/([^\0]+)$/);
 if(!match)fail(`BMAD ${key} must be a project-root-relative path.`);
 const relative=slash(match[1]);
 if(relative.startsWith('/')||/^[a-z]:/i.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))
  fail(`BMAD ${key} must be a project-root-relative path.`);
 const absolute=path.resolve(root,...relative.split('/'));
 const rel=path.relative(root,absolute);
 if(!rel||rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))fail(`BMAD ${key} must resolve inside the project root.`);
 let current=root;
 for(const part of relative.split('/')){
  current=path.join(current,part);
  try{if(fs.lstatSync(current).isSymbolicLink())fail(`BMAD ${key} cannot pass through a symbolic link: ${slash(path.relative(root,current))}`);}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return slash(rel);
}

export function bmadLayout(root){
 const project=path.resolve(root);
 const manifestPath=path.join(project,'_bmad','_config','manifest.yaml');
 const configPath=path.join(project,'_bmad','bmm','config.yaml');
 const manifest=readText(manifestPath,'BMAD installation manifest');
 const version=installationVersion(manifest);
 const config=readText(configPath,'BMAD BMM configuration');
 const planningDir=configuredDirectory(project,config,'planning_artifacts');
 const implementationDir=configuredDirectory(project,config,'implementation_artifacts');
 const sprintStatusFile=`${implementationDir}/sprint-status.yaml`;
 return {adapter:'v6',version,planningDir,implementationDir,sprintStatusFile};
}

function parseDevelopmentStatus(text,file){
 const section=text.match(/^development_status:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/m)?.[1];
 if(!section)fail(`BMAD sprint status is missing development_status: ${file}`);
 const statuses=new Map();
 for(const line of section.split(/\r?\n/)){
  if(!line.trim()||/^\s*#/.test(line))continue;
  const match=line.match(/^\s{2}([^\s:#][^:]*):\s*([^\s#]+)\s*(?:#.*)?$/);
  if(!match)fail(`BMAD sprint status contains an unsupported entry: ${line.trim()}`);
  const id=match[1].trim(),status=match[2].trim();
  if(statuses.has(id))fail(`BMAD sprint status has duplicate story key: ${id}`);
  statuses.set(id,status);
 }
 return statuses;
}

function slug(title){
 return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/g,'');
}

function storyRecords(epicsText,epicsPath){
 const found=[];
 const pattern=/^#{2,4}\s*Story\s+(\d+)\.(\d+[a-z]?)\s*:\s*(.*?)\s*#*\s*$/gim;
 for(const match of epicsText.matchAll(pattern)){
  const epic=match[1],number=match[2],title=match[3].trim();
  if(!title)continue;
  const id=`${epic}-${number}-${slug(title)}`;
  if(found.some(story=>story.id===id))fail(`BMAD epic document has duplicate story key: ${id}`);
  found.push({id,epic:Number(epic),number,title,epicPath:epicsPath});
 }
 return found;
}

export function bmadTasks(storyText){
 const lines=storyText.split(/\r?\n/);
 let inTasks=false;
 const tasks=[];
 for(const line of lines){
  const heading=line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
  if(heading){
   const title=heading[2].trim().toLowerCase();
   if(title==='tasks / subtasks'||title==='tasks and subtasks'||title==='tasks'){inTasks=true;continue;}
   if(inTasks)break;
  }
  if(!inTasks)continue;
  const task=line.match(/^\s*[-*]\s+\[[ xX]\]\s*(Task\s+\d+(?:\.\d+)*|Subtask\s+\d+(?:\.\d+)*)\b/i);
  if(task){
   const id=task[1].replace(/\s+/g,' ');
   if(tasks.some(item=>item.id===id))fail(`BMAD story has duplicate task identifier: ${id}`);
   tasks.push({id,complete:task[0].match(/\[[xX]\]/)!==null,text:line.trim()});
  }
 }
 return tasks;
}

export function bmadTaskIds(storyText){return bmadTasks(storyText).map(task=>task.id);}

const allowedStatuses=new Set(['backlog','drafted','contexted','ready-for-dev','in-progress','review','done','optional','deployed']);
const normalizeStatus=status=>status==='drafted'?'ready-for-dev':status==='contexted'?'in-progress':status;

export function bmadStories(root,layout=bmadLayout(root)){
 const project=path.resolve(root);
 const planning=path.join(project,...layout.planningDir.split('/'));
 const implementation=path.join(project,...layout.implementationDir.split('/'));
 const epicsPath=`${layout.planningDir}/epics.md`;
 const epicsFile=path.join(project,...epicsPath.split('/'));
 if(!fs.existsSync(epicsFile)||!fs.statSync(epicsFile).isFile())return [];
 const docs=['prd.md','architecture.md','epics.md'].map(name=>`${layout.planningDir}/${name}`)
  .filter(file=>fs.existsSync(path.join(project,...file.split('/'))));
 const records=storyRecords(readText(epicsFile,'BMAD epics document'),epicsPath);
 const statusFile=path.join(project,...layout.sprintStatusFile.split('/'));
 const statuses=fs.existsSync(statusFile)?parseDevelopmentStatus(readText(statusFile,'BMAD sprint status file'),layout.sprintStatusFile):new Map();
 return records.map(record=>{
  const taskPath=`${layout.implementationDir}/${record.id}.md`;
  const taskFile=path.join(project,...taskPath.split('/'));
  const exists=fs.existsSync(taskFile)&&fs.statSync(taskFile).isFile();
  let status=statuses.get(record.id);
  if(!status)status=exists?'ready-for-dev':'backlog';
  if(!allowedStatuses.has(status))fail(`Unsupported BMAD story status "${status}" for ${record.id}.`);
  status=normalizeStatus(status);
  if(!exists&&['ready-for-dev','in-progress','review'].includes(status))
   fail(`BMAD story ${record.id} is ${status} but its story file is missing: ${taskPath}`);
  const text=exists?readText(taskFile,'BMAD story file'):'';
  const declared=text.match(/^#\s*Story\s+(\d+)\.(\d+[a-z]?)\s*:\s*(.*?)\s*#*\s*$/im);
  if(exists&&declared&&(`${declared[1]}-${declared[2]}-${slug(declared[3])}`!==record.id))
   fail(`BMAD story file does not match epic story ${record.id}: ${taskPath}`);
  const taskIds=exists?bmadTaskIds(text):[];
  return {id:record.id,epic:record.epic,title:record.title,status,specPaths:[...docs],taskPath:exists?taskPath:null,taskIds};
 });
}
