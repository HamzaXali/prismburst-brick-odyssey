#!/usr/bin/env node
/* Fail if a shipped file contains a secret key or a JWT whose payload
 * role is the privileged secret role. Documentation may name that role;
 * the files copied to GitHub Pages may not. The official supabase-js
 * bundle mentions the publishable/secret key prefixes as a format check;
 * a real key is the prefix plus token characters, and that still fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ROOT_FILES = [
  'index.html', 'style.css', 'game.js', 'levels.js', 'sw.js',
  'manifest.webmanifest', 'config.js', 'privacy.html', 'privacy-policy.html', 'delete-account.html', '.nojekyll'
];
const DIRS = ['js', 'lib', 'icons'];
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g;
const SECRET_KEY_RE = /sb_secret_[A-Za-z0-9]{8,}/;
const FORBIDDEN_WORD = 'service' + '_role';

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

function shippedFiles() {
  const out = [];
  for (const rel of ROOT_FILES) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push(abs);
  }
  for (const dir of DIRS) walk(path.join(root, dir), out);
  return out;
}

function isShipped(rel) {
  const norm = rel.split(path.sep).join('/');
  if (ROOT_FILES.includes(norm)) return true;
  return DIRS.some(function (dir) { return norm === dir || norm.startsWith(dir + '/'); });
}

function decodePayload(token) {
  const body = token.split('.')[1];
  const pad = body + '='.repeat((4 - (body.length % 4)) % 4);
  const json = Buffer.from(pad.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

function scanText(rel, text) {
  const problems = [];
  if (text.includes(FORBIDDEN_WORD)) problems.push(rel + ': contains the secret-role name');
  if (SECRET_KEY_RE.test(text)) problems.push(rel + ': contains a secret API key');
  if (/BEGIN [A-Z ]*PRIVATE KEY/.test(text) || /"private_key"\s*:/.test(text)) {
    problems.push(rel + ': contains a private key / service-account material');
  }
  if (/"type"\s*:\s*"service_account"/.test(text)) {
    problems.push(rel + ': contains a Google service-account JSON');
  }
  JWT_RE.lastIndex = 0;
  let match;
  while ((match = JWT_RE.exec(text))) {
    try {
      const payload = decodePayload(match[0]);
      const role = payload && payload.role;
      const blob = JSON.stringify(payload);
      if (role === FORBIDDEN_WORD || (blob && blob.includes(FORBIDDEN_WORD))) {
        problems.push(rel + ': contains a JWT for the secret role');
      }
    } catch (e) { /* not a JSON payload */ }
  }
  return problems;
}

function scanShipped() {
  const problems = [];
  for (const abs of shippedFiles()) {
    const rel = path.relative(root, abs);
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
    scanText(rel.split(path.sep).join('/'), text).forEach(function (p) { problems.push(p); });
  }
  return problems;
}

function main() {
  const problems = scanShipped();
  if (problems.length) {
    console.error('Secret scan failed:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('No secret-role JWT or secret API key in shipped files ✔');
}

if (require.main === module) main();

module.exports = { scanText, scanShipped, isShipped, shippedFiles, FORBIDDEN_WORD };
