import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'render.mjs');
const temp = () => mkdtempSync(path.join(tmpdir(), 'codex-lean-'));
function run(input, out, audit) {
  return spawnSync(process.execPath, [script, input, '--out', out, '--audit', audit], { encoding: 'utf8', cwd: root });
}

test('Markdown reports render a safe table and checklists, and repeat idempotently', () => {
  const dir = temp();
  const input = path.join(root, 'examples/status.md');
  const out = path.join(dir, 'status.html');
  const audit = path.join(dir, 'audit.jsonl');
  const first = run(input, out, audit);
  assert.equal(first.status, 0, first.stderr);
  const generated = readFileSync(out, 'utf8');
  assert.match(generated, /<table>/);
  assert.match(generated, /type="checkbox" disabled checked/);
  assert.match(generated, /color-scheme:light dark/);
  const mtime = statSync(out).mtimeMs;
  const second = run(input, out, audit);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /unchanged/);
  assert.equal(statSync(out).mtimeMs, mtime, 'unchanged render should not touch the output');
  const log = readFileSync(audit, 'utf8').trim().split('\n').map((s) => JSON.parse(s));
  assert.equal(log.length, 2);
  assert.equal(log[0].status, 'ok');
  assert.equal(log[0].changed, true);
  assert.equal(log[1].changed, false);
  assert.equal(log[0].inputSha256.length, 64);
});

test('Diagrams render geometry from layer data, not authored SVG', () => {
  const dir = temp(), out = path.join(dir, 'architecture.html');
  const result = run(path.join(root, 'examples/architecture.json'), out, path.join(dir, 'audit.jsonl'));
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<svg viewBox/);
  assert.match(html, /Defender XDR/);
  assert.match(html, /marker-end="url\(#arrow\)"/);
});

test('Interactive boards contain prebuilt JS, no external dependencies and valid data', () => {
  const dir = temp(), out = path.join(dir, 'board.html');
  const result = run(path.join(root, 'examples/board.json'), out, path.join(dir, 'audit.jsonl'));
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /id="export-board"/);
  assert.match(html, /localStorage/);
  assert.match(html, /ticket\.column = column/);
  assert.doesNotMatch(html, /<script\s+src=/);
});

test('Source is escaped and script-injection text remains non-executable', () => {
  const dir = temp(), input = path.join(dir, 'board.json'), out = path.join(dir, 'board.html');
  const board = JSON.parse(readFileSync(path.join(root, 'examples/board.json'), 'utf8'));
  board.tickets[0].title = '</script><script>alert(1)</script>';
  writeFileSync(input, JSON.stringify(board));
  const result = run(input, out, path.join(dir, 'audit.jsonl'));
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(out, 'utf8');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
  const md = path.join(dir, 'bad.md');
  writeFileSync(md, '# Test\n\n[bad](javascript:alert) <img src=x onerror=alert(1)>');
  const r2 = run(md, path.join(dir, 'safe.html'), path.join(dir, 'audit.jsonl'));
  assert.equal(r2.status, 0, r2.stderr);
  const safe = readFileSync(path.join(dir, 'safe.html'), 'utf8');
  assert.doesNotMatch(safe, /href="javascript:/);
  assert.match(safe, /&lt;img/);
});

test('Validation fails closed with structured failure audit', () => {
  const dir = temp(), input = path.join(dir, 'invalid.json'), out = path.join(dir, 'invalid.html');
  const bad = JSON.parse(readFileSync(path.join(root, 'examples/board.json'), 'utf8'));
  bad.tickets[0].column = 'missing';
  writeFileSync(input, JSON.stringify(bad));
  const audit = path.join(dir, 'audit.jsonl');
  const result = run(input, out, audit);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown column/);
  assert.equal(JSON.parse(readFileSync(audit, 'utf8')).status, 'failed');
});

test('Diagram rejects dangling references', () => {
  const dir = temp(), input = path.join(dir, 'diagram.json');
  const bad = JSON.parse(readFileSync(path.join(root, 'examples/architecture.json'), 'utf8'));
  bad.edges.push({ from: 'missing', to: 'xdr' });
  writeFileSync(input, JSON.stringify(bad));
  const result = run(input, path.join(dir, 'out.html'), path.join(dir, 'audit.jsonl'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown node/);
});

test('Codex JSONL usage summary distinguishes cached input and output', () => {
  const dir = temp(), input = path.join(dir, 'usage.jsonl');
  writeFileSync(input, [
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 5000, cached_input_tokens: 3000, output_tokens: 700, reasoning_output_tokens: 200 } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 2000, cached_input_tokens: 1000, output_tokens: 200 } }),
  ].join('\n'));
  const cli = path.join(root, 'scripts', 'usage-summary.mjs');
  const proc = spawnSync(process.execPath, [cli, input], { encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /7000/);
  assert.match(proc.stdout, /4000/);
  assert.match(proc.stdout, /3000/);
  assert.match(proc.stdout, /900/);
});

test('Board storage key follows source hash to avoid overriding newer source data', () => {
  const dir = temp(), input = path.join(dir, 'board.json');
  const board = JSON.parse(readFileSync(path.join(root, 'examples/board.json'), 'utf8'));
  const output = path.join(dir, 'board.html'), audit = path.join(dir, 'audit.jsonl');
  writeFileSync(input, JSON.stringify(board));
  assert.equal(run(input, output, audit).status, 0);
  const initial = readFileSync(output, 'utf8').match(/data-source-hash="([a-f0-9]{64})"/)?.[1];
  assert.ok(initial);
  board.tickets[0].column = 'done';
  writeFileSync(input, JSON.stringify(board));
  assert.equal(run(input, output, audit).status, 0);
  const updated = readFileSync(output, 'utf8').match(/data-source-hash="([a-f0-9]{64})"/)?.[1];
  assert.notEqual(initial, updated);
});
