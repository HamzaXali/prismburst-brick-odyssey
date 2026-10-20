# Install the Android debug app (phone only)

This builds a free debug APK of the same game that runs on the website. Chrome on the phone is enough. If a GitHub button is cut off, open the Chrome menu and turn on **Desktop site**.

The app is signed with the automatic debug key. It is for installing on your phone. It is not a Play Store build.

## 1. Download the APK

1. Open the game repository on GitHub: [HamzaXali/prismburst-brick-odyssey](https://github.com/HamzaXali/prismburst-brick-odyssey).
2. Tap **Actions**.
3. Tap **Android debug APK** in the workflow list.
4. Open the newest run that has a green check. A run starts on its own for a pull request, or you can tap **Run workflow** on that workflow page.
5. Scroll to **Artifacts**.
6. Download **prismburst-debug-apk**. GitHub gives you a zip file.

In the GitHub Android app, open the same Actions run and download the artifact. The zip lands in the Downloads folder.

## 2. Unzip it

1. Open the **Files** app (or the download notification).
2. Find `prismburst-debug-apk.zip` in Downloads.
3. Tap it and extract. Inside is `app-debug.apk`.

## 3. Install it

1. Tap `app-debug.apk`.
2. If Android asks, allow this install. On newer phones the switch is **Install unknown apps** for Chrome or the Files app. Turn it on for that one app, then go back and tap the APK again.
3. Tap **Install**, then **Open**.

The game is full screen. Progress is stored on the phone under `prismburst.save.v1`, and the display name under `prismburst.profile.v1`, the same as the website. Guest play works offline. Email sign-in and cloud save work when the phone has a connection.

Updating the app later: download a newer artifact and install it over this one. Uninstalling deletes the save stored in the app.

## 4. Google sign-in from the app

Google does not allow the normal sign-in page inside the app's web view. **Continue with Google** opens Chrome (or the phone's browser). When it finishes, Android opens PRISMBURST again.

That return address is not the website. In Supabase open **Authentication → URL Configuration → Redirect URLs** and add:

`com.hamzaxali.prismburst://auth`

If the form wants a wildcard, this also works:

`com.hamzaxali.prismburst://**`

Save. The Site URL stays the GitHub Pages address. Email confirmation and password-reset links use the same app address when they are sent from the app, so those links open the app too.

If that redirect URL is missing, Supabase sends the player to the Site URL instead of back into the app. Closing the browser without finishing leaves the phone save as it was.

The Google Cloud **Authorized redirect URI** is still the Supabase callback (`https://qogqnutpqzatxnbhcznc.supabase.co/auth/v1/callback`, or whatever the Supabase Google page shows). Do not put the `com.hamzaxali.prismburst` address into Google Cloud. That address belongs only in Supabase's redirect allow list.

## 5. Later: a release key (not done yet)

A Play Store build needs a release keystore that you keep forever. This pull request does not create one and does not sign a release APK.

When you want that, on the phone with [Termux](https://f-droid.org/packages/com.termux/):

1. `pkg install openjdk-17`
2. `keytool -genkeypair -v -keystore prismburst-release.keystore -alias prismburst -keyalg RSA -keysize 2048 -validity 10000`
3. Store the keystore file somewhere safe, off the phone if you can. Losing it means you cannot update the Play listing.
4. `base64 -w 0 prismburst-release.keystore` and copy that long text.

In the GitHub repository, **Settings → Secrets and variables → Actions → New repository secret**. Create these four. The values stay in GitHub. They do not go in the repo or in chat.

| Secret | What it is |
| --- | --- |
| `KEYSTORE_BASE64` | The base64 text of the keystore file |
| `KEYSTORE_PASSWORD` | The store password you typed for keytool |
| `KEY_ALIAS` | `prismburst`, unless you chose another alias |
| `KEY_PASSWORD` | The key password you typed for keytool |

A later change can teach the workflow to build a release APK with those secrets. Do not add them until you have the keystore.
