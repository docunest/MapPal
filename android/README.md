# MapPal button (Android)

A floating 📍 button for the dashboard phone/tablet. Tap it anywhere → it
gets the current GPS position → opens the MapPal web app there.

**Designed to be installed once.** All features live in the web app, which
updates without touching the device. The APK only:

1. reads GPS (no Google Play Services needed),
2. fills `{lat}` `{lng}` `{acc}` into a link you can edit in the app,
3. opens it in a Chrome Custom Tab (shares Chrome's login cookies).

It knows nothing else about the web app, so web changes never need a new
APK. If the web address or URL format changes, edit the link in the app.
After a reboot (dashboard power-cycles with the car) the button comes back
by itself.

## Contract with the web app (keep stable)

`https://<mappal>/?lat=<lat>&lng=<lng>&acc=<meters>` — see
`components/nearby/useLocation.ts`. Without coordinates the web app uses
the browser's GPS.

## Install

1. GitHub → Actions → "Android APK" → latest run → download
   `mappal-button-apk` (unzip → `app-debug.apk`). Or build locally:
   `cd android && ./gradlew assembleDebug -PmappalUrl=https://your-app`.
2. Copy to the device, open it, allow "install unknown apps" once.
3. In the app: set the link (your MapPal address), tap 1-2-3 to allow
   location, "display over other apps" and notifications, then
   "Show floating button".
4. Log in to MapPal once in the Chrome tab it opens.

Drag the button to move it; long-press to hide it.

## Optional: fixed signing key (lets future builds install over this one)

Create once: `keytool -genkeypair -v -keystore mappal.keystore -alias mappal
-keyalg RSA -keysize 2048 -validity 20000`, then add repo secrets
`MAPPAL_KEYSTORE_B64` (`base64 -w0 mappal.keystore`),
`MAPPAL_KEYSTORE_PASSWORD`, `MAPPAL_KEY_ALIAS` (`mappal`),
`MAPPAL_KEY_PASSWORD`. Set repo variable `MAPPAL_URL` to bake in the default
link.
