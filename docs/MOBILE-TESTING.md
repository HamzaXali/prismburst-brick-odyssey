# PrismBurst — Android phone test checklist

The automated tests ran in an emulated phone (headless Chrome), so none of this has been checked on a
real device yet. Please work through it in **Chrome for Android** at
`https://<your-username>.github.io/prismburst-brick-odyssey/`. It takes about 20–30 minutes.
Copy the "Report back" block at the end and fill it in.

**Before you start:** write down your phone model and Android version, plus your Chrome version
(Chrome ⋮ → Settings → About Chrome). Turn the phone's media volume up and turn silent mode off.

## 1. Speed and smoothness
- [ ] Play W1-L1 for a minute. Does the ball move smoothly, or does it stutter or skip?
- [ ] Break a lot of bricks quickly, or catch a Multi-ball (several balls plus particles). Does it slow down?
- [ ] Is the ball speed comfortable, too fast, or too slow?
- [ ] Does the phone get noticeably warm after 5 minutes?

## 2. Sound
- [ ] After your first tap, do you hear sounds for: paddle hit, brick break, power-up pickup, life lost, and level clear?
- [ ] Settings → Sound OFF makes everything silent. Turn it back ON and sound returns.
- [ ] Switch to another app and come back. Does sound still work after your next tap?

## 3. Vibration
- [ ] With Settings → Vibration ON: do you feel a buzz on power-up pickup, explosions, life lost and level clear?
- [ ] With Vibration OFF: no buzzing at all.
- (Some phones turn vibration off in battery saver or Do Not Disturb. Please note if either was on.)

## 4. Screen layout
- [ ] The game fills the screen width. On tall phones, **dark bars above and below the game are expected**.
      Tell me how big they look ("thin" / "about a thumb" / "huge").
- [ ] All text is readable, and no buttons are cut off or hidden behind the notch or camera.
- [ ] The page never scrolls sideways, and pinching or double-tapping never zooms in.
- [ ] Rotate the phone sideways: what happens? (Portrait is the intended orientation.)
- [ ] Optional: Chrome ⋮ → "Add to Home screen" / "Install app". Open it from the icon. Does it open full-screen in portrait?

## 5. Touch controls
- [ ] Dragging anywhere moves the paddle under your finger. Does it lag behind your finger?
- [ ] Lifting your finger launches the ball. Did it ever launch when you didn't want it to?
- [ ] Hitting the paddle edge sends the ball out at a steeper angle than hitting the middle.
- [ ] The pause button (top right) is easy to hit and never launches the ball by accident.
- [ ] Swiping down from the top of the game does **not** refresh the page.
- [ ] Menu buttons, world cards and level tiles all respond on the first tap.

## 6. Saving progress
- [ ] Clear W1-L1 and W1-L2, then pull the page down to reload (or Chrome ⋮ → reload). Are levels, stars and coins still there?
- [ ] Fully close Chrome (swipe it away in recent apps) and reopen the game. Is progress still there?
- [ ] Mid-level, switch to another app. When you come back, the game should be **paused**.
- [ ] Rewards → claim the daily reward. Coins go up, and the button says "Come back tomorrow".
- Note: clearing Chrome's site data or browsing history for the site **erases progress**. That is expected for a web game.

## 7. Offline
- [ ] Open the game once while online and wait for the menu to appear.
- [ ] Turn on Airplane mode, fully close Chrome, reopen it and go to the game URL.
      It should load and play normally.
- [ ] Turn Airplane mode off when done.

## 8. Hard or long levels (the bot found these slow; please play them)
Levels unlock in order, so just test the ones you reach. If you want to test them sooner,
ask for a temporary "unlock all" test build.

| Level | Name | Objective | Bot time (perfect play) |
|---|---|---|---|
| W2-L1 | Cave Mouth | Clear all | ~5.5 min |
| W4-L10 | Crucible | Reach score | ~6 min |
| W5-L10 | Gravity Well | Time trial (limit now ~17.5 min) | ~9 min |
| W3-L3 | Facet Bloom | Time trial (limit now ~9.5 min) | ~6 min |
| W2-L10 | Geode Vault | Time trial (limit now ~12 min) | ~6 min |
| W3-L15 | Flare Cascade | Golden cores | ~5.5 min |
| W4-L9 | Lumen Bloom | Clear all | ~5 min |

When only a few crystals remain and nothing has been hit for a while, a **Prism Assist** power-up drops.
Shortly after, **Prism Guidance** gently bends the ball toward the last crystals. Note whether these
felt helpful or felt like cheating.

For each level you try, note: won or lost, roughly how long it took, lives lost, and whether
it felt fun, too hard, or boring (stuck hitting one last brick).

## Report back (copy and fill in)
```
Phone / Android / Chrome version:
1 Smoothness (smooth / slight stutter / laggy), ball speed (ok / too fast / too slow), warm?:
2 Sound working (yes/no, which sounds missing):
3 Vibration working (yes/no):
4 Dark bars size, anything cut off, rotation behaviour, home-screen install ok?:
5 Touch: paddle lag?, accidental launches?, pull-to-refresh happened?:
6 Save after reload: ok?  After closing Chrome: ok?  Auto-pause on app switch: ok?:
7 Offline (airplane mode) load: ok?:
8 Hard levels (level: won/lost, minutes, lives lost, fun/too hard/boring):
Bugs or anything odd (with what you were doing, screenshots welcome):
```
