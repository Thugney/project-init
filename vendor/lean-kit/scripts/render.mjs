#!/usr/bin/env node
// Codex Lean Kit: deterministic, dependency-free Markdown / structured-data renderer.
import { readFile, writeFile, mkdir, rename, rm, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MAX_INPUT_BYTES = 1_048_576;
const htmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const digest = (s) => createHash('sha256').update(s).digest('hex');
const requiredText = (x, where, max = 200) => {
  if (typeof x !== 'string' || !x.trim() || x.length > max) throw new Error(`Invalid ${where}: expected non-empty text up to ${max} characters`);
  return x;
};
const requiredId = (x, where) => {
  requiredText(x, where, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(x)) throw new Error(`Invalid ${where}: use letters, numbers, '.', '_', '-', ':'`);
  return x;
};
const list = (x, where, max) => {
  if (!Array.isArray(x) || x.length > max) throw new Error(`Invalid ${where}: expected an array with at most ${max} entries`);
  return x;
};
const checkOptionalText = (x, where, max = 400) => {
  if (x !== undefined && x !== null && (typeof x !== 'string' || x.length > max)) throw new Error(`Invalid ${where}: expected text up to ${max} characters`);
};

function validateBoard(data) {
  requiredText(data.title, 'title');
  requiredId(data.boardId, 'boardId');
  list(data.columns, 'columns', 12);
  if (!data.columns.length) throw new Error('A board needs at least one column');
  list(data.tickets, 'tickets', 500);
  const columns = new Set();
  const ids = new Set();
  for (const col of data.columns) {
    if (!col || typeof col !== 'object') throw new Error('Invalid column');
    requiredId(col.id, 'column.id');
    requiredText(col.title, 'column.title');
    if (columns.has(col.id)) throw new Error(`Duplicate column: ${col.id}`);
    columns.add(col.id);
  }
  for (const ticket of data.tickets) {
    if (!ticket || typeof ticket !== 'object') throw new Error('Invalid ticket');
    requiredId(ticket.id, 'ticket.id');
    requiredText(ticket.title, 'ticket.title', 300);
    if (!columns.has(ticket.column)) throw new Error(`Unknown column '${ticket.column}' for ${ticket.id}`);
    if (ids.has(ticket.id)) throw new Error(`Duplicate ticket: ${ticket.id}`);
    for (const key of ['owner', 'notes', 'priority']) checkOptionalText(ticket[key], `ticket.${key}`, 2000);
    ids.add(ticket.id);
  }
}

function validateDiagram(data) {
  requiredText(data.title, 'title');
  list(data.nodes, 'nodes', 30);
  list(data.edges, 'edges', 70);
  if (!data.nodes.length) throw new Error('A diagram needs at least one node');
  const ids = new Set();
  for (const node of data.nodes) {
    if (!node || typeof node !== 'object') throw new Error('Invalid node');
    requiredId(node.id, 'node.id');
    requiredText(node.label, 'node.label', 100);
    if (!Number.isInteger(node.layer) || node.layer < 0 || node.layer > 10) throw new Error(`Invalid layer for ${node.id}: integer 0..10 required`);
    if (ids.has(node.id)) throw new Error(`Duplicate node: ${node.id}`);
    ids.add(node.id);
  }
  for (const edge of data.edges) {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to)) throw new Error('An edge references an unknown node');
    if (edge.from === edge.to) throw new Error('Self-edges are not supported');
  }
}

