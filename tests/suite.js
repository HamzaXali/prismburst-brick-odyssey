const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const URL = process.env.PB_URL || 'http://127.0.0.1:8090/index.html';
const SHOTS = (process.env.SHOTS_DIR || 'shots') + '/';
const results = [];
function record(name, pass, detail) { results.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const cdp = await ctx.newCDPSession(page);

  const toPage = async (x, y) => page.evaluate(([x, y]) => { const r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.left + x * r.width / 720, y: r.top + y * r.height / 1280 }; }, [x, y]);
  const tap = async (x, y) => { const p = await toPage(x, y); await page.touchscreen.tap(p.x, p.y); await sleep(120); };
  const scenes = () => page.evaluate(() => __PB.scenes());
  const state = () => page.evaluate(() => __PB.state());
  const waitScene = (k, t = 6000) => page.waitForFunction(k => __PB.scenes().includes(k), k, { timeout: t });
  // find a UI element (by container name or label text) in a scene and return its centre in game coords
  const findUI = (scene, q) => page.evaluate(([scene, q]) => {
    const s = PB.game.scene.getScene(scene); let found = null;
    const walk = list => list.forEach(o => {
      if (found) return;
      if (o.name === q || (o.label && o.label.text === q)) { const b = o.getBounds(); found = { x: b.centerX, y: b.centerY }; return; }
      if (o.list) walk(o.list);
    });
    walk(s.children.list); return found;
  }, [scene, q]);
  const tapUI = async (scene, q) => { const p = await findUI(scene, q); if (!p) throw new Error('UI not found: ' + scene + '/' + q); await tap(p.x, p.y); };
  const dismissPopups = async () => {
    for (let i = 0; i < 5; i++) {
      const open = await page.evaluate(() => __PB.scenes().includes('HomePop'));
      if (!open) return;
      await tapUI('HomePop', 'popupClose');
      await sleep(250);
    }
  };
  const touch = async (type, x, y) => { const tp = type === 'touchEnd' ? [] : [Object.assign(await toPage(x, y), { id: 1 })]; await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: tp }); };

  try {
    // ---------------------------------------------------------- 1. launch
    await page.goto(URL);
    await waitScene('Menu', 15000); await sleep(800);
    await dismissPopups();
    const info = await page.evaluate(() => ({ phaser: Phaser.VERSION, renderer: PB.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas', vp: document.querySelector('meta[name=viewport]').content }));
    record('Game launches to main menu', true, info);
    await page.screenshot({ path: SHOTS + '01-main-menu.png' });

    // ---------------------------------------------------------- 2. layout
    const lay = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, sh: document.scrollingElement.scrollHeight, ih: innerHeight, ta: getComputedStyle(document.body).touchAction, ob: getComputedStyle(document.body).overscrollBehaviorY }));
    record('No horizontal scroll / no overflow', lay.sw <= lay.iw && lay.sh <= lay.ih, lay);
    record('Zoom & gesture guards (viewport user-scalable=no, touch-action:none)', /user-scalable=no/.test(info.vp) && lay.ta === 'none' && lay.ob === 'none', { touchAction: lay.ta, overscroll: lay.ob });

    // ---------------------------------------------------------- 3. navigation by taps
    await tapUI('Menu', 'PLAY'); await waitScene('Worlds'); await sleep(400);
    await page.screenshot({ path: SHOTS + '02-world-select.png' });
    // tap a locked world -> stays
    await tap(360, 230 + 2 * 202 + 80); await sleep(400);
    const stillWorlds = (await scenes()).includes('Worlds');
    await tap(360, 230 + 80); await waitScene('Levels'); await sleep(500);
    await page.screenshot({ path: SHOTS + '03-level-select.png' });
    // tap locked level 2 -> stays on Levels
    await tap(360 - 80, 320); await sleep(400);
    const stillLevels = (await scenes()).includes('Levels') && !(await scenes()).includes('Game');
    await tap(360 - 240, 320); await waitScene('Game'); await sleep(600);
    const s0 = await state();
    record('Menu → World → Level → Gameplay via taps (locked world/level ignored)', s0 && s0.world === 0 && s0.level === 0 && stillWorlds && stillLevels, { stillWorlds, stillLevels, world: s0.world, level: s0.level });

    // ---------------------------------------------------------- 4. touch drag + tap launch
    await sleep(1800);
    await touch('touchStart', 360, 1180);
    for (let i = 0; i <= 10; i++) { await touch('touchMove', 360 - i * 25, 1180); await sleep(30); }
    await sleep(300);
    const sDrag = await state();
    record('Touch drag moves paddle', Math.abs(sDrag.paddle.x - 110) < 20 && sDrag.balls[0].attached, { paddleX: Math.round(sDrag.paddle.x), expected: 110, ballAttached: sDrag.balls[0].attached });
    await touch('touchEnd');
    await sleep(300);
    const sL = await state();
    record('Releasing the touch (tap) launches the ball', sL.started && !sL.balls[0].attached && sL.balls[0].vy < 0, { started: sL.started, vy: Math.round(sL.balls[0].vy) });

    // ---------------------------------------------------------- 5. collisions / scoring (bot plays briefly)
    await page.evaluate(() => __PB.bot(true, 2));
    await page.waitForFunction(() => __PB.state().counters.paddleHits >= 2 && __PB.state().counters.destroyed >= 3, null, { timeout: 30000 }).catch(() => {});
    const sC = await state();
    record('Ball/paddle collision (ball bounces up off paddle)', sC.counters.paddleHits >= 2 && sC.lives === 3, { paddleHits: sC.counters.paddleHits, lives: sC.lives });
    record('Bricks break and score updates', sC.counters.destroyed >= 3 && sC.score > 0 && sC.left < 46, { destroyed: sC.counters.destroyed, score: sC.score, left: sC.left });
    const hudScore = await page.evaluate(() => __PB.game().scoreText.text);
    record('HUD score text reflects score', hudScore !== '0', { hud: hudScore });
    // speed sanity: all balls at configured speed
    const sp = await page.evaluate(() => { const g = __PB.game(); return g.balls.filter(b => b.active && !b.attached).map(b => Math.hypot(b.vx, b.vy) / g.speed); });
    record('Ball speed is constant-clamped', sp.every(r => Math.abs(r - 1) < 0.01), sp.map(r => r.toFixed(3)));
    await page.evaluate(() => __PB.bot(false, 1));

    // ---------------------------------------------------------- 6. power-ups (each one through a real falling capsule)
    await page.evaluate(() => __PB.start(1, 19)); await waitScene('Game'); await sleep(2500);
    // laser first, ball still attached so only lasers can score
    await page.evaluate(() => { const g = __PB.game(); g.paddle.tx = 360; });
    await sleep(500);
    await page.evaluate(() => __PB.drop('laser'));
    await page.waitForFunction(() => __PB.state().timers.laser > 0, null, { timeout: 4000 }).catch(() => {});
    await sleep(1500);
    const sLa = await state();
    record('Power-up: LASER (capsule caught, paddle fires, bricks damaged)', sLa.timers.laser > 0 && sLa.counters.laserHits > 0 && sLa.balls[0].attached, { timer: +sLa.timers.laser.toFixed(1), laserHits: sLa.counters.laserHits, score: sLa.score });
    await page.screenshot({ path: SHOTS + '04-gameplay-laser.png' });
    await page.evaluate(() => __PB.drop('wide'));
    await page.waitForFunction(() => __PB.state().timers.wide > 0, null, { timeout: 4000 }).catch(() => {});
    await sleep(700);
    const sW = await state();
    record('Power-up: WIDE paddle', sW.timers.wide > 0 && sW.paddle.w > 200, { w: Math.round(sW.paddle.w) });
    await page.evaluate(() => __PB.drop('multi'));
    await page.waitForFunction(() => __PB.state().balls.length >= 3, null, { timeout: 4000 }).catch(() => {});
    const sM = await state();
    record('Power-up: MULTI-BALL', sM.balls.length >= 3 && sM.balls.every(b => !b.attached), { balls: sM.balls.length });
    await page.evaluate(() => __PB.bot(true, 1));
    await page.evaluate(() => __PB.drop('fire', 30));
    await page.waitForFunction(() => __PB.state().timers.fire > 0, null, { timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => __PB.state().counters.fireKills > 0, null, { timeout: 12000 }).catch(() => {});
    const sF = await state();
    record('Power-up: FIREBALL (multi-HP crystals destroyed in one pass)', sF.counters.fireKills > 0, { fireKills: sF.counters.fireKills, timer: +sF.timers.fire.toFixed(1) });
    await page.screenshot({ path: SHOTS + '05-gameplay-powerups.png' });
    await page.evaluate(() => { __PB.game().timers.fire = 0; __PB.game().updateBallLook(); });
    await page.evaluate(() => __PB.drop('explosive', 30));
    await page.waitForFunction(() => __PB.state().timers.explosive > 0, null, { timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => __PB.state().counters.blastHits > 0, null, { timeout: 12000 }).catch(() => {});
    const sE = await state();
    record('Power-up: EXPLOSIVE ball (area blasts on hit)', sE.counters.blastHits > 0, { blastHits: sE.counters.blastHits });
    await page.evaluate(() => __PB.bot(false, 1));

    // ---------------------------------------------------------- 7. pause / resume / restart
    await tapUI('Game', 'pauseBtn'); await waitScene('Pause'); await sleep(300);
    const p1 = await state(); await sleep(800); const p2 = await state();
    const frozen = JSON.stringify(p1.balls) === JSON.stringify(p2.balls) && !p2.active;
    await page.screenshot({ path: SHOTS + '06-pause-menu.png' });
    await tapUI('Pause', 'resume'); await sleep(900);
    const p3 = await state();
    record('Pause freezes gameplay; Resume continues', frozen && p3.active && !(await scenes()).includes('Pause') && JSON.stringify(p3.balls) !== JSON.stringify(p2.balls), { frozen, resumedActive: p3.active });
    await tapUI('Game', 'pauseBtn'); await waitScene('Pause'); await sleep(200);
    await tapUI('Pause', 'restart'); await sleep(1200);
    const p4 = await state();
    record('Restart resets the level', p4.active && p4.score === 0 && p4.lives === 3 && p4.balls.length === 1 && p4.balls[0].attached && !(await scenes()).includes('Pause'), { score: p4.score, lives: p4.lives, balls: p4.balls.length });
    // settings from pause overlay
    await tapUI('Game', 'pauseBtn'); await waitScene('Pause'); await sleep(200);
    await tapUI('Pause', 'settings'); await waitScene('Settings'); await sleep(300);
    await tapUI('Settings', 'Done'); await sleep(300);
    const sc = await scenes();
    record('Pause → Settings overlay → Done returns to Pause', sc.includes('Pause') && !sc.includes('Settings'), sc);
    await tapUI('Pause', 'quit'); await waitScene('Levels');
    record('Pause → Quit returns to level select', (await scenes()).includes('Levels'));

    // ---------------------------------------------------------- 8. auto-pause on interruption
    await page.evaluate(() => __PB.start(0, 0)); await waitScene('Game'); await sleep(1500);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(400);
    const ap1 = (await scenes()).includes('Pause');
    await page.evaluate(() => { const g = PB.game.scene.getScene('Pause'); g.resumeGame(); }); await sleep(400);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(400);
    const ap2 = (await scenes()).includes('Pause');
    await page.evaluate(() => { delete document.hidden; });
    record('Auto-pause on window blur and on visibilitychange (app switch)', ap1 && ap2, { blur: ap1, hidden: ap2 });

    // ---------------------------------------------------------- 9. level complete unlocks next
    await page.evaluate(() => __PB.start(0, 0)); await waitScene('Game'); await sleep(1200);
    await page.evaluate(() => { __PB.launch(); __PB.clear(); });
    await waitScene('Complete', 5000); await sleep(1800);
    await page.screenshot({ path: SHOTS + '07-level-complete.png' });
    const sv = await page.evaluate(() => __PB.save());
    record('Completing W1-L1 shows Level Clear and unlocks L2', sv.unlocked[0] >= 2 && sv.levels['0-0'] && sv.levels['0-0'].stars >= 1 && sv.coins > 0, { unlocked: sv.unlocked, rec: sv.levels['0-0'], coins: sv.coins });
    await tapUI('Complete', 'next'); await sleep(1200);
    const sN = await state();
    record('"Next level" starts W1-L2', sN.level === 1 && sN.active, { level: sN.level });

    // ---------------------------------------------------------- 10. game over + retry
    await page.evaluate(() => { const g = __PB.game(); g.lives = 1; g.paddle.tx = 40; __PB.launch(); });
    await page.evaluate(() => { const g = __PB.game(); g.balls.forEach(b => { if (b.active) { b.x = 650; b.y = 1000; b.vx = 10; b.vy = 600; } }); g.paddle.x = 80; g.paddle.tx = 80; });
    await waitScene('GameOver', 8000).catch(() => {}); await sleep(600);
    const go = (await scenes()).includes('GameOver');
    await page.screenshot({ path: SHOTS + '08-game-over.png' });
    await tapUI('GameOver', 'retry'); await sleep(1000);
    const sR = await state();
    record('Losing the last life shows Game Over; Retry restarts', go && sR.active && sR.lives === 3 && sR.level === 1, { gameOver: go, lives: sR.lives });

    // time objective failure path
    await page.evaluate(() => { __PB.start(1, 9); }); await waitScene('Game'); await sleep(1200);
    await page.evaluate(() => { const g = __PB.game(); __PB.launch(); g.elapsed = g.lv.objective.time + 1; });
    await waitScene('GameOver', 4000).catch(() => {});
    const goT = await page.evaluate(() => PB.game.scene.getScene('GameOver').d && PB.game.scene.getScene('GameOver').d.reason);
    record('Time-limit objective fails with "Time\'s up" when exceeded', goT === 'time', { reason: goT });

    // ---------------------------------------------------------- 11. save survives reload
    await page.reload(); await waitScene('Menu', 15000); await sleep(600);
    await dismissPopups();
    const sv2 = await page.evaluate(() => __PB.save());
    const contLabel = await page.evaluate(() => PB.game.scene.getScene('Menu').btnContinue.label.text);
    record('Save data survives browser reload', sv2.unlocked[0] >= 2 && sv2.levels['0-0'] && sv2.coins === sv.coins, { unlocked: sv2.unlocked, coins: sv2.coins, continueBtn: contLabel });
    await tapUI('Menu', 'CONTINUE'); await waitScene('Game'); await sleep(800);
    const sCont = await state();
    record('Continue jumps to highest unlocked level', sCont.world === 0 && sCont.level === 1, { world: sCont.world, level: sCont.level });

    // ---------------------------------------------------------- 12. rewards: daily, missions, skins
    await page.evaluate(() => { PB.game.scene.stop('Game'); PB.game.scene.start('Rewards'); }); await waitScene('Rewards'); await sleep(500);
    const c0 = (await page.evaluate(() => __PB.save())).coins;
    await tapUI('Rewards', 'claimDaily'); await sleep(600);
    const svD = await page.evaluate(() => __PB.save());
    await page.screenshot({ path: SHOTS + '09-rewards-daily-missions.png' });
    record('Daily reward claim adds coins & starts streak; second claim blocked', svD.coins === c0 + 50 && svD.daily.streak === 1, { before: c0, after: svD.coins, daily: svD.daily });
    await tapUI('Rewards', 'claimDaily'); await sleep(300);
    record('Daily reward cannot be claimed twice the same day', (await page.evaluate(() => __PB.save())).coins === svD.coins);
    const ms = svD.missions;
    record('3 daily missions exist, dated today, with progress tracked', ms.list.length === 3 && ms.date === await page.evaluate(() => PB.today()) && ms.list.some(m => m.progress > 0), ms.list.map(m => m.text + ' ' + m.progress + '/' + m.target));
    // complete a mission artificially-progressed? use real progress: set a mission to its target via gameplay counters is slow; verify claim logic
    await page.evaluate(() => { const m = PB.Save.data.missions.list[0]; m.progress = m.target; PB.game.scene.getScene('Rewards').show('daily'); });
    const c1 = (await page.evaluate(() => __PB.save())).coins;
    await tapUI('Rewards', 'mission0'); await sleep(500);
    const svM = await page.evaluate(() => __PB.save());
    record('Completed mission can be claimed once for coins', svM.coins === c1 + svM.missions.list[0].reward && svM.missions.list[0].claimed, { reward: svM.missions.list[0].reward });
    await tapUI('Rewards', 'Balls'); await sleep(700);
    await page.evaluate(() => { PB.Save.data.coins = Math.max(PB.Save.data.coins, 160); PB.Save.persist(); PB.game.scene.getScene('Rewards').show('ball'); });
    const c2 = (await page.evaluate(() => __PB.save())).coins;
    await tapUI('Rewards', 'ball_rose'); await sleep(500);
    const svB = await page.evaluate(() => __PB.save());
    await page.screenshot({ path: SHOTS + '10-rewards-ball-skins.png' });
    record('Buying a ball skin spends coins and equips it', svB.owned.ball.includes('rose') && svB.equipped.ball === 'rose' && svB.coins === c2 - 150, { coins: [c2, svB.coins], equipped: svB.equipped });
    await tapUI('Rewards', 'ball_void'); await sleep(400);
    const svB2 = await page.evaluate(() => __PB.save());
    record('Cannot buy a skin without enough coins', !svB2.owned.ball.includes('void') && svB2.coins === svB.coins);
    await tapUI('Rewards', 'Paddles'); await sleep(700);
    await page.screenshot({ path: SHOTS + '11-rewards-paddle-skins.png' });
    await page.evaluate(() => __PB.start(0, 1)); await waitScene('Game'); await sleep(800);
    const tex = await page.evaluate(() => __PB.game().balls[0].spr.texture.key);
    record('Equipped skin is used in gameplay', tex === 'ball_rose', { texture: tex });

    // ---------------------------------------------------------- 13. settings toggles + persisted
    await page.evaluate(() => { PB.game.scene.stop('Game'); PB.game.scene.start('Settings', { from: 'Menu' }); }); await waitScene('Settings'); await sleep(500);
    await tapUI('Settings', 'toggle_sound'); await tapUI('Settings', 'toggle_vibration'); await sleep(200);
    await page.screenshot({ path: SHOTS + '12-settings.png' });
    await page.reload(); await waitScene('Menu', 15000);
    const st = (await page.evaluate(() => __PB.save())).settings;
    record('Sound & vibration toggles persist across reload', st.sound === false && st.vibration === false, st);
    await page.evaluate(() => { PB.Save.data.settings.sound = true; PB.Save.data.settings.vibration = true; PB.Save.persist(); });

    // ---------------------------------------------------------- 14. offline via service worker
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await waitScene('Menu', 15000); await sleep(500);
    const ctrl = await page.evaluate(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    let offlineOK = false, offErr = null;
    try {
      await page.reload(); await waitScene('Menu', 15000);
      await page.evaluate(() => __PB.start(0, 0)); await waitScene('Game'); await sleep(800);
      await page.evaluate(() => { __PB.launch(); __PB.bot(true, 2); }); await sleep(2500);
      const so = await state(); offlineOK = so.started && so.counters.paddleHits + so.counters.brickHits > 0;
    } catch (e) { offErr = e.message; }
    await ctx.setOffline(false);
    record('Works offline after first load (service worker cache)', ctrl && offlineOK, { swControlling: ctrl, offErr });

    // ---------------------------------------------------------- 15. reset progress with confirm
    await page.evaluate(() => { __PB.bot(false); PB.game.scene.getScenes(true).forEach(s => PB.game.scene.stop(s.scene.key)); PB.game.scene.start('Settings', { from: 'Menu' }); }); await waitScene('Settings'); await sleep(500);
    await tapUI('Settings', 'Reset progress'); await sleep(300);
    await tapUI('Settings', 'Cancel'); await sleep(300);
    const keep = await page.evaluate(() => __PB.save());
    await tapUI('Settings', 'Reset progress'); await sleep(300);
    await tapUI('Settings', 'Reset'); await sleep(600);
    const gone = await page.evaluate(() => __PB.save());
    record('Reset progress requires confirmation (Cancel keeps, Reset wipes)', keep.unlocked[0] >= 2 && gone.unlocked[0] === 1 && gone.coins === 0 && Object.keys(gone.levels).length === 0, { afterCancel: keep.unlocked, afterReset: gone.unlocked });

    // ---------------------------------------------------------- 16. corrupt save fallback
    await page.evaluate(() => localStorage.setItem('prismburst.save.v1', '{not json'));
    await page.reload(); await waitScene('Menu', 15000);
    const fb = await page.evaluate(() => __PB.save());
    record('Corrupt save JSON falls back to defaults without crashing', fb.unlocked[0] === 1 && fb.coins === 0);

    record('No console errors / page errors during whole run', errors.length === 0, errors.slice(0, 10));
  } catch (e) {
    record('Suite crashed', false, e.stack);
    await page.screenshot({ path: SHOTS + '_crash.png' });
  }
  fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed`);
  await browser.close();
})();
