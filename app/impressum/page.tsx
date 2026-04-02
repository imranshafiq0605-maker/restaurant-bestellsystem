import Link from "next/link";
export default function Impressum() {
  return (
    <div className="legal-wrapper">
      <div className="legal-card">
        <h1>Impressum</h1>

        <p>
          La Rosa GmbH<br />
          Bahnhofstraße 2<br />
          64546 Mörfelden-Walldorf
        </p>

        <p>
          Geschäftsführer: Muhammad Shafiq<br />
          Telefon: 06105 297883<br />
          E-Mail: larosa1993@outlook.de
        </p>
      </div>
    </div>
  );
}