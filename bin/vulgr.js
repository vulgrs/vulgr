#!/usr/bin/env node
// Starts the Vulgr desktop app with the Electron that npm installed alongside it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import electron from 'electron';

const main = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'electron', 'main.js');
const child = spawn(electron, [main, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
