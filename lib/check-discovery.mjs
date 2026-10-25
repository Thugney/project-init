// Discover command proposals from project-owned manifests. Discovery never runs them.
import fs from 'node:fs';
import path from 'node:path';
import {projectRoot, projectFile} from './core.mjs';

const MAX_PACKAGES = 128;
const MAX_DIRECTORIES = 512;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const LOCKS = [['package-lock.json', 'npm'], ['npm-shrinkwrap.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun']];
const CHECK_SCRIPT = /^(?:test|build|typecheck|type-check|lint|check|verify|validate|smoke)(?::[A-Za-z0-9_-]+)*$/;
const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;
const IGNORED = new Set(['node_modules', 'vendor', '.git', '.project-init', 'work', 'worktrees', 'dist', 'build', 'coverage', '.next', '.venv']);
const posix = value => value.split(path.sep).join('/');

function readManifest(root, relative, blocked) {
  const name = relative === '.' ? 'package.json' : `${relative}/package.json`;
  try {
    const file = projectFile(root, name);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) throw new Error('expected a package.json file no larger than 1 MiB');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('expected a JSON object');
    if (data.scripts !== undefined && (!data.scripts || typeof data.scripts !== 'object' || Array.isArray(data.scripts))) throw new Error('scripts must be an object');
    if (Object.keys(data.scripts || {}).length > 256) throw new Error('more than 256 scripts; configure checks explicitly');
    return {path: relative, manifest: name, data};
  } catch (error) {
    blocked.push(`${name}: ${error.message}`);
    return null;
  }
}

