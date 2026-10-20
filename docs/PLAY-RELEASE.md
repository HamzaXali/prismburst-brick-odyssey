# Play release build (phone only)

This builds a signed Android App Bundle for Google Play, and a signed APK you can install on your phone to test that same build. The keystore never goes in the git repository. Do not paste the keystore or the passwords into chat, email, or a GitHub issue.

The debug APK workflow is separate and stays as it is. Use [ANDROID.md](ANDROID.md) for that install. A pull request also runs a signing check with a key the runner creates and deletes. That check does not upload a Play file. Do not ship anything from that check.

## What version the first upload uses

`package.json` is the source of those numbers:

- `version` is the `versionName` players can see. The first upload is `1.3.1`.
- `androidVersionCode` is the `versionCode`. The first upload is `1`.

Google Play rejects an upload whose `versionCode` is not higher than the one already in the console. The next upload must use `2`, then `3`, and so on. Change `androidVersionCode` in `package.json` before you run the workflow. Change `version` when you want the visible name to change (`1.3.2`, `1.4.0`, and so on).

You can also type both numbers into the workflow form when you tap **Run workflow**. A git tag named `v1.3.1` uses that tag as `versionName` and still reads `androidVersionCode` from `package.json`.

## 1. Create the upload keystore in Termux

Install [Termux](https://f-droid.org/packages/com.termux/) from F-Droid. Then paste this:

```sh
pkg install openjdk-17
keytool -genkeypair -v -keystore prismburst-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias prismburst-upload
```

keytool asks for a store password, your name, and a key password. You can press Enter on the name questions. The alias you type later must be exactly `prismburst-upload`.

Java 17 writes a PKCS12 file. That format keeps one password. If keytool says the key password was ignored, type the store password again when it asks for the key password, and use that same password for both `KEYSTORE_PASSWORD` and `KEY_PASSWORD`. A different key password makes the signed build fail.

The file `prismburst-upload.jks` is now in the Termux home folder. Turn the file into one long line:

```sh
base64 -w0 prismburst-upload.jks
```

That line is the first secret. It is not a password. Leave Termux open so you can copy it, or write the file somewhere outside the repository. Do not commit it.

## 2. Add the four secrets on the GitHub website

On the phone, open the repository in Chrome: [HamzaXali/prismburst-brick-odyssey](https://github.com/HamzaXali/prismburst-brick-odyssey).

1. Tap **Settings**.
2. Tap **Secrets and variables**, then **Actions**.
3. Tap **New repository secret** four times. The name must match. The value is hidden after you save.

| Secret name | Value |
| --- | --- |
| `KEYSTORE_BASE64` | The one long line from `base64 -w0` |
| `KEYSTORE_PASSWORD` | The store password you typed for keytool |
| `KEY_ALIAS` | `prismburst-upload` |
| `KEY_PASSWORD` | The key password you typed for keytool |

If a secret is missing, the release run stops at the first step and names the missing secret. It does not print the value.

## 3. Back up the key offline

Copy `prismburst-upload.jks` off the phone, and write both passwords somewhere that is not GitHub and not this chat. Play App Signing means Google holds the key players install, and you hold the upload key. If you lose the upload key you can ask Google for an upload-key reset, but the backup is what keeps the next update simple. Do the backup before you delete the file from Termux.

## 4. Run the workflow and download the AAB

1. Open the repository, tap **Actions**.
2. Tap **Android release**.
3. Tap **Run workflow**. Leave both version boxes empty for the first upload (`1.3.1` and version code `1`).
4. Open the run when it has a green check.
5. Under **Artifacts**, download **prismburst-release-aab**. That zip contains `app-release.aab`. Upload that file in Play Console.
6. **prismburst-release-apk** is the same build as an APK, for installing on your phone. It is not the file you upload to Play.

The run log prints SHA-256 checksums of those two files, plus `apksigner verify --print-certs` and `jarsigner -verify`. The certificate SHA-256 in that log is public. The log must not contain the keystore or the passwords. The runner deletes the keystore at the end of the job, including when the build fails.

## Release hardening already in the project

- Release builds set `debuggable` to false and shrink with R8. ProGuard rules keep Capacitor and the WebView bridge.
- WebView remote debugging follows that flag. The Capacitor config no longer forces debugging on, so a release build leaves it off and a debug APK can still be inspected.
- Cleartext HTTP is off. The game and Supabase use HTTPS.
- Android Auto Backup is off (`android:allowBackup="false"`). The WebView holds the sign-in session and `prismburst.save.v1`. A backup would copy those to the player's Google account. Cloud save still works after sign-in. A guest save stays on that device only.
- `targetSdk` and `compileSdk` are 36. `minSdk` is 24 (Android 7.0), which is the Capacitor 8 floor.

Google's target API page, last updated 16 October 2026, says that from 31 August 2026 new apps and updates must target Android 16 (API level 36) or higher: [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk). This app targets 36, so it meets that rule. Wear OS, TV, Automotive, and XR have different floors. This is a phone app.

The real signed upload is not produced until the four secrets exist. Until then, only the throwaway pull-request check has signed a build.
