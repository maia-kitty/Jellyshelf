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

### Offline: downloads, reader and player

Inside the app, Jellyshelf's pages get **download buttons**: on each manga chapter (plus "Download unread"), each
episode, and a film's "In your library" card. Account menu → **Downloads** (also on the "Can't connect" screen) is the
app's own screen, bundled in the app so it works with no connection at all:

- **Manga** is read in the app (one long strip, "Next chapter" at the end). Chapters are stored as CBZs in Mihon's
  Local-source layout (`Manga/<Series>/<Series> - Ch. 012.cbz`), so Mihon can read the same folder.
- **Episodes and films** are the original files, played in the app with Media3 (ExoPlayer), the file's own audio and
  subtitle tracks, and styled anime subtitles drawn by libass ([ass-media](https://github.com/peerless2012/libass-android)).
  It picks up where you left off.
- **Progress made offline** (chapters read to the end, how far you got in an episode) is sent to the server the next
  time the app reaches it, so AniList and Jellyfin catch up.
- **Where downloads go:** the app's own storage, or a folder you pick (Downloads → Choose a folder). Each place keeps
  its own list (`jellyshelf-downloads.json` next to the files); switching doesn't move what's already downloaded.
- Downloads run in the background with a progress notification, one at a time, and a dropped download resumes where it
  stopped.

The server side: chapters come from `/api/manga/<id>/<chapter>/file` (Mangarr's CBZ), videos through the Jellyfin relay
(`/api/jf/Videos/<item>/stream?static=true`), both with the app's sign-in.

Android 11 or newer. No Google Play services, no tracking. The release APK is about 10 MB (most of it is libass), built
for 64-bit phones and the x86_64 emulator.

## Build

Needs the Android SDK (platform 36) and JDK 17.

```sh
cd android
echo "sdk.dir=$HOME/Android/Sdk" > local.properties   # where your SDK is
JAVA_HOME=/usr/lib/jvm/java-17-openjdk gradle assembleRelease
```

The APK lands in `app/build/outputs/apk/release/app-release.apk`. Copy it to the phone and open it to install (allow
installing from that app when Android asks), or `adb install app/build/outputs/apk/release/app-release.apk`.

**Signing:** release builds use your own key when `~/.local/share/jellyshelf-android/keystore.properties` exists
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), and the debug key otherwise, so a fresh clone still builds
something installable. Make a key once:

```sh
keytool -genkeypair -keystore ~/.local/share/jellyshelf-android/release.jks -storetype PKCS12 \
  -alias jellyshelf -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=Jellyshelf"
```

Keep a backup of it: Android only installs an update signed with the same key as the installed app, so a lost key means
uninstalling (and signing in again) to update.

## Not (yet) in it

- Uploading files from the phone (nothing in Jellyshelf needs it today)
- Pull to refresh
- Notifications: use the ntfy app with Jellyshelf's **Phone notifications** as before
- Two pages side by side in the offline reader (the online reader has it)
- Picking which audio/subtitle track to download: the whole file comes down
