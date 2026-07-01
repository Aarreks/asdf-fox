#!/usr/bin/env node
/*
 * Build an OPTIONAL local coverage-only overlay from a downloaded public
 * passphrase list, such as initstring/passphrase-wordlist's passphrases.txt.
 * It deliberately does not fetch during npm install or app startup, and the
 * app does not ship/re-distribute that 20M-line release.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const defaults = {
  output: path.join(root, 'data', 'passphrase-entity-overlay.local.json'),
  limit: 100_000
};

function usage() {
  console.error('Usage: node scripts/import-passphrase-entities.mjs --input /path/to/passphrases.txt [--output data/passphrase-entity-overlay.local.json] [--limit 100000]');
}

function normalize(raw) {
  return raw
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase('en-US');
}

const args = process.argv.slice(2);
let input = null;
let output = defaults.output;
let limit = defaults.limit;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--input') input = args[++i];
  else if (args[i] === '--output') output = path.resolve(args[++i]);
  else if (args[i] === '--limit') limit = Number(args[++i]);
  else {
    usage();
    process.exit(2);
  }
}
if (!input || !Number.isInteger(limit) || limit < 1) {
  usage();
  process.exit(2);
}

const wordfreq = JSON.parse(fs.readFileSync(path.join(root, 'data', 'wordfreq-en-2021.json'), 'utf8'));
const existing = new Set(wordfreq.entries);
const result = [];
const seen = new Set();
const reader = readline.createInterface({ input: fs.createReadStream(input, { encoding: 'utf8' }), crlfDelay: Infinity });

for await (const line of reader) {
  const token = normalize(line.trim());
  if (token.length < 3 || token.length > 32 || seen.has(token) || existing.has(token)) continue;
  seen.add(token);
  result.push(token);
  if (result.length >= limit) break;
}

const payload = {
  schemaVersion: 1,
  purpose: 'Locally generated coverage-only supplement. Entry order is source order, not a frequency estimate.',
  source: path.basename(input),
  sourceHint: 'Use a public passphrase/entity corpus that you are allowed to process locally. The demo documentation gives initstring/passphrase-wordlist as one candidate.',
  entryCount: result.length,
  entries: result
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${result.length.toLocaleString()} coverage-only tokens to ${output}`);
