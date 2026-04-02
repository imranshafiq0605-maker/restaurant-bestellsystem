import Link from "next/link";
export default function Widerruf() {
  return (
    <div className="legal-wrapper">
      <div className="legal-card">
        <h1>Widerrufsbelehrung</h1>

        <h2>Widerrufsrecht</h2>
        <p>
          Verbraucher haben grundsätzlich ein Widerrufsrecht von 14 Tagen.
        </p>

        <h2>Ausschluss</h2>
        <p>
          Bei Lieferung von Speisen besteht kein Widerrufsrecht, da diese verderblich sind.
        </p>

        <h2>Folgen</h2>
        <p>
          Im Falle eines Widerrufs werden Zahlungen erstattet.
        </p>
      </div>
    </div>
  );
}