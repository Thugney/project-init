import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {discoverProjectChecks} from '../lib/check-discovery.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'project-init-check-discovery-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const put = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };
  return {root, put};
}

test('check discovery proposes actual scripts without running or rewriting anything', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', scripts:{test:'node -e "require(\'fs\').writeFileSync(\'must-not-run\',\'bad\')"', build:'tsc', typecheck:'tsc --noEmit', dev:'vite'}});
  put('package-lock.json', {lockfileVersion:3});
  const before = fs.readFileSync(path.join(root, 'package.json'));
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['build','test','typecheck']);
  assert.deepEqual(result.checks.find(c => c.name === 'test'), {name:'test', argv:['npm','run','test'], cwd:'.'});
  assert.equal(result.executed, false);
  assert.deepEqual(result.blocked, []);
  assert.equal(fs.existsSync(path.join(root, 'must-not-run')), false);
  assert.equal(fs.existsSync(path.join(root, '.project-init')), false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'package.json')), before);
});

test('Trace-style workspace build wrappers do not duplicate backend and frontend builds', t => {
  const {root, put} = fixture(t);
  put('package.json', {workspaces:['backend','frontend'], scripts:{build:'npm run build:backend && npm run build:frontend', 'build:backend':'cd backend && npm run build', 'build:frontend':'cd frontend && npm run build'}});
  put('backend/package.json', {scripts:{test:'vitest run', build:'tsc'}});
  put('backend/package-lock.json', {lockfileVersion:3});
  put('frontend/package.json', {scripts:{build:'tsc && vite build', dev:'vite'}});
  put('frontend/package-lock.json', {lockfileVersion:3});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['build','backend:test']);
  assert.deepEqual(result.checks.find(c => c.name === 'backend:test'), {name:'backend:test', argv:['npm','run','test'], cwd:'backend'});
  assert.deepEqual(result.blocked, []);
});