function workspacePatterns(root, manifest, warnings, blocked) {
  const declared = manifest?.data.workspaces;
  let patterns = Array.isArray(declared) ? declared : declared?.packages;
  if (declared !== undefined && !Array.isArray(patterns)) blocked.push('package.json workspaces must be an array or an object with a packages array.');
  patterns = Array.isArray(patterns) ? [...patterns] : [];
  const file = projectFile(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(file)) {
    const body = fs.readFileSync(file, 'utf8');
    const section = body.match(/^packages:\s*(?:#.*)?\r?\n((?:[ \t]+.*(?:\r?\n|$)|\s*\r?\n)*)/m)?.[1];
    if (!section) warnings.push('pnpm-workspace.yaml uses an unsupported packages layout; only conventional package folders will be inspected.');
    else {
      for (const line of section.split(/\r?\n/)) {
        const item = line.match(/^\s+-\s+(?:'([^']+)'|"([^"]+)"|([^#\s]+))\s*(?:#.*)?$/);
        if (item) patterns.push(item[1] || item[2] || item[3]);
        else if (line.trim() && !line.trim().startsWith('#')) blocked.push('pnpm-workspace.yaml contains an unsupported package pattern; select explicit check commands.');
      }
    }
  }
  return patterns;
}

function discoverPackages(root, warnings, blocked) {
  const rootPackage = readManifest(root, '.', blocked);
  const patterns = workspacePatterns(root, rootPackage, warnings, blocked);
  // Deliberately bounded: do not adopt an independent application under work/ or a nested Git checkout.
  const requested = [...patterns, 'backend', 'frontend', 'apps/*', 'packages/*', 'services/*'];
  const excluded = patterns.filter(p => typeof p === 'string' && p.startsWith('!')).map(p => p.slice(1));
  const found = new Set(['.']);
  let visited = 0;
  function expand(pattern) {
    if (typeof pattern !== 'string') { blocked.push('Workspace package patterns must be strings.'); return; }
    if (pattern.startsWith('!')) return;
    const parts = pattern.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '').split('/');
    if (path.isAbsolute(pattern) || /^[A-Za-z]:/.test(pattern) || parts.length > 5 || parts.some(p => !p || p === '..' || /[?\[\]{}!]/.test(p) || p.includes('**'))) {
      blocked.push(`Unsupported workspace pattern ${JSON.stringify(pattern)}; provide explicit check commands for it.`);
      return;
    }
    function visit(relative, index) {
      if (++visited > MAX_DIRECTORIES) throw new Error(`Package discovery exceeds ${MAX_DIRECTORIES} directories; configure checks explicitly.`);
      if (index === parts.length) { found.add(relative || '.'); return; }
      const base = relative ? projectFile(root, relative) : root;
      if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) return;
      const wanted = parts[index];
      const matcher = new RegExp('^' + wanted.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      for (const entry of fs.readdirSync(base, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED.has(entry.name) || entry.name.startsWith('.') || !matcher.test(entry.name)) continue;
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (fs.existsSync(path.join(base, entry.name, '.git'))) {
          warnings.push(`Skipped independent Git checkout ${child}; prepare that worktree separately.`);
          continue;
        }
        visit(child, index + 1);
      }
    }
    visit('', 0);
  }
  try { for (const pattern of requested) expand(pattern); }
  catch (error) { blocked.push(error.message); }
  const matches = (value, pattern) => new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$').test(value);
  const dirs = [...found].filter(p => p === '.' || !excluded.some(e => matches(p, e))).sort();
  if (dirs.length > MAX_PACKAGES) blocked.push(`Package discovery exceeds ${MAX_PACKAGES} packages; configure checks explicitly.`);
  return dirs.slice(0, MAX_PACKAGES).map(p => p === '.' ? rootPackage : readManifest(root, p, blocked)).filter(Boolean);
}

function managerFor(root, pkg, rootPackage, warnings, blocked) {
  const own = pkg.data.packageManager;
  const declared = own ?? rootPackage?.data.packageManager;
  let selected = null;
  if (declared !== undefined) {
    const match = typeof declared === 'string' && declared.match(/^(npm|pnpm|yarn)@\S+$/);
    if (!match) { blocked.push(`${pkg.manifest}: unsupported packageManager ${JSON.stringify(declared)}; configure its check commands explicitly.`); return null; }
    selected = match[1];
  }
  const localLocks = LOCKS.filter(([name]) => fs.existsSync(projectFile(root, pkg.path === '.' ? name : `${pkg.path}/${name}`)));
  const inheritedLocks = pkg.path === '.' || own !== undefined ? [] : LOCKS.filter(([name]) => fs.existsSync(projectFile(root, name)));
  const locks = [...localLocks, ...inheritedLocks];
  const managers = [...new Set(locks.map(([,manager]) => manager))];
  if (managers.length > 1 || selected && managers.some(manager => manager !== selected)) {
    blocked.push(`${pkg.manifest}: conflicting packageManager/lockfiles (${[selected, ...managers].filter(Boolean).join(', ')}); no manager was guessed.`);
    return null;
  }
  if (!selected) selected = managers[0];
  if (selected && !['npm','pnpm','yarn'].includes(selected)) {
    blocked.push(`${pkg.manifest}: ${selected} is not a supported check runner; configure a supported command explicitly.`);
    return null;
  }
  if (!selected) {
    selected = 'npm';
    warnings.push(`${pkg.manifest}: no packageManager or lockfile; npm is the package.json default. Review this proposal and add the intended lockfile before CI installation.`);
  }
  return selected;
}

function rejectScript(script, command) {
  if (!SCRIPT_NAME.test(script)) return 'script name cannot be passed portably as an argv argument';
  if (typeof command !== 'string' || !command.trim()) return 'empty or non-string script';
  if (/(?:^|:)(?:watch|dev|serve|start|update)(?:$|:)/i.test(script) || /(?:^|\s)(?:--watch(?:All)?(?:\s|$|=true)|-w(?:\s|$)|--ui(?:\s|$))|\b(?:nodemon|tsx\s+watch|webpack\s+serve)\b/i.test(command)) return 'interactive or watch script';
  if (/\bvitest\b/.test(command) && !/\bvitest\s+run\b|\bvitest\b[^;&|]*\s--(?:run|watch=false)\b/.test(command)) return 'Vitest defaults to watch mode; provide a non-interactive run script';
  if (/\b(?:vite\s*(?:$|--|preview\b)|(?:next|nuxt)\s+(?:dev|start|preview)\b)/.test(command)) return 'development or preview server is not a terminating check';
  if (/no test specified|\b(?:TODO|FIXME)\b/i.test(command) || /^(?:echo\b|printf\b|true\s*$|exit\s+0\s*$)/.test(command.trim()) && !/&&\s*(?!exit\b)(?:\S)/.test(command)) return 'placeholder script does not establish a real check';
  if (/\|\|\s*(?:true|exit\s+0)\b/.test(command)) return 'script masks a failed exit status';
  return null;
}

function invocationGraph(packages, root, warnings, blocked, candidates, blockedDiagnostics) {
  const candidateIds = candidates.map(check => check.id);
  const graph = new Map();
  const unsupported = new Set();
  const issues = [];
  const byPath = new Map(packages.map(pkg => [pkg.path, pkg]));
  for (const pkg of packages) for (const [script, body] of Object.entries(pkg.data.scripts || {})) {
    if (typeof body !== 'string') continue;
    const id = `${pkg.path}\0${script}`, edges = new Set();
    graph.set(id, edges);
    const block = (message, kind = 'script') => issues.push({id,message,kind});
    const rejected = rejectScript(script,body);
    if(rejected){unsupported.add(id);block(`${pkg.manifest} script ${script}: ${rejected}.`);}
    // Only infer a dependency from literal, conventional shell invocations. Never evaluate shell text.
    const tokens = body.match(/"[^"\r\n]*"|'[^'\r\n]*'|&&|\|\||;|[^\s;&|]+/g) || [];
    let cwd = pkg.path, chunk = [];
    const consume = () => {
      const t = chunk.map(token => /^(['"]).*\1$/.test(token) ? token.slice(1,-1) : token); chunk = [];
      if (!t.length) return;
      if (t[0] === 'cd' && t.length === 2 && !/[$`]/.test(t[1])) {
        const absolute = path.resolve(root, cwd, t[1]);
        const relative = posix(path.relative(root, absolute)) || '.';
        if (relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative)) cwd = relative;
        return;
      }
      if (!['npm','pnpm','yarn'].includes(t[0])) {
        if (t.some(token => ['npm','pnpm','yarn'].includes(token))) {
          unsupported.add(id);
          block(`${pkg.manifest} script ${script}: wrapped package invocation needs explicit check selection.`, 'unsupported-aggregate-routing');
        }
        return;
      }
      let command = t.slice(1).flatMap(arg => /^(--workspace|--prefix)=/.test(arg) ? [arg.slice(0,arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg]), target = cwd;
      if (command.some(arg => ['-r','--recursive','--filter','workspaces','exec'].includes(arg) || arg.startsWith('--filter=')) || tokens.includes('||')) {
        unsupported.add(id);
        warnings.push(`${pkg.manifest} script ${script}: aggregate routing cannot be resolved safely; its constituent checks are proposed separately.`);
        block(`${pkg.manifest} script ${script} needs explicit check selection because its aggregate routing is unsupported.`, 'unsupported-aggregate-routing');
        return;
      }
      const prefix = command.indexOf('--prefix');
      if (prefix !== -1 && command[prefix + 1]) {
        target = posix(path.relative(root, path.resolve(root, cwd, command[prefix + 1]))) || '.';
        command.splice(prefix, 2);
      }
      const workspaces = command.includes('--workspaces') || command.includes('-ws');
      const workspaceIndex = command.findIndex(arg => arg === '--workspace' || arg === '-w');
      if (workspaceIndex !== -1 && command[workspaceIndex + 1]) {
        const choice = command[workspaceIndex + 1];
        const match = packages.find(item => item.path === choice || item.data.name === choice);
        if (match) target = match.path;
        else {
          unsupported.add(id);
          block(`${pkg.manifest} script ${script}: workspace ${choice} could not be resolved.`);
          return;
        }
        command.splice(workspaceIndex, 2);
      }
      command = command.filter(arg => !['--workspaces','-ws','--if-present','--silent','--quiet'].includes(arg));
      let invoked = command[0] === 'run' || command[0] === 'run-script' ? command[1] : command[0];
      if (!SCRIPT_NAME.test(invoked || '')) {
        unsupported.add(id);
        block(`${pkg.manifest} script ${script}: dynamic or unsupported package invocation needs explicit check selection.`, 'unsupported-aggregate-routing');
        return;
      }
      const targets = workspaces ? packages.filter(item => item.path !== '.') : [byPath.get(target)].filter(Boolean);
      for (const destination of targets) if (Object.hasOwn(destination.data.scripts || {}, invoked)) edges.add(`${destination.path}\0${invoked}`);
    };
    for (const token of tokens) {
      if (['&&','||',';'].includes(token)) { consume(); if (token !== '&&') cwd = pkg.path; }
      else chunk.push(token);
    }
    consume();
  }
  const cycles = new Set();
  const coverage = new Map();
  function walk(id, visiting) {
    if (visiting.includes(id)) { visiting.slice(visiting.indexOf(id)).forEach(item => cycles.add(item)); return new Set(); }
    if (coverage.has(id)) return coverage.get(id);
    const result = new Set();
    for (const child of graph.get(id) || []) {
      result.add(child);
      for (const target of walk(child, [...visiting, id])) result.add(target);
    }
    coverage.set(id, result);
    return result;
  }
  for (const id of graph.keys()) walk(id, []);
  const relevant=new Set(candidateIds);
  for(const id of candidateIds)for(const child of coverage.get(id)||[])relevant.add(child);
  for(const issue of issues)if(relevant.has(issue.id)){
    blocked.push(issue.message);
    blockedDiagnostics.push({kind:issue.kind,message:issue.message,
      resolution:issue.kind==='unsupported-aggregate-routing'?'explicit-check-selection':null,
      checks:candidates.filter(check=>check.id===issue.id||coverage.get(check.id)?.has(issue.id)).map(({id,...check})=>check)});
  }
  for (const id of cycles) if(relevant.has(id))blocked.push(`Recursive package script ${id.replace('\0', ':')}; resolve its command cycle before verification.`);
  return {coverage, cycles, unsupported};
}

function discoverCi(root, warnings) {
  const files = [], providers = new Set(), errors = [];
  try {
    const folder = projectFile(root, '.github/workflows');
    if (fs.existsSync(folder)) for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      if (!/\.ya?ml$/i.test(entry.name)) continue;
      const relative = `.github/workflows/${entry.name}`;
      const file = projectFile(root, relative);
      if (!fs.statSync(file).isFile()) continue;
      fs.accessSync(file, fs.constants.R_OK);
      files.push(relative); providers.add('github-actions');
    }
    for (const [file, provider] of [['azure-pipelines.yml','azure-pipelines'], ['.gitlab-ci.yml','gitlab'], ['.circleci/config.yml','circleci'], ['Jenkinsfile','jenkins']]) {
      const full = projectFile(root, file);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) { fs.accessSync(full, fs.constants.R_OK); files.push(file); providers.add(provider); }
    }
  } catch (error) { errors.push(error.message); warnings.push(`CI configuration could not be fully inspected: ${error.message}`); }
  return {state: errors.length ? 'unreadable' : files.length ? 'configured' : 'missing', files: files.sort(), providers: [...providers].sort(), errors,
    configurationVerified: false, runsVerified: false, enforcementVerified: false,
    notes: ['Workflow files are configuration evidence only; no CI run or required-check enforcement was verified.', 'PR trigger coverage is not inferred. Check the actual target branch, including stacked feature branches.']};
}

export function discoverProjectChecks(raw) {
  const root = projectRoot(raw), warnings = [], blocked = [], blockedDiagnostics = [];
  const packages = discoverPackages(root, warnings, blocked);
  const rootPackage = packages.find(pkg => pkg.path === '.');
  const candidates = [];
  for (const pkg of packages) {
    pkg.manager = managerFor(root, pkg, rootPackage, warnings, blocked);
    for (const [script, command] of Object.entries(pkg.data.scripts || {}).sort(([a],[b]) => a.localeCompare(b))) {
      if (!CHECK_SCRIPT.test(script)) continue;
      const reason = rejectScript(script, command);
      if (reason) { warnings.push(`${pkg.manifest} script ${script} was not proposed: ${reason}.`); continue; }
      if (!pkg.manager) continue;
      candidates.push({id: `${pkg.path}\0${script}`, name: pkg.path === '.' ? script : `${pkg.path}:${script}`, argv: [pkg.manager, 'run', script], cwd: pkg.path});
    }
  }
  const {coverage, cycles, unsupported} = invocationGraph(packages, root, warnings, blocked,candidates,blockedDiagnostics);
  const eligible = candidates.filter(check => !cycles.has(check.id) && !unsupported.has(check.id) && ![...(coverage.get(check.id) || [])].some(id => cycles.has(id) || unsupported.has(id)));
  const checks = eligible.filter(check => !eligible.some(other => other.id !== check.id && coverage.get(other.id)?.has(check.id)))
    .map(({id, ...check}) => check);
  if (!packages.length) warnings.push('No supported package.json manifests were found; configure the project’s actual check commands explicitly.');
  else if (!checks.length) warnings.push('No non-interactive build/test/check scripts were discovered; no successful verification is implied.');
  const ci = discoverCi(root, warnings);
  const messages = [...new Set(blocked)];
  return {checks, warnings: [...new Set(warnings)], blocked: messages,
    blockedDiagnostics:messages.map(message=>blockedDiagnostics.find(item=>item.message===message)||{kind:'discovery',message,resolution:null,checks:[]}),
    packages: packages.map(pkg => ({path:pkg.path, manifest:pkg.manifest, manager:pkg.manager, scripts:Object.keys(pkg.data.scripts || {}).sort()})),
    ci, executed: false, limitation: 'Command discovery is a proposal, not requirement coverage, test execution, CI success or approval.'};
}
