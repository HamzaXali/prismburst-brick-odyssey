#!/usr/bin/env node
/* Pre-deploy check: every file referenced by index.html, sw.js and
 * manifest.webmanifest must exist with EXACT case (GitHub Pages is
 * case-sensitive), must be relative (works under /<repo>/), and nothing at
 * runtime may reference node_modules. Exit 1 on failure. */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const errors = [], refs = new Set();
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function existsExact(rel) { // walk each segment and compare names case-sensitively
  let dir = root;
  for (const seg of rel.split('/').filter(Boolean)) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    if (!fs.readdirSync(dir).includes(seg)) return false;
    dir = path.join(dir, seg);
  }
  return fs.existsSync(dir);
}
function add(ref, from) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('/')) { errors.push(`${from}: non-relative reference "${ref}"`); return; }
  let rel = ref.replace(/^\.\//, '').split(/[?#]/)[0];
  if (rel === '' ) rel = 'index.html';
  refs.add(rel + '  <- ' + from);
  if (!existsExact(rel)) errors.push(`${from}: "${ref}" does not exist with exact case`);
}
const html = read('index.html');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) add(m[1], 'index.html');
for (const m of html.matchAll(/register\('([^']+)'/g)) add(m[1], 'index.html (service worker)');
const sw = read('sw.js');
const list = sw.match(/ASSETS\s*=\s*\[([\s\S]*?)\]/)[1];
for (const m of list.matchAll(/'([^']+)'/g)) add(m[1], 'sw.js precache');
const man = JSON.parse(read('manifest.webmanifest'));
add(man.start_url, 'manifest start_url');
if (man.scope !== './') errors.push(`manifest scope should be "./" (is "${man.scope}")`);
man.icons.forEach(i => add(i.src, 'manifest icon'));
// every script loaded by index.html must also be precached for offline use
for (const m of html.matchAll(/<script src="([^"]+)"/g)) if (!list.includes(`'./${m[1]}'`)) errors.push(`sw.js precache is missing ${m[1]}`);
for (const f of ['index.html', 'sw.js', 'game.js', 'levels.js', 'js/core.js', 'js/menus.js', 'style.css', 'manifest.webmanifest'])
  if (/node_modules/.test(read(f))) errors.push(`${f} references node_modules`);
console.log([...refs].sort().join('\n'));
if (errors.length) { console.error('\nFAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`\nAll ${refs.size} references relative, present with exact case; no node_modules at runtime ✔`);
