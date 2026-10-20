import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, readJson, statePath, validUIDesign, status, projectFile, isWithin, fail, audit, hashFile } from './core.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
function reviewContext(root) {
  const context=readJson(statePath(root,'review-context.json'),false);
  if(!context)return null;
  if(context.schemaVersion!==1||!Array.isArray(context.specPaths)||!context.specPaths.length||context.specPaths.some(p=>typeof p!=='string'||!p.trim())) fail('Review context requires schemaVersion 1 and nonempty specPaths referencing authoritative specifications.');
  const sourceSpecs=context.specPaths.map(p=>{const file=projectFile(root,p);if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Review context source missing: ${p}`);return {path:p,sha256:hashFile(file)};});
  for(const key of ['journeys','components','edges','permissions','questions'])if(context[key]!==undefined&&!Array.isArray(context[key]))fail(`Review context ${key} must be an array.`);
    const ids=new Set();
    for(const component of context.components||[]){if(!component||typeof component.id!=='string'||!component.id.trim()||ids.has(component.id)||typeof component.label!=='string'||!component.label.trim())fail('Review components require unique nonempty IDs and labels.');ids.add(component.id);}
    for(const edge of context.edges||[])if(!edge||!ids.has(edge.from)||!ids.has(edge.to)||typeof edge.label!=='string'||!edge.label.trim())fail('Review flow edges require known component IDs and a nonempty handoff label.');
  return {sourceSpecs,journeys:context.journeys||[],components:context.components||[],edges:context.edges||[],permissions:context.permissions||[],questions:context.questions||[]};
}
function referenceMockup(root,design){
  if(!design.referenceMockup)return null;
  if(typeof design.referenceMockup!=='string')fail('referenceMockup must name a project-local HTML file.');
  const file=projectFile(root,design.referenceMockup);
  if(!isWithin(file,path.join(root,'.project-init'))||path.extname(file).toLowerCase()!=='.html'||!fs.existsSync(file))fail('referenceMockup must be an existing HTML file inside .project-init.');
  return {path:design.referenceMockup,html:fs.readFileSync(file,'utf8')};
}
export function renderVisualReview(root, output) {
  const state=readState(root);
  const design=validUIDesign(root);
  const old=readJson(projectFile(root,'planning/architecture/design.json'),false);
  const s=status(root);
  const data={project:path.basename(root),uiRequired:state.uiRequired,framework:state.framework||'Not selected',
    mode:state.mode,design,referenceMockup:referenceMockup(root,design),reviewArchitecture:reviewContext(root),legacyArchitecture:old?{baseline:old.baseline,components:old.components||[],edges:old.edges||[],
      journeys:old.journeys||[],permissions:old.permissions||[],questions:old.questions||[],requirements:old.requirements||[]}:null,
    sourceRevision:state.initialSource.revision,approval:s.approved,baseline:s.baseline.current,
    note:'Local design proposal. Visual components are mockups, not live application functionality.'};
  const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const template=fs.readFileSync(path.resolve(dirname,'../assets/review-shell.html'),'utf8');
  const html=template.replace('__REVIEW_DATA__',json);
  const outfile=output?projectFile(root,output):statePath(root,'review.html');
  if(!isWithin(outfile,path.join(root,'.project-init'))||path.extname(outfile).toLowerCase()!=='.html') fail('Visual output must be an HTML file inside .project-init; existing application files are protected.');
  if(data.referenceMockup&&path.relative(outfile,projectFile(root,data.referenceMockup.path))==='')fail('Visual output must not overwrite the authored reference mockup.');
  fs.mkdirSync(path.dirname(outfile),{recursive:true});
  fs.writeFileSync(outfile,html,'utf8');
  audit(root,'visual-rendered',{path:path.relative(root,outfile).replaceAll('\\','/'),screenCount:design.screens.length});
  return {output:outfile,screenCount:design.screens.length,approved:s.approved,
    notice:'Offline HTML mockup. No application functionality or screenshot acceptance was tested.'};
}