function safeHref(url) {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(value)) return value;
  if (!/^[a-z][\w+.-]*:/i.test(value) && !value.startsWith('\\') && !value.startsWith('//')) return value;
  return null;
}
function inlineMarkdown(input) {
  const slots = [];
  const withoutCode = String(input).replace(/`([^`]+)`/g, (_, code) => {
    const slot = slots.push(`<code>${htmlEscape(code)}</code>`) - 1;
    return `\u0001${slot}\u0002`;
  });
  return htmlEscape(withoutCode)
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, href) => {
      const safe = safeHref(href.replace(/&amp;/g, '&'));
      return safe ? `<a href="${htmlEscape(safe)}" rel="noopener noreferrer">${label}</a>` : label;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\u0001(\d+)\u0002/g, (_, index) => slots[Number(index)]);
}
const isTableSep = (s) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let currentList = null;
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (currentList) out.push(`</${currentList}>`);
    currentList = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      flushParagraph(); flushList();
      const language = line.trim().slice(3).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      const code = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code${language ? ` class="language-${language}"` : ''}>${htmlEscape(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph(); flushList();
      out.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushParagraph(); flushList(); out.push('<hr>'); continue; }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushParagraph(); flushList();
      const headings = cells(line);
      out.push('<div class="table-scroll"><table><thead><tr>' + headings.map((h) => `<th>${inlineMarkdown(h)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      for (; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) {
        const row = cells(lines[i]);
        out.push('<tr>' + headings.map((_, j) => `<td>${inlineMarkdown(row[j] || '')}</td>`).join('') + '</tr>');
      }
      out.push('</tbody></table></div>');
      i--;
      continue;
    }
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      const kind = ordered ? 'ol' : 'ul';
      if (currentList !== kind) { flushList(); out.push(`<${kind}>`); currentList = kind; }
      const body = (ordered || unordered)[1];
      const task = body.match(/^\[([ xX])\]\s+(.+)$/);
      out.push(task
        ? `<li class="task"><input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}>${inlineMarkdown(task[2])}</li>`
        : `<li>${inlineMarkdown(body)}</li>`);
      continue;
    }
    if (line.startsWith('> ')) { flushParagraph(); flushList(); out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue; }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList();
  return out.join('\n');
}

