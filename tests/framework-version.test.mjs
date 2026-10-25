import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCliVersion } from '../lib/core.mjs';

// Reproduces `specify version`: ASCII art, a title, then a bordered table. The
// first stdout line is decoration, so reporting it as the version showed
// box-drawing glyphs in `project-init status`.
const SPEC_KIT_OUTPUT = [
  '             ███████╗██████╗ ███████╗ ██████╗██╗███████╗██╗   ██╗              ',
  '             ██╔════╝██╔══██╗██╔════╝██╔════╝██║██╔════╝╚██╗ ██╔╝              ',
  '             ███████╗██████╔╝█████╗  ██║     ██║█████╗   ╚████╔╝               ',
  '             ╚════██║██╔═══╝ ██╔══╝  ██║     ██║██╔══╝    ╚██╔╝                ',
  '             ███████║██║     ███████╗╚██████╗██║██║        ██║                 ',
  '             ╚══════╝╚═╝     ╚══════╝ ╚═════╝╚═╝╚═╝        ╚═╝                 ',
  '                                                                               ',
  '               GitHub Spec Kit - Spec-Driven Development Toolkit               ',
  '',
  '╭──────────────────────── Specify CLI Information ────────────────────────╮',
  '│                                                                        │',
  '│     CLI Version    1.2.3                                               │',
  '│                                                                        │',
  '│          Python    3.11.15                                             │',
  '│                                                                        │',
  '╰────────────────────────────────────────────────────────────────────────╯',
].join('\n');

test('extracts the labelled version from a decorated native CLI banner', () => {
  assert.equal(extractCliVersion(SPEC_KIT_OUTPUT), '1.2.3');
});

test('prefers the labelled version over an unrelated earlier number', () => {
  const output = ['Spec Kit 2000 edition', 'CLI Version 1.2.3'].join('\n');
  assert.equal(extractCliVersion(output), '1.2.3');
});

test('reads a plain single-line version, as openspec --version prints', () => {
  assert.equal(extractCliVersion('0.9.4\n'), '0.9.4');
  assert.equal(extractCliVersion('openspec/1.10.0 win32-x64 node-v22.3.0'), '1.10.0');
});

test('keeps prerelease and build metadata', () => {
  assert.equal(extractCliVersion('version 2.1.0-preview.15'), '2.1.0-preview.15');
});

test('ignores ANSI colour sequences around the version', () => {
  assert.equal(extractCliVersion('\u001B[1mCLI Version\u001B[0m \u001B[32m1.2.3\u001B[0m'), '1.2.3');
});

test('reports no version rather than decoration when none is present', () => {
  const bannerOnly = SPEC_KIT_OUTPUT.split('\n').slice(0, 8).join('\n');
  assert.equal(extractCliVersion(bannerOnly), null);
  assert.equal(extractCliVersion(''), null);
  assert.equal(extractCliVersion('   \n\n'), null);
  assert.equal(extractCliVersion(undefined), null);
  assert.equal(extractCliVersion(null), null);
});
