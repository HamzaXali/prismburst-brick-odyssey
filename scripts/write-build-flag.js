#!/usr/bin/env node
/* Turn on the debug unlock flag in a copied build-flags.js.
 * Refuses to edit the source file. levelsOpen stays false until the player
 * flips the Settings toggle, and that toggle is not written into the save. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.resolve(root, 'js', 'build-flags.js');
const target = path.resolve(process.argv[2] || path.join(root, 'www', 'js', 'build-flags.js'));

if (target === source) {
  console.error('Refusing to rewrite the source build flag. Pass the www copy.');
  process.exit(1);
}

let text;
try {
  text = fs.readFileSync(target, 'utf8');
} catch (err) {
  console.error('Cannot read ' + target);
  process.exit(1);
}

if (!/debugUnlock:\s*false/.test(text)) {
  console.error('debugUnlock: false was not found in ' + target);
  process.exit(1);
}

text = text.replace(/debugUnlock:\s*false/, 'debugUnlock: true');
if (/levelsOpen:\s*true/.test(text)) {
  console.error('levelsOpen must stay off until the player toggles it');
  process.exit(1);
}

fs.writeFileSync(target, text);
console.log('Debug unlock flag enabled in ' + target);
