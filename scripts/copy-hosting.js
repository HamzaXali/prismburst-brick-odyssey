#!/usr/bin/env node
/* Copy the auth bridge and the public legal pages into hosting/ for
 * Firebase Hosting. The game, tests, and Android project stay out.
 * Spark plan static hosting only — no Cloud Functions. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const FILES = [
  'auth-bridge.html',
  'privacy-policy.html',
  'privacy.html',
  'delete-account.html',
  'config.js',
  'js/firebase-config.js',
  'js/delete-core.js',
  'js/delete-page.js',
  'lib/firebase-app-compat.js',
  'lib/firebase-auth-compat.js',
  'lib/firebase-firestore-compat.js'
];

function copyFile(rel, destRoot) {
  const from = path.join(root, rel);
  const to = path.join(destRoot, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyHosting(destRoot) {
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destRoot, { recursive: true });
  FILES.forEach(function (rel) { copyFile(rel, destRoot); });
  return destRoot;
}

if (require.main === module) {
  const dest = copyHosting(path.join(root, 'hosting'));
  process.stdout.write('Copied the auth bridge and legal pages to ' + dest + '\n');
}

module.exports = {
  FILES: FILES,
  copyHosting: copyHosting
};
