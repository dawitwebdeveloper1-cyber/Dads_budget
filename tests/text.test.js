// Catches garbled characters (like "â€¦" where "…" should be) that appear
// when a file is saved with the wrong text encoding.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = new Set(['.js', '.mjs', '.html', '.css', '.json', '.webmanifest', '.md']);

function files(dir) {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    if (name === '.git' || name === 'node_modules') return [];
    const full = join(ROOT, dir, name);
    if (statSync(full).isDirectory()) return files(join(dir, name));
    return CHECK.has(extname(name)) ? [full] : [];
  });
}

// "â€" / "Ã" / "ðŸ" are what UTF-8 text looks like when read the wrong way;
// U+0080–U+009F are invisible control characters that never belong in text.
const GARBLED = /â€|Ã[\u0080-¿]|ðŸ|Â[ -¿]|[\u0080-\u009f]|�/;

test('no garbled characters in any app file', () => {
  const self = fileURLToPath(import.meta.url);
  for (const file of files('.').filter((f) => f !== self)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      assert.ok(!GARBLED.test(line), `${relative(ROOT, file)}:${i + 1} has garbled text: ${line.trim().slice(0, 80)}`);
    });
  }
});
