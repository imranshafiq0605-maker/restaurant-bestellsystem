# Google Ads: Bestellmessung und Admin-Auswertung

## Einrichtung

Die Integration nutzt das bestehende Stripe-Checkout und Firebase Admin. Keine neuen kostenpflichtigen Dienste oder zusätzlichen Pakete erforderlich.

In der **Produktionsumgebung** des Vercel-Projekts setzen (danach neu deployen):

| Variable | Inhalt |
| --- | --- |
| `GOOGLE_ADS_ID` | Google-Ads-Tag-ID im Format `AW-…` |
| `GOOGLE_ADS_PURCHASE_LABEL` | Label der dedizierten La-Rosa-Kauf-Conversion, kein GA4-Eventname |
| `GOOGLE_ADS_ORIGIN` | Exakter kanonischer HTTPS-Origin der Website, ohne abschließenden Slash |
| `GOOGLE_ADS_ALTERNATE_ORIGIN` | Optionaler zweiter eigener HTTPS-Origin, hier `https://www.pizzerialarosagmbh.de` |
| `ADS_ATTRIBUTION_SECRET` | Optional: zufälliger langlebiger Signaturschlüssel; sonst wird der vorhandene Admin-/E-Mail-Code-Schlüssel bzw. Firebase-Schlüssel mit separatem Signaturpräfix verwendet |

Die Konfiguration wird zur Laufzeit gelesen, damit der vorhandene Container-Build keine öffentlichen Build-Variablen benötigt. Ohne vollständige Konfiguration, auf fremden Origins, in Vercel-Previews und in nativen Capacitor-Apps bleibt Google-Tracking aus. Ein Schlüsselwechsel macht frühere Zuordnungssignaturen unlesbar; den Schlüssel dauerhaft aufbewahren.

In Google Ads eine **Website → Kauf → manuell per Code**-Conversion für La Rosa verwenden: unterschiedliche Werte, EUR, Zählmethode „Jede“. Die Pizza-Kampagne auf diese Bestell-Conversion ausrichten; alte Jewelry-/Shopping-App-Ziele nicht als Ersatz verwenden. Automatisches Tagging aktivieren, damit `gclid`, `gbraid` oder `wbraid` auf der Zielseite ankommen. Die interne Zuordnung folgt dem letzten erkannten Anzeigenbesuch mit 30 Tagen Fenster; Google kann ein anderes Attributionsmodell verwenden.

Die Firestore-Collection `adsVisits` benötigt keinen Clientzugriff. In den **bestehenden** Firestore-Regeln Zugriffe aus dem Web-SDK dafür sperren (Admin SDK benötigt diese Regeln nicht). Bestehende Bestellregeln nicht pauschal ersetzen. Die Sammlung enthält nur Besuchs-ID, pseudonyme Browser-ID, Quelle und Zeit; keine Kundenkontakte und keine unveränderten Google-Klickkennungen.

## Ablauf

