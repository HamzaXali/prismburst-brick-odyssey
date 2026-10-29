# Google Play Store prep (1.4.4)

This is the checklist and copy for publishing PRISMBURST — Brick Odyssey on Google Play, written for someone who only has an Android phone. Anything marked **NOT VERIFIED** has not been checked against the live Play Console or on a real phone.

Public links used below:

| What | URL |
| --- | --- |
| Privacy policy | `https://hamzaxali.github.io/prismburst-brick-odyssey/privacy-policy.html` |
| Delete account page | `https://hamzaxali.github.io/prismburst-brick-odyssey/delete-account.html` |
| Web game | `https://hamzaxali.github.io/prismburst-brick-odyssey/` |

These pages go live only after this PR is merged and the Pages workflow finishes. **NOT VERIFIED** until then.

---

## 0. Before anything: the three things only you can do

1. **Contact email in the privacy policy.** Done: `privacy-policy.html` lists the developer's public contact email (added by Ali on 27 Oct 2026).
2. **Apply migration 004.** Dost applies `supabase/migrations/004_delete_my_account.sql` in the Supabase SQL editor after review. Until then the Delete account button shows "Account deletion is not switched on in the cloud yet. Nothing was deleted."
3. **Supabase redirect URLs.** Supabase → Authentication → URL Configuration → Redirect URLs must contain both:
   - `https://hamzaxali.github.io/prismburst-brick-odyssey/**` (also covers `delete-account.html` Google sign-in)
   - `com.prismburst.brickodyssey://**`

---

## 1. App content answers (Play Console → Policy → App content)

### Privacy policy
Paste the privacy policy URL above.

### Ads
**Does your app contain ads? → Yes** (recommended, even for 1.4.4).

Reason: the "Watch ad" screens are demo ads drawn by the game itself (`js/ads.js`, `DemoAdProvider`). They only promote PRISMBURST, use no ad network and make no network request. But they *look and act like* rewarded video ads, and Google's ads help page says a banner, interstitial or ad wall that promotes your own products counts as an ad; only a quiet "More apps" menu entry may be declared "No". Misdeclaring ads can get an app suspended, while declaring "Yes" only adds the "Contains ads" label. Answering Yes now also means nothing changes when real ads arrive. Source: Play Console Help, "Prepare your app for review" → Ads (checked 22 Oct 2026).

**When AdMob (or any ad SDK) is added later:** change this answer to **Yes**, update the Data safety form (device or other IDs, app interactions, diagnostics are collected by the SDK and shared for advertising), update `privacy-policy.html` and the Settings footer (`PB.SETTINGS_FOOTER` in `js/menus.js`), and set up the AdMob consent form for EU/UK users.

### App access
Choose **All functionality is available without special access**. Guest play needs no account. (Accounts are optional and anyone can create one.)

### Content rating (IARC questionnaire)
- Category: **Game** → Arcade/puzzle style.
- Violence: **No** (bricks break; no characters are harmed).
- Fear, sexuality, language, controlled substances, gambling: **No**.
- **Simulated gambling: No.** The Lucky Wheel gives in-game coins and boosts only, costs no money and cannot be bought.
- User-generated content / users can interact or communicate: **No.** Display names are only shown to the player themselves; there are no chats or leaderboards.
- Shares user location: **No**. Digital purchases: **No**.
- Expected result: **Everyone / PEGI 3 / ESRB E** class rating. **NOT VERIFIED** until you submit the questionnaire.

### Target audience and content
- Recommended target age groups: **13–15, 16–17, 18 and over.**
- Do **not** tick ages under 13 unless you want to join the Families program. Ticking under‑13 brings the Families policy (teacher-approved rules, stricter ads, COPPA). The privacy policy already says the game is for 13+.
- "Could your store listing unintentionally appeal to children?" → answer honestly; the neon style is general-audience. If Google asks, explain there are no ads SDKs and no data collection without sign-in.

### News app → No. COVID-19 app → No. Government app → No. Financial features → none. Health → none.

### Data safety form
Answer based on what 1.4.4 actually does:

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** (only when the player signs in) |
| Is all user data encrypted in transit? | **Yes** (HTTPS to Supabase) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — in-app (Settings → Delete account) and the delete account URL above |
| Data shared with third parties | **None** (Supabase is a service provider processing on your behalf, which Google does not count as sharing) |

