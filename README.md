# PRISMBURST — Brick Odyssey

A mobile-first neon-crystal brick-breaker that runs in any modern Android browser.
It's a plain static site: no build step and no paid APIs. Guest play has no account and no tracking. Optional cloud save uses a free Firebase (Spark) project when `js/firebase-config.js` is filled in.
It's built to be hosted free on **GitHub Pages**. A Capacitor Android project builds a debug APK from the same files. See [docs/ANDROID.md](docs/ANDROID.md).

- **5 themed worlds × 20 levels** (Prism Nebula, Crystal Caverns, Neon Reef, Solar Forge, Void Citadel)
- **Objectives:** clear all crystals, reach a score, beat a time limit, or shatter the golden cores
- **Bricks:** 1–4 HP crystals, steel (indestructible, never required), explosive, moving, regenerating, prize and target cores
- **Power-ups:** Multi-ball, Fireball, Laser, Blast (explosive) ball, Wide paddle
- **Progression:** stars, coins, daily reward streak, 3 daily missions, 7 ball skins and 6 paddle skins
- **Offline:** a service worker caches the game after the first visit. Guest play and gameplay never wait on the network. All graphics are drawn in code and all sound is synthesized with WebAudio.
- **Optional account:** guest, email, Google, and Facebook. Google and Facebook ship turned off. Progress stays in `prismburst.save.v1` on the device, and a signed-in player can sync that same save. A display name is separate (`prismburst.profile.v1` on the device, `public.profiles` when signed in). See [docs/CLOUD-SETUP.md](docs/CLOUD-SETUP.md) and [docs/GOOGLE-SIGNIN.md](docs/GOOGLE-SIGNIN.md).

## How to play
- **Drag** your finger anywhere on the screen. The paddle follows it.
- **Release / tap** to launch the ball.
- Where the ball lands on the paddle sets its angle: the edges send it out wide.
- Consecutive brick hits build a **combo multiplier** (up to ×4). Touching the paddle, or 3 seconds without a hit, resets it.
- Catch falling capsules for power-ups. Timed power-ups show a bar under the HUD.
- **Stars:** ★ clear the level · ★ lose no lives · ★ reach the 3-star score.
- The game pauses automatically when you switch apps. Use the ❚❚ button to pause, restart, change settings or quit.

## File structure
```
index.html             page shell, viewport/zoom guards, service-worker registration
style.css              full-screen, no-scroll, no-zoom mobile styles
levels.js              world data, hand-made level templates + deterministic generator
game.js                gameplay scene (physics, power-ups, scoring), Phaser config, test hook
config.js              provider switches (email / Google / Facebook)
js/firebase-config.js  public Firebase web config (PLACEHOLDER_ = offline guest mode)
privacy-policy.html    privacy policy (no ad SDK, no analytics; account data only if you sign in)
privacy.html           old address, forwards to privacy-policy.html
delete-account.html    public account deletion page (Google Play requirement)
store/                 Play Store icon, feature graphic, screenshots (not deployed)
js/core.js             save system, WebAudio synth, haptics, procedural textures, UI helpers
js/home.js             daily bonus, lucky wheel, and daily tasks (save.home)
js/home-ui.js          home bar, shortcuts, and the startup popup queue
js/save-sync.js        cloud merge and validation (no network)
js/cloud.js            Firebase Auth + Firestore sync (real client only; no-op when config is placeholder)
js/account.js          account sheet (guest, Google, Facebook, email)
js/menus.js            boot, menu, world/level select, settings, rewards, pause/complete/game-over
sw.js                  offline cache; Firebase / Google API calls are network-only
manifest.webmanifest   installable PWA manifest (portrait, fullscreen)
lib/phaser.min.js      Phaser 3.90.0, vendored (MIT, see lib/PHASER-LICENSE.md)
lib/firebase-*-compat.js  Firebase JS 10.14.1 compat, vendored (Apache-2.0)
auth-bridge.html       Native Google sign-in bridge for Capacitor Android
firestore.rules        Owner-only Firestore security rules
supabase/              LEGACY Supabase SQL (unused by the live client)
icons/                 original launcher icons (192, 512, maskable 512, 1024)
scripts/validate-levels.js   checks all 100 levels (reachability, objectives, duplicates)
scripts/make-icons.py        regenerates the icons (Python + Pillow)
scripts/check-paths.js       pre-deploy check: relative, case-exact file references
scripts/check-secrets.js     fails if a shipped file contains a secret-role JWT or secret API key
.github/workflows/pages.yml  GitHub Pages deploy (official actions)
.github/workflows/android-debug.yml  debug APK (no release signing)
.github/workflows/android-release.yml  signed Play AAB and APK (secrets stay in GitHub)
android/                Capacitor Android project
docs/PLAY-RELEASE.md         phone steps for the Play upload key and the release workflow
docs/MOBILE-TESTING.md       Android phone test checklist
docs/FIREBASE-SETUP.md       Firebase Spark setup for a phone browser
docs/CLOUD-SETUP.md          Cloud save overview (points at Firebase)
tests/                 optional headless-browser tests (not needed to play or host)
```

## Adding levels or worlds
Add an object to `WORLDS` in `levels.js` (name, colours, optional hand-made `hand` levels keyed by
level index). Any level index without a hand-made grid is generated automatically. Grid legend:
`.` empty · `1-4` crystal HP · `S` steel · `X` explosive · `M`/`N` moving (1/2 HP) · `R` regenerating ·
`P` prize · `T` target core. Then run `node scripts/validate-levels.js`.

## Local development (optional, needs a computer)
```
npm start                 # serves on http://localhost:8080 (http-server via npx)
npm run validate          # levels, paths, secret scan, cloud merge unit tests
```
Any static file server works. Opening `index.html` straight from the disk also runs the game,
but browsers only enable the service worker over http(s).

## Hosting on GitHub Pages
Put these files at the root of a public repository named `prismburst-brick-odyssey`, then go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
`.github/workflows/pages.yml` validates the levels, file paths, secret scan, and cloud merge tests, then deploys only the game files
(no `tests/`, `scripts/`, `docs/`, `supabase/`, `firestore.rules` source-only paths, or `.github/`) on every push to `main`. You can also run it by hand
from the Actions tab. `config.js`, `privacy-policy.html`, `privacy.html` and `delete-account.html` are deployed. The database script is not.
The game will be at `https://<your-username>.github.io/prismburst-brick-odyssey/`.
All paths are relative, so any repository name works.

Phone test checklist: [docs/MOBILE-TESTING.md](docs/MOBILE-TESTING.md).

## Accounts and privacy
With PLACEHOLDER_ values in `js/firebase-config.js`, the game does not sign anyone in and does not call Firebase.
Progress (levels, coins, skins, settings) is saved in `localStorage` on the device under `prismburst.save.v1`.
Login, logout, and auth errors do not clear that key. Setup steps for a free Firebase Spark project, email, Google,
and Facebook are in [docs/CLOUD-SETUP.md](docs/CLOUD-SETUP.md). The public policy is [privacy-policy.html](privacy-policy.html). Players delete their account in Settings or on [delete-account.html](delete-account.html). Play Store steps: [docs/PLAY-STORE.md](docs/PLAY-STORE.md).

## Credits
Game code and art © the PrismBurst author. Phaser © Photon Storm Ltd (MIT license).
Auth / Firestore client © Google Firebase (Apache-2.0), vendored at `lib/firebase-*-compat.js`.
