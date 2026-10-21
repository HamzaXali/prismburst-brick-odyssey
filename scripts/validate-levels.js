#!/usr/bin/env node
/* Validates every level in levels.js. Exit code 1 on any failure.
 * Checks: grid shape & legend, >=1 breakable brick, every breakable brick is
 * reachable from open space (independent flood fill, steel = wall), moving rows
 * contain only moving bricks, objectives achievable, no duplicate levels. */
'use strict';
const L = require('../levels.js');
const VALID = new Set(['.', ...Object.keys(L.BRICK_INFO)]);
const errors = [], seen = new Map(), shapes = new Map();
let total = 0, counts = { clear: 0, score: 0, time: 0, targets: 0 }, patterns = new Set();

function reachable(grid) { // BFS from the open row below the formation (4-neighbour)
  const R = grid.length, C = L.COLS, vis = Array.from({ length: R + 1 }, () => Array(C).fill(false));
  const q = [];
  for (let c = 0; c < C; c++) { vis[R][c] = true; q.push([R, c]); }
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > R || nc < 0 || nc >= C || vis[nr][nc]) continue;
      if (nr < R && grid[nr][nc] === 'S') continue;
      vis[nr][nc] = true; q.push([nr, nc]);
    }
  }
  return vis;
}

for (let w = 0; w < L.worldCount(); w++) {
  for (let l = 0; l < L.LEVELS_PER_WORLD; l++) {
    const lv = L.getLevel(w, l), id = `W${w + 1}-L${l + 1} "${lv.name}"`, g = lv.grid;
    total++; counts[lv.objective.type]++; patterns.add(lv.pattern);
    const err = (m) => errors.push(`${id}: ${m}`);
    if (!g.length || g.length > L.MAX_ROWS) err(`row count ${g.length} out of range`);
    g.forEach((row, r) => {
      if (row.length !== L.COLS) err(`row ${r} has width ${row.length}`);
      for (const ch of row) if (!VALID.has(ch)) err(`row ${r} has invalid char '${ch}'`);
      if (/[MN]/.test(row) && /[^MN.]/.test(row)) err(`row ${r} mixes moving bricks with static bricks`);
    });
    let breakable = 0, targets = 0, minScore = 0, totalHp = 0;
    const vis = reachable(g);
    g.forEach((row, r) => [...row].forEach((ch, c) => {
      const info = L.BRICK_INFO[ch]; if (!info || info.type === 'steel') return;
      breakable++; totalHp += info.hp; if (info.type === 'target') targets++;
      minScore += info.hp * L.PTS_HIT + info.hp * L.PTS_BREAK; // score with x1 multiplier
      if (!vis[r][c]) err(`breakable brick at row ${r}, col ${c} is sealed off by steel`);
    }));
    if (breakable < 1) err('no breakable bricks');
    // dead-end pockets: non-steel cell enclosed on 3+ sides by steel / side walls
    let steel = 0;
    g.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === 'S') { steel++; return; }
      const blocked = (rr, cc) => cc < 0 || cc >= L.COLS ? true : (rr < 0 || rr >= g.length ? false : g[rr][cc] === 'S');
      const n = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => blocked(rr, cc)).length;
      if (n >= 3) err(`cell row ${r}, col ${c} is a dead-end pocket (${n} blocked sides)`);
    }));
    if (steel > (breakable + steel) * 0.35) err(`too much steel (${steel} of ${breakable + steel})`);
    const o = lv.objective;
    if (o.type === 'score' && !(o.target > 0 && o.target <= minScore * 0.9)) err(`score target ${o.target} not <= 90% of min clear score ${minScore}`);
    if (o.type === 'time' && !(o.time >= 100 + totalHp * 3.5)) err(`time limit ${o.time}s not generous for ${totalHp} HP`);
    if (o.type === 'targets' && targets < 1) err('targets objective with no target cores');
    if (lv.star3 > minScore * 1.6) err('3-star score unrealistically high');
    const key = JSON.stringify([g, o.type]);
    if (seen.has(key)) err(`identical to ${seen.get(key)}`); else seen.set(key, id);
    const shape = L.shapeSignature(g);
    if (shapes.has(shape)) err(`near-duplicate silhouette of ${shapes.get(shape)} (shift or mirror)`);
    else shapes.set(shape, id);
  }
}
if (L.worldCount() !== 5 || L.LEVELS_PER_WORLD !== 20) errors.push(`expected 5 worlds x 20 levels, got ${L.worldCount()} x ${L.LEVELS_PER_WORLD}`);

const Dense = require('../js/dense.js');
const denseAudit = Dense.auditAll();
console.log('Crystal Mass solvability:');
denseAudit.rows.forEach(function (row) {
  console.log('  L' + (row.index + 1) + ' ' + row.name + ' steel=' + row.steel + ' mouths=' + row.mouths + ' reached=' + row.reached + '/' + row.breakable + ' bot=' + (Math.round(row.pct * 1000) / 10) + '% steps=' + row.steps + ' ms=' + row.ms);
});
denseAudit.errors.forEach(function (msg) { errors.push('Crystal Mass: ' + msg); });

console.log(`Checked ${total} levels in ${L.worldCount()} worlds.`);
console.log(`Objectives: ${JSON.stringify(counts)}; layout patterns used: ${patterns.size}`);
if (errors.length) { console.error(`FAILED (${errors.length} problems):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log('All levels valid ✔');
