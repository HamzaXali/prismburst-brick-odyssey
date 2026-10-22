/*
 * TEST-ONLY. Playwright checks for the startup popup queue.
 * Not loaded by the game and not deployed.
 */
const fs = require('fs');
const { chromium, devices } = require('playwright-core');
const SHOTS = process.env.SHOTS_DIR || '/opt/cursor/artifacts';
fs.mkdirSync('shots', { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass });
  const extra = detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '';
  console.log((pass ? 'PASS ' : 'FAIL ') + name + extra);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const toPage = async (x, y) => page.evaluate(([x, y]) => {
    const r = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: r.left + x * r.width / 720, y: r.top + y * r.height / 1280 };
  }, [x, y]);
  const tap = async (x, y) => { const p = await toPage(x, y); await page.touchscreen.tap(p.x, p.y); await sleep(150); };
  const findUI = (scene, q) => page.evaluate(([scene, q]) => {
    const s = PB.game.scene.getScene(scene);
    if (!s) return null;
    let found = null;
    const walk = list => (list || []).forEach(o => {
      if (found) return;
      if (o.name === q || (o.label && o.label.text === q)) {
        const b = o.getBounds();
        found = { x: b.centerX, y: b.centerY };
        return;
      }
      if (o.list) walk(o.list);
    });
    walk(s.children.list);
    return found;
  }, [scene, q]);
  const tapUI = async (scene, q) => {
    const p = await findUI(scene, q);
    if (!p) throw new Error('UI not found: ' + scene + '/' + q);
    await tap(p.x, p.y);
  };
  const boot = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(500);
  };
  const hasText = wanted => page.evaluate(wanted => {
    const s = PB.game.scene.getScene('HomePop');
    if (!s) return false;
    let found = false;
    const walk = list => (list || []).forEach(o => {
      if (o.text === wanted) found = true;
      if (o.list) walk(o.list);
    });
    walk(s.children.list);
    return found;
  }, wanted);

  try {
    await boot();
    const first = await page.evaluate(() => __PB.scenes().slice());
    record('startup opens the menu and the first popup together', first.includes('Menu') && first.includes('HomePop'), first);
    record('the first popup is the daily bonus', await hasText('DAILY BONUS'));
    record('day 2 says 1 gem', await hasText('1 gem') && !(await hasText('1 gems')));
    const layout = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      const found = {};
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'bonusPanel' || /^dayCard[1-7]$/.test(o.name || '') || o.name === 'popupNote') found[o.name] = o;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      const box = o => ({ x: o.x - o.width / 2, y: o.y - o.height / 2, r: o.x + o.width / 2, b: o.y + o.height / 2, w: o.width, h: o.height, cx: o.x });
      const panel = box(found.bonusPanel);
      const cards = [1, 2, 3, 4, 5, 6, 7].map(day => box(found['dayCard' + day]));
      const note = found.popupNote;
      return { panel, cards, noteY: note.y, noteH: note.height };
    });
    const panel = layout.panel;
    const inside = layout.cards.every(c => c.x >= panel.x + 12 && c.r <= panel.r - 12 && c.y >= panel.y + 12 && c.b <= panel.b - 12);
    const leftGap = layout.cards[0].x - panel.x;
    const rightGap = panel.r - layout.cards[3].r;
    const row2Right = panel.r - layout.cards[6].r;
    const noteInside = layout.noteY + layout.noteH / 2 <= panel.b - 12 && layout.noteY - layout.noteH / 2 >= panel.y + 12;
    await page.screenshot({ path: 'shots/daily-bonus.png' });
    record('daily bonus cards and status text sit inside the panel',
      inside && Math.abs(leftGap - rightGap) < 2 && Math.abs(leftGap - row2Right) < 2 && layout.cards[6].w > layout.cards[0].w && noteInside,
      { leftGap, rightGap, row2Right, day7: layout.cards[6].w, day1: layout.cards[0].w, noteY: layout.noteY, panel });
    const beforePick = await page.evaluate(() => __PB.save().coins);
    await tapUI('HomePop', 'dayCard3');
    await sleep(200);
    const otherDay = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      let burst = false;
      let hot = false;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'bonusBurst') burst = true;
        if (o.name === 'dayHot') hot = true;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      return { note: s.noteText ? s.noteText.text : '', burst, hot, coins: PB.Save.data.coins };
    });
    record('tapping a later day card does not claim it',
      otherDay.note === 'Come back on Day 3' && otherDay.burst === false && otherDay.hot === true && otherDay.coins === beforePick,
      otherDay);
    await tapUI('HomePop', 'dayCard1');
    await sleep(250);
    const picked = await page.evaluate(before => {
      const s = PB.game.scene.getScene('HomePop');
      let card = null;
      let burst = null;
      let claimed = null;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'dayCard1') card = o;
        if (o.name === 'bonusBurst') burst = o;
        if (o.name === 'dayClaimed') claimed = o;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      return {
        note: s.noteText ? s.noteText.text : '',
        coins: PB.Save.data.coins - before,
        cardX: card ? card.x : null,
        burstX: burst ? burst.x : null,
        claimedX: claimed ? claimed.x : null,
        claimedText: claimed ? claimed.text : ''
      };
    }, beforePick);
    await page.screenshot({ path: SHOTS + '/lucky-box.png' });
    record('the tapped day card is the one that claims and shows the burst',
      picked.note.indexOf('Day 1') >= 0 && picked.coins === 20 && picked.claimedText === 'Claimed'
        && Math.abs(picked.burstX - picked.cardX) < 2 && Math.abs(picked.claimedX - picked.cardX) < 2,
      picked);
    const beforeDouble = await page.evaluate(() => __PB.save().coins);
    await tapUI('HomePop', 'claimDouble');
    await sleep(200);
    const note = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.noteText ? s.noteText.text : '';
    });
    const afterDouble = await page.evaluate(() => __PB.save().coins);
    record('2x Claim shows Coming soon and does not grant a reward', note === 'Coming soon' && afterDouble === beforeDouble, { note, beforeDouble, afterDouble });

    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    record('X advances to the tasks reminder', await hasText('DAILY TASKS'));
    record('unbuilt tasks are labelled as not in the game yet', await hasText('Not in the game yet') && await hasText('Finish 1 challenge level') && await hasText('Open a chest'));
    record('the first milestone says 1 task', await hasText('1 task · 15 gems'));
    const stubs = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      const found = {};
      const walk = list => (list || []).forEach(o => {
        if (o.name && (o.name.indexOf('stub-') === 0 || o.name.indexOf('taskBar-') === 0)) found[o.name] = o;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      return ['challenge', 'chest'].map(id => {
        const stub = found['stub-' + id];
        const bar = found['taskBar-' + id];
        return { id, stubBottom: stub.y + stub.height / 2, barTop: bar.y - bar.height / 2 };
      });
    });
    record('the not-in-game label sits above the progress bar', stubs.every(row => row.stubBottom < row.barTop - 4), stubs);
    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    record('X advances to the lucky wheel', await hasText('LUCKY WHEEL'));
    await tapUI('HomePop', 'popupClose');
    await sleep(300);
    const closed = await page.evaluate(() => __PB.scenes().slice());
    record('the queue finishes and the menu stays open', !closed.includes('HomePop') && closed.includes('Menu'), closed);
    const top = await page.evaluate(() => {
      const s = PB.game.scene.getScene('Menu');
      const boxes = {};
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'starBadge' || o.name === 'coinBadge' || o.name === 'gemBadge') {
          let label = '';
          const read = nodes => (nodes || []).forEach(n => {
            if (typeof n.text === 'string' && n.text !== '') label = n.text;
            if (n.list) read(n.list);
          });
          read(o.list);
          boxes[o.name] = { x: o.x - 90, y: o.y - 26, r: o.x + 90, bot: o.y + 26, visible: o.visible && o.alpha > 0, label };
        }
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      const save = __PB.save();
      return { boxes, coins: String(save.coins), gems: String((save.home && save.home.gems) || 0) };
    });
    const star = top.boxes.starBadge, coin = top.boxes.coinBadge, gem = top.boxes.gemBadge;
    const apart = (a, b) => a && b && (a.r <= b.x + 0.5 || b.r <= a.x + 0.5 || a.bot <= b.y + 0.5 || b.bot <= a.y + 0.5);
    record('Home shows the coin badge and the gem badge without overlap',
      !!(star && coin && gem && coin.visible && gem.visible && star.visible
        && coin.label === top.coins && gem.label === top.gems
        && apart(star, coin) && apart(coin, gem) && apart(star, gem)
        && coin.x >= 0 && gem.r <= 720 && coin.y >= 0 && coin.bot <= 140 && gem.bot <= 140),
      top.boxes);
    await tapUI('Menu', 'PLAY');
    await page.waitForFunction(() => __PB.scenes().includes('Worlds'), null, { timeout: 8000 });
    record('gameplay is reachable after the popups close', (await page.evaluate(() => __PB.scenes().includes('Worlds'))));

    await page.evaluate(() => {
      const now = Date.now();
      PB.Home.claimBonus(PB.Save.data, now);
      PB.Home.note(PB.Save.data, 'clears', 10, now);
      PB.Home.note(PB.Save.data, 'spins', 3, now);
      PB.Home.note(PB.Save.data, 'powerups', 3, now);
      PB.Save.data.home.wheel.used = 3;
      PB.Save.data.home.wheel.pending = [];
      PB.Save.persist();
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(400);
    const skipped = await page.evaluate(() => __PB.scenes().slice());
    record('an empty queue does not open a popup', skipped.includes('Menu') && !skipped.includes('HomePop'), skipped);

    await page.evaluate(() => localStorage.clear());
    await boot();
    const started = await page.evaluate(() => {
      const result = PB.Home.beginSpin(PB.Save.data, Date.now(), function () { return 0; });
      PB.Save.persist();
      return { id: result.spin && result.spin.id, segment: result.segment && result.segment.id, coins: PB.Save.data.coins, pending: PB.Save.data.home.wheel.pending.length };
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(400);
    const once = await page.evaluate(() => ({ coins: __PB.save().coins, pending: __PB.save().home.wheel.pending.length, gems: __PB.save().home.gems }));
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const twice = await page.evaluate(() => __PB.save().coins);
    record('refresh during a pending spin grants that reward once',
      started.segment === 'c25' && started.pending === 1 && started.coins === 0 && once.coins === 25 && once.pending === 0 && twice === 25,
      { started, once, twice });

    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => {
      PB.Home.mode = { type: 'one', items: ['wheel'], index: 0 };
      const menu = PB.game.scene.getScene('Menu');
      menu.scene.launch('HomePop');
      menu.scene.bringToTop('HomePop');
    });
    await sleep(300);
    const angleBefore = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.wheelGfx ? s.wheelGfx.angle : null;
    });
    await tapUI('HomePop', 'spinWheel');
    await sleep(200);
    const spinning = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      return { angle: s && s.wheelGfx ? s.wheelGfx.angle : null, pending: PB.Save.data.home.wheel.pending.length, spinning: !!(s && s.spinning) };
    });
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const afterSpin = await page.evaluate(() => ({ coins: __PB.save().coins, gems: __PB.save().home.gems, powers: __PB.save().home.powers, pending: __PB.save().home.wheel.pending.length }));
    const paid = afterSpin.coins > 0 || afterSpin.gems > 0 || afterSpin.powers.wide > 0 || afterSpin.powers.multi > 0;
    record('the wheel animates and a reload mid-spin grants the stored reward once',
      angleBefore === 0 && spinning.spinning === true && spinning.pending === 1 && spinning.angle !== 0 && paid && afterSpin.pending === 0,
      { angleBefore, spinning, afterSpin });

    const legacy = {
      v: 1, coins: 42, unlocked: [2, 0, 0, 0, 0], levels: { '0-0': { best: 15, stars: 2 } },
      owned: { ball: ['classic'], paddle: ['classic'] },
      equipped: { ball: 'classic', paddle: 'classic' },
      settings: { sound: true, vibration: true, shake: true },
      daily: { last: null, streak: 0 }, missions: { date: null, list: [] },
      stats: { bricks: 3, played: 1, cleared: 1 }, last: { world: 0, level: 0 }
    };
    await page.evaluate(raw => localStorage.setItem('prismburst.save.v1', raw), JSON.stringify(legacy));
    await page.reload();
    await page.waitForFunction(() => window.__PB && __PB.scenes().includes('Menu'), null, { timeout: 20000 });
    await sleep(300);
    const loaded = await page.evaluate(() => __PB.save());
    record('an old save keeps its coins and levels and gains home version 1',
      loaded.coins === 42 && loaded.levels['0-0'].stars === 2 && loaded.unlocked[0] === 2 && loaded.home && loaded.home.v === 1 && loaded.home.bonus.lastClaim === null,
      { coins: loaded.coins, stars: loaded.levels['0-0'] && loaded.levels['0-0'].stars, home: loaded.home && loaded.home.v });

    await page.evaluate(() => { PB.game.scene.stop('HomePop'); PB.game.scene.start('Menu'); });
    await sleep(400);
    await tapUI('Menu', 'Shop');
    await sleep(200);
    const soon = await page.evaluate(() => {
      let text = '';
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'shopTitle' && o.text) text = o.text;
        if (o.list) walk(o.list);
      });
      const pop = PB.game.scene.getScene('HomePop');
      if (pop) walk(pop.children.list);
      return text;
    });
    record('Shop opens the prism coin shop', soon === 'PRISM SHOP', soon);
    await page.evaluate(() => { PB.Save.track('clears', 2); PB.Save.track('powerups', 1); });
    const hooked = await page.evaluate(() => __PB.save().home.tasks.progress);
    record('clearing a level and using a power-up advance the live tasks', hooked.clears === 2 && hooked.powerups === 1, hooked);

    await page.evaluate(() => localStorage.clear());
    await boot();
    const dotBefore = await page.evaluate(() => {
      let found = false;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'dot-bonus') found = true;
        if (o.list) walk(o.list);
      });
      walk(PB.game.scene.getScene('Menu').children.list);
      return found;
    });
    await tapUI('HomePop', 'claimBonus');
    await sleep(300);
    const claimed = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      let btn = null;
      let note = null;
      let panel = null;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'claimBonus') btn = o;
        if (o.name === 'popupNote') note = o;
        if (o.name === 'bonusPanel') panel = o;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      const label = btn && btn.label;
      let dot = false;
      let footer = '';
      const walkMenu = list => (list || []).forEach(o => {
        if (o.name === 'dot-bonus') dot = true;
        if (o.name === 'versionFooter') footer = o.text;
        if (o.list) walkMenu(o.list);
      });
      walkMenu(PB.game.scene.getScene('Menu').children.list);
      return {
        text: label && label.text,
        localCenter: label ? label.x + label.width * (0.5 - label.originX) : 99,
        note: note && note.text,
        noteTop: note.y - note.height / 2,
        noteBottom: note.y + note.height / 2,
        panelTop: panel.y - panel.height / 2,
        panelBottom: panel.y + panel.height / 2,
        dot,
        footer
      };
    });
    record('Claimed is centred and the status line stays inside the panel',
      dotBefore === true && claimed.text === 'Claimed' && Math.abs(claimed.localCenter) < 2
        && claimed.note.indexOf('saved on this device') >= 0
        && claimed.noteTop >= claimed.panelTop + 12 && claimed.noteBottom <= claimed.panelBottom - 12
        && claimed.dot === false && claimed.footer.indexOf('v1.4.0') === 0,
      claimed);
    await tapUI('HomePop', 'popupClose');
    await sleep(200);
    const dotAfter = await page.evaluate(() => {
      let found = false;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'dot-bonus') found = true;
        if (o.list) walk(o.list);
      });
      walk(PB.game.scene.getScene('Menu').children.list);
      return found;
    });
    record('the bonus dot stays off after returning to Home', dotAfter === false);

    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => {
      PB.game.scene.stop('HomePop');
      PB.Home.mode = { type: 'one', items: ['wheel'], index: 0 };
      const menu = PB.game.scene.getScene('Menu');
      menu.scene.launch('HomePop');
      menu.scene.bringToTop('HomePop');
    });
    await sleep(300);
    record('the wheel offers one free spin', await hasText('1 free spin left today'));
    const beforeWheel = await page.evaluate(() => ({
      coins: PB.Save.data.coins, gems: PB.Save.data.home.gems,
      wide: PB.Save.data.home.powers.wide, multi: PB.Save.data.home.powers.multi
    }));
    await tapUI('HomePop', 'spinWheel');
    await page.waitForFunction(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.spinning === false && s.noteText && s.noteText.text;
    }, null, { timeout: 8000 });
    const landed = await page.evaluate(before => {
      const s = PB.game.scene.getScene('HomePop');
      const index = PB.Home.segmentAtPointer(s.wheelGfx.angle);
      const seg = PB.Home.SEGMENTS[index];
      const now = {
        coins: PB.Save.data.coins, gems: PB.Save.data.home.gems,
        wide: PB.Save.data.home.powers.wide, multi: PB.Save.data.home.powers.multi
      };
      const labels = [];
      (s.wheelGfx.list || []).forEach(o => {
        if (!o || !o.text || !o.getWorldTransformMatrix) return;
        const m = o.getWorldTransformMatrix();
        labels.push({ text: o.text, y: m.ty, x: m.tx });
      });
      labels.sort((a, b) => (a.y - b.y) || (Math.abs(a.x - s.wheelGfx.x) - Math.abs(b.x - s.wheelGfx.x)));
      const short = seg.kind === 'coins' ? String(seg.amount) : (seg.kind === 'gems' ? (seg.amount + (seg.amount === 1 ? ' gem' : ' gems')) : seg.label.split(' ')[0]);
      return {
        toast: s.noteText.text,
        label: seg.label,
        id: seg.id,
        top: labels[0] ? labels[0].text : '',
        short,
        used: PB.Save.data.home.wheel.used,
        pending: PB.Save.data.home.wheel.pending.length,
        coins: now.coins - before.coins,
        gems: now.gems - before.gems,
        wide: now.wide - before.wide,
        multi: now.multi - before.multi,
        expectCoins: seg.kind === 'coins' ? seg.amount : 0,
        expectGems: seg.kind === 'gems' ? seg.amount : 0,
        expectWide: seg.power === 'wide' ? seg.amount : 0,
        expectMulti: seg.power === 'multi' ? seg.amount : 0
      };
    }, beforeWheel);
    record('the wheel stops on the awarded segment and the toast matches the balance',
      landed.toast === landed.label && landed.top === landed.short && landed.used === 1 && landed.pending === 0
        && landed.coins === landed.expectCoins && landed.gems === landed.expectGems
        && landed.wide === landed.expectWide && landed.multi === landed.expectMulti,
      landed);

    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => {
      PB.game.scene.stop('HomePop');
      PB.Home.mode = { type: 'one', items: ['wheel'], index: 0 };
      const menu = PB.game.scene.getScene('Menu');
      menu.scene.launch('HomePop');
      menu.scene.bringToTop('HomePop');
    });
    await sleep(200);
    const doubleTap = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      let zone = null;
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'spinWheel') zone = o.zone;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      zone.emit('pointerup');
      zone.emit('pointerup');
      return { used: PB.Save.data.home.wheel.used, pending: PB.Save.data.home.wheel.pending.length };
    });
    await page.waitForFunction(() => {
      const s = PB.game.scene.getScene('HomePop');
      return s && s.spinning === false && s.noteText && s.noteText.text;
    }, null, { timeout: 8000 });
    const afterDoubleTap = await page.evaluate(() => ({
      used: PB.Save.data.home.wheel.used,
      pending: PB.Save.data.home.wheel.pending.length,
      toast: PB.game.scene.getScene('HomePop').noteText.text
    }));
    record('a double tap uses exactly one spin',
      doubleTap.used === 1 && doubleTap.pending === 1 && afterDoubleTap.used === 1 && afterDoubleTap.pending === 0 && afterDoubleTap.toast.length > 0,
      { doubleTap, afterDoubleTap });

    await page.evaluate(() => localStorage.clear());
    await boot();
    await page.evaluate(() => {
      PB.game.scene.stop('HomePop');
      PB.Home.mode = { type: 'one', items: ['achievements'], index: 0 };
      const menu = PB.game.scene.getScene('Menu');
      menu.scene.launch('HomePop');
      menu.scene.bringToTop('HomePop');
    });
    await sleep(400);
    const achPanel = await page.evaluate(() => {
      const s = PB.game.scene.getScene('HomePop');
      let title = '';
      let prog = '';
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'achievementsTitle') title = o.text;
        if (o.name === 'ach-prog-clear-10') prog = o.text;
        if (o.list) walk(o.list);
      });
      walk(s.children.list);
      return { title, prog };
    });
    await page.screenshot({ path: SHOTS + '/achievements-panel.png' });
    record('Home opens an achievements panel with locked progress', achPanel.title === 'ACHIEVEMENTS' && achPanel.prog === '0/10', achPanel);
    const toast = await page.evaluate(() => {
      PB.Save.recordResult(0, 0, 400, 1);
      const fresh = PB.Achievements.settle(PB.Save.data, { flawless: false, now: Date.now() });
      const again = PB.Achievements.settle(PB.Save.data, { now: Date.now() + 1 });
      PB.Save.persist();
      const scene = PB.game.scene.getScene('HomePop');
      scene.render();
      if (fresh[0]) PB.Achievements.showToast(scene, fresh[0].name);
      let text = '';
      const walk = list => (list || []).forEach(o => {
        if (o.name === 'achievementToast') text = o.text;
        if (o.list) walk(o.list);
      });
      walk(scene.children.list);
      return { fresh: fresh.map(row => row.name), again: again.length, text, coins: PB.Save.data.coins };
    });
    await sleep(200);
    await page.screenshot({ path: SHOTS + '/achievement-toast.png' });
    record('a new clear toasts once and a second settle does not toast again',
      toast.fresh.indexOf('First Clear') >= 0 && toast.again === 0 && toast.text === 'Achievement unlocked: First Clear' && toast.coins >= 15,
      toast);

    record('popup run has no page errors', errors.length === 0, errors.slice(0, 5));
  } catch (err) {
    record('home suite crashed', false, err && err.stack ? err.stack : String(err));
  }
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await browser.close();
  if (results.some(r => !r.pass)) process.exit(1);
})();