1. Die Website fragt nach Einwilligung; vor Zustimmung keine Google-Tag-Anfragen und keine Werbe-Zuordnung. Ablehnen und Erlauben sind gleichwertige Optionen, die Auswahl gilt höchstens 180 Tage und kann jederzeit geändert werden.
2. Ein eingewilligter Besuch mit einer Google-Klickkennung wird serverseitig gespeichert. Ein signiertes, sicheres HttpOnly-Cookie hält die Zuordnung maximal 30 Tage. Derselbe Klick wird innerhalb von 30 Minuten als ein Besuch gezählt. Das Cookie identifiziert einen Browser, keine Person. Anzeigen-URL-Kennungen sind messbare Hinweise, kein kryptografischer Nachweis von Google.
3. Checkout speichert ausschließlich die serverseitig validierte Zuordnung, sofern beim Bestellen weiterhin zugestimmt wurde. Die bestehende Webhook-Bestellung übernimmt sie. Kundenkontakte bleiben im Bestellsystem.
4. Stripe setzt `{CHECKOUT_SESSION_ID}` in die Rücksprung-URL ein. `/api/ads/purchase` prüft die Session mit dem geheimen Stripe-Schlüssel, Live-Modus, Zahlungsstatus und die vom Webhook gespeicherte Bestellung. Betrag kommt von Stripe, nicht aus dem Browser. `paid=true` allein löst nichts aus. Falls der Webhook noch nicht da ist, wird maximal eine Minute erneut geprüft.
5. Das Browser-Tag sendet `conversion` mit Bestell-ID (`transaction_id`), tatsächlich bezahltem EUR-Wert und Conversion-Label. Keine Namen, E-Mails, Telefonnummern oder Lieferadressen; keine erweiterten Conversions und keine personalisierte Werbung. Google dedupliziert anhand der Transaktions-ID. Zusätzlich verhindern Browser-Speicher und ein Speicher im laufenden Tab wiederholte Aufrufe. Ein Tag-Callback ist keine Empfangsbestätigung von Google; Adblocker/Netzfehler können Messungen verhindern.
6. Die Rücksprung-URL wird für Messereignisse bereinigt; Vercel Analytics erhält keine Query-Parameter. Referrer enthalten nur den Origin. Die Stripe-Session-ID ist ein vertrauliches Zugriffstoken und darf nicht in Logs oder externe Analysen kopiert werden.

## Admin: `/admin#google-ads`

Hinter der bestehenden Admin-Anmeldung: Tag, Kalenderwoche (Montag–Sonntag), Kalendermonat und Datumsauswahl; Berliner Zeitzone einschließlich Zeitumstellung. Besuche und wiedererkannte Browser nach Besuchsdatum; bezahlte Bestellungen und Umsatz nach Bestelldatum. Tagesverlauf und Suche nach Bestellnummer, Name oder E-Mail. Keine IP-Adresse im Bericht. Kundenkontakte werden nur über die authentifizierte Admin-API geliefert (`private, no-store`).

Nur Bestellungen mit gültiger Zuordnung und bestätigter Stripe-Live-Zahlung werden gezählt. Als storniert markierte Bestellungen sind ausgeschlossen; Stripe-Erstattungen werden **nicht automatisch** abgezogen. Ab 10.000 Datensätzen pro Zeitraum erscheint eine ausdrückliche Warnung statt scheinbar vollständiger Zahlen. Frühere Bestellungen werden nicht rückwirkend zugeordnet. Ohne Einwilligung, bei Gerätewechsel oder gelöschten Cookies fehlen Zuordnungen. Das Dashboard zeigt eigene Website-Daten, keine offiziellen Google-Ads-Klickzahlen, Kosten oder ROAS.

## Verifikation vor Freigabe

- `npm run test:ads`, `npm run test:security`, TypeScript und Produktionsbuild ausführen (Node 24.22.1+ innerhalb 24.x).
- Im Browser Ablehnen prüfen: keine Google-Anfrage, keine neue Anzeigenbesuch-Zuordnung. Zustimmung/Widerruf sowie Navigation und mobile Darstellung prüfen.
- Ohne Admin-Sitzung muss `/api/admin/google-ads` 401 liefern; ungültige Stripe-Sessions dürfen niemals einen Bestellwert liefern.
- Mit Googles Tag Assistant nach freiwilliger Zustimmung das geladene Tag und Consent-Signale prüfen. Den Bestellablauf zuerst mit gemockten Diensten testen; Testmodus-Zahlungen werden absichtlich nicht an die Live-Conversion gesendet.
- Die erste echte, vom Betreiber veranlasste Bestellung mit Einwilligung muss nach Webhook-Bestätigung genau eine Bestell-ID im Ereignis erhalten. Kein künstlicher Klick auf eigene Anzeigen und keine unbeauftragte echte Zahlung für den Test.
- Abschließend Google-Ads-Diagnose prüfen. Eine technische Implementierung beweist weder eine bereits erfasste Conversion noch eine profitable Kampagne.

## Referenzen

- [Google: Consent Mode](https://developers.google.com/tag-platform/security/guides/consent)
- [Google: Conversions](https://developers.google.com/tag-platform/devguides/conversions)
- [Stripe: Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)
