import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const UV_VERSION='0.13.5';
const TOOL_HOME=path.join(os.homedir(),'.project-init','tools');

function resolveWindowsCommand(command){
  if(process.platform!=='win32'||path.isAbsolute(command)||path.extname(command)) return command;
  for(const raw of (process.env.PATH||'').split(path.delimiter)){
    const dir=raw.replace(/^"|"$/g,'');
    if(!dir||!path.isAbsolute(dir)) continue;
    for(const ext of ['.exe','.com','.cmd','.bat']){
      const candidate=path.join(dir,command+ext);
      if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return command;
}
function run(command,args=[],options={}){
  const resolved=resolveWindowsCommand(command);
  const common={encoding:'utf8',windowsHide:true,timeout:options.timeout||15000,maxBuffer:4*1024*1024,...options};
  if(process.platform==='win32'&&/\.(cmd|bat)$/i.test(resolved)){
    const quote=value=>{
      if(/["%\r\n!^&|<>\0]/.test(value)) throw new Error('Unsafe Windows bootstrap argument.');
      return '"'+value+'"';
    };
    const line=[resolved,...args].map(quote).join(' ');
    return spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe'),['/d','/v:off','/s','/c','"'+line+'"'],{...common,windowsVerbatimArguments:true});
  }
  return spawnSync(resolved,args,common);
}
function runInteractive(command,args=[]){
  const resolved=resolveWindowsCommand(command);
  const common={stdio:'inherit',windowsHide:false};
  if(process.platform==='win32'&&/\.(cmd|bat)$/i.test(resolved)){
    const quote=value=>{
      if(/["%\r\n!^&|<>\0]/.test(value)) throw new Error('Unsafe Windows bootstrap argument.');
      return '"'+value+'"';
    };
    const line=[resolved,...args].map(quote).join(' ');
    return spawnSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe'),['/d','/v:off','/s','/c','"'+line+'"'],{...common,windowsVerbatimArguments:true});
  }
  return spawnSync(resolved,args,common);
}
function commandOk(command,args=[]){
  try{const r=run(command,args);return r.status===0;}catch{return false;}
}
function firstLine(command,args=[]){
  try{const r=run(command,args);return r.status===0?(r.stdout||r.stderr||'').trim().split(/\r?\n/)[0]:'';}catch{return '';}
}
function managedUvDir(){return path.join(TOOL_HOME,'uv',UV_VERSION);}
export function managedUvExecutable(){return path.join(managedUvDir(),process.platform==='win32'?'uv.exe':'uv');}
function prependPath(dir){
  if(!dir||!fs.existsSync(dir)) return;
  const parts=(process.env.PATH||'').split(path.delimiter);
  if(!parts.some(p=>{try{return path.resolve(p||'.')===path.resolve(dir);}catch{return false;}})) process.env.PATH=dir+path.delimiter+(process.env.PATH||'');
}
function activateNpmGlobalBin(){
  if(!commandOk('npm',['--version'])) return null;
  const r=run('npm',['prefix','-g']);
  if(r.status!==0) return null;
  const prefix=(r.stdout||'').trim().split(/\r?\n/).filter(Boolean).at(-1);
  if(!prefix) return null;
  const bin=process.platform==='win32'?prefix:path.join(prefix,'bin');
  prependPath(bin);
  return bin;
}
function npmGlobalRoot(){
  if(!commandOk('npm',['--version'])) return null;
  const r=run('npm',['root','-g']);
  if(r.status!==0) return null;
  const root=(r.stdout||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||null;
  return root&&fs.existsSync(root)?root:null;
}
function codexNativeSpec(){
  if(process.platform!=='win32') return null;
  if(process.arch==='x64') return {packageName:'codex-win32-x64',triple:'x86_64-pc-windows-msvc'};
  if(process.arch==='arm64') return {packageName:'codex-win32-arm64',triple:'aarch64-pc-windows-msvc'};
  return null;
}
function boundedFind(root,name,maxDepth=8){
  if(!root||!fs.existsSync(root)) return null;
  const stack=[[root,0]];
  while(stack.length){
    const [dir,depth]=stack.pop();
    let entries;
    try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
    for(const e of entries){
      const p=path.join(dir,e.name);
      if(e.isFile()&&e.name.toLowerCase()===name.toLowerCase()) return p;
      if(e.isDirectory()&&depth<maxDepth&&e.name!=='.cache') stack.push([p,depth+1]);
    }
  }
  return null;
}
export function resolveCodexNativeExecutable(){
  if(process.platform!=='win32') return null;
  const override=process.env.PROJECT_INIT_CODEX_NATIVE_EXECUTABLE;
  if(override){
    const candidate=path.resolve(override);
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()&&path.extname(candidate).toLowerCase()==='.exe') return candidate;
  }
  const spec=codexNativeSpec(),root=npmGlobalRoot();
  if(!spec||!root) return null;
  const candidates=[
    path.join(root,'@openai','codex','node_modules','@openai',spec.packageName,'vendor',spec.triple,'bin','codex.exe'),
    path.join(root,'@openai',spec.packageName,'vendor',spec.triple,'bin','codex.exe')
  ];
  for(const candidate of candidates){
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()) return candidate;
  }
  const roots=[
    path.join(root,'@openai','codex'),
    path.join(root,'@openai',spec.packageName)
  ];
  for(const searchRoot of roots){
    const found=boundedFind(searchRoot,'codex.exe',10);
    if(found) return found;
  }
  return null;
}
export function activateAgentRuntimeBinaries(){
  const npmGlobalBin=activateNpmGlobalBin();
  const globalRoot=npmGlobalRoot();
  let codexNative=null,codexPackageRoot=null;
  if(globalRoot){
    const candidate=path.join(globalRoot,'@openai','codex');
    if(fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory()) codexPackageRoot=candidate;
  }
  if(process.platform==='win32'){
    codexNative=resolveCodexNativeExecutable();
    if(codexNative) prependPath(path.dirname(codexNative));
  }
  if(codexNative){
    if(codexPackageRoot) process.env.CODEX_MANAGED_PACKAGE_ROOT=codexPackageRoot;
    process.env.CODEX_MANAGED_BY_NPM='1';
    delete process.env.CODEX_MANAGED_BY_BUN;
    delete process.env.CODEX_MANAGED_BY_PNPM;
    delete process.env.CODEX_MANAGED_BY_VITE_PLUS;
  }
  return {npmGlobalBin,codexNative,codexPackageRoot};
}
export function prepareVendorRuntimeEnvironment(){
  const managed=activateManagedTools({includeAgents:false});
  const agents=activateAgentRuntimeBinaries();
  return {env:{...process.env},...managed,...agents};
}
function directExecutableOk(executable,args=[]){
  if(!executable) return false;
  try{
    const r=spawnSync(executable,args,{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,env:process.env});
    return r.status===0;
  }catch{return false;}
}

export function activateManagedTools({includeAgents=true}={}){
  const npmGlobalBin=activateNpmGlobalBin();
  const exe=managedUvExecutable();
  let uvToolBin=null;
  if(fs.existsSync(exe)){
    prependPath(path.dirname(exe));
    const dir=run(exe,['tool','dir','--bin']);
    if(dir.status===0){
      uvToolBin=(dir.stdout||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||null;
      if(uvToolBin) prependPath(uvToolBin);
    }
  }
  const agents=includeAgents?activateAgentRuntimeBinaries():{npmGlobalBin,codexNative:null};
  return {uv:fs.existsSync(exe)?exe:null,uvToolBin,...agents};
}
function uvStatus(){
  activateManagedTools();
  if(commandOk('uv',['--version'])) return {id:'uv',ready:true,version:firstLine('uv',['--version']),source:fs.existsSync(managedUvExecutable())?'project-init-managed':'system'};
  return {id:'uv',ready:false,version:null,source:null,requiredBy:'Spec Kit',installable:true,managedVersion:UV_VERSION};
}
function pythonCommand(){
  for(const cmd of (process.platform==='win32'?['python']:['python3','python'])) if(commandOk(cmd,['--version'])) return cmd;
  return null;
}
export function prerequisitePlan({needUv=true,needEcc=true,needFactory=true}={}){
  const managed=activateManagedTools({includeAgents:false});
  const winget=process.platform==='win32'&&commandOk('winget',['--version']);
  const npmReady=commandOk('npm',['--version']);
  const checks=[
    {id:'git',ready:commandOk('git',['--version']),version:firstLine('git',['--version']),requiredBy:'Project Init / Factory / agent plugins',installable:!!winget,repairWith:winget?'winget':null},
    {id:'node',ready:true,version:process.version,requiredBy:'Project Init / agent CLIs',installable:false},
  ];

  if(needEcc||needFactory){
    checks.push({id:'npm',ready:npmReady,version:firstLine('npm',['--version']),requiredBy:needFactory?'Codex CLI / Claude Code CLI / ECC':'ECC',installable:false});
  }
  if(needEcc){
    checks.push({id:'npx',ready:commandOk('npx',['--version']),version:firstLine('npx',['--version']),requiredBy:'ECC',installable:npmReady,repairWith:npmReady?'npm-reinstall':null});
  }
  if(needUv) checks.push(uvStatus());

  let codexNative=null;
  if(needFactory){
    const py=pythonCommand();
    checks.push({id:'python',ready:!!py,version:py?firstLine(py,['--version']):null,command:py,requiredBy:'Factory helper scripts',installable:process.platform==='win32'&&commandOk('winget',['--version'])});

    // Check the npm/shell entrypoints before prepending the nested native Codex payload.
    // This mirrors what the user can run in PowerShell.
    const codexReady=commandOk('codex',['--version']);
    checks.push({id:'codex-cli',ready:codexReady,version:codexReady?firstLine('codex',['--version']):null,requiredBy:'Factory Codex worker / ECC Codex plugin',installable:npmReady,package:'@openai/codex@latest'});
    if(codexReady){
      const authReady=commandOk('codex',['login','status']);
      checks.push({id:'codex-auth',ready:authReady,version:authReady?'signed-in':null,requiredBy:'Factory Codex worker',installable:true,interactive:true});
      const pluginList=commandOk('codex',['plugin','list','--json']);
      const marketplaceList=commandOk('codex',['plugin','marketplace','list','--json']);
      checks.push({id:'codex-ecc-capability',ready:pluginList&&marketplaceList,version:pluginList&&marketplaceList?'plugin-api-ready':null,requiredBy:'ECC Codex native plugin lifecycle',installable:npmReady,repairWith:'codex-update'});
      if(process.platform==='win32'){
        codexNative=resolveCodexNativeExecutable();
        const nativeReady=!!codexNative&&directExecutableOk(codexNative,['--version']);
        checks.push({id:'codex-native-runtime',ready:nativeReady,version:nativeReady?codexNative:null,requiredBy:'ECC shell-less Codex plugin execution on Windows',installable:npmReady,repairWith:'codex-reinstall'});
      }
    }

    const claudeReady=commandOk('claude',['--version']);
    checks.push({id:'claude-code',ready:claudeReady,version:claudeReady?firstLine('claude',['--version']):null,requiredBy:'Factory Claude worker/orchestrator / ECC Claude plugin',installable:npmReady,package:'@anthropic-ai/claude-code@latest'});
    if(claudeReady){
      const authReady=commandOk('claude',['auth','status']);
      checks.push({id:'claude-auth',ready:authReady,version:authReady?'signed-in':null,requiredBy:'Factory Claude worker/orchestrator',installable:true,interactive:true});
      const pluginList=commandOk('claude',['plugin','list','--json']);
      const marketplaceList=commandOk('claude',['plugin','marketplace','list','--json']);
      checks.push({id:'claude-ecc-capability',ready:pluginList&&marketplaceList,version:pluginList&&marketplaceList?'plugin-api-ready':null,requiredBy:'ECC Claude native plugin lifecycle',installable:npmReady,repairWith:'claude-update'});
    }
  }

  // From this point onward every vendor child inherits the same normalized PATH.
  if(codexNative) prependPath(path.dirname(codexNative));
  return {
    ready:checks.every(x=>x.ready),
    checks,
    missing:checks.filter(x=>!x.ready).map(x=>x.id),
    runtime:{...managed,npmGlobalBin:activateNpmGlobalBin(),codexNative}
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

export function installCodexCli({force=false}={}){
  if(!commandOk('npm',['--version'])) throw new Error('Codex CLI requires npm, but npm is unavailable.');
  const args=['install','--global',...(force?['--force']:[]),'@openai/codex@latest'];
  const r=run('npm',args,{timeout:20*60*1000});
  if(r.status!==0) throw new Error(`Codex CLI installation failed: ${(r.stderr||r.stdout||'').trim().slice(-1200)}`);
  activateNpmGlobalBin();
  const runtime=activateAgentRuntimeBinaries();
  if(!commandOk('codex',['--version'])) throw new Error('Codex CLI install completed but codex is not discoverable on PATH.');
  if(process.platform==='win32'&&!runtime.codexNative) throw new Error('Codex CLI shell shim installed, but the native codex.exe payload required by ECC could not be resolved.');
  return {id:'codex-cli',installed:true,version:firstLine('codex',['--version']),package:'@openai/codex@latest',nativeExecutable:runtime.codexNative||null};
}

export function repairCodexRuntime(){
  const result=installCodexCli({force:true});
  const runtime=prepareVendorRuntimeEnvironment();
  if(process.platform==='win32'&&!runtime.codexNative) throw new Error('Codex was reinstalled but Project Init still could not resolve the native codex.exe payload required by ECC.');
  if(!commandOk('codex',['plugin','list','--json'])||!commandOk('codex',['plugin','marketplace','list','--json'])) {
    throw new Error('Codex CLI is installed but does not expose the plugin inventory APIs required by ECC.');
  }
  return {...result,id:'codex-runtime',repaired:true,nativeExecutable:runtime.codexNative||null};
}

export function authenticateCodexCli(){
  if(!commandOk('codex',['--version'])) throw new Error('Codex CLI is not installed.');
  if(commandOk('codex',['login','status'])) return {id:'codex-auth',authenticated:true,already:true};
  const r=runInteractive('codex',['login']);
  if(r.status!==0) throw new Error(`Codex sign-in did not complete successfully (exit ${r.status}).`);
  if(!commandOk('codex',['login','status'])) throw new Error('Codex sign-in flow finished but codex login status is not authenticated.');
  return {id:'codex-auth',authenticated:true,already:false};
}

export function installClaudeCodeCli(){
  if(!commandOk('npm',['--version'])) throw new Error('Claude Code CLI requires npm, but npm is unavailable.');
  const r=run('npm',['install','--global','@anthropic-ai/claude-code@latest'],{timeout:20*60*1000});
  if(r.status!==0) throw new Error(`Claude Code CLI installation failed: ${(r.stderr||r.stdout||'').trim().slice(-1200)}`);
  prepareVendorRuntimeEnvironment();
  if(!commandOk('claude',['--version'])) throw new Error('Claude Code CLI install completed but claude is not discoverable on PATH.');
  return {id:'claude-code',installed:true,version:firstLine('claude',['--version']),package:'@anthropic-ai/claude-code@latest'};
}

export function repairClaudeCodeRuntime(){
  const result=installClaudeCodeCli();
  prepareVendorRuntimeEnvironment();
  if(!commandOk('claude',['plugin','list','--json'])||!commandOk('claude',['plugin','marketplace','list','--json'])) {
    throw new Error('Claude Code CLI is installed but does not expose the plugin inventory APIs required by ECC.');
  }
  return {...result,id:'claude-runtime',repaired:true};
}

export function authenticateClaudeCodeCli(){
  if(!commandOk('claude',['--version'])) throw new Error('Claude Code CLI is not installed.');
  if(commandOk('claude',['auth','status'])) return {id:'claude-auth',authenticated:true,already:true};
  const r=runInteractive('claude',['auth','login']);
  if(r.status!==0) throw new Error(`Claude Code sign-in did not complete successfully (exit ${r.status}).`);
  if(!commandOk('claude',['auth','status'])) throw new Error('Claude Code sign-in flow finished but claude auth status is not authenticated.');
  return {id:'claude-auth',authenticated:true,already:false};
}

export function repairNpx(){
  const npmVersion=firstLine('npm',['--version']);
  if(!npmVersion) throw new Error('ECC requires npx and npm is unavailable.');
  const r=run('npm',['install','--global','--force',`npm@${npmVersion}`],{timeout:10*60*1000});
  if(r.status!==0) throw new Error(`npm repair failed: ${(r.stderr||r.stdout||'').trim().slice(-1000)}`);
  if(!commandOk('npx',['--version'])) throw new Error('npm repair completed but npx is still unavailable.');
  return {id:'npx',installed:true,version:firstLine('npx',['--version']),npmVersion};
}

export function installGitWindows(){
  if(process.platform!=='win32'||!commandOk('winget',['--version'])) throw new Error('Git is required and Project Init cannot install it automatically on this platform.');
  const r=run('winget',[
    'install','--id','Git.Git','-e','--scope','user',
    '--accept-package-agreements','--accept-source-agreements','--silent'
  ],{timeout:20*60*1000});
  if(r.status!==0) throw new Error(`Git installation failed: ${(r.stderr||r.stdout||'').trim().slice(-1000)}`);
  if(!commandOk('git',['--version'])) {
    const common=path.join(process.env.LOCALAPPDATA||'', 'Programs','Git','cmd');
    if(fs.existsSync(common)) prependPath(common);
  }
  if(!commandOk('git',['--version'])) throw new Error('Git installer completed but Git is not discoverable in this terminal. Open a new terminal and re-run Project Init.');
  return {id:'git',installed:true,version:firstLine('git',['--version'])};
}

export function installPythonWindows(){
  if(process.platform!=='win32') throw new Error('Automatic Python installation is currently supported only on Windows.');
  if(!commandOk('winget',['--version'])) throw new Error('Python is required by Factory helper scripts and winget is not available for Project Init to install it.');
  const r=run('winget',[
    'install','--id','Python.Python.3.13','-e','--scope','user',
    '--accept-package-agreements','--accept-source-agreements','--silent'
  ],{timeout:20*60*1000});
  if(r.status!==0) throw new Error(`Python installation failed: ${(r.stderr||r.stdout||'').trim().slice(-1000)}`);
  let py=pythonCommand();
  if(!py){
    const local=process.env.LOCALAPPDATA||'';
    const candidates=[
      path.join(local,'Programs','Python','Python313'),
      path.join(local,'Programs','Python','Python313','Scripts')
    ];
    for(const dir of candidates) prependPath(dir);
    py=pythonCommand();
  }
  if(!py) throw new Error('Python installer completed but Python is not discoverable in this terminal. Open a new terminal and re-run project-init init --project . --apply.');
  return {id:'python',installed:true,version:firstLine(py,['--version']),command:py};
}
