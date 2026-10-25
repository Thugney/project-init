import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {VERSION,commandInvocation,fail} from './core.mjs';

const REPO='Thugney/project-init';
const API_MAIN=`https://api.github.com/repos/${REPO}/commits/main`;

function parseVersion(value){
  const m=String(value||'').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if(!m) return null;
  return {major:+m[1],minor:+m[2],patch:+m[3],pre:m[4]||''};
}

export function compareVersions(left,right){
  const a=parseVersion(left),b=parseVersion(right);
  if(!a||!b) return String(left).localeCompare(String(right),undefined,{numeric:true});
  for(const key of ['major','minor','patch']) if(a[key]!==b[key]) return a[key]-b[key];
  if(a.pre===b.pre) return 0;
  if(!a.pre) return 1;
  if(!b.pre) return -1;
  const ap=a.pre.split('.'),bp=b.pre.split('.');
  const n=Math.max(ap.length,bp.length);
  for(let i=0;i<n;i++){
    if(ap[i]===undefined)return -1;
    if(bp[i]===undefined)return 1;
    const an=/^\d+$/.test(ap[i]),bn=/^\d+$/.test(bp[i]);
    if(an&&bn){const d=Number(ap[i])-Number(bp[i]);if(d)return d;continue;}
    if(an!==bn)return an?-1:1;
    const d=ap[i].localeCompare(bp[i]);if(d)return d;
  }
  return 0;
}

async function json(url,fetcher){
  const response=await fetcher(url,{headers:{'User-Agent':'project-init-self-update','Accept':'application/vnd.github+json'}});
  if(!response.ok) fail(`Update check failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchPreviewRelease(fetcher=globalThis.fetch){
  if(typeof fetcher!=='function') fail('This Node runtime does not provide fetch; Node 20.19+ is required.');
  const commit=await json(API_MAIN,fetcher);
  const sha=commit?.sha;
  if(!/^[a-f0-9]{40}$/i.test(sha||'')) fail('GitHub did not return a valid Project Init main commit.');
  const manifest=await json(`https://raw.githubusercontent.com/${REPO}/${sha}/package.json`,fetcher);
  if(manifest?.name!=='@thugney/project-init'||!parseVersion(manifest?.version)) fail('Remote Project Init package metadata is invalid.');
  return {
    channel:'preview',
    ref:'main',
    sha,
    version:manifest.version,
    source:`git+https://github.com/${REPO}.git#${sha}`
  };
}

function run(command,args,options={}){
  const invocation=commandInvocation(command,args);
  return spawnSync(invocation.command,invocation.args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,...invocation.options,...options});
}

export function updateDecision(currentVersion,remoteVersion,{force=false}={}){
  const comparison=compareVersions(currentVersion,remoteVersion);
  if(force) return {status:'update-available',reason:'forced'};
  if(comparison<0) return {status:'update-available',reason:'newer-version'};
  if(comparison===0) return {status:'current',reason:'same-version'};
  return {status:'ahead',reason:'local-version-newer'};
}

export async function updateProjectInit({check=false,force=false,fetcher=globalThis.fetch,runner=run}={}){
  const remote=await fetchPreviewRelease(fetcher);
  const decision=updateDecision(VERSION,remote.version,{force});
  const base={
    currentVersion:VERSION,
    remoteVersion:remote.version,
    channel:remote.channel,
    remoteCommit:remote.sha,
    source:remote.source,
    status:decision.status,
    reason:decision.reason,
    updated:false
  };
  if(check||decision.status!=='update-available') return base;

  const install=runner('npm',['install','--global','--force',remote.source]);
  if(install.error) fail(`Project Init update failed to start npm: ${install.error.message}`);
  if(install.status!==0) fail(`Project Init update failed (npm exit ${install.status}): ${(install.stderr||install.stdout||'').trim().slice(-1200)}`);

  const verify=runner('project-init',['version']);
  if(verify.error) fail(`Project Init updated but verification failed to start: ${verify.error.message}`);
  const installed=String(verify.stdout||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||'';
  if(verify.status!==0||installed!==remote.version){
    fail(`Project Init update verification failed: expected ${remote.version}, got ${installed||'no version output'}.`);
  }
  return {...base,status:'updated',updated:true,installedVersion:installed};
}
