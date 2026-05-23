import Link from "next/link";

export default function AgbPage() {
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
            <h1>Allgemeine Geschäftsbedingungen</h1>
            <p className="legal-lead">
              Bedingungen für Bestellungen über unseren Online-Bestellservice.
            </p>
          </div>

          <section className="legal-section">
            <h2>1. Geltungsbereich</h2>
            <p>
              Diese Allgemeinen Geschäftsbedingungen gelten für alle
              Bestellungen, die über unsere Website abgegeben werden.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Anbieter</h2>
            <p>
              La Rosa GmbH
              <br />
              Bahnhofstraße 2
              <br />
              64546 Mörfelden-Walldorf
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Vertragsschluss</h2>
            <p>
              Die Darstellung der Produkte auf unserer Website stellt kein
              rechtlich bindendes Angebot dar, sondern eine unverbindliche
              Aufforderung zur Bestellung.
            </p>
            <p>
              Mit dem Absenden der Bestellung geben Sie ein verbindliches
              Angebot ab. Der Vertrag kommt mit Annahme der Bestellung durch uns
              zustande.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Preise</h2>
            <p>
              Alle Preise verstehen sich in Euro inklusive der gesetzlichen
              Mehrwertsteuer, soweit diese anfällt.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Lieferung und Abholung</h2>
            <p>
              Bestellungen können je nach Angebot zur Abholung oder Lieferung
              aufgegeben werden. Lieferungen erfolgen nur in die von uns
              angebotenen Liefergebiete.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Mindestbestellwert</h2>
            <p>
              Für bestimmte Liefergebiete kann ein Mindestbestellwert gelten.
              Dieser wird im Bestellprozess angezeigt.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Zahlungsbedingungen</h2>
            <p>
              Die Zahlung erfolgt über die auf der Website angebotenen
              Zahlungsmethoden.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Mitwirkungspflichten des Kunden</h2>
            <p>
              Sie sind verpflichtet, im Rahmen der Bestellung korrekte,
              vollständige und aktuelle Angaben zu machen.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Lieferzeiten</h2>
            <p>
              Angegebene Zeiten für Lieferung oder Abholung sind unverbindliche
              Richtwerte, sofern nicht ausdrücklich etwas anderes vereinbart
              wurde.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Nichtverfügbarkeit</h2>
            <p>
              Sollten einzelne Produkte ausnahmsweise nicht verfügbar sein,
              behalten wir uns vor, die Bestellung insoweit nicht anzunehmen
              oder nach Rücksprache anzupassen.
            </p>
          </section>

          <section className="legal-section">
            <h2>11. Haftung</h2>
            <p>
              Wir haften unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie
              bei Schäden aus der Verletzung des Lebens, des Körpers oder der
              Gesundheit. Im Übrigen gelten die gesetzlichen Vorschriften.
            </p>
          </section>

          <section className="legal-section">
            <h2>12. Allergene und Inhaltsstoffe</h2>
            <p>
              Trotz größter Sorgfalt können Spuren von Allergenen in Speisen
              nicht ausgeschlossen werden. Bei Unverträglichkeiten oder
              Allergien bitten wir um vorherige Rücksprache.
            </p>
          </section>

          <section className="legal-section">
            <h2>13. Widerruf</h2>
            <p>
              Für frisch zubereitete Speisen und schnell verderbliche Waren kann
              das Widerrufsrecht ausgeschlossen sein. Weitere Informationen
              finden Sie in der Widerrufsbelehrung.
            </p>
          </section>

          <section className="legal-section">
            <h2>14. Schlussbestimmungen</h2>
            <p>
              Es gilt das Recht der Bundesrepublik Deutschland, soweit
              gesetzlich zulässig.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}