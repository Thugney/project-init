import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('license, attribution and package metadata match Apache-2.0', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const license = read('LICENSE');
  const notice = read('NOTICE.md');
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(lock.packages[''].license, 'Apache-2.0');
  assert.equal(pkg.private, true, 'npm registry publishing must remain disabled');
  assert.match(license, /^Apache License\nVersion 2\.0, January 2004/);
  assert.match(license, /9\. Accepting Warranty or Additional Liability\./);
  assert.match(notice, /Copyright 2026 Thugney/);
  assert.match(notice, /vendor\/lean-kit/);
  assert.match(notice, /legacy\/v1/);
});