Data types to declare as **collected** (not shared):

| Data type | Collected | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → **Email address** | Yes | Optional (only if signing in) | Account management |
| Personal info → **Name** (display name the player chooses) | Yes | Optional | App functionality, Account management |
| Personal info → **User IDs** (Supabase account id) | Yes | Optional | Account management, App functionality |
| App activity → **Other user-generated content** or **In-app actions** (the game save: levels, stars, coins, skins) | Yes | Optional | App functionality (cloud save) |

Not collected: location, contacts, photos, files, audio, messages, financial info, health, web browsing, device or other IDs, crash logs, diagnostics, advertising ID. No analytics SDK, no crash SDK, no ad SDK.

The "processed ephemerally" box: leave unticked (saves are stored).

Account deletion section (Play requires it because the app lets users create accounts):
- **Delete account URL:** the delete account page above.
- The page names the app and developer, lists the steps, says what is deleted (account, email, provider id, display name, cloud save) and what is kept (nothing on the server; device progress only on the phone, which the player can clear).

### Government / financial / health declarations
None apply.

### In-app purchases
**None.** Prism coins, boosts, skins and the Lucky Wheel are earned and spent inside the game. There is no Google Play Billing, no real-money purchase, no subscription. Do not set up products in Monetize.

---

## 2. Store listing (Grow → Store presence → Main store listing), English

**App name** (max 30, this is 25):

```
PRISMBURST: Brick Odyssey
```

**Short description** (max 80, this is 76):

```
Neon prism brick breaker: 100 levels, power-ups, daily wheel. Plays offline.
```

**Full description** (max 4000):

```
Smash glowing glass bricks with a beam of light in PRISMBURST: Brick Odyssey, a neon brick-breaker made for one-hand play on your phone.

Guide your paddle, launch the prism ball and split the light into a rainbow of power-ups. Every world brings new brick shapes, steel frames with narrow openings and tricky targets to clear.

FEATURES
• 100 handcrafted levels across 5 glowing worlds
• Power-ups: explosive blast, multi-ball, piercing beam, wide paddle, slow motion and bonus coins
• Steel frames and openings that reward clever angles
• Stars, achievements and missions to chase
• Lucky Wheel: one free spin every day
• Daily bonus and streaks
• Prism Shop: spend coins you earn in the game on boosts and new ball and paddle looks
• Smooth touch controls: the paddle follows your finger
• Plays offline. No account needed

CLOUD SAVE (OPTIONAL)
Sign in with Google or email to keep your progress safe and continue on another device. You can delete your account from Settings at any time.

FAIR AND PRIVATE
• No real-money purchases. Coins are earned by playing
• No third-party ad networks and no tracking. The only ads are short promos for PRISMBURST itself
• Guest play sends nothing to a server

Bounce, burst and light up every level. How far can your prism go?
```

**Graphics** (all original, generated by `scripts/make-store-graphics.js`):

| Asset | File | Size |
| --- | --- | --- |
| App icon | `store/icon-512.png` | 512 × 512, 32-bit PNG |
| Feature graphic | `store/feature-graphic-1024x500.png` | 1024 × 500 |
| Phone screenshots | `store/screenshots/01-home.png` … `06-login.png` | 1080 × 1920 each |

On the phone: download each file from the GitHub repository page (open the file → ⋮ → Download), then upload it from **Files** in the Play Console mobile site in Chrome. Use Chrome's "Desktop site" option if a page does not show the upload button. **NOT VERIFIED** that every Play Console upload works on mobile Chrome.

**Category:** Game → Arcade. **Tags:** Brick breaker, Arcade, Casual, Offline. **Contact details:** the email you chose (required, shown publicly). Website: the web game URL (optional).

**Release notes for 1.4.4** (max 500):

```
• Delete your account from Settings, or from our web page
• Clearer privacy information and a new privacy policy
• Login popup with Google, email sign-up and working "Forgot password"
• New Prism Shop design
• Crystal Mass mode removed
```

---

## 3. Play Console step by step (Android phone only)

Use **Chrome on the phone**. Play Console is a website; there is also a **Google Play Console** app, which is needed for some verification steps. Tick **Desktop site** in Chrome's ⋮ menu if a page looks cut off.

### A. Create the developer account (up to the $25 payment)
1. Open `https://play.google.com/console/signup` and sign in with the Google account that will own the app. Use one you will keep for years; it cannot be moved later without a transfer process.
2. Choose **Yourself** (personal account). An organisation account needs a D‑U‑N‑S number; a personal account does not.
3. Fill in the **developer name** shown on Google Play (for example "HamzaXali" or "Prismburst Games").
4. Add a **contact email** and **phone number**. Google sends codes to both; enter them.
5. Answer the questions about your Android experience and how many apps you plan to publish.
6. Accept the Developer Distribution Agreement.
7. **Pay the $25 one-time registration fee** with a card that works for international payments. *This is where the free work stops.* Only you can pay; nobody else should enter your card.

### B. Right after payment
8. **Identity verification:** Google asks for your legal name, address and an ID document (CNIC or passport photo). Upload it from the phone camera. This can take a few days. **NOT VERIFIED:** exact documents accepted in Pakistan; follow what the console asks for.
9. **Android device verification:** install the **Google Play Console** app on your phone and sign in with the same account; it asks to confirm the device.
10. Wait for the "Your account is verified" email.

### C. Create the app
11. Play Console → **Create app**. App name `PRISMBURST: Brick Odyssey`, default language English (United States), **Game**, **Free**. Tick the declarations.
    - The Android **package name** comes from the AAB, not from this screen. From 1.4.4 it is `com.prismburst.brickodyssey`. **It is permanent** once the first AAB is uploaded — you cannot change it later without a brand-new Play listing. Do not upload an older AAB that still used `com.hamzaxali.prismburst`.
12. Go through **Dashboard → Set up your app** using section 1 and 2 above (privacy policy, app access, ads, content rating, target audience, data safety, government apps, financial features, health, store listing).

### D. Signing secrets and the AAB (needs GitHub, no PC)
13. Make the upload keystore in Termux and add the four GitHub secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Steps: [PLAY-RELEASE.md](PLAY-RELEASE.md). Never paste these into chat, an issue or a commit.
14. On GitHub: **Actions → Android release → Run workflow** on `main`. Leave the version boxes empty (uses 1.4.4 / versionCode 6 from `package.json`).
15. When the run is green, download the **prismburst-release-aab** artifact (a zip). Open it in **Files** and extract `app-release.aab`.
16. **Play App Signing:** on the first upload Play Console offers "Google-generated key" — accept it. Google then holds the app signing key, and your Termux key becomes the *upload key*. Keep the `.jks` file and passwords backed up offline.

### E. Closed testing (required before production)
17. **Test and release → Testing → Closed testing → Create track** (or use the default "Alpha").
18. **Testers:** create an email list and add at least **12** Gmail addresses (add 15–20 in case some drop out). Each tester must open the **opt-in link** from Play Console and tap **Become a tester**, then install from the Play Store link.
19. **Create release** → upload `app-release.aab` → paste the release notes → **Review release** → **Start rollout to Closed testing**. Google reviews the first closed release (often a few days).
20. Keep **12 or more testers opted in continuously for 14 days**. A tester who leaves and rejoins restarts their own 14 days. Ask testers to actually play and send feedback; Google asks about it.
21. After 14 days, **Dashboard → Apply for production** and answer the questions about your test (what testers did, what you fixed). Review usually takes up to about a week.

### F. Every later update
- Raise `androidVersionCode` in `package.json` (6 → 7 → 8 …) and usually `version`. Play rejects an AAB whose versionCode is not higher than the last upload.
- Run the release workflow again and upload the new AAB to the same track.

---

## 4. What is verified and what is not

| Item | Status |
| --- | --- |
| Store text lengths (name 25, short 76, full under 4000, notes under 500 characters) | Checked by `tests/delete-unit.js` |
| Graphic sizes | Checked with a PNG header read |
| In-app and web account deletion (mocked server) | Tested with Playwright mocks |
| `delete_my_account()` on the real Supabase project | **NOT VERIFIED** (migration not yet applied) |
| Signed release AAB with your secrets | **NOT VERIFIED** (secrets not added yet) |
| Content rating, Data safety acceptance, review outcome | **NOT VERIFIED** |
| Play Console uploads from mobile Chrome | **NOT VERIFIED** |
