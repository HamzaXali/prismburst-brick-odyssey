<!-- Legacy Supabase Google notes. Current flow: docs/FIREBASE-SETUP.md + auth-bridge.html -->

# Google sign-in (phone browser)

Use Chrome on the Android phone. If a button is cut off or a form is too wide, open the Chrome menu (the three dots) and turn on **Desktop site**. You can turn it off again after the form is saved.

This turns on the **Continue with Google** button. Email sign-in keeps working if you stop halfway. The button stays disabled and says **Not set up yet** until the last step.

There are two different addresses. Do not swap them.

| What | Address | Where it goes |
| --- | --- | --- |
| Game page (GitHub Pages) | `https://hamzaxali.github.io/prismburst-brick-odyssey/` | Supabase **Site URL**, and the page the player comes back to |
| JavaScript origin | `https://hamzaxali.github.io` | Google Cloud **Authorized JavaScript origins**. Origin only. No path, no slash at the end |
| Google redirect URI | Copy from Supabase. Expected: `https://qogqnutpqzatxnbhcznc.supabase.co/auth/v1/callback` | Google Cloud **Authorized redirect URIs**. This is Supabase, not the game |

The value shown in the Supabase Google provider screen is the one to copy. If it ever differs from the expected address above, use the screen.

The Google **client secret** is typed only into Google Cloud and into Supabase. Do not put it in GitHub, in `config.js`, or in a chat message.

## 1. Create the Google Cloud project