test('nested script aggregates run once and preserve unrelated checks', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', scripts:{test:'node --test tests/*.mjs', check:'node --check lib/main.mjs && npm test', 'test:vendor':'node --test vendor/tests/*.mjs', 'test:all':'npm run check && npm run test:vendor', smoke:'node app.mjs help'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['smoke','test:all']);
});

test('npm --workspaces and explicit --workspace dependencies are resolved without duplicate execution', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', workspaces:['packages/*'], scripts:{build:'npm run build --workspaces --if-present', test:'npm run test --workspace @app/api'}});
  put('packages/api/package.json', {name:'@app/api', scripts:{test:'node --test', build:'tsc'}});
  put('packages/ui/package.json', {name:'@app/ui', scripts:{build:'vite build'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['build','test']);
  assert.deepEqual(result.blocked, []);
});

test('pnpm workspace package declarations and manager inheritance are honored', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'pnpm@10.0.0'});
  put('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  put('pnpm-workspace.yaml', "packages:\n  - 'modules/*'\n  - '!modules/excluded'\n");
  put('modules/service/package.json', {scripts:{test:'vitest run'}});
  put('modules/excluded/package.json', {scripts:{test:'vitest run'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, [{name:'modules/service:test', argv:['pnpm','run','test'], cwd:'modules/service'}]);
  assert.deepEqual(result.blocked, []);
});

test('a yarn lock selects yarn and conflicting manager signals block guessed commands', t => {
  const {root, put} = fixture(t);
  put('package.json', {scripts:{test:'node --test'}});
  put('yarn.lock', '# fixture lock\n');
  assert.deepEqual(discoverProjectChecks(root).checks[0].argv, ['yarn','run','test']);
  put('package-lock.json', {lockfileVersion:3});
  let result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, []);
  assert.match(result.blocked.join('\n'), /conflicting.*lockfiles/);
  fs.unlinkSync(path.join(root, 'package-lock.json'));
  put('package.json', {packageManager:'npm@10.9.0', scripts:{test:'node --test'}});
  result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, []);
  assert.match(result.blocked.join('\n'), /no manager was guessed/);
});

test('watch, dev server, placeholder and failure-masking scripts are never proposed', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', scripts:{test:'echo "Error: no test specified" && exit 1', 'test:watch':'vitest --watch', 'test:unit':'vitest', 'test:related':'vitest related src/app.ts', 'test:ui':'playwright test --ui', 'test:masked':'node --test || true', 'build:preview':'vite preview', 'build:watch':'tsc -w', build:'tsc', 'test:ci':'vitest run'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['build','test:ci']);
  assert.match(result.warnings.join('\n'), /placeholder/);
  assert.match(result.warnings.join('\n'), /watch mode/);
  assert.match(result.warnings.join('\n'), /masks a failed/);
});

test('conventional app packages are found but independent checkouts and work directories are excluded', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', workspaces:['apps/*','work/*']});
  put('apps/main/package.json', {scripts:{test:'node --test'}});
  put('apps/other/package.json', {scripts:{test:'node --test'}});
  put('apps/other/.git', 'gitdir: /fixture/elsewhere\n');
  put('work/tutor-v2/package.json', {scripts:{test:'node --test'}});
  put('node_modules/third-party/package.json', {scripts:{test:'node --test'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['apps/main:test']);
  assert.match(result.warnings.join('\n'), /independent Git checkout apps\/other/);
});

test('unsupported workspace routing is visible and leaves independent checks available', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'pnpm@10.0.0', workspaces:['packages/*'], scripts:{'test:all':'pnpm -r test'}});
  put('packages/service/package.json', {scripts:{test:'vitest run'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['packages/service:test']);
  assert.match(result.blocked.join('\n'), /aggregate routing is unsupported/);
});

test('cyclic package scripts and their callers cannot become verification proposals', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', scripts:{test:'npm run check', check:'npm test', 'test:all':'npm test', build:'tsc'}});
  const result = discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c => c.name), ['build']);
  assert.match(result.blocked.join('\n'), /Recursive package script/);
});

test('unrelated development scripts do not block valid verification commands',t=>{
  const {root,put}=fixture(t);
  put('package.json',{packageManager:'npm@10.9.0',scripts:{test:'node --test',dev:'NODE_ENV=development npm run serve',serve:'node server.js','dev:loop':'npm run dev:loop'}});
  const result=discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c=>c.name),['test']);
  assert.deepEqual(result.blocked,[]);
});

test('a check wrapper cannot reintroduce a rejected watch dependency',t=>{
  const {root,put}=fixture(t);
  put('package.json',{packageManager:'npm@10.9.0',scripts:{test:'npm run test:watch','test:watch':'vitest --watch',build:'tsc'}});
  const result=discoverProjectChecks(root);
  assert.deepEqual(result.checks.map(c=>c.name),['build']);
  assert.match(result.blocked.join('\n'),/interactive or watch script/);
});

test('no supported manifest, invalid JSON and unsupported package managers do not invent tests', t => {
  const {root, put} = fixture(t);
  put('pyproject.toml', '[project]\nname="fixture"\n');
  let result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, []);
  assert.match(result.warnings.join('\n'), /No supported package.json/);
  put('package.json', '{bad json');
  result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, []);
  assert.ok(result.blocked.some(message => message.includes('package.json')));
  put('package.json', {packageManager:'bun@1.2.0', scripts:{test:'bun test'}});
  result = discoverProjectChecks(root);
  assert.deepEqual(result.checks, []);
  assert.match(result.blocked.join('\n'), /unsupported packageManager/);
});

test('unsafe or unsupported workspace patterns are reported instead of scanning outside the project', t => {
  const {root, put} = fixture(t);
  put('package.json', {packageManager:'npm@10.9.0', workspaces:['../other','apps/**'], scripts:{test:'node --test'}});
  const result = discoverProjectChecks(root);
  assert.equal(result.checks.length, 1);
  assert.equal(result.blocked.filter(message => message.includes('Unsupported workspace pattern')).length, 2);
});

test('existing workflows establish configuration presence, never a passing run or branch enforcement', t => {
  const {root, put} = fixture(t);
  assert.equal(discoverProjectChecks(root).ci.state, 'missing');
  const workflow = 'name: CI\non:\n  pull_request:\n    branches: [dev]\njobs: {}\n';
  put('.github/workflows/ci.yml', workflow);
  const result = discoverProjectChecks(root);
  assert.equal(result.ci.state, 'configured');
  assert.deepEqual(result.ci.files, ['.github/workflows/ci.yml']);
  assert.equal(result.ci.configurationVerified, false);
  assert.equal(result.ci.runsVerified, false);
  assert.equal(result.ci.enforcementVerified, false);
  assert.match(result.ci.notes.join('\n'), /stacked feature branches/);
  assert.equal(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'), workflow);
});

test('other known CI providers are identified separately from absent GitHub Actions', t => {
  const {root, put} = fixture(t);
  put('azure-pipelines.yml', 'trigger: none\n');
  const result = discoverProjectChecks(root);
  assert.equal(result.ci.state, 'configured');
  assert.deepEqual(result.ci.providers, ['azure-pipelines']);
  assert.equal(result.ci.runsVerified, false);
});

test('symlinked manifests and workflows cannot cause discovery to read outside the repository', t => {
  const {root, put} = fixture(t);
  const external = path.join(root, 'external');
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'package.json'), JSON.stringify({scripts:{test:'node --test'}}));
  put('package.json', {packageManager:'npm@10.9.0'});
  fs.mkdirSync(path.join(root, 'backend'));
  try { fs.symlinkSync(path.join(external, 'package.json'), path.join(root, 'backend/package.json')); }
  catch (error) { if (['EPERM','EACCES'].includes(error.code)) { t.skip('Host does not permit creating fixture symlinks.'); return; } throw error; }
  let result = discoverProjectChecks(root);
  assert.match(result.blocked.join('\n'), /Symbolic-link/);
  fs.mkdirSync(path.join(root, '.github/workflows'), {recursive:true});
  fs.symlinkSync(path.join(external, 'package.json'), path.join(root, '.github/workflows/ci.yml'));
  result = discoverProjectChecks(root);
  assert.equal(result.ci.state, 'unreadable');
  assert.match(result.warnings.join('\n'), /CI configuration could not be fully inspected/);
});
