// Turns the failing tests in a `node --test` output into GitHub error annotations.
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) process.exit(0);
const lines = readFileSync(file, 'utf-8').split('\n');
const blocks = [];
lines.forEach((line, i) => {
  if (/^\s*not ok \d+/.test(line)) blocks.push(lines.slice(i, i + 30).join('\n'));
});
// Workflow commands encode newlines as %0A.
const encode = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
for (const block of blocks.slice(0, 8)) {
  const title = block.split('\n')[0].trim().slice(0, 120);
  console.log(`::error title=${encode(title)}::${encode(block.slice(0, 3500))}`);
}
if (!blocks.length) console.log(`::error title=Tests failed::${encode(lines.slice(-60).join('\n'))}`);
