import Link from "next/link";

export default function DatenschutzPage() {
  return (
    <main className="legal-page">
      <div className="legal-container">
        <div className="legal-card">
          <div className="legal-topbar">
            <Link href="/" className="legal-back-button">
              ← Zurück zur Startseite
            </Link>
          </div>

          <div className="legal-head">
            <span className="legal-eyebrow">Rechtliches</span>
            <h1>Datenschutzerklärung</h1>
            <p className="legal-lead">
              Informationen zur Verarbeitung personenbezogener Daten auf unserer
              Website und im Rahmen von Bestellungen.
            </p>
          </div>

          <section className="legal-section">
            <h2>1. Verantwortlicher</h2>
            <p>
              Verantwortlich für die Datenverarbeitung auf dieser Website ist:
            </p>
            <p>
              La Rosa GmbH
              <br />
              Bahnhofstraße 2
              <br />
              64546 Mörfelden-Walldorf
              <br />
              E-Mail: larosa1993@outlook.de
              <br />
              Telefon: 06105 297883
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Allgemeine Hinweise</h2>
            <p>
              Der Schutz Ihrer persönlichen Daten ist uns ein besonderes
              Anliegen. Wir behandeln Ihre personenbezogenen Daten vertraulich
              und entsprechend der gesetzlichen Datenschutzvorschriften,
              insbesondere der DSGVO.
            </p>
            <p>
              Personenbezogene Daten sind alle Daten, mit denen Sie persönlich
              identifiziert werden können. Diese Datenschutzerklärung erläutert,
              welche Daten wir erheben, wie wir sie nutzen und zu welchem Zweck
              das geschieht.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Hosting</h2>
            <p>
              Unsere Website wird über externe technische Dienstleister
              bereitgestellt. Dabei können technische Zugriffsdaten wie
              IP-Adresse, Browserdaten, Betriebssystem, Datum und Uhrzeit des
              Zugriffs sowie weitere Server-Log-Daten verarbeitet werden.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Zugriffsdaten und Server-Logfiles</h2>
            <p>
              Beim Aufruf unserer Website werden durch den Browser automatisch
              Informationen an den Server übermittelt. Diese Informationen werden
              temporär in sogenannten Logfiles gespeichert.
            </p>
            <ul>
              <li>IP-Adresse</li>
              <li>Datum und Uhrzeit der Anfrage</li>
              <li>Browsertyp und Browserversion</li>
              <li>verwendetes Betriebssystem</li>
              <li>Referrer-URL</li>
              <li>Name der aufgerufenen Datei bzw. Seite</li>
            </ul>
            <p>
              Die Verarbeitung erfolgt zur Sicherstellung des technischen
              Betriebs, der Systemsicherheit und der Fehleranalyse.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Kontaktaufnahme</h2>
            <p>
              Wenn Sie uns per E-Mail, telefonisch oder über Eingabefelder auf
              der Website kontaktieren, verarbeiten wir Ihre Angaben zur
              Bearbeitung Ihrer Anfrage und für eventuelle Rückfragen.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Bestellungen über die Website</h2>
            <p>
              Im Rahmen des Bestellprozesses verarbeiten wir die von Ihnen
              eingegebenen Daten, soweit dies zur Durchführung Ihrer Bestellung
              erforderlich ist.
            </p>
            <ul>
              <li>Name</li>
              <li>Telefonnummer</li>
              <li>E-Mail-Adresse</li>
              <li>Adresse bei Lieferung</li>
              <li>Bestellinhalt</li>
              <li>Hinweise zur Bestellung</li>
              <li>gewünschte Bestellzeit</li>
            </ul>
            <p>
              Die Verarbeitung erfolgt zur Vertragsdurchführung, zur
              Kundenkommunikation sowie zur internen Bearbeitung und Abwicklung
              der Bestellung.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Zahlungsabwicklung</h2>
            <p>
              Für Online-Zahlungen können externe Zahlungsdienstleister
              eingebunden werden. Dabei werden die für die Zahlung erforderlichen
              Daten an den jeweiligen Anbieter übermittelt, soweit dies zur
              Zahlungsabwicklung notwendig ist.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Speicherdauer</h2>
            <p>
              Wir speichern personenbezogene Daten nur so lange, wie dies für
              die jeweiligen Verarbeitungszwecke erforderlich ist oder
              gesetzliche Aufbewahrungsfristen bestehen.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Rechtsgrundlagen</h2>
            <p>Die Verarbeitung Ihrer Daten erfolgt insbesondere auf Grundlage:</p>
            <ul>
              <li>Art. 6 Abs. 1 lit. b DSGVO (Vertrag / Bestellung)</li>
              <li>Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Verpflichtung)</li>
              <li>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</li>
              <li>Art. 6 Abs. 1 lit. a DSGVO (Einwilligung, soweit erforderlich)</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>10. Ihre Rechte</h2>
            <p>Sie haben insbesondere folgende Rechte:</p>
            <ul>
              <li>Auskunft über gespeicherte Daten</li>
              <li>Berichtigung unrichtiger Daten</li>
              <li>Löschung Ihrer Daten</li>
              <li>Einschränkung der Verarbeitung</li>
              <li>Datenübertragbarkeit</li>
              <li>Widerspruch gegen bestimmte Verarbeitungen</li>
              <li>Widerruf erteilter Einwilligungen</li>
              <li>Beschwerde bei einer Aufsichtsbehörde</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>11. Datensicherheit</h2>
            <p>
              Wir setzen technische und organisatorische Maßnahmen ein, um Ihre
              Daten vor Verlust, Manipulation und unbefugtem Zugriff zu
              schützen.
            </p>
          </section>

          <section className="legal-section">
            <h2>12. SSL-/TLS-Verschlüsselung</h2>
            <p>
              Diese Website nutzt aus Sicherheitsgründen eine
              SSL-/TLS-Verschlüsselung. Sie erkennen dies in der Regel an
              „https://“ in der Adresszeile Ihres Browsers.
            </p>
          </section>

          <section className="legal-section">
            <h2>13. Änderungen</h2>
            <p>
              Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit
              sie stets den aktuellen rechtlichen Anforderungen entspricht.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}