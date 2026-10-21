/*
 * PRISMBURST — shop.js
 * Prism coin shop: next-level boosts and original prism looks.
 * No network and no DOM. The save key stays prismburst.save.v1.
 * Shop state is save.shop. Old saves omit it and keep their coins.
 *
 * Prices, against current income (a first clear pays 35–45 coins,
 * the Rewards daily starts at 50, missions pay 50–80):
 *   Slow ball 25 — whole next level at 72% speed, cheaper than one clear.
 *   Wide paddle 35 — about one 1-star first clear.
 *   Extra life 40 — +1 life on the next level only, just above a clear.
 *   Multi-ball 55 — three balls at the start, the strongest boost.
 * Looks are cosmetics only: trails 80 / 120 / 180 (a few clears),
 * paddles 160 / 220 / 300 (still under the Rewards skins, which start at 150).
 * Continue prices on Out of Lives are 40, then 80, then 160, three times
 * per level attempt. Each one restores a single life on the same bricks.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.window === root) {
    root.PB = root.PB || {};
    root.PB.Shop = api;
    root.PB.SHOP_LOOKS = api.LOOKS;
    root.PB.SHOP_BOOSTS = api.BOOSTS;
    if (root.PB.Save) api.attach(root.PB);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var plain = null;
  if (typeof require === 'function') {
    try { plain = require('./save-plain.js'); } catch (e) { plain = null; }
  }
  function plainApi() {
    if (plain) return plain;
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return g.PB && g.PB.SavePlain || null;
  }

  var LOOKS = [
    { id: 'ion-wake', kind: 'trail', name: 'Ion Wake', price: 80, color: 0x22e8ff },
    { id: 'rose-ribbon', kind: 'trail', name: 'Rose Ribbon', price: 120, color: 0xff3df0 },
    { id: 'solar-flare', kind: 'trail', name: 'Solar Flare', price: 180, color: 0xffd166 },
    { id: 'quartz-keel', kind: 'paddle', name: 'Quartz Keel', price: 160, color: 0x7af0ff, edge: 0xffffff },
    { id: 'flare-wing', kind: 'paddle', name: 'Flare Wing', price: 220, color: 0xff3df0, edge: 0xffd166 },
    { id: 'halo-rail', kind: 'paddle', name: 'Halo Rail', price: 300, color: 0xffd166, edge: 0x22e8ff }
  ];
  var BOOSTS = [
    { id: 'life', name: 'Extra life', price: 40 },
    { id: 'wide', name: 'Wide paddle', price: 35 },
    { id: 'multi', name: 'Multi-ball', price: 55 },
    { id: 'slow', name: 'Slow ball', price: 25 }
  ];
  var BOOST_IDS = ['life', 'wide', 'multi', 'slow'];
  var CONTINUE_PRICES = [40, 80, 160];
  var MAX_PENDING = 8;
  var MAX_SPENT = 80;
  var ID_RE = /^[a-z0-9]{6,20}$/;

  function lookById(id) {
    for (var i = 0; i < LOOKS.length; i++) if (LOOKS[i].id === id) return LOOKS[i];
    return null;
  }

  function boostById(id) {
    for (var i = 0; i < BOOSTS.length; i++) if (BOOSTS[i].id === id) return BOOSTS[i];
    return null;
  }

  function defaultShop() {
    return {
      owned: [],
      trail: null,
      paddle: null,
      boosts: { life: [], wide: [], multi: [], slow: [] },
      spent: []
    };
  }

  function normalize(raw) {
    var base = defaultShop();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    var seen = {};
    var owned = Array.isArray(raw.owned) ? raw.owned : [];
    for (var i = 0; i < owned.length && base.owned.length < LOOKS.length; i++) {
      if (!lookById(owned[i]) || seen[owned[i]]) continue;
      seen[owned[i]] = true;
      base.owned.push(owned[i]);
    }
    if (raw.trail && seen[raw.trail] && lookById(raw.trail).kind === 'trail') base.trail = raw.trail;
    if (raw.paddle && seen[raw.paddle] && lookById(raw.paddle).kind === 'paddle') base.paddle = raw.paddle;
    var spentSeen = {};
    var spentIn = Array.isArray(raw.spent) ? raw.spent : [];
    for (var s = 0; s < spentIn.length && base.spent.length < MAX_SPENT; s++) {
      if (typeof spentIn[s] !== 'string' || !ID_RE.test(spentIn[s]) || spentSeen[spentIn[s]]) continue;
      spentSeen[spentIn[s]] = true;
      base.spent.push(spentIn[s]);
    }
    var boosts = raw.boosts || {};
    for (var b = 0; b < BOOST_IDS.length; b++) {
      var key = BOOST_IDS[b];
      var list = Array.isArray(boosts[key]) ? boosts[key] : [];
      var local = {};
      for (var j = 0; j < list.length && base.boosts[key].length < MAX_PENDING; j++) {
        var bid = list[j];
        if (typeof bid !== 'string' || !ID_RE.test(bid) || local[bid] || spentSeen[bid]) continue;
        local[bid] = true;
        base.boosts[key].push(bid);
      }
    }
    var api = plainApi();
    if (api) {
      var kept = api.absorb(base, raw, 0);
      if (!kept.ok) return defaultShop();
    }
    return base;
  }

  function validate(raw) {
    if (raw == null) return { ok: true, shop: defaultShop() };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'shop is invalid' };
    var api = plainApi();
    if (api) {
      var checked = api.copyValue(raw, 0);
      if (!checked.ok) return { ok: false, error: checked.error };
      raw = checked.value;
    }
    if (!Array.isArray(raw.owned) || raw.owned.length > LOOKS.length) return { ok: false, error: 'shop looks are invalid' };
    var seen = {};
    for (var o = 0; o < raw.owned.length; o++) {
      if (!lookById(raw.owned[o]) || seen[raw.owned[o]]) return { ok: false, error: 'shop looks are invalid' };
      seen[raw.owned[o]] = true;
    }
    if (!(raw.trail === null || (seen[raw.trail] && lookById(raw.trail).kind === 'trail'))) return { ok: false, error: 'equipped trail is invalid' };
    if (!(raw.paddle === null || (seen[raw.paddle] && lookById(raw.paddle).kind === 'paddle'))) return { ok: false, error: 'equipped paddle is invalid' };
    if (!raw.boosts || typeof raw.boosts !== 'object' || Array.isArray(raw.boosts)) return { ok: false, error: 'boosts are invalid' };
    var pending = {};
    for (var b = 0; b < BOOST_IDS.length; b++) {
      var list = raw.boosts[BOOST_IDS[b]];
      if (!Array.isArray(list) || list.length > MAX_PENDING) return { ok: false, error: 'boosts are invalid' };
      for (var j = 0; j < list.length; j++) {
        if (typeof list[j] !== 'string' || !ID_RE.test(list[j]) || pending[list[j]]) return { ok: false, error: 'boosts are invalid' };
        pending[list[j]] = true;
      }
    }
    if (!Array.isArray(raw.spent) || raw.spent.length > MAX_SPENT) return { ok: false, error: 'spent boosts are invalid' };
    var spent = {};
    for (var s = 0; s < raw.spent.length; s++) {
      if (typeof raw.spent[s] !== 'string' || !ID_RE.test(raw.spent[s]) || spent[raw.spent[s]] || pending[raw.spent[s]]) return { ok: false, error: 'spent boosts are invalid' };
      spent[raw.spent[s]] = true;
    }
    return { ok: true, shop: normalize(raw) };
  }

  function merge(localShop, remoteShop, localWins) {
    var local = normalize(localShop);
    var remote = normalize(remoteShop);
    var state = localWins ? local : remote;
    var ownedSeen = {};
    var owned = [];
    local.owned.concat(remote.owned).forEach(function (id) {
      if (ownedSeen[id] || !lookById(id)) return;
      ownedSeen[id] = true;
      owned.push(id);
    });
    function keep(id, kind) {
      if (!id || !ownedSeen[id]) return null;
      var look = lookById(id);
      return look && look.kind === kind ? id : null;
    }
    var trail = keep(state.trail, 'trail') || keep(local.trail, 'trail') || keep(remote.trail, 'trail');
    var paddle = keep(state.paddle, 'paddle') || keep(local.paddle, 'paddle') || keep(remote.paddle, 'paddle');
    var spentSeen = {};
    var spent = [];
    local.spent.concat(remote.spent).forEach(function (id) {
      if (spentSeen[id] || spent.length >= MAX_SPENT) return;
      spentSeen[id] = true;
      spent.push(id);
    });
    var boosts = { life: [], wide: [], multi: [], slow: [] };
    BOOST_IDS.forEach(function (key) {
      var seenId = {};
      local.boosts[key].concat(remote.boosts[key]).forEach(function (id) {
        if (seenId[id] || spentSeen[id] || boosts[key].length >= MAX_PENDING) return;
        seenId[id] = true;
        boosts[key].push(id);
      });
    });
    return { owned: owned, trail: trail, paddle: paddle, boosts: boosts, spent: spent };
  }

  function hasProgress(shop) {
    var s = normalize(shop);
    if (s.owned.length || s.spent.length) return true;
    for (var i = 0; i < BOOST_IDS.length; i++) if (s.boosts[BOOST_IDS[i]].length) return true;
    return false;
  }

  function ensure(data) {
    data.shop = normalize(data.shop);
    return data.shop;
  }

  function spend(data, n) {
    n = n | 0;
    if (n <= 0) return false;
    var have = data.coins | 0;
    if (have < n) return false;
    data.coins = have - n;
    return true;
  }

  function buyLook(data, id) {
    var shop = ensure(data);
    var look = lookById(id);
    if (!look) return { ok: false, reason: 'unknown', coins: data.coins | 0 };
    if (shop.owned.indexOf(id) >= 0) return { ok: false, reason: 'owned', coins: data.coins | 0 };
    if (!spend(data, look.price)) return { ok: false, reason: 'coins', coins: data.coins | 0 };
    shop.owned.push(id);
    return { ok: true, coins: data.coins | 0 };
  }

  function equip(data, id) {
    var shop = ensure(data);
    var look = lookById(id);
    if (!look || shop.owned.indexOf(id) < 0) return { ok: false, reason: 'owned' };
    if (look.kind === 'trail') shop.trail = id;
    else shop.paddle = id;
    return { ok: true };
  }

  function equipped(data) {
    var shop = data && data.shop ? normalize(data.shop) : defaultShop();
    return {
      trail: shop.trail ? lookById(shop.trail) : null,
      paddle: shop.paddle ? lookById(shop.paddle) : null
    };
  }

  function receiptId(rand, now) {
    var s = (now || Date.now()).toString(36);
    var roll = typeof rand === 'function' ? rand() : Math.random();
    var r = Math.floor(roll * 1e9).toString(36);
    var id = (s + r).replace(/[^a-z0-9]/g, '').slice(0, 20);
    while (id.length < 6) id += '0';
    return id;
  }

  function buyBoost(data, id, receipt) {
    var shop = ensure(data);
    var boost = boostById(id);
    if (!boost) return { ok: false, reason: 'unknown', coins: data.coins | 0 };
    if (shop.boosts[id].length >= MAX_PENDING) return { ok: false, reason: 'full', coins: data.coins | 0 };
    var rid = receipt || receiptId();
    if (typeof rid !== 'string' || !ID_RE.test(rid)) return { ok: false, reason: 'unknown', coins: data.coins | 0 };
    if (shop.spent.indexOf(rid) >= 0) return { ok: false, reason: 'unknown', coins: data.coins | 0 };
    for (var i = 0; i < BOOST_IDS.length; i++) {
      if (shop.boosts[BOOST_IDS[i]].indexOf(rid) >= 0) return { ok: false, reason: 'unknown', coins: data.coins | 0 };
    }
    if (!spend(data, boost.price)) return { ok: false, reason: 'coins', coins: data.coins | 0 };
    shop.boosts[id].push(rid);
    return { ok: true, id: rid, coins: data.coins | 0 };
  }

  function takeNext(data) {
    var shop = ensure(data);
    var out = { life: 0, wide: false, multi: false, slow: false, used: false };
    for (var i = 0; i < BOOST_IDS.length; i++) {
      var key = BOOST_IDS[i];
      if (!shop.boosts[key].length) continue;
      var id = shop.boosts[key].shift();
      if (shop.spent.length >= MAX_SPENT) shop.spent.shift();
      shop.spent.push(id);
      out.used = true;
      if (key === 'life') out.life = 1;
      else out[key] = true;
    }
    return out;
  }

  function continuePrice(used) {
    used = used | 0;
    if (used < 0 || used >= CONTINUE_PRICES.length) return 0;
    return CONTINUE_PRICES[used];
  }

  function payContinue(data, used) {
    var price = continuePrice(used);
    var coins = data.coins | 0;
    if (!price) return { ok: false, reason: 'limit', price: 0, coins: coins };
    if (!spend(data, price)) return { ok: false, reason: 'coins', price: price, coins: data.coins | 0 };
    return { ok: true, price: price, coins: data.coins | 0 };
  }

  function attach(PB) {
    var Save = PB.Save;
    if (!Save || Save._shopAttached) return;
    Save._shopAttached = true;
    var origLoad = Save.load;
    Save.load = function () {
      var data = origLoad.apply(this, arguments);
      ensure(data);
      return data;
    };
    if (Save.data) ensure(Save.data);
  }

  return {
    LOOKS: LOOKS,
    BOOSTS: BOOSTS,
    CONTINUE_PRICES: CONTINUE_PRICES,
    defaultShop: defaultShop,
    normalize: normalize,
    validate: validate,
    merge: merge,
    hasProgress: hasProgress,
    ensure: ensure,
    spend: spend,
    buyLook: buyLook,
    equip: equip,
    equipped: equipped,
    buyBoost: buyBoost,
    takeNext: takeNext,
    continuePrice: continuePrice,
    payContinue: payContinue,
    receiptId: receiptId,
    attach: attach
  };
});
