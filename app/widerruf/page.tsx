import Link from "next/link";

export default function WiderrufPage() {
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
            <h1>Widerrufsbelehrung</h1>
            <p className="legal-lead">
              Hinweise zum Widerrufsrecht bei Bestellungen über unseren
              Online-Service.
            </p>
          </div>

          <section className="legal-section">
            <h2>1. Hinweis zum Widerrufsrecht</h2>
            <p>
              Verbrauchern steht bei Fernabsatzverträgen grundsätzlich ein
              gesetzliches Widerrufsrecht zu.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Ausschluss des Widerrufsrechts</h2>
            <p>
              Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung von
              Waren, die schnell verderben können oder deren Verfallsdatum
              schnell überschritten würde.
            </p>
            <p>
              Bei frisch zubereiteten Speisen, individuell zusammengestellten
              Gerichten und leicht verderblichen Lebensmitteln ist ein Widerruf
              daher in der Regel ausgeschlossen.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Bestellungen von Speisen</h2>
            <p>
              Da unser Angebot insbesondere frisch zubereitete Speisen und
              Getränke umfasst, besteht für diese Produkte regelmäßig kein
              gesetzliches Widerrufsrecht nach Beginn der Zubereitung oder
              Ausführung der Bestellung.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Reklamationen</h2>
            <p>
              Unabhängig vom gesetzlichen Widerrufsrecht können Sie sich bei
              Problemen mit einer Bestellung selbstverständlich an uns wenden.
              Wir bemühen uns um eine schnelle und kundenfreundliche Lösung.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Musterbelehrung für ausnahmsweise widerrufbare Leistungen</h2>
            <p>
              Soweit im Einzelfall doch ein Widerrufsrecht besteht, gilt
              Folgendes:
            </p>
            <p>
              Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
              diesen Vertrag zu widerrufen.
            </p>
            <p>
              Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer
              eindeutigen Erklärung über Ihren Entschluss informieren.
            </p>
            <p>
              La Rosa GmbH
              <br />
              Bahnhofstraße 2
              <br />
              64546 Mörfelden-Walldorf
              <br />
              E-Mail: larosa1993@outlook.de
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Folgen des Widerrufs</h2>
            <p>
              Wenn Sie einen wirksam widerrufbaren Vertrag widerrufen, erstatten
              wir Ihnen alle entsprechenden Zahlungen nach Maßgabe der
              gesetzlichen Vorschriften.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}