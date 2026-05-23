import Link from "next/link";

export default function ImpressumPage() {
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
            <h1>Impressum</h1>
            <p className="legal-lead">
              Anbieterkennzeichnung gemäß den gesetzlichen Vorgaben.
            </p>
          </div>

          <section className="legal-section">
            <h2>Angaben gemäß § 5 TMG</h2>
            <p>
              La Rosa GmbH
              <br />
              Bahnhofstraße 2
              <br />
              64546 Mörfelden-Walldorf
            </p>
          </section>

          <section className="legal-section">
            <h2>Vertreten durch</h2>
            <p>Muhammad Shafiq</p>
          </section>

          <section className="legal-section">
            <h2>Kontakt</h2>
            <p>
              Telefon: 06105 297883
              <br />
              E-Mail: larosa1993@outlook.de
            </p>
          </section>

          <section className="legal-section">
            <h2>Registereintrag</h2>
            <p>
              Handelsregister: Darmstadt
              <br />
              Registernummer: HRB 105429
            </p>
          </section>

          <section className="legal-section">
            <h2>Umsatzsteuer-ID</h2>
            <p>DE363846903</p>
          </section>

          <section className="legal-section">
            <h2>Verantwortlich für den Inhalt</h2>
            <p>
              Muhammad Shafiq
              <br />
              Bahnhofstraße 2
              <br />
              64546 Mörfelden-Walldorf
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}