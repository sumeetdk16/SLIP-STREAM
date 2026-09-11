#!/usr/bin/env node
/**
 * Slipstream — packages extension/ into a Chrome Web Store upload.
 * Runs the integrity check first: an unloadable zip is worse than no zip.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'extension');
const dist = path.join(root, 'dist');

execFileSync(process.execPath, [path.join(root, 'scripts/check.js')], { stdio: 'inherit' });

const { version } = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `slipstream-${version}.zip`);
fs.rmSync(out, { force: true });

execFileSync('zip', ['-r', '-q', '-X', out, '.', '-x', '.*', '-x', '__MACOSX/*'], { cwd: ext });

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`\n  Packaged ${path.relative(root, out)} (${kb} KB)`);
