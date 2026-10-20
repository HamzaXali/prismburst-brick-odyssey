#!/usr/bin/env node
/* Copy the shipped game into www/ for Capacitor. The allowlist matches the
 * GitHub Pages deploy. tests, scripts, supabase, docs, node_modules, and
 * .github stay out. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const INCLUDE_FILES = [
  'index.html',
  'style.css',
  'game.js',
  'levels.js',
  'sw.js',
  'manifest.webmanifest',
  'config.js',
  'privacy.html',
  '.nojekyll'
];
const INCLUDE_DIRS = ['js', 'lib', 'icons'];

function copyFile(rel, destRoot) {
  const from = path.join(root, rel);
  const to = path.join(destRoot, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(rel, destRoot) {
  const abs = path.join(root, rel);
  for (const name of fs.readdirSync(abs)) {
    const child = path.join(rel, name);
    const childAbs = path.join(root, child);
    if (fs.statSync(childAbs).isDirectory()) copyDir(child, destRoot);
    else copyFile(child, destRoot);
  }
}

function copyWeb(destRoot) {
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destRoot, { recursive: true });
  INCLUDE_FILES.forEach(function (rel) { copyFile(rel, destRoot); });
  INCLUDE_DIRS.forEach(function (rel) { copyDir(rel, destRoot); });
  return destRoot;
}

if (require.main === module) {
  const dest = copyWeb(path.join(root, 'www'));
  process.stdout.write('Copied the game to ' + dest + '\n');
}

module.exports = {
  INCLUDE_FILES: INCLUDE_FILES,
  INCLUDE_DIRS: INCLUDE_DIRS,
  copyWeb: copyWeb
};
