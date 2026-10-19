import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {readState,projectFile,statePath,audit,hashFile,fail} from './core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const renderer=path.resolve(here,'../vendor/lean-kit/scripts/render.mjs');
export function renderLean(root,{input,out,execute=false}={}){
 readState(root);
 if(typeof input!=='string'||!input||!out)fail('Supply a project-relative --input .md|.json and --out .project-init/lean/*.html.');
 const source=projectFile(root,input),output=projectFile(root,out),relative=path.relative(statePath(root,'lean'),output);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!out.toLowerCase().endsWith('.html'))fail('Lean Kit outputs must be inside .project-init/lean/ and end in .html.');
 if(!['.md','.json'].includes(path.extname(source).toLowerCase())||!fs.existsSync(source)||!fs.statSync(source).isFile())fail('Lean Kit source must be an existing project Markdown or JSON file.');
 if(source===output)fail('Renderer cannot overwrite source.');
 if(!execute)return {executed:false,source,output,bundled:true,notice:'Pass --execute to use bundled Lean Kit; no separate install or API key needed.'};
 fs.mkdirSync(path.dirname(output),{recursive:true});
 const receipt=spawnSync(process.execPath,[renderer,source,'--out',output,'--audit',statePath(root,'lean/audit.jsonl')],{cwd:root,encoding:'utf8',timeout:60_000,maxBuffer:1024*1024});
 const success=receipt.status===0&&fs.existsSync(output);
 audit(root,'lean-render',{success,source:path.relative(root,source),output:path.relative(root,output)});
 return {executed:true,passed:success,bundled:true,source,output,sha256:success?hashFile(output):null,error:success?null:String(receipt.stderr||receipt.error?.message||'Renderer failed').slice(-1500)};
}