1. Open [https://console.cloud.google.com/](https://console.cloud.google.com/). Sign in with the Google account that should own the game's sign-in.
2. Open the project picker at the top. Choose **New project**.
3. Name it `PRISMBURST`. Create it, then make sure that project is the one selected at the top.

## 2. OAuth consent screen

1. Open [https://console.cloud.google.com/auth/overview](https://console.cloud.google.com/auth/overview) (Google may also call this **Google Auth platform** or **OAuth consent screen**).
2. If it asks for a user type, choose **External**. Create.
3. App name: `PRISMBURST`.
4. User support email: your Gmail address.
5. Application home page, if asked: `https://hamzaxali.github.io/prismburst-brick-odyssey/`.
6. Privacy policy: `https://hamzaxali.github.io/prismburst-brick-odyssey/privacy-policy.html`.
7. Save, then continue until you can add scopes.
8. Add only these scopes: `openid`, `.../auth/userinfo.email`, and `.../auth/userinfo.profile`. In the list they are the basic **email**, **profile**, and **openid** scopes. Do not add extra scopes.
9. Save.
10. **Test users**: add the Gmail address you will use to try the game. While the app is in Testing, Google rejects every other account.
11. Leave the app in **Testing** until you have signed in once yourself. When every player should be able to use Google, come back and **Publish** the app. Publishing can ask you to verify the app if you request sensitive scopes. These three basic scopes usually do not need a long review, but Google may still show an "unverified app" warning until you publish.

## 3. Create the Web client

1. Open [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Web application**. Name: `PRISMBURST web`.
4. **Authorized JavaScript origins** → **Add URI**: `https://hamzaxali.github.io`  
   That is the origin only. Do not add `/prismburst-brick-odyssey` or a trailing path.
5. **Authorized redirect URIs** → **Add URI**: paste the callback you copy in the next section. It is not the GitHub Pages address.
6. You can leave the redirect blank for a moment, create the client, and come back to add it. Google lets you edit the client later.
7. Create. Copy the **Client ID**. Copy the **Client secret** into a note on the phone. You will paste both into Supabase and nowhere else.

## 4. Paste the client into Supabase and copy the callback

1. Open the Supabase project: [https://supabase.com/dashboard/project/qogqnutpqzatxnbhcznc/auth/providers](https://supabase.com/dashboard/project/qogqnutpqzatxnbhcznc/auth/providers).
2. Open **Google**.
3. Find **Callback URL (for OAuth)**. Copy that whole address. For this project it should look like `https://qogqnutpqzatxnbhcznc.supabase.co/auth/v1/callback`. The text on this screen wins if it is different.
4. Go back to the Google Cloud client from section 3 and paste that callback into **Authorized redirect URIs**. Save the Google client.
5. Back on the Supabase Google screen, turn **Enable Sign in with Google** on.
6. Paste the **Client ID** and the **Client secret**.
7. Leave the scopes as the defaults (`openid`, `email`, `profile`) if Supabase shows them. Do not add extra scopes.
8. Save.

## 5. Allow the game page to come back

In Supabase open **Authentication** → **URL Configuration**.

- **Site URL:** `https://hamzaxali.github.io/prismburst-brick-odyssey/`
- **Redirect URLs**, one per line:
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/**`
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/`
  - `https://hamzaxali.github.io/prismburst-brick-odyssey/index.html`

Save.

The game asks Supabase to return to the page the player started on (`redirectTo` is that page, with no extra path invented). If that page is not on the allow list, Supabase sends the player to the Site URL instead.

## 6. Run the display-name SQL

If you have not already, paste [supabase/migrations/002_profiles.sql](https://github.com/HamzaXali/prismburst-brick-odyssey/blob/main/supabase/migrations/002_profiles.sql) into the Supabase **SQL Editor** and run it. The live project already has `player_saves`. This file only adds `public.profiles`. It does not change saved games.

## 7. Turn the button on with a pull request

`config.js` in the repo still has `providers.google: false`. That is deliberate.

1. On GitHub, open a pull request that changes only `providers.google` from `false` to `true`. Do not change the Supabase URL or the publishable key. Do not add the client secret.
2. Merge that pull request into `main` when you are ready. The existing **Deploy to GitHub Pages** workflow publishes it. There is no second deploy workflow.
3. Wait until that workflow is green. Fully close the game tab. Open [https://hamzaxali.github.io/prismburst-brick-odyssey/](https://hamzaxali.github.io/prismburst-brick-odyssey/) again.

Until that flag is true, the Google button stays disabled. Email buttons stay usable.

## 8. Try it

On the phone, in Chrome:

1. Play a little as a guest so the phone has progress, or just open Account.
2. Account shows a name like `PrismPlayer1234`. That name is on the phone only.
3. Tap **Continue with Google**. Sign in with a Gmail address that is a test user (section 2).
4. If Google asks for email, profile, and openid, allow those. Do not expect any other permission.
5. You land back on the game page. The address should not keep `?code=` or `?error=` in it.
6. If both the phone and the account have progress, the game asks you to merge, use the cloud copy, or keep this device. It does not replace one with the other by itself.
7. If the account has no display name yet, the sheet suggests the Google account name (`full_name` or `name`). If Google did not send one, it suggests the guest name. It does not suggest your email. Nothing is stored until you tap **Save name**.
8. The name shows on the Account sheet and under the main menu. You can edit it later and tap **Save name** again.
9. Log out. The guest name and the progress on the phone stay. Sign in again and the account name comes back.
10. Try the same Google button once in desktop Chrome if you have it. The phone is the one that matters.

Cancel the Google screen (or tap back) and the game should say sign-in was cancelled. The phone save stays byte for byte.

## If something goes wrong

**`redirect_uri_mismatch`** on the Google screen. The redirect URI on the Google client is not exactly the Supabase callback. Open Supabase → Authentication → Sign In / Providers → Google, copy **Callback URL (for OAuth)** again, and paste it into the Web client's **Authorized redirect URIs**. No extra slash, no game path. Save, wait a minute, and try again.

**`redirect URL not allowed`** or the game says sign-in could not return to this page. Supabase did not allow the game URL, so it fell back to the Site URL or rejected the return. Check section 5. The Site URL must be `https://hamzaxali.github.io/prismburst-brick-odyssey/` and the allow list must include `https://hamzaxali.github.io/prismburst-brick-odyssey/**`.

**Error `access_denied` after you come back.** You cancelled, or the Google app is in Testing and that Gmail address is not a test user. Add the address under Test users, or publish the consent screen. The phone save is unchanged.

**`unauthorized` domain, or the JavaScript origin is rejected.** The origin on the Google client must be `https://hamzaxali.github.io` with `https`, with no path. The game lives under `/prismburst-brick-odyssey/`, but that path is not part of the JavaScript origin.

**The Google page never comes back to the game.** Close every game tab. In Chrome, open the site settings for `hamzaxali.github.io` and clear stored data, or wait and reload twice so the new service worker replaces the old one. The game does not serve the cached shell for a return that contains `code`, `error`, or `access_token`. An old service worker from before this version can still get in the way until it updates.

**Email stopped working.** It should not. Google being off, or a failed Google attempt, does not clear `prismburst.save.v1`. Use **Log in** with email on the same Account sheet.

**The name will not save.** It needs 3 to 20 characters, after trimming. Normal letters, accents, and emoji are fine. Empty names, the email address, `<`, `>`, and control characters are rejected. A message appears on the sheet. Progress is not changed by a failed name save.

**Live Google sign-in cannot be tested in the repository.** The flag ships as `false`, and Google Cloud is not configured by the game code. The checks in this repo use a fake Supabase. After you finish the steps above and merge the one-line flag change, try section 8 on the phone. That is the real test.
