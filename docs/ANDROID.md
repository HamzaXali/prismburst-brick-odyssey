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

`com.prismburst.brickodyssey://auth`

If the form wants a wildcard, this also works:

`com.prismburst.brickodyssey://**`

Save. The Site URL stays the GitHub Pages address. Email confirmation and password-reset links use the same app address when they are sent from the app, so those links open the app too.

If that redirect URL is missing, Supabase sends the player to the Site URL instead of back into the app. Closing the browser without finishing leaves the phone save as it was.

The app opens Google through the Capacitor **Browser** plugin (Custom Tabs), then an in-app **OpenUrl** Intent.ACTION_VIEW helper if Custom Tabs fails, then window.open. Errors include a short `[vX.Y.Z step=…]` code so a screenshot shows which build and step failed (`window.Capacitor.Plugins.Browser.open`), which uses Android Custom Tabs. If that plugin handle is missing, the game falls back to `window.open`. This static WebView build does not ship `@capacitor/core`'s `registerPlugin` API.

The Google Cloud **Authorized redirect URI** is still the Supabase callback (`https://qogqnutpqzatxnbhcznc.supabase.co/auth/v1/callback`, or whatever the Supabase Google page shows). Do not put the `com.prismburst.brickodyssey` address into Google Cloud. That address belongs only in Supabase's redirect allow list.

## 5. Play Store build

The signed Play bundle is a different workflow from this debug APK. The phone steps, the upload keystore, and the four GitHub secrets are in [PLAY-RELEASE.md](PLAY-RELEASE.md). The alias is `prismburst-upload`. Do not paste the keystore or the passwords into chat.
