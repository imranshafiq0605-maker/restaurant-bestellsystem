# La Rosa iOS-App

Die iOS-App liegt unter `ios/App/App.xcodeproj` und verwendet Capacitor. Sie
lädt die eigenständige App-Oberfläche unter
`https://restaurant-bestellsystem.vercel.app/mobile`. Dadurch verwenden Website und
App dieselbe Firebase-Datenbank sowie dieselben Bestell-, Stripe- und
E-Mail-Endpunkte auf Vercel.

## In Xcode öffnen

```bash
npm install
npm run ios:sync
npm run ios:open
```

`npm run ios:open` öffnet ausdrücklich
`/Users/karina.mhs/Downloads/Xcode-beta.app` (Xcode 27 Beta), nicht die normale
Xcode-Installation. Danach oben das iPhone oder einen Simulator auswählen und
auf den Start-Button klicken.

Für eine lokale Vorschau zuerst `npm run dev` laufen lassen und in einem
zweiten Terminal `npm run ios:local` ausführen. Der Simulator lädt dann die
neue App-Oberfläche direkt vom Mac. `npm run ios:sync` stellt anschließend
wieder die produktive Vercel-Adresse ein.

Für die Vorschau auf dem echten iPhone müssen Mac und iPhone im selben WLAN
sein. Dann `npm run dev` laufen lassen, in einem zweiten Terminal
`npm run ios:device` ausführen und das Projekt mit `npm run ios:open` in Xcode
Beta öffnen. Dieser Modus verwendet `http://192.168.178.105:3000` und startet
automatisch auf `/mobile`.

Vor Archive/TestFlight/App Store immer `npm run ios:production` ausführen.
Damit wird die App wieder mit der sicheren produktiven URL gebaut.

Falls Xcode meldet, dass iOS nicht installiert ist, unter **Xcode → Settings →
Components** die zum Xcode-SDK passende iOS-Simulatorversion installieren oder
aktualisieren. Xcode und Simulator müssen denselben Buildstand verwenden.

## Firebase-Anmeldung

Die App unterstützt E-Mail/Passwort, Google, Apple und SMS als zweiten Faktor.
In Firebase Authentication müssen diese Anbieter aktiviert sein. Unter
**Settings → Authorized domains** müssen `localhost` und die Vercel-Domain
`restaurant-bestellsystem.vercel.app` eingetragen sein. Für Apple sind
zusätzlich die Apple-Service-ID und der private Schlüssel in Firebase nötig.

## Änderungen übernehmen

Web-Änderungen werden wie bisher über GitHub nach Vercel veröffentlicht und
sind anschließend automatisch in der App sichtbar. Wenn native Plugins oder
die Capacitor-Konfiguration geändert wurden, zusätzlich `npm run ios:sync`
ausführen.

## App Store

Vor dem Hochladen muss in Xcode unter **Signing & Capabilities** das eigene
Apple-Developer-Team ausgewählt werden. Die Bundle-ID lautet
`com.larosa.bestellsystem`.
