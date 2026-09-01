#!/usr/bin/env node
// ==========================================================================
// Wrapper that invokes Tauri CLI directly, bypassing pnpm arg-rewrite
// (which turns `--bundles msi,nsis` into `--bundles msi nsis`).
// Streams build output to a log file and prints the last lines on exit.
// ==========================================================================

const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

const args = ['build', '--bundles', 'msi,nsis'];
const logPath = path.join(root, '.audit-logs', 'openpaint-build-0.1.2.log');

const fs = require('node:fs');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const logStream = fs.createWriteStream(logPath, { flags: 'w' });

console.log(`[build] cwd = ${root}`);
console.log(`[build] cli = ${cli}`);
console.log(`[build] args = ${args.join(' ')}`);
console.log(`[build] log = ${logPath}`);

const child = spawn(process.execPath, [cli, ...args], {
  cwd: root,
  env: { ...process.env, RUST_LOG: 'info' },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

const tag = (s) => `[build ${new Date().toISOString()}] ${s}`;
child.stdout.on('data', (b) => {
  const s = b.toString('utf8');
  process.stdout.write(s);
  logStream.write(tag('STDOUT\n') + s + '\n');
});
child.stderr.on('data', (b) => {
  const s = b.toString('utf8');
  process.stderr.write(s);
  logStream.write(tag('STDERR\n') + s + '\n');
});
child.on('exit', (code, signal) => {
  const line = `[build ${new Date().toISOString()}] EXIT code=${code} signal=${signal ?? '-'}`;
  console.log(line);
  logStream.write(line + '\n');
  logStream.end();
  process.exit(code ?? 1);
});