/**
 * Duo Loop runs Claude Code in a terminal pane. To learn what a step really
 * cost, Claude is run with `--output-format stream-json --verbose` and piped
 * through this script, which prints the answer as plain text (what the pane
 * shows) and writes the run's usage as JSON to the file given as argument.
 * It exits 1 when Claude reported an error, so the step still fails.
 *
 * Run with Vulgr's own Electron as Node (ELECTRON_RUN_AS_NODE=1), so no
 * separate Node install is needed.
 */
import { writeFileSync } from 'node:fs';
import { claudeStreamJsonParser } from '../adapters/outputParsers.js';

const usageFile = process.argv[2];
const parser = claudeStreamJsonParser();
let raw = '';
let failed = false;

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  raw += chunk;
  if (/"is_error"\s*:\s*true/.test(chunk)) failed = true;
  const text = parser.push(chunk);
  if (text) process.stdout.write(text);
});
process.stdin.on('end', () => {
  const { stdout, usage } = parser.finish(raw, '');
  // Nothing streamed (old CLI, or an error before any event): show what came back.
  if (!/"type"\s*:\s*"assistant"/.test(raw) && stdout) process.stdout.write(stdout);
  process.stdout.write('\n');
  if (usageFile && usage) {
    try {
      writeFileSync(usageFile, JSON.stringify(usage), 'utf-8');
    } catch {
      // The usage is a bonus; the answer already reached the pane.
    }
  }
  process.exit(failed ? 1 : 0);
});
