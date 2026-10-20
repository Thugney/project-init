import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {resolveWindowsCommand,commandInvocation} from '../lib/core.mjs';
test('Windows native-only Codex install resolves its executable without requiring a cmd shim',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-init-native-resolution-'));
 try {fs.writeFileSync(path.join(dir,'codex.exe'),'resolution fixture; never executed');
  assert.equal(resolveWindowsCommand('codex',dir),path.join(dir,'codex.exe'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('Windows resolution respects the first PATH directory and preserves npm-style cmd shims',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-init-shim-resolution-'));
 try {const a=path.join(dir,'a'),b=path.join(dir,'b');fs.mkdirSync(a);fs.mkdirSync(b);
  fs.writeFileSync(path.join(a,'codex.cmd'),'resolution fixture; never executed');
  fs.writeFileSync(path.join(b,'codex.exe'),'resolution fixture; never executed');
  assert.equal(resolveWindowsCommand('codex',a+path.delimiter+b),path.join(a,'codex.cmd'));
  assert.equal(resolveWindowsCommand(process.execPath,a),process.execPath);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
for(const ext of ['cmd','bat']) test(`Windows executes the selected ${ext} path despite a conflicting working-directory shim`,{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'project-init dispatch '));
 try {
  const selected=path.join(dir,'selected path'),cwd=path.join(dir,'cwd');fs.mkdirSync(selected);fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(selected,`runner.${ext}`),'@echo selected:%~1\r\n');
  fs.writeFileSync(path.join(cwd,`runner.${ext}`),'@echo WRONG\r\n');
  const invocation=commandInvocation(resolveWindowsCommand('runner',selected),['argument with spaces']);
  const actual=spawnSync(invocation.command,invocation.args,{cwd,encoding:'utf8',windowsHide:true,...invocation.options});
  assert.equal(actual.status,0,actual.stderr||actual.error?.message);
  assert.equal(actual.stdout.trim(),'selected:argument with spaces');
  for(const unsafe of ['x&echo injected','%PATH%','x"y','x\ny']) assert.throws(()=>commandInvocation(path.join(selected,`runner.${ext}`),[unsafe]),/Unsafe Windows batch/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
