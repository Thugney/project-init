// A skill is a menu entry/instruction file. It is not an executable workflow by itself.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {readState,projectFile,audit,fail,hashBytes} from './core.mjs';
const entries={
 '':{title:'Start or resume development project',text:'Start with `project-init status --project .` and `project-init prepare --project .`. Reuse the active native feature, its task IDs and its actual worktree. When local preparation is authorized, run `project-init prepare --project . --apply`; use --feature only to resolve the actual active scope, or --spec for existing authoritative documents. Inspect existing tests and resolve agent-owned check/mapping gaps through --mapping, preserving custom IDs. Do not make the user write configuration JSON. Preparation never invents a specification or approval. Ask only for unresolved scope decisions, required human approval, or installation/application actions not already authorized. Preserve AGENTS.md and CLAUDE.md. Report tooling, feature, approval, Factory board and acceptance state separately.'},
 design:{title:'Create or review high-fidelity UI mockups and architecture',text:'Use framework-owned requirements and technical specifications. Author actual screens with navigation, labels, controls, states and design tokens in `.project-init/ui-design.json`. Run `project-init render --project .`; present the visual-review HTML for human approval. Prepare screenshot coverage using `project-init visual plan --project .`. Do not overwrite approved references or claim a mockup is working application code.'},
 plan:{title:'Plan work with the selected native spec framework',text:'Run `project-init status --project .` then `project-init handoff --project . --phase planning`. Reuse existing authoritative native specifications and task progress. Follow the installed framework planning workflow only for missing or changed scope. After native planning, use `project-init prepare --project .` and authorized --apply to discover real check commands, preserve requirement IDs, resolve evidence mappings and register the completed baseline. Obtain actual independent review and human approval only when that baseline requires them. One framework owns PRD/specs/tasks; do not generate a competing Project Init PRD or task board.'},
 build:{title:'Implement the next approved task using real code',text:'Run `project-init prepare --project .` and authorized --apply, resolving agent-owned missing check/mapping inputs from the actual native task and tests. Keep explicit feature/spec selections when supplied; do not rewrite a valid approved baseline. Check `project-init status --project .`, the approved design and the current framework-native work item. Make only approved changes to source and tests; update the same native task IDs. For automated Codex runs use `project-init run --phase implementation` with explicit --task, --allow paths and authorized --execute. For an actual Factory job follow its documented integrated-evidence workflow with its real slug. Interactive Claude edits are not a claimed Codex process: retain real Git/test evidence and use the independently reviewed existing-code path during verification when no supported runner receipt exists. A new session must receive the feature path, task IDs, worktree, branch, checks and actual Factory slug if any; it must resume these records rather than create a replacement feature.'},
 verify:{title:'Run tests, visual screenshot comparison, and AI drift gates',text:'Run `project-init prepare --project .` and authorized --apply to reuse the existing scope and configure actual checks/mappings before baselining; never create a competing plan. If an actual Factory job exists, use `project-init execution factory --project . --job ACTUAL_SLUG --allow APPROVED_PATH --execute` with all actual approved scopes and continue verification at its returned integrationProject. Otherwise run `project-init verify --project . --execute` for the configured checks. Obtain actual independent source review, record it with source-review, run semantic plan and import per-requirement evidence. For graphical projects compare actual implementation screenshots against approved references using visual compare. For already implemented code without a supported runner receipt, use `project-init execution existing --project . --task ACTUAL_TASK --actor ACTUAL_REVIEWER --evidence ACTUAL_REFERENCE --execute` after the independent review and checks; it must not invent a code execution or a dummy edit. Finish with `project-init guard --project .`. Return unresolved findings to the existing native tasks. Missing/stale evidence or changed design blocks acceptance. Do not self-approve release.'},
 status:{title:'Show actual project progress and acceptance blockers',text:'Run `project-init status --project .`. Report the selected framework and feature/task path, configured checks and coverage gaps, baseline/review/approval, actual execution evidence mode, current test/visual/semantic evidence, Factory board path and job count, and remaining actions. Distinguish installed tooling from prepared work and from accepted implementation. CI configuration presence is not proof that CI ran or is enforced. Status and preview are read-only. Never claim ongoing background work without an actual active runner.'},
 report:{title:'Render concise reports with built-in Lean Kit',text:'Lean Kit is bundled and requires no separate installation. Write concise Markdown or JSON data. Run `project-init lean --project . --input docs/report.md --out .project-init/lean/report.html --execute`. Do not generate repetitive HTML directly. Lean Kit is for report/board/diagram outputs, not application UIs.'}
};
const preamble='Project Init owns discovery, orchestration, approvals and evidence. Selected spec framework owns PRD, architecture decisions and task definitions. Codex/Claude perform code edits. Preserve exact approved scope. Do not create extra credentials, change remote infrastructure, auto-commit, push, merge or deploy. Before declaring success inspect actual test and evidence receipts. Project Init v1 legacy review files are read-only compatibility artifacts.\n\n';
function md(name,key,kind){const e=entries[key],command=name;
 const header=`---\nname: ${command}\ndescription: ${e.title}. Use in repositories initialized by Project Init.\n---\n\n`;
 return `${header}# ${command}\n\n${preamble}${e.text}\n\nUser request arguments remain subject to current approved scope; never reinterpret the skill invocation as approval to modify source.\n`;
}
export function skillPlan(root,{agent='both',apply=false,plugin=false,scope='project',backupConflicts=false,userHome=os.homedir(),previewState}={}){
 if(!['project','user'].includes(scope)) fail('--scope must be project or user.');
 if(!['both','codex','claude'].includes(agent)) fail('--agent must be codex, claude or both');
 if(scope==='project'&&(apply||!previewState)) readState(root);
 const destinationRoot=scope==='user'?path.resolve(userHome):root;
 const files=[];
 for(const target of (agent==='both'?['codex','claude']:[agent])){
  // Codex personal skills live in ~/.agents/skills, not ~/.codex/skills.
  const base=target==='codex'?'.agents/skills':'.claude/skills';
  for(const key of Object.keys(entries)){
   const name=key?`project-init-${key}`:'project-init';
   files.push({path:`${base}/${name}/SKILL.md`,content:md(name,key,target),canBackup:true});
  }
 }
 if(plugin&&agent!=='codex'){
  files.push({path:'.project-init/claude-plugin/.claude-plugin/plugin.json',content:JSON.stringify({name:'project-init',version:'2.1.0-preview.15',description:'Project Init local workflow skills'},null,2)+'\n',canBackup:false});
  for(const key of Object.keys(entries)){
   const name=key||'start';
   files.push({path:`.project-init/claude-plugin/skills/${name}/SKILL.md`,content:md(name,key,'claude-plugin'),canBackup:false});
  }
 }
 const plans=files.map(f=>{
  const p=projectFile(destinationRoot,f.path);
  const exists=fs.existsSync(p);
  const same=exists&&fs.readFileSync(p,'utf8')===f.content;
  const occupied=exists||fs.existsSync(path.dirname(p));
  const conflict=occupied&&!same;
  return {path:f.path,action:same?'unchanged':conflict?(backupConflicts&&f.canBackup?'backup-and-create':'conflict'):'create',hash:hashBytes(f.content)};
 });
 const legacySkillPaths=[];
 if(scope==='user'&&agent!=='claude'){
  for(const key of Object.keys(entries)){
   const name=key?`project-init-${key}`:'project-init';
   const old=path.join(destinationRoot,'.codex','skills',name,'SKILL.md');
   if(fs.existsSync(old)) legacySkillPaths.push(old);
  }
 }
 const backupRoot=path.join(destinationRoot,'.project-init','backups','skills');
 if(!apply) return {
  applied:false,agent,scope,skills:plans,backupConflicts,backupDirectory:backupRoot,legacySkillPaths,
  notice:'Preview only. --apply installs. Existing skills are preserved unless --backup-conflicts is explicitly supplied.'
 };
 const blockers=plans.filter(x=>x.action==='conflict');
 if(blockers.length) fail(`Existing skill content differs; refused without overwrite: ${blockers.map(c=>c.path).join(', ')}. Preview --backup-conflicts and apply only after reviewing the backup plan.`);
 const made=[],backups=[];
 try{
  const backupSet=path.join(backupRoot,`${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`);
  for(let i=0;i<files.length;i++){
   if(plans[i].action!=='backup-and-create') continue;
   const from=path.dirname(projectFile(destinationRoot,files[i].path));
   const to=path.join(backupSet,path.dirname(files[i].path));
   fs.mkdirSync(path.dirname(to),{recursive:true});
   fs.renameSync(from,to);
   backups.push({from,to});
  }
  for(let i=0;i<files.length;i++){
   if(!['create','backup-and-create'].includes(plans[i].action)) continue;
   const p=projectFile(destinationRoot,files[i].path);
   fs.mkdirSync(path.dirname(p),{recursive:true});
   fs.writeFileSync(p,files[i].content,{encoding:'utf8',flag:'wx',mode:0o600});
   made.push(p);
  }
 }catch(error){
  for(const p of made.reverse()){
   fs.rmSync(p,{force:true});
   try{fs.rmdirSync(path.dirname(p));}catch{}
  }
  for(const b of backups.reverse()){
   fs.mkdirSync(path.dirname(b.from),{recursive:true});
   fs.renameSync(b.to,b.from);
  }
  throw error;
 }
 audit(destinationRoot,'agent-skills-installed',{
  agent,scope,created:made.length,backupConflicts,backups:backups.map(b=>({from:b.from,to:b.to}))
 });
 return {
  applied:true,agent,scope,created:made.length,alreadyPresent:plans.filter(p=>p.action==='unchanged').length,
  backedUp:backups.length,backupPaths:backups.map(b=>b.to),legacySkillPaths,namespacedClaude:plugin,
  commands:{
   codex:agent!=='claude'?Object.keys(entries).map(k=>`$project-init${k?'-'+k:''}`):[],
   claude:agent!=='codex'?Object.keys(entries).map(k=>`/project-init${k?'-'+k:''}`):[],
   claudePlugin:plugin?Object.keys(entries).map(k=>`/project-init:${k||'start'}`):[]
  },
  restart:'Restart Codex/Claude or reload skills to discover the new descriptions.',
  pluginLaunch:plugin?`claude --plugin-dir "${path.join(destinationRoot,'.project-init','claude-plugin')}"`:null
 };
}