function renderDiagram(data) {
  const groups = new Map();
  for (const n of data.nodes) {
    if (!groups.has(n.layer)) groups.set(n.layer, []);
    groups.get(n.layer).push(n);
  }
  const layers = [...groups.keys()].sort((a, b) => a - b);
  const points = new Map();
  const w = 218, h = 86, colGap = 95, rowGap = 50;
  for (const [col, layer] of layers.entries()) {
    const nodes = groups.get(layer);
    for (let row = 0; row < nodes.length; row++) {
      points.set(nodes[row].id, { x: 35 + col * (w + colGap), y: 80 + row * (h + rowGap), layer });
    }
  }
  const width = Math.max(600, 70 + layers.length * (w + colGap) - colGap);
  const height = Math.max(265, ...[...points.values()].map((p) => p.y + h + 32));
  const svg = [`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${htmlEscape(data.title)}">`,
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L7 3 z" class="diagram-arrow"/></marker></defs>'];
  for (const edge of data.edges) {
    const a = points.get(edge.from), b = points.get(edge.to);
    const forward = b.x > a.x;
    const startX = forward ? a.x + w : a.x + w / 2;
    const startY = forward ? a.y + h / 2 : a.y + h;
    const endX = forward ? b.x : b.x + w / 2;
    const endY = forward ? b.y + h / 2 : b.y;
    const curve = forward ? `M ${startX} ${startY} C ${startX + 45} ${startY}, ${endX - 45} ${endY}, ${endX} ${endY}` : `M ${startX} ${startY} L ${endX} ${endY}`;
    svg.push(`<path d="${curve}" class="diagram-edge" marker-end="url(#arrow)"/>`);
  }
  for (const layer of layers) {
    const first = points.get(groups.get(layer)[0].id);
    svg.push(`<text x="${first.x}" y="44" class="diagram-layer">LAYER ${layer + 1}</text>`);
  }
  for (const node of data.nodes) {
    const p = points.get(node.id);
    const words = node.label.split(/\s+/);
    const lines = [];
    for (const word of words) {
      const last = lines.length - 1;
      if (last >= 0 && `${lines[last]} ${word}`.length <= 23) lines[last] += ` ${word}`;
      else lines.push(word);
    }
    if (lines.length > 3 || lines.some((line) => line.length > 26)) throw new Error(`Diagram node label too long for layout: ${node.id}`);
    svg.push(`<rect class="diagram-node" x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="12"/>`);
    const top = p.y + h / 2 - (lines.length - 1) * 9;
    svg.push(`<text x="${p.x + w / 2}" y="${top}" class="diagram-label" text-anchor="middle">${lines.map((line, i) => `<tspan x="${p.x + w / 2}" dy="${i ? 20 : 0}">${htmlEscape(line)}</tspan>`).join('')}</text>`);
  }
  svg.push('</svg>');
  return `<div class="diagram-wrap">${svg.join('\n')}</div>`;
}
function page(title, body, css, scripts = '') {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="codex-lean-kit/1.0"><title>${htmlEscape(title)}</title><style>${css}</style></head>\n<body><main><div class="eyebrow">Codex Lean Kit</div>${body}<div class="footer">Generated from a concise source file. Edit the source, not this HTML.</div></main>${scripts}</body></html>\n`;
}
function argsFrom(argv) {
  if (!argv.length || argv.includes('--help')) {
    console.log('Usage: node scripts/render.mjs <source.md|source.json> --out <target.html> [--audit <audit.jsonl>]');
    process.exit(argv.includes('--help') ? 0 : 1);
  }
  const options = { input: argv[0] };
  for (let i = 1; i < argv.length; i += 2) {
    if (!['--out', '--audit'].includes(argv[i]) || !argv[i + 1]) throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    if (options[key]) throw new Error(`Repeated --${key}`);
    options[key] = argv[i + 1];
  }
  if (!options.out) throw new Error('--out is required');
  return options;
}

async function main() {
  let resultMessage;
  const options = argsFrom(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.out);
  const auditPath = path.resolve(options.audit || '.codex-lean-kit/audit.jsonl');
  if (inputPath === outputPath || outputPath === auditPath || inputPath === auditPath) throw new Error('Input, output and audit paths must be distinct');
  const record = { event: 'render', inputPath, outputPath, status: 'failed' };
  try {
    const info = await stat(inputPath);
    if (!info.isFile() || info.size > MAX_INPUT_BYTES) throw new Error(`Input must be a file of at most ${MAX_INPUT_BYTES} bytes`);
    const source = await readFile(inputPath, 'utf8');
    record.inputSha256 = digest(source);
    const css = await readFile(path.join(ROOT, 'assets/base.css'), 'utf8');
    let result;
    if (path.extname(inputPath).toLowerCase() === '.md') {
      record.kind = 'markdown';
      const title = source.match(/^#\s+(.+)$/m)?.[1] || path.basename(inputPath, '.md');
      result = page(title, `<article class="sheet">${renderMarkdown(source)}</article>`, css);
    } else if (path.extname(inputPath).toLowerCase() === '.json') {
      const data = JSON.parse(source);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Source JSON must be an object');
      record.kind = data.kind;
      if (data.kind === 'board') {
        validateBoard(data);
        const js = await readFile(path.join(ROOT, 'assets/board.js'), 'utf8');
        const encoded = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
        result = page(data.title,
          `<h1>${htmlEscape(data.title)}</h1><div class="toolbar"><p>Move tickets by drag-and-drop or with their dropdowns.</p><button id="export-board" class="button" type="button">Export JSON</button></div><div id="summary" class="summary" aria-live="polite"></div><div id="board" class="board" data-source-hash="${record.inputSha256}"></div><p class="hint">Local edits stay in this browser when storage is available; use Export JSON to save them.</p>`,
          css, `<script id="board-data" type="application/json">${encoded}</script><script>${js}</script>`);
      } else if (data.kind === 'diagram') {
        validateDiagram(data);
        result = page(data.title, `<h1>${htmlEscape(data.title)}</h1>${renderDiagram(data)}`, css);
      } else throw new Error(`Unknown kind '${data.kind}'; choose board or diagram`);
    } else throw new Error('Supported sources: .md and .json');
    record.outputSha256 = digest(result);
    let previous = null;
    try { previous = await readFile(outputPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const changed = previous !== result;
    if (changed) {
      await mkdir(path.dirname(outputPath), { recursive: true });
      const temp = `${outputPath}.${process.pid}.tmp`;
      try { await writeFile(temp, result, { encoding: 'utf8', flag: 'wx' }); await rename(temp, outputPath); }
      finally { await rm(temp, { force: true }); }
    }
    record.changed = changed;
    record.status = 'ok';
    resultMessage = `${record.kind}: ${changed ? 'rendered' : 'unchanged'} -> ${outputPath}`;
  } catch (error) {
    record.error = error.message;
    throw error;
  } finally {
    record.at = new Date().toISOString();
    await mkdir(path.dirname(auditPath), { recursive: true });
    await appendFile(auditPath, JSON.stringify(record) + '\n', 'utf8');
  }
  console.log(resultMessage);
}
main().catch((error) => { console.error(`Render failed: ${error.message}`); process.exitCode = 1; });
