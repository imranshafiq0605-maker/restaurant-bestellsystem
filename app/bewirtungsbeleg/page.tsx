import type { Metadata } from "next";
import Link from "next/link";
import { buildInvoiceData } from "../lib/belege/invoice-data";
import { loadOrderForBeleg } from "../lib/belege/load-order";
import styles from "./bewirtungsbeleg.module.css";

export const metadata: Metadata = {
  title: "Bewirtungsbeleg | La Rosa GmbH",
  robots: { index: false, follow: false },
};

const euro = (value: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
const datum = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(date);

export default async function BewirtungsbelegPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id, t } = await searchParams;
  const order = await loadOrderForBeleg(id, t).catch((error) => {
    console.error("❌ Bewirtungsbeleg: Bestellung konnte nicht geladen werden:", error);
    return null;
  });

  if (!order) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <div className={styles.brand}>LA ROSA</div>
          <h1 className={styles.title}>Link ungültig</h1>
          <p className={styles.lead}>
            Diese Bestellung konnte nicht gefunden werden. Bitte öffne den Link direkt aus deiner Bestellbestätigung
            oder ruf uns an: <a href="tel:06105297883">06105 297883</a>.
          </p>
          <Link className={styles.secondary} href="/">Zur Startseite</Link>
        </section>
      </main>
    );
  }

  const data = buildInvoiceData(order);
  const lieferadresse = data.orderType === "Lieferung" ? data.customer.lines.join(", ") : "";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>LA ROSA</div>
        <span className={styles.kicker}>Für Geschäftskunden</span>
        <h1 className={styles.title}>Bewirtungsbeleg erstellen</h1>
        <p className={styles.lead}>
          Der Beleg wird automatisch mit allen Angaben zu deiner Bestellung erstellt. Ergänze hier die Angaben zur
          Bewirtung – oder lass Felder leer und fülle sie später auf dem Ausdruck per Hand aus.
        </p>

        <dl className={styles.summary}>
          <div><dt>Rechnung</dt><dd>{data.invoiceNumber}</dd></div>
          <div><dt>Bestellnummer</dt><dd>{data.orderNumber ? `#${data.orderNumber}` : "–"}</dd></div>
          <div><dt>Datum</dt><dd>{datum(data.serviceDate)}</dd></div>
          <div><dt>Betrag</dt><dd>{euro(data.total)}</dd></div>
        </dl>

        <form className={styles.form} method="post" action="/api/bewirtungsbeleg">
          <input type="hidden" name="id" value={String(id)} />
          <input type="hidden" name="t" value={String(t)} />

          <label className={styles.field}>
            <span>Anlass der Bewirtung</span>
            <textarea name="anlass" rows={2} maxLength={500} placeholder="z. B. Projektbesprechung „Umbau Lager“ mit Firma Weber" />
          </label>
          <label className={styles.field}>
            <span>Bewirtete Personen</span>
            <textarea name="personen" rows={3} maxLength={1000} placeholder={"Eine Person pro Zeile, inkl. dir selbst\nz. B. Jonas Weber (Weber Logistik AG)"} />
          </label>
          <label className={styles.field}>
            <span>Bewirtende Person / Unternehmen</span>
            <input name="bewirtender" maxLength={200} defaultValue={data.customer.name === "Kunde" ? "" : data.customer.name} />
          </label>
          <label className={styles.field}>
            <span>Ort der Bewirtung</span>
            <input name="ort" maxLength={200} defaultValue={lieferadresse} placeholder="z. B. Büro, Musterstraße 1, 64546 Mörfelden-Walldorf" />
          </label>
          <label className={styles.field}>
            <span>Trinkgeld (optional)</span>
            <input name="trinkgeld" inputMode="decimal" maxLength={20} placeholder="0,00 €" />
          </label>

          <button className={styles.primary} type="submit">Bewirtungsbeleg herunterladen (PDF)</button>
          <a className={styles.secondary} href={`/api/rechnung?id=${encodeURIComponent(String(id))}&t=${encodeURIComponent(String(t))}`}>
            Rechnung {data.invoiceNumber} als PDF
          </a>
        </form>

        <p className={styles.hint}>
          Bitte den Beleg nach dem Ausdrucken unterschreiben und zusammen mit der Rechnung aufbewahren.
        </p>
      </section>
    </main>
  );
}
