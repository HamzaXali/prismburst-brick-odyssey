# Cloud save setup (phone browser)

PRISMBURST already runs without an account. Cloud save stays off until you paste a Supabase project URL and publishable key into `config.js`. Google and Facebook stay off until you turn those two switches on after the OAuth clients exist.

Do this in Chrome on the Android phone. If a dashboard button is cut off, open the browser menu and turn on **Desktop site**.

You do not need a computer, a credit card, or a paid Supabase plan. You never put the dashboard **secret** key in the game. Older dashboards call that key `service_role`. The game's check fails the GitHub Pages build if that kind of key is committed.

## What the game will do after this

- **Continue as Guest** keeps using the save already on the phone (`prismburst.save.v1`). Guest play works offline.
- **Email** turns on when `config.js` has the URL, the publishable key, and `providers.email` is `true` (that is already the default).
- **Google** and **Facebook** turn on only when you set `providers.google` or `providers.facebook` to `true` after the steps below. Facebook stays off in this setup.
- Signing in never deletes the phone save. Before a cloud copy replaces it, the game writes a backup key named `prismburst.save.backup.<time>`.
- Every player has a display name. A guest name such as `PrismPlayer1234` is stored on the phone in `prismburst.profile.v1`, separate from the game save. A signed-in name is stored in `public.profiles`. Syncing the save does not change the name, and the game never uses the email address as the name.

## Conflict rule

When both sides have progress and you choose **Merge** (or the same account syncs on its own):

- Unlocked levels: the higher count in each world is kept.
- Each level's best score and stars: the higher number is kept.
- Owned skins: the union of both sides.
- Lifetime stats (bricks broken, games played, levels cleared): the higher number.
- The furthest current level is kept.
- Coins, equipped skins, settings (sound, vibration, screen shake), daily reward, and mission state come from whichever side has the newer `client_updated_at`. If the times match, this phone wins those fields.

**Use cloud** replaces this phone with the account copy. **Keep this device's progress** keeps this phone's coins and settings, and still keeps any better scores, stars, unlocks, and skins from the account. Both choices write a local backup first.

The database stores a `revision`. A write is accepted only if the phone sends the revision it last read (`0` if the account has no row yet). If another device wrote in between, the server returns `revision_conflict`, and the phone loads the row again, merges, and retries. A newer row is not replaced by a stale write.

## 1. Create the free Supabase project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Sign in with **GitHub** (the same GitHub account that owns the game repo is fine).
3. **New project**. Pick the free plan, a name you will remember, and a database password. Store that password in your phone's password manager. It does not go in the game.
4. Wait until the project status is healthy.

## 2. Run the database script

