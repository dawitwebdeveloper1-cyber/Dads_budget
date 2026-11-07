// Makes sure every file the app needs is in the offline list in sw.js,
// so nothing is missing when the phone has no internet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function filesIn(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const full = join(ROOT, dir, name);
    return statSync(full).isDirectory() ? filesIn(join(dir, name)) : [relative(ROOT, full).split('\\').join('/')];
  });
}

const swSource = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const listed = [...swSource.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

test('every app file is saved for offline use', () => {
  const needed = [...filesIn('js'), ...filesIn('css'), 'index.html', 'manifest.webmanifest'];
  for (const file of needed) assert.ok(listed.includes(file), `${file} is missing from sw.js`);
});

test('every file in the offline list exists', () => {
  for (const file of listed) assert.ok(existsSync(join(ROOT, file)), `${file} is listed in sw.js but doesn't exist`);
});

test('icons from index.html and the manifest are in the offline list', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const icons = [...html.matchAll(/href="(icons\/[^"]+)"/g)].map((m) => m[1]).concat(manifest.icons.map((i) => i.src));
  for (const icon of icons) assert.ok(listed.includes(icon), `${icon} is missing from sw.js`);
});
