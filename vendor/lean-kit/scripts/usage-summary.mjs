#!/usr/bin/env node
// Summarize token usage from Codex CLI `codex exec --json` event logs.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const paths = process.argv.slice(2);
if (!paths.length || paths.includes('--help')) {
  console.log('Usage: node scripts/usage-summary.mjs <codex-exec-a.jsonl> [codex-exec-b.jsonl ...]');
  process.exit(paths.includes('--help') ? 0 : 1);
}
try {
  const rows = [];
  for (const filename of paths) {
    const content = await readFile(filename, 'utf8');
    const row = { file: path.basename(filename), turns: 0, input: 0, cached: 0, uncached: 0, output: 0, reasoning: 0 };
    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type !== 'turn.completed' || !event.usage) continue;
      const usage = event.usage;
      if (![usage.input_tokens, usage.output_tokens].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error(`Missing/invalid usage values in ${filename}`);
      const cached = Number.isSafeInteger(usage.cached_input_tokens) ? usage.cached_input_tokens : 0;
      if (cached < 0 || cached > usage.input_tokens) throw new Error(`Invalid cached token count in ${filename}`);
      row.turns++;
      row.input += usage.input_tokens;
      row.cached += cached;
      row.uncached += usage.input_tokens - cached;
      row.output += usage.output_tokens;
      row.reasoning += Number.isSafeInteger(usage.reasoning_output_tokens) ? usage.reasoning_output_tokens : 0;
    }
    if (!row.turns) throw new Error(`No completed Codex turns with usage found in ${filename}`);
    rows.push(row);
  }
  console.table(rows);
  console.log('Input includes cached input. Reported reasoning tokens, when available, are a subset of output tokens.');
} catch (error) {
  console.error(`Usage summary failed: ${error.message}`);
  process.exitCode = 1;
}
