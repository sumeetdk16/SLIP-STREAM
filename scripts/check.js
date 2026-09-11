#!/usr/bin/env node
/**
 * Slipstream — pre-load integrity check.
 *
 * Chrome reports a bad manifest as a single opaque "could not load" dialog, so
 * this catches the usual causes first: missing files, permissions that do not
 * cover the content-script matches, and syntax errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'extension');

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

/* ------------------------------------------------------------- manifest */

const manifestPath = path.join(ext, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`version "${manifest.version}" is not x.y.z`);
if ((manifest.description || '').length > 132) {
  fail(`description is ${manifest.description.length} chars; the Web Store caps it at 132`);
}
if ((manifest.name || '').length > 75) fail('name exceeds the 75-char Web Store limit');

/* ---------------------------------------------------- referenced files */

const referenced = new Set();
const ref = (p) => p && referenced.add(p);

Object.values(manifest.icons || {}).forEach(ref);
Object.values(manifest.action?.default_icon || {}).forEach(ref);
ref(manifest.action?.default_popup);
ref(manifest.options_ui?.page);
ref(manifest.background?.service_worker);
(manifest.content_scripts || []).forEach((cs) => {
  (cs.js || []).forEach(ref);
  (cs.css || []).forEach(ref);
});

for (const rel of referenced) {
  if (!fs.existsSync(path.join(ext, rel))) fail(`manifest references a missing file: ${rel}`);
}

/* ------------------------------------------------------- host coverage */

const hostPermissions = manifest.host_permissions || [];
const matches = (manifest.content_scripts || []).flatMap((cs) => cs.matches || []);

/** A match is covered when some host permission shares its origin. */
const originOf = (pattern) => pattern.replace(/^(https?:\/\/[^/]+).*/, '$1');
for (const m of matches) {
  const covered = hostPermissions.some((h) => originOf(h) === originOf(m));
  if (!covered) fail(`content script matches ${m} with no matching host permission`);
}

if (!hostPermissions.some((h) => h.includes('api.groq.com'))) {
  fail('host_permissions is missing https://api.groq.com/* — Groq calls will be blocked');
}

/* ------------------------------------------- platform registry coverage */

const registrySource = fs.readFileSync(path.join(ext, 'src/shared/platforms.js'), 'utf8');
const scope = { SLIPSTREAM_PLATFORM_LIST: [] };
new Function('self', registrySource)(scope);

for (const platform of scope.SLIPSTREAM_PLATFORM_LIST) {
  for (const host of platform.hosts) {
    const covered = matches.some((m) => m.includes(host));
    if (!covered) {
      fail(`platform "${platform.id}" claims ${host}, but no content script matches it`);
    }
    const permitted = hostPermissions.some((h) => h.includes(host));
    if (!permitted) fail(`platform "${platform.id}" claims ${host} with no host permission`);
  }
}
notes.push(`${scope.SLIPSTREAM_PLATFORM_LIST.length} platforms wired end to end`);

/* -------------------------------------------------------- syntax sweep */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(path.join(ext, 'src'));
const jsFiles = files.filter((f) => f.endsWith('.js'));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`syntax error in ${path.relative(ext, file)}: ${String(err.stderr).split('\n')[1] || ''}`);
  }
}
notes.push(`${jsFiles.length} scripts parse cleanly`);

/* --------------------------------------------------- html asset checks */

for (const file of files.filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const asset of assets) {
    if (/^(https?:)?\/\//.test(asset)) continue;
    const resolved = path.resolve(path.dirname(file), asset);
    if (!fs.existsSync(resolved)) {
      fail(`${path.relative(ext, file)} references a missing asset: ${asset}`);
    }
  }
  if (/\son\w+=/.test(html)) {
    fail(`${path.relative(ext, file)} has an inline event handler; MV3's CSP blocks those`);
  }
}

/* ------------------------------------------------------------- report */

for (const note of notes) console.log(`  ${note}`);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} found:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\n  Extension is loadable.');
