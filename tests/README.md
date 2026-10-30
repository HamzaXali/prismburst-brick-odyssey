# Tests (optional, desktop/CI only, not needed to play)

Headless Chrome tests driven by playwright-core with Pixel 5 touch emulation.

```
npm i playwright-core
python3 -m http.server 8090   # optional; suites start their own server
node cloud-unit.js            # merge rule, Firebase rules, secret scan, Android checks
node cloud-suite.js           # mocked Firebase Auth + Firestore in the browser
node auth-shop-suite.js       # login popup, forgot/reset, Facebook off (mocked)
node play-prep-suite.js       # version footer, delete account, privacy (mocked)
node firebase-suite.js         # extra Firebase auth/save/delete/backoff mock coverage
node delete-unit.js           # delete core + Firebase wording (no browser)
```

`cloud-suite.js` injects a test-only mock Firebase SDK. The game has no fake auth path.
Live Firebase tests are **0 / NOT VERIFIED** until `js/firebase-config.js` has a full web app config.
Set CHROME_PATH if Chrome is not at /usr/bin/google-chrome.