1. In the project, open **SQL Editor** → **New query**.
2. On GitHub, open [supabase/schema.sql](https://github.com/HamzaXali/prismburst-brick-odyssey/blob/main/supabase/schema.sql) (after this change is on `main`). Select all of the text and copy it.
3. Paste it into the SQL editor and press **Run**.
4. You should see success. Running the same script again is safe.

The script creates `public.player_saves`, turns on row level security, and lets only the signed-in user (`auth.uid() = user_id`) select, insert, update, or delete their own row. The `anon` role gets no policy and no grants. Writes go through `upsert_player_save`, which checks the revision. It also creates `public.profiles` for the display name.

The live project already has `player_saves`. Do not rely on pasting `schema.sql` again for the name table. Open [supabase/migrations/002_profiles.sql](https://github.com/HamzaXali/prismburst-brick-odyssey/blob/main/supabase/migrations/002_profiles.sql) (after this change is on `main`), copy that file alone, paste it into a new SQL query, and run it. It only adds `public.profiles`. It does not read or write `player_saves`. Running it twice is safe.

## 3. Copy the URL and publishable key into the game

1. In Supabase open **Project Settings** → **API** (or **API Keys**).
2. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
3. Copy the **publishable** key, also called the **anon** key. Do not copy the **secret** key.
4. On GitHub open [config.js on main](https://github.com/HamzaXali/prismburst-brick-odyssey/blob/main/config.js).
5. Tap the pencil (**Edit this file**). If GitHub asks you to sign in, use the phone browser.
6. Set `supabaseUrl` and `supabaseAnonKey` to the two values, inside the quotes. Leave `providers.google` and `providers.facebook` as `false` for now. Leave `providers.email` as `true` if you want email sign-in.
7. Commit directly to `main`. The **Deploy to GitHub Pages** workflow publishes the file. Give it a minute, then fully close the game tab and open [https://hamzaxali.github.io/prismburst-brick-odyssey/](https://hamzaxali.github.io/prismburst-brick-odyssey/) again. If the old page is still cached, open it once more.

Until those two strings are filled in, every account button stays disabled and says **Not set up yet.**

## 4. Auth URLs

In Supabase open **Authentication** → **URL Configuration**.

- **Site URL:** `https://hamzaxali.github.io/prismburst-brick-odyssey/`
- **Redirect URLs**, add each of these on its own line:
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/**`
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/`
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/index.html`

Save. The game sends players back to the page they started on, including the `/prismburst-brick-odyssey/` subpath.

## 5. Email sign-in

1. **Authentication** → **Providers** (or **Sign In / Providers**) → **Email**. Turn it on.
2. Leave "confirm email" on if you want players to open a link before the first sign-in. The game tells them to check their inbox and does not delete the phone save. The free email sender only allows a few messages per hour. If a reset email fails, the game shows the error and keeps the phone save.
3. With the URL and publishable key in `config.js` and `providers.email` set to `true`, the email buttons enable themselves. No other switch is required for email.

### Forgot password (1.4.0)

**Forgot password?** in the login popup opens its own screen. It calls Supabase `resetPasswordForEmail` with a return address that ends in `?type=recovery`:

- website: `https://hamzaxali.github.io/prismburst-brick-odyssey/index.html?type=recovery` (or the page the player is on)
- Android app: `com.hamzaxali.prismburst://auth?type=recovery`

Both are already covered by the wildcard lines above (`https://hamzaxali.github.io/prismburst-brick-odyssey/**`) and by `com.hamzaxali.prismburst://**` from [ANDROID.md](ANDROID.md). If a line is missing, Supabase sends the player to the Site URL and the app cannot finish the reset.

When the link comes back, the game shows **Choose a new password** (type it twice) and saves it with `updateUser`. The phone save `prismburst.save.v1` is not cleared. The link only works in the same browser or app that asked for it (PKCE). Opened elsewhere, the game says so and offers **Ask for a new link**.

Email template: **Authentication → Emails → Reset Password** can stay on the default. It must keep the `{{ .ConfirmationURL }}` link. Do not paste any key or secret into a template.

## 6. Google sign-in

The Google button stays off and says **Not set up yet** until `providers.google` is `true`. Email keeps working while Google is off.

Do the phone steps in [GOOGLE-SIGNIN.md](GOOGLE-SIGNIN.md). Two addresses are easy to mix up:

- **Google's Authorized redirect URI** is Supabase's callback. Copy it from Supabase. For this project it is expected to look like `https://qogqnutpqzatxnbhcznc.supabase.co/auth/v1/callback`. The value on the Supabase screen is the one that counts.
- **The game URL** is GitHub Pages: `https://hamzaxali.github.io/prismburst-brick-odyssey/`. That is the Supabase Site URL and the page the player returns to. It is not the Google redirect URI.

The Google client secret stays in Google Cloud and in the Supabase Google provider form. It does not go in GitHub, `config.js`, or a chat.

## 7. Facebook sign-in

Facebook ships off (`providers.facebook` is `false`). Turn it on only after this works for you as a tester.

1. Open [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/) and create an app. Use case: **Facebook Login**. App name `PRISMBURST`.
2. Add the **Facebook Login** product if it is not already there. Choose the **Web** setup.
3. **Valid OAuth Redirect URI:** the same Supabase callback as Google, `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Permissions: `public_profile` and `email`.
5. **Settings** → **Basic**: set the privacy policy URL to `https://hamzaxali.github.io/prismburst-brick-odyssey/privacy.html`. For data deletion, set the **Data deletion instructions URL** to `https://hamzaxali.github.io/prismburst-brick-odyssey/privacy.html#deletion`. This site cannot run Meta's automatic POST callback because GitHub Pages is a static host. The instructions on that page are how a player asks for deletion.
6. Add yourself as an admin or tester and try login before review. Facebook only lets other people sign in after the app is in **Live** mode. `email` may need **Advanced Access** and app review before it works for players who are not testers. `public_profile` is the standard profile permission.
7. Copy the **App ID** and **App secret**. In Supabase → **Facebook** provider, paste them and turn the provider on. The app secret stays in Supabase, not in `config.js`.
8. Edit `config.js` and set `providers.facebook` to `true`. Commit to `main`.

## 8. Free-plan limits

- A free project can **pause after about a week** with no traffic. Sign-in then fails and the game still plays from the phone save. Open the Supabase dashboard and restore the project.
- Built-in auth emails are **rate limited** (a small number per hour). "Forgot password" can fail until the limit resets. The phone save is not touched.
- Each cloud save must be **under 64 KB**. A normal game save is much smaller.
- The free database and monthly active users have plan caps. One save row per player is enough for this game.

## 9. Android app

The debug APK and the extra Supabase redirect are in [ANDROID.md](ANDROID.md). On the website, Google still returns to the page you started on. Inside the Android app, Google opens the system browser and returns to `com.hamzaxali.prismburst://auth`. Add that address (or `com.hamzaxali.prismburst://**`) under Supabase **Redirect URLs**. The service worker is not registered inside the app.

## Privacy page

Players, Google, and Facebook can open [privacy.html](https://hamzaxali.github.io/prismburst-brick-odyssey/privacy.html). It matches what the game stores: email and provider id if you sign in, the display name, and the game save. No ads and no analytics.
