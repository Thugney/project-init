import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {comparePng,readPng} from './png.mjs';
import {readJson,readState,projectFile,statePath,hashFile,checkBaseline,status,sourceSnapshot,utcNow,atomicJson,audit,fail} from './core.mjs';
const CASE_ID=/^[a-z0-9][a-z0-9_-]{0,70}$/;
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const safeRel=p=>p.replaceAll('\\','/');
function load(root){
 const data=readJson(statePath(root,'visual-cases.json'),false)||{schemaVersion:1,cases:[]};
 if(data.schemaVersion!==1||!Array.isArray(data.cases))fail('visual-cases.json must have schemaVersion 1 and cases[]');
 const seen=new Set();
 for(const c of data.cases){
  if(!c||!CASE_ID.test(c.id)||seen.has(c.id)||!CASE_ID.test(c.screen)||!['desktop','mobile'].includes(c.viewport)||!['light','dark'].includes(c.theme)||typeof c.state!=='string'||!c.state.trim()||c.state.length>100)fail('Invalid visual case id, screen, viewport, theme, or state');
  seen.add(c.id);if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<240||c.width>4096||c.height<320||c.height>4096||c.width*c.height>8_000_000)fail(`Invalid viewport for ${c.id}`);
  if(typeof c.maxDiffRatio!=='number'||c.maxDiffRatio<0||c.maxDiffRatio>0.4||!Number.isInteger(c.pixelThreshold)||c.pixelThreshold<0||c.pixelThreshold>80)fail(`Invalid pixel thresholds for ${c.id}`);
  for(const side of ['reference','actual']){const expected=`.project-init/visual/${side==='reference'?'baselines':'actual'}/${c.id}.png`;if(c[side]!==expected)fail(`Visual case ${c.id} ${side} must be exactly ${expected}`);projectFile(root,c[side]);}
 }
 return data;
}
export function approvedVisualFiles(root){return load(root).cases.map(c=>c.reference);}
export function visualCases(root){return load(root);}
export function visualPlan(root){
 const state=readState(root),design=readJson(statePath(root,'ui-design.json'));const cases=load(root).cases;
 const missing=[];
 if(state.uiRequired){
  for(const s of design.screens){
   for(const viewport of ['desktop','mobile'])for(const theme of ['light','dark'])if(!cases.some(c=>c.screen===s.id&&c.viewport===viewport&&c.theme===theme&&c.state.toLowerCase()==='default'))missing.push({screen:s.id,viewport,theme,state:'Default'});
   for(const defined of s.states||[])if(!cases.some(c=>c.screen===s.id&&c.state.toLowerCase()===defined.toLowerCase()))missing.push({screen:s.id,state:defined,reason:'approved screen state has no comparison'});
  }
  for(const c of cases)if(!design.screens.some(s=>s.id===c.screen))missing.push({case:c.id,reason:'case references missing approved screen'});
 }
 return {uiRequired:state.uiRequired,cases:cases.map(c=>({id:c.id,screen:c.screen,viewport:c.viewport,theme:c.theme,state:c.state,referenceExists:fs.existsSync(projectFile(root,c.reference)),actualExists:fs.existsSync(projectFile(root,c.actual))})),missing,complete:!state.uiRequired||!!cases.length&&missing.length===0};
}
function browserCandidates(){
 if(process.platform==='win32'){const pf=process.env.PROGRAMFILES||'C:\\Program Files',pf86=process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)';return [path.join(pf86,'Microsoft','Edge','Application','msedge.exe'),path.join(pf,'Microsoft','Edge','Application','msedge.exe'),path.join(pf,'Google','Chrome','Application','chrome.exe'),path.join(pf86,'Google','Chrome','Application','chrome.exe')];}
 if(process.platform==='darwin')return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
 return ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
}
function localUrl(raw,root){let parsed;try{parsed=new URL(raw);}catch{fail('Capture requires a valid explicit URL.');}
 if(parsed.username||parsed.password)fail('Credentials in capture URLs are forbidden.');
 if(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))return parsed.toString();
 if(parsed.protocol==='file:'){const {fileURLToPath}=requireFileURL();const filepath=fileURLToPath(parsed);const checked=projectFile(root,path.relative(root,filepath));if(!fs.existsSync(checked)||path.extname(checked).toLowerCase()!=='.html')fail('File screenshot source must be an existing project HTML file.');return parsed.toString();}
 fail('Only local HTTP and project-local HTML files may be captured. HTTPS and remote websites are intentionally blocked.');
}
function requireFileURL(){return {fileURLToPath:(url)=>{if(url.host)fail('Remote file host refused');let str=decodeURIComponent(url.pathname);if(process.platform==='win32'&&/^\/[A-Za-z]:/.test(str))str=str.slice(1);return str;}};}
export function captureVisual(root,{id,side='actual',url,browser,execute=false}={}){
 const c=load(root).cases.find(x=>x.id===id);if(!c)fail('Unknown visual case id; add a case to .project-init/visual-cases.json.');
 if(!['actual','reference'].includes(side))fail('Capture side must be actual or reference.');
 if(!url)fail('Pass --url with an explicit local address.');const target=projectFile(root,c[side]),safeUrl=localUrl(url,root);
 if(side==='reference'&&fs.existsSync(target))fail('Reference already exists; do not overwrite an approved mockup. Create a new reviewed baseline instead.');
 const bin=browser?path.resolve(browser):browserCandidates().find(p=>fs.existsSync(p));
 if(!bin||!fs.existsSync(bin))return {executed:false,blocked:'Chrome/Edge/Chromium executable not found. Supply --browser PATH or provide screenshots from existing Playwright tests.',target};
 const args=['--headless=new','--no-first-run','--disable-gpu','--disable-extensions','--disable-background-networking','--hide-scrollbars','--force-device-scale-factor=1',`--window-size=${c.width},${c.height}`];
 if(process.platform==='linux'&&process.getuid?.()===0)args.push('--no-sandbox');
 const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'pinit-browser-'));
 const tempFile=path.join(tempDir,'capture.png');args.push(`--user-data-dir=${path.join(tempDir,'profile')}`,`--screenshot=${tempFile}`,safeUrl);
 if(!execute){fs.rmSync(tempDir,{recursive:true,force:true});return {executed:false,browser:bin,target,width:c.width,height:c.height,url:safeUrl,notice:'Preview only. --execute runs the local browser and captures the page.'};}
 try{
  const out=spawnSync(bin,args,{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:128*1024,windowsHide:true});
  if(out.error||out.status!==0||!fs.existsSync(tempFile))fail(`Browser screenshot failed (exit ${out.status??'unknown'}): ${out.error?.message||String(out.stderr||'').slice(-500)||'no screenshot produced'}`);
  const png=readPng(tempFile);if(png.width!==c.width||png.height!==c.height)fail(`Screenshot dimension mismatch: expected ${c.width}x${c.height}, got ${png.width}x${png.height}. Capture through Playwright if browser window decoration changes pixels.`);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(tempFile,target,side==='reference'?fs.constants.COPYFILE_EXCL:0);
  audit(root,'visual-capture',{id,side,width:c.width,height:c.height,sha256:hashFile(target),sourceUrl:safeUrl});return {executed:true,id,side,path:target,sha256:hashFile(target),width:png.width,height:png.height};
 }finally{fs.rmSync(tempDir,{recursive:true,force:true});}
}
export function compareVisual(root){
 const state=readState(root),plan=visualPlan(root),baseline=checkBaseline(root),s=status(root);
 const cases=load(root).cases,results=[];const dest=statePath(root,'visual/diffs');fs.mkdirSync(dest,{recursive:true});
 for(const c of cases){const ref=projectFile(root,c.reference),act=projectFile(root,c.actual),diff=projectFile(root,`.project-init/visual/diffs/${c.id}.png`);
  if(!fs.existsSync(ref)||!fs.existsSync(act)){results.push({id:c.id,passed:false,reason:!fs.existsSync(ref)?'Approved reference screenshot missing':'Implementation screenshot missing'});continue;}
  try{const compare=comparePng(ref,act,{pixelThreshold:c.pixelThreshold,maxDiffRatio:c.maxDiffRatio,diffOutput:diff});results.push({id:c.id,...compare,referenceHash:hashFile(ref),actualHash:hashFile(act),diff:`visual/diffs/${c.id}.png`});}
  catch(error){results.push({id:c.id,passed:false,reason:error.message});}
 }
 const receipt={schemaVersion:1,at:utcNow(),baselineHash:baseline.actualHash||null,sourceHash:sourceSnapshot(root).hash,manifestHash:hashFile(statePath(root,'visual-cases.json')),
  coverageComplete:plan.complete,missingCoverage:plan.missing,approved:s.approved,passed:!!(state.uiRequired&&s.approved&&baseline.current&&plan.complete&&results.length&&results.every(r=>r.passed)),results,
  limitation:'Pixel comparison tests screenshot regression only. Browser actions, accessibility and complete semantic behavior require additional tests and review.'};
 if(!state.uiRequired)receipt.passed=true;
 fs.mkdirSync(statePath(root,'evidence'),{recursive:true});atomicJson(statePath(root,'evidence/latest-visual.json'),receipt);
 const rows=results.map(r=>{const id=escape(r.id),ok=r.passed?'PASS':'FAIL';return `<article><h2>${id} — ${ok}</h2><p>${escape(r.reason||`Difference ${(r.diffRatio*100).toFixed(2)}% (maximum ${(r.maxDiffRatio*100).toFixed(2)}%)`)}</p><div class="screens"><figure><img src="../visual/baselines/${encodeURIComponent(r.id)}.png" alt="Approved mockup"><figcaption>Approved reference</figcaption></figure><figure><img src="../visual/actual/${encodeURIComponent(r.id)}.png" alt="Implemented screenshot"><figcaption>Implementation</figcaption></figure>${r.diff?`<figure><img src="../${escape(r.diff)}" alt="Highlighted changed pixels"><figcaption>Pixel differences</figcaption></figure>`:''}</div></article>`;}).join('');
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Visual fidelity review</title><style>body{background:#edf2f8;color:#1a2d45;font:14px system-ui;margin:0;padding:28px}main{max-width:1300px;margin:auto}h1{margin:0 0 8px}article{background:#fff;border:1px solid #d9e3ef;padding:20px;margin:20px 0;border-radius:14px}.screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:15px}figure{min-width:0;margin:0}img{width:100%;border:1px solid #d1dfeb;border-radius:8px}figcaption{color:#52667e;margin-top:8px;font-weight:600}.status{padding:12px;background:#fff;border-radius:10px}</style><main><h1>Visual fidelity verification</h1><p class="status">${receipt.passed?'PASS':'FAIL / INCOMPLETE'} · Approved baseline: ${receipt.approved?'yes':'no'} · Coverage: ${receipt.coverageComplete?'complete':'incomplete'}</p><p>References must be explicitly approved. Comparisons do not prove application logic, navigation or accessibility.</p>${rows||'<article>No visual cases. Add real screenshot cases; no results were assumed.</article>'}</main></html>`;
 const htmlPath=statePath(root,'evidence/visual-review.html');fs.writeFileSync(htmlPath,html,'utf8');audit(root,'visual-verification',{passed:receipt.passed,caseCount:results.length,coverageComplete:plan.complete});return {...receipt,reviewPage:htmlPath};
}
