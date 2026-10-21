#!/usr/bin/env node
/* Unit tests for level silhouettes, the coin shop, continue prices,
 * and cloud save of doubled clears. No browser and no network. */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../levels.js');
const shop = require('../js/shop');
const sync = require('../js/save-sync');

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail && !pass ? ' — ' + detail : ''));
}

function data(coins, extra) {
  const save = {
    v: 1, coins: coins, unlocked: [1, 0, 0, 0, 0], levels: {},
    owned: { ball: ['classic'], paddle: ['classic'] },
    equipped: { ball: 'classic', paddle: 'classic' },
    settings: { sound: true, vibration: true, shake: true },
    daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
    stats: { bricks: 0, played: 0, cleared: 0 }, last: null, home: null
  };
  if (extra) Object.keys(extra).forEach(function (k) { save[k] = extra[k]; });
  return save;
}

try {
  const sigs = new Map();
  for (let w = 0; w < L.worldCount(); w++) {
    for (let l = 0; l < L.LEVELS_PER_WORLD; l++) {
      const lv = L.getLevel(w, l);
      const sig = L.shapeSignature(lv.grid);
      if (!sigs.has(sig)) sigs.set(sig, []);
      sigs.get(sig).push(lv.id);
    }
  }
  const dupes = [...sigs.values()].filter(ids => ids.length > 1);
  record('every level has a distinct silhouette, including mirrors and shifts', L.worldCount() === 5 && L.LEVELS_PER_WORLD === 20 && sigs.size === 100 && dupes.length === 0, dupes.map(ids => ids.join(' ')).join('; '));

  const poor = data(10);
  const missed = shop.buyLook(poor, 'ion-wake');
  record('a look purchase with too few coins changes nothing', missed.ok === false && missed.reason === 'coins' && poor.coins === 10 && shop.ensure(poor).owned.length === 0);

  const buyer = data(80);
  const bought = shop.buyLook(buyer, 'ion-wake');
  const again = shop.buyLook(buyer, 'ion-wake');
  record('buying a look once spends the price and a second buy does not', bought.ok === true && buyer.coins === 0 && again.ok === false && again.reason === 'owned' && buyer.coins === 0);

  const equip = shop.equip(buyer, 'ion-wake');
  const equipped = shop.equipped(buyer);
  record('equipping a bought trail stores it on the save', equip.ok === true && equipped.trail && equipped.trail.id === 'ion-wake');
  record('equipping a look that was not bought fails', shop.equip(buyer, 'halo-rail').ok === false && shop.equipped(buyer).paddle === null);

  const boosts = data(40);
  const life = shop.buyBoost(boosts, 'life', 'life0001');
  record('an extra life boost is queued and the balance stays non-negative', life.ok === true && boosts.coins === 0 && boosts.shop.boosts.life.length === 1);
  const broke = shop.buyBoost(boosts, 'slow', 'slow0001');
  record('a second boost without coins is refused', broke.ok === false && broke.reason === 'coins' && boosts.coins === 0 && boosts.shop.boosts.slow.length === 0);

  const taken = shop.takeNext(boosts);
  const takenAgain = shop.takeNext(boosts);
  record('a queued boost is consumed once', taken.used === true && taken.life === 1 && takenAgain.used === false && boosts.shop.boosts.life.length === 0 && boosts.shop.spent.indexOf('life0001') >= 0);

  const cont = data(40);
  const first = shop.payContinue(cont, 0);
  const second = shop.payContinue(cont, 1);
  record('continue spends 40 then refuses 80 without going negative', first.ok === true && first.price === 40 && cont.coins === 0 && second.ok === false && second.reason === 'coins' && cont.coins === 0);
  record('a fourth continue is not offered', shop.continuePrice(3) === 0 && shop.payContinue(data(1000), 3).ok === false);

  const local = data(100, {
    levels: { '0-0': { best: 20, stars: 1 } },
    shop: shop.normalize({ owned: ['ion-wake'], trail: 'ion-wake', paddle: null, boosts: { life: ['aaaaaa01'], wide: [], multi: [], slow: [] }, spent: [] })
  });
  const remote = data(30, {
    levels: { '0-0': { best: 50, stars: 2, doubled: true } },
    shop: shop.normalize({ owned: ['flare-wing'], trail: null, paddle: 'flare-wing', boosts: { life: ['bbbbbb02'], wide: [], multi: [], slow: [] }, spent: ['aaaaaa01'] })
  });
  const merged = sync.mergeProgress(local, remote, '2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', { worlds: 5, perWorld: 20 });
  record('merge keeps the newer coins and does not add them', merged.save.coins === 100);
  record('merge unions shop looks and drops a boost the other device already spent',
    merged.save.shop.owned.indexOf('ion-wake') >= 0 && merged.save.shop.owned.indexOf('flare-wing') >= 0
    && merged.save.shop.boosts.life.indexOf('bbbbbb02') >= 0 && merged.save.shop.boosts.life.indexOf('aaaaaa01') < 0
    && merged.save.shop.spent.indexOf('aaaaaa01') >= 0 && merged.save.shop.trail === 'ion-wake' && merged.save.shop.paddle === 'flare-wing');
  record('merge keeps a doubled clear from either side', merged.save.levels['0-0'].doubled === true && merged.save.levels['0-0'].best === 50 && merged.save.levels['0-0'].stars === 2);

  const plain = data(42, { levels: { '0-0': { best: 15, stars: 2 } } });
  delete plain.shop;
  const oldCloud = sync.toCloudData(plain, '2026-10-01T00:00:00.000Z');
  delete oldCloud.shop;
  const accepted = sync.validateCloudData(oldCloud, { worlds: 5, perWorld: 20 });
  record('an old cloud save without shop or doubled still loads',
    accepted.ok === true && accepted.save.coins === 42 && accepted.save.levels['0-0'].stars === 2 && !('doubled' in accepted.save.levels['0-0']) && accepted.save.shop.owned.length === 0,
    accepted.ok ? '' : accepted.error);

  const doubledCloud = sync.toCloudData(data(5, { levels: { '0-1': { best: 9, stars: 1, doubled: true } } }), '2026-10-02T00:00:00.000Z');
  const doubledOk = sync.validateCloudData(doubledCloud, { worlds: 5, perWorld: 20 });
  record('a doubled flag on a level record is accepted', doubledOk.ok === true && doubledOk.save.levels['0-1'].doubled === true);
  const badDouble = sync.toCloudData(data(5, { levels: { '0-1': { best: 9, stars: 1, doubled: false } } }), '2026-10-02T00:00:00.000Z');
  record('doubled: false is rejected so old records stay unchanged', sync.validateCloudData(badDouble, { worlds: 5, perWorld: 20 }).ok === false);

  const ads = fs.readFileSync(path.join(__dirname, '../js/ads.js'), 'utf8');
  record('the ads module exposes a provider and does not build HTML from text',
    ads.includes('showRewarded') && ads.includes('DemoAdProvider') && ads.includes('textContent') && !ads.includes('innerHTML'));
  record('three demo caption scripts are shipped', (ads.match(/at: 0, text:/g) || []).length === 3);
} catch (err) {
  record('lives unit suite crashed', false, err.stack);
}

const passed = results.filter(r => r.pass).length;
console.log('\n' + passed + '/' + results.length + ' passed');
if (passed !== results.length) process.exit(1);
