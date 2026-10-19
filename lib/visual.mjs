import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState, readJson, statePath, validUIDesign, status, projectFile, isWithin, fail, audit } from './core.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
export function renderVisualReview(root, output) {
  const state=readState(root);
  const design=validUIDesign(root);
  const old=readJson(projectFile(root,'planning/architecture/design.json'),false);
  const s=status(root);
  const data={project:path.basename(root),uiRequired:state.uiRequired,framework:state.framework||'Not selected',
    mode:state.mode,design,legacyArchitecture:old?{baseline:old.baseline,components:old.components||[],edges:old.edges||[],
      journeys:old.journeys||[],permissions:old.permissions||[],questions:old.questions||[],requirements:old.requirements||[]}:null,
    sourceRevision:state.initialSource.revision,approval:s.approved,baseline:s.baseline.current,
    note:'Local design proposal. Visual components are mockups, not live application functionality.'};
  const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const template=fs.readFileSync(path.resolve(dirname,'../assets/review-shell.html'),'utf8');
  const html=template.replace('__REVIEW_DATA__',json);
  const outfile=output?projectFile(root,output):statePath(root,'review.html');
  if(!isWithin(outfile,path.join(root,'.project-init'))||path.extname(outfile).toLowerCase()!=='.html') fail('Visual output must be an HTML file inside .project-init; existing application files are protected.');
  fs.mkdirSync(path.dirname(outfile),{recursive:true});
  fs.writeFileSync(outfile,html,'utf8');
  audit(root,'visual-rendered',{path:path.relative(root,outfile).replaceAll('\\','/'),screenCount:design.screens.length});
  return {output:outfile,screenCount:design.screens.length,approved:s.approved,
    notice:'Offline HTML mockup. No application functionality or screenshot acceptance was tested.'};
}
