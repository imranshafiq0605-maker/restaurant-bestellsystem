import Link from "next/link";

export default function Widerruf() {
  return (
    <div className="legal-wrapper">
      <div className="legal-card">
        <div className="legal-topbar">
          <Link href="/" className="legal-back-button">
            ← Zurück zur Startseite
          </Link>
        </div>

        <h1>Widerrufsbelehrung</h1>

        <h2>1. Verbraucherinformation</h2>
        <p>
          Verbrauchern steht bei außerhalb von Geschäftsräumen geschlossenen
          Verträgen und bei Fernabsatzverträgen grundsätzlich ein gesetzliches
          Widerrufsrecht zu.
        </p>

        <h2>2. Ausschluss bzw. vorzeitiges Erlöschen des Widerrufsrechts</h2>
        <p>
          Das Widerrufsrecht besteht jedoch nicht bei Verträgen zur Lieferung von
          Waren, die schnell verderben können oder deren Verfallsdatum schnell
          überschritten würde.
        </p>
        <p>
          Ebenfalls kann das Widerrufsrecht ausgeschlossen sein bei Verträgen zur
          Lieferung versiegelter Waren, die aus Gründen des Gesundheitsschutzes
          oder der Hygiene nicht zur Rückgabe geeignet sind, wenn ihre
          Versiegelung nach der Lieferung entfernt wurde.
        </p>
        <p>
          Bei frisch zubereiteten Speisen, individuell zusammengestellten
          Gerichten, warmen Speisen, Salaten, Pasta, Pizza, Getränkekombinationen
          sowie sonstigen leicht verderblichen Lebensmitteln besteht daher in der
          Regel kein Widerrufsrecht.
        </p>

        <h2>3. Hinweis für Online-Bestellungen von Speisen</h2>
        <p>
          Da unser Online-Angebot insbesondere die Bestellung von frisch
          zubereiteten Speisen und schnell verderblichen Lebensmitteln umfasst,
          ist ein Widerruf nach Beginn der Zubereitung oder Lieferung regelmäßig
          ausgeschlossen.
        </p>
        <p>
          Mit Abschluss der Bestellung erklären Sie sich damit einverstanden, dass
          wir vor Ablauf einer etwaigen Widerrufsfrist mit der Bearbeitung,
          Zubereitung und Durchführung Ihrer Bestellung beginnen.
        </p>

        <h2>4. Kulanzregelungen</h2>
        <p>
          Unabhängig von einem gesetzlichen Widerrufsrecht bemühen wir uns im
          Rahmen unserer Möglichkeiten um eine kundenfreundliche Lösung, sofern
          es zu Problemen mit einer Bestellung kommt. Ein Anspruch auf
          Rückerstattung oder Stornierung besteht jedoch nur im Rahmen der
          gesetzlichen Regelungen oder einer ausdrücklichen freiwilligen
          Kulanzentscheidung unsererseits.
        </p>

        <h2>5. Reklamationen</h2>
        <p>
          Sollten Sie Grund zur Beanstandung haben, bitten wir Sie, sich
          schnellstmöglich bei uns zu melden. Dies gilt insbesondere bei falsch
          gelieferten Artikeln, Qualitätsmängeln oder Transportschäden.
        </p>

        <h2>6. Muster-Widerrufsbelehrung für nicht ausgeschlossene Fälle</h2>
        <p>
          Soweit im Einzelfall ausnahmsweise ein Widerrufsrecht besteht, gilt
          Folgendes:
        </p>

        <h2>Widerrufsrecht</h2>
        <p>
          Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen
          diesen Vertrag zu widerrufen.
        </p>
        <p>
          Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder
          ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die
          Ware in Besitz genommen haben bzw. hat.
        </p>

        <h2>Ausübung des Widerrufs</h2>
        <p>
          Um Ihr Widerrufsrecht auszuüben, müssen Sie uns
          <br />
          La Rosa GmbH
          <br />
          Bahnhofstraße 2
          <br />
          64546 Mörfelden-Walldorf
          <br />
          E-Mail: larosa1993@outlook.de
          <br />
          mittels einer eindeutigen Erklärung über Ihren Entschluss, diesen
          Vertrag zu widerrufen, informieren.
        </p>

        <h2>Folgen des Widerrufs</h2>
        <p>
          Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die
          wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit
          Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie
          eine andere Art der Lieferung als die von uns angebotene,
          günstigste Standardlieferung gewählt haben), unverzüglich und
          spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die
          Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist.
        </p>
        <p>
          Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei
          der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen
          wurde ausdrücklich etwas anderes vereinbart.
        </p>

        <h2>7. Ende der Widerrufsbelehrung</h2>
        <p>
          Bitte beachten Sie, dass für den Regelfall unserer angebotenen Speisen
          und frisch zubereiteten Produkte aufgrund ihrer Beschaffenheit kein
          gesetzliches Widerrufsrecht besteht.
        </p>
      </div>
    </div>
  );
}