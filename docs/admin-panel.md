# Admin-Panel (/admin)

## Zugang
- Anmeldung mit E-Mail + Passwort eines Firebase-Kontos, danach bei **jeder** Anmeldung ein 6-stelliger Code per E-Mail (10 Min. gültig, 5 Versuche). Sitzung: 12 Stunden, httpOnly-Cookie.
- Erlaubte Adressen: larosa1993@outlook.de (fest in app/lib/admin-auth.ts) plus optional weitere, kommagetrennt in der Umgebungsvariable `ADMIN_EMAILS` in Vercel.
- Optional: `ADMIN_SESSION_SECRET` (sonst `EMAIL_CODE_SECRET` bzw. `FIREBASE_PRIVATE_KEY`).

## Bereiche
- **Öffnungszeiten** je Wochentag für Abholung und Lieferung. Gespeichert in `einstellungen/website`, gelesen über `/api/site-settings` (Startseite, Warenkorb, Checkout).
  - **Besondere Öffnungszeiten** (`specialDays`): ein Tag oder Zeitraum, Abholung und Lieferung jeweils „wie immer“, „geschlossen“ oder eigene Zeiten. Gehen den Wochenzeiten vor. Die Startseite zeigt heute einen Hinweis und darunter die kommenden besonderen Tage. Alte `closedDates` werden beim Laden automatisch übernommen.
  - **Sofort schließen** (`closure`) mit Dauer (30 Min., 1–2 Std., Rest des Tages, bis Datum oder unbegrenzt). `closure.until` ist ein ISO-Zeitpunkt; danach gilt automatisch wieder geöffnet (`isClosureActive`).
- Auf dem Handy hat das Panel eine Navigation unten, Fenster öffnen sich von unten und Kunden erscheinen als Karten.
- **Speisekarte**: Kategorien und Produkte. Solange nichts gespeichert ist, gilt `app/data/menu.ts`; nach dem Speichern `einstellungen/speisekarte` (JSON). „Originalkarte wiederherstellen“ löscht das Dokument.
- **Kunden**: alle Firebase-Konten plus Gastbesteller aus `bestellungen`. Kundennummern ab 10001 werden beim Laden rückwirkend vergeben (`kunden/{uid}.kundennummer`, `gaeste/{emailHash}`), neue Konten bekommen sie beim ersten Laden des Profils.
- **Newsletter**: Anmeldung per Häkchen bei der Registrierung oder im Konto (`kunden/{uid}.newsletter`). Versand über Resend von `newsletter@pizzerialarosagmbh.de` mit Abmelde-Link; Verlauf in `newsletterVersand`.
