# Jellyshelf for Android

A small Android app that opens your Jellyshelf server full screen, so it feels like an app instead of a browser tab.
It's the same web app inside (a WebView), so everything Jellyshelf does works the same, and it updates whenever the
server does.

What the app adds:

- **Asks for your server once.** First start shows a "server address" screen (`192.168.1.10:8101` is fine, `http://`
  is added). Change it later: long-press the app icon → **Change server**.
- **Stays signed in**, like a browser would.
- **Full-screen video**: the player's full-screen button hides the status and navigation bars.
- **Back goes back a page**, and closes the app on the first page.
- **Links to other sites** (AniList, TMDB, FMHY…) open in your browser. AniList's sign-in stays in the app, because it
  comes back to your server.
- **Can't reach the server?** A "Can't connect" screen with Try again / Change server, instead of a browser error page.
- **Plain http on your home network** is allowed, since that's how most home servers run.
- The web app can tell it's in the app: the user agent ends in `JellyshelfAndroid/<version>`.

Android 11 or newer. No Google Play services, no extra libraries, no tracking: the release APK is about 40 KB.

## Build

Needs the Android SDK (platform 36) and JDK 17.

```sh
cd android
echo "sdk.dir=$HOME/Android/Sdk" > local.properties   # where your SDK is
JAVA_HOME=/usr/lib/jvm/java-17-openjdk gradle assembleRelease
```

The APK lands in `app/build/outputs/apk/release/app-release.apk`. Copy it to the phone and open it to install (allow
installing from that app when Android asks), or `adb install app/build/outputs/apk/release/app-release.apk`.

The release build is signed with the debug key so it installs as is. To publish it anywhere, sign it with your own
keystore instead (`signingConfigs` in `app/build.gradle.kts`).

## Not (yet) in it

- Uploading files from the phone (nothing in Jellyshelf needs it today)
- Pull to refresh
- Notifications: use the ntfy app with Jellyshelf's **Phone notifications** as before
- Offline manga: use Mihon with the Syncthing'd folder (see the Mangarr docs)
