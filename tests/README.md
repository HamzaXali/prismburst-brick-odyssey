# Tests (optional, desktop/CI only, not needed to play)
Headless Chrome tests driven by playwright-core with Pixel 5 touch emulation.
```
npm i playwright-core            # in this folder
python3 -m http.server 8090      # in the project root
mkdir -p shots && node suite.js  # end-to-end checks -> results.json + screenshots
node bot.js 0 0,9,19 10          # bot plays world 1 levels 1,10,20 at 10x speed
node cloud-unit.js               # merge rule, validation, secret scan, schema checks
node cloud-suite.js              # mocked Supabase in the browser (not a real provider)
node auth-shop-suite.js          # login popup, forgot/reset password, Facebook off, shop cards (mocked)
node play-prep-suite.js         # Settings footer, Delete account (in-app + delete-account.html), privacy pages (mocked)
node delete-unit.js             # delete core, migration 004, footer, pages, store text and graphic sizes (no browser)
```
`cloud-suite.js` is a test-only mock. It intercepts HTTP with Playwright. The game has no fake auth path.
Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome.
