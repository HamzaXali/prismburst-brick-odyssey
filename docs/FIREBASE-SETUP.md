# Firebase setup (phone browser, free Spark plan)

Do this in Chrome on the Android phone. If a dashboard button is cut off, open the browser menu and turn on **Desktop site**.

You do not need a computer, a credit card, or a paid Firebase plan. You never put a **service account** JSON or private key in the game.

## What you will paste into the game

After the steps below, open `js/firebase-config.js` in the GitHub file editor and replace every `PLACEHOLDER_…` value with the matching field from Firebase. Key names only (values come from your console):

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

The Firebase Web `apiKey` is a public client id. It is fine to commit once it is real. Secret Admin / service-account keys must never go in the repo.

Until those placeholders are replaced, the game stays in guest / local mode and shows **Cloud save not set up yet**.

## 0. Already created

Ali created the Firebase project:

- Project ID: `prismburst-brick-odyssey`
- Project number: `1094215889946`
- `authDomain` / `storageBucket` are already filled in `js/firebase-config.js`
- Still needed from the Web app register screen: `apiKey`, `appId`, and `messagingSenderId` (often equals the project number — paste what the console shows)

## 1. Create the free Firebase project (done — keep for reference)

1. Open [https://console.firebase.google.com](https://console.firebase.google.com).
2. Sign in with the Google account you use for Play Console (same one is fine).
3. **Add project** → name it something like `prismburst-brick-odyssey`.
4. Google Analytics is optional; you can turn it off.
5. Wait until the project is ready. Stay on the **Spark (free)** plan.

## 2. Add a Web app

1. Project overview → **Add app** → Web (`</>`).
2. Nickname: `prismburst-web`.
3. You do **not** need Firebase Hosting for this game (GitHub Pages already hosts it).
4. Copy the `firebaseConfig` object fields into `js/firebase-config.js` (see list above).

## 3. Enable Email/Password and Google

1. Build → **Authentication** → **Get started**.
2. Sign-in method → **Email/Password** → Enable → Save.
   - Leave "Email link (passwordless)" off.
3. Sign-in method → **Google** → Enable.
4. Set the **Project support email** to your own Gmail → Save.
5. Keep **Facebook** disabled.

## 4. Authorized domains

Authentication → Settings → **Authorized domains** must include:

- `hamzaxali.github.io`
- `localhost`

(Firebase usually adds `localhost` and your `*.firebaseapp.com` domain automatically.)

## 5. Create Firestore (production mode, free)

1. Build → **Firestore Database** → **Create database**.
2. Choose **Production mode** (rules start locked).
3. Pick a region close to you (any is fine on Spark).
4. After it is created, open the **Rules** tab.
5. Replace the rules with the contents of `firestore.rules` from this repo → **Publish**.

Those rules allow each signed-in player to read/write only `profiles/{theirUid}` and `saves/{theirUid}`, with field checks. There are no public reads.

## 6. Confirm the game

1. Commit / merge the filled `js/firebase-config.js` (or edit it on GitHub after this PR merges).
2. Open the web game, try **Sign up** with email → check inbox for Firebase's verification mail.
3. Try **Forgot password** → Firebase sends the reset mail for free.
4. On Android, Google login opens `auth-bridge.html` in the system browser, then returns via `com.prismburst.brickodyssey://auth`.

## Security reminders

- Never paste a service-account JSON, `private_key`, or Admin SDK key into chat, GitHub, or the app.
- Do not turn off Firestore rules to "make it work".
- Local save key `prismburst.save.v1` is never cleared by login, logout, account switch, or auth errors.
