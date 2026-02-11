#!/usr/bin/env node
/**
 * Debug script: log env + anchor build output for hypothesis check.
 * Writes NDJSON to .cursor/debug.log (run from project root).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(process.cwd(), '.cursor', 'debug.log');
const ts = () => Date.now();

function append(entry) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}

// #region agent log
append({
  id: `log_${ts()}_pre`,
  timestamp: ts(),
  location: 'scripts/debug-anchor-build.js',
  message: 'pre-build env',
  data: {
    PATH_first300: (process.env.PATH || '').slice(0, 300),
    CARGO: process.env.CARGO || 'unset',
    RUSTC: process.env.RUSTC || 'unset',
    RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || 'unset',
    whichCargo: (() => { try { return execSync('which cargo', { encoding: 'utf8' }).trim(); } catch (e) { return e.message; } })(),
    cargoVersion: (() => { try { return execSync('cargo --version', { encoding: 'utf8' }).trim(); } catch (e) { return e.message; } })(),
  },
  sessionId: 'debug-session',
  runId: 'run1',
  hypothesisId: 'H1,H3',
});
// #endregion

let buildOutput = '';
try {
  buildOutput = execSync('anchor build 2>&1', { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
} catch (e) {
  buildOutput = (e.stdout || '') + (e.stderr || '') + (e.message || '');
}

// #region agent log
append({
  id: `log_${ts()}_build`,
  timestamp: ts(),
  location: 'scripts/debug-anchor-build.js',
  message: 'anchor build output',
  data: { outputLast60Lines: buildOutput.split('\n').slice(-60).join('\n') },
  sessionId: 'debug-session',
  runId: 'run1',
  hypothesisId: 'H2,H4,H5',
});
// #endregion

console.log('Debug log written to .cursor/debug.log');
console.log(buildOutput.slice(-1500));
