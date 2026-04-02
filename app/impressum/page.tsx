import Link from "next/link";

export default function Impressum() {
  return (
    <div className="legal-wrapper">
      <div className="legal-card">
        <div className="legal-topbar">
          <Link href="/" className="legal-back-button">
            ← Zurück zur Startseite
          </Link>
        </div>

        <h1>Impressum</h1>

        <h2>Angaben gemäß § 5 TMG</h2>
        <p>
          La Rosa GmbH
          <br />
          Bahnhofstraße 2
          <br />
          64546 Mörfelden-Walldorf
        </p>

        <h2>Vertreten durch</h2>
        <p>
          Geschäftsführer: Muhammad Shafiq
        </p>

        <h2>Kontakt</h2>
        <p>
          Telefon: 06105 297883
          <br />
          E-Mail: larosa1993@outlook.de
        </p>

        <h2>Registereintrag</h2>
        <p>
          Eintragung im Handelsregister.
          <br />
          Registergericht: Darmstadt
          <br />
          Registernummer: HRB 105429
        </p>

        <h2>Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:
          <br />
          DE363846903
        </p>

        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>
          Muhammad Shafiq
          <br />
          Bahnhofstraße 2
          <br />
          64546 Mörfelden-Walldorf
        </p>

        <h2>Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte
          auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
          §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
          übermittelte oder gespeicherte fremde Informationen zu überwachen oder
          nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
          hinweisen.
        </p>
        <p>
          Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
          Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
          Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der
          Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden
          von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend
          entfernen.
        </p>

        <h2>Haftung für Links</h2>
        <p>
          Unser Angebot enthält gegebenenfalls Links zu externen Websites Dritter,
          auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für
          diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
          verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der
          Seiten verantwortlich.
        </p>

        <h2>Urheberrecht</h2>
        <p>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen
          Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung,
          Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
          Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des
          jeweiligen Autors bzw. Erstellers.
        </p>
      </div>
    </div>
  );
}