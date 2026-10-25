import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const UV_VERSION='0.13.5';
const TOOL_HOME=path.join(os.homedir(),'.project-init','tools');

function run(command,args=[],options={}){
  return spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout:options.timeout||15000,maxBuffer:4*1024*1024,...options});
}
function commandOk(command,args=[]){
  try{const r=run(command,args);return r.status===0;}catch{return false;}
}
function firstLine(command,args=[]){
  try{const r=run(command,args);return r.status===0?(r.stdout||r.stderr||'').trim().split(/\r?\n/)[0]:'';}catch{return '';}
}
function managedUvDir(){return path.join(TOOL_HOME,'uv',UV_VERSION);}
export function managedUvExecutable(){return path.join(managedUvDir(),process.platform==='win32'?'uv.exe':'uv');}
export function activateManagedTools(){
  const exe=managedUvExecutable();
  if(fs.existsSync(exe)){
    const dir=path.dirname(exe);
    const parts=(process.env.PATH||'').split(path.delimiter);
    if(!parts.some(p=>path.resolve(p||'.')===path.resolve(dir))) process.env.PATH=dir+path.delimiter+(process.env.PATH||'');
  }
  return {uv:fs.existsSync(exe)?exe:null};
}
function uvStatus(){
  activateManagedTools();
  if(commandOk('uv',['--version'])) return {id:'uv',ready:true,version:firstLine('uv',['--version']),source:fs.existsSync(managedUvExecutable())?'project-init-managed':'system'};
  return {id:'uv',ready:false,version:null,source:null,requiredBy:'Spec Kit',installable:true,managedVersion:UV_VERSION};
}
function pythonCommand(){
  for(const cmd of (process.platform==='win32'?['python','py']:['python3','python'])) if(commandOk(cmd,['--version'])) return cmd;
  return null;
}
export function prerequisitePlan({needUv=true,needEcc=true,needFactory=true}={}){
  const checks=[
    {id:'git',ready:commandOk('git',['--version']),version:firstLine('git',['--version']),requiredBy:'Project Init / Factory',installable:false},
    {id:'node',ready:true,version:process.version,requiredBy:'Project Init',installable:false},
  ];
  if(needEcc){
    checks.push({id:'npm',ready:commandOk('npm',['--version']),version:firstLine('npm',['--version']),requiredBy:'ECC',installable:false});
    checks.push({id:'npx',ready:commandOk('npx',['--version']),version:firstLine('npx',['--version']),requiredBy:'ECC',installable:false});
  }
  if(needUv) checks.push(uvStatus());
  if(needFactory){
    const py=pythonCommand();
    checks.push({id:'python',ready:!!py,version:py?firstLine(py,['--version']):null,command:py,requiredBy:'Factory helper scripts',installable:process.platform==='win32'&&commandOk('winget',['--version'])});
  }
  return {
    ready:checks.every(x=>x.ready),
    checks,
    missing:checks.filter(x=>!x.ready).map(x=>x.id)
  };
}

function assetForPlatform(){
  const a=process.arch;
  if(process.platform==='win32'){
    if(a==='x64') return 'uv-x86_64-pc-windows-msvc.zip';
    if(a==='arm64') return 'uv-aarch64-pc-windows-msvc.zip';
  }
  if(process.platform==='darwin'){
    if(a==='x64') return 'uv-x86_64-apple-darwin.tar.gz';
    if(a==='arm64') return 'uv-aarch64-apple-darwin.tar.gz';
  }
  if(process.platform==='linux'){
    if(a==='x64') return 'uv-x86_64-unknown-linux-gnu.tar.gz';
    if(a==='arm64') return 'uv-aarch64-unknown-linux-gnu.tar.gz';
  }
  throw new Error(`No Project Init managed uv build for ${process.platform}/${process.arch}.`);
}
async function download(url,file,fetcher=globalThis.fetch){
  const r=await fetcher(url,{headers:{'User-Agent':'project-init-bootstrap'}});
  if(!r.ok) throw new Error(`Download failed (${r.status}): ${url}`);
  const bytes=Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,bytes,{mode:0o600});
  return bytes;
}
function findFile(root,name){
  if(!fs.existsSync(root)) return null;
  const stack=[root];
  while(stack.length){
    const dir=stack.pop();
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,e.name);
      if(e.isDirectory()) stack.push(p);
      else if(e.isFile()&&e.name.toLowerCase()===name.toLowerCase()) return p;
    }
  }
  return null;
}
export async function installManagedUv({fetcher=globalThis.fetch}={}){
  if(typeof fetcher!=='function') throw new Error('Node fetch is unavailable; Node 20.19+ is required.');
  const asset=assetForPlatform();
  const base=`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;
  const cache=path.join(os.homedir(),'.project-init','downloads','uv',UV_VERSION);
  const archive=path.join(cache,asset);
  const checksumFile=archive+'.sha256';
  const archiveBytes=await download(`${base}/${asset}`,archive,fetcher);
  const checksumBytes=await download(`${base}/${asset}.sha256`,checksumFile,fetcher);
  const expected=checksumBytes.toString('utf8').match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase();
  if(!expected) throw new Error('uv checksum file did not contain a SHA-256 digest.');
  const actual=crypto.createHash('sha256').update(archiveBytes).digest('hex');
  if(actual!==expected) throw new Error(`uv archive checksum mismatch: expected ${expected}, got ${actual}.`);

  const dest=managedUvDir();
  fs.rmSync(dest,{recursive:true,force:true});
  fs.mkdirSync(dest,{recursive:true});
  let extract;
  if(process.platform==='win32'){
    extract=run('powershell',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`Expand-Archive -LiteralPath '${archive.replaceAll("'","''")}' -DestinationPath '${dest.replaceAll("'","''")}' -Force`],{timeout:120000});
  }else{
    extract=run('tar',['-xzf',archive,'-C',dest],{timeout:120000});
  }
  if(extract.status!==0) throw new Error(`Failed to extract uv: ${(extract.stderr||extract.stdout||'').trim().slice(-600)}`);
  const found=findFile(dest,process.platform==='win32'?'uv.exe':'uv');
  if(!found) throw new Error('uv archive extracted but uv executable was not found.');
  const target=managedUvExecutable();
  if(path.resolve(found)!==path.resolve(target)){
    fs.copyFileSync(found,target);
  }
  if(process.platform!=='win32') fs.chmodSync(target,0o755);
  activateManagedTools();
  const verify=run(target,['--version']);
  if(verify.status!==0) throw new Error(`uv verification failed: ${(verify.stderr||verify.stdout||'').trim().slice(-600)}`);
  return {id:'uv',installed:true,version:(verify.stdout||verify.stderr||'').trim().split(/\r?\n/)[0],path:target,asset,sha256:actual};
}

export function installPythonWindows(){
  if(process.platform!=='win32') throw new Error('Automatic Python installation is currently supported only on Windows.');
  if(!commandOk('winget',['--version'])) throw new Error('Python is required by Factory helper scripts and winget is not available for Project Init to install it.');
  const r=run('winget',[
    'install','--id','Python.Python.3.13','-e','--scope','user',
    '--accept-package-agreements','--accept-source-agreements','--silent'
  ],{timeout:20*60*1000});
  if(r.status!==0) throw new Error(`Python installation failed: ${(r.stderr||r.stdout||'').trim().slice(-1000)}`);
  const py=pythonCommand();
  if(!py) throw new Error('Python installer completed but Python is not discoverable in this terminal. Open a new terminal and re-run project-init init --project . --apply.');
  return {id:'python',installed:true,version:firstLine(py,['--version']),command:py};
}
