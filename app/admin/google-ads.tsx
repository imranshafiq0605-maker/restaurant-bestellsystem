"use client";

import { useEffect, useState } from "react";
import { berlinDay, type AdsPeriod, type AdsReport } from "../lib/ads-report";
import { adminFetch, euro, Icon, number, PageHead } from "./ui";
import styles from "./admin.module.css";
import ads from "./google-ads.module.css";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function GoogleAds({ onError }: { onError: (error: unknown) => string }) {
  const [period, setPeriod] = useState<AdsPeriod>("day");
  const [date, setDate] = useState(() => berlinDay(new Date()));
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: AdsReport; error?: string } | null>(null);
  const [query, setQuery] = useState("");
  const key = `${period}:${date}:${refresh}`;
  const current = result?.key === key ? result : null;
  const data = current?.data;

  useEffect(() => {
    const controller = new AbortController();
    adminFetch<AdsReport>(`/api/admin/google-ads?period=${period}&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => { if (!controller.signal.aborted) setResult({ key, error: onError(error) }); });
    return () => controller.abort();
  }, [period, date, key, onError]);

  const orders = data?.orders.filter((order) => `${order.number} ${order.name} ${order.email}`.toLowerCase().includes(query.toLowerCase())) || [];
  const maxOrders = Math.max(1, ...(data?.days.map((day) => day.orders) || []));
  return <>
    <PageHead title="Google Ads" text="Anzeigenbesuche und daraus zugeordnete Online-Bestellungen.">
      <button className={styles.secondary} type="button" onClick={() => setRefresh((value) => value + 1)}><Icon name="refresh" />Aktualisieren</button>
    </PageHead>
    <section className={styles.card}>
      <div className={ads.filters}>
        <div className={styles.chips} aria-label="Zeitraum">
          {([["day", "Tag"], ["week", "Woche"], ["month", "Monat"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={period === value} className={period === value ? styles.chipActive : ""} onClick={() => setPeriod(value)}>{label}</button>)}
        </div>
        <label>Datum im gewünschten Zeitraum <input className={styles.input} type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
      </div>
      <details className={ads.explanation}><summary>Wie werden Bestellungen zugeordnet?</summary><p className={ads.note}>Eigene Website-Messung ab Einrichtung, Zeitzone Berlin. Wochen beginnen montags.
        Eine Bestellung wird dem letzten erfassten Google-Anzeigenbesuch innerhalb von 30 Tagen zugeordnet.
        Nur mit Einwilligung; keine vollständige Zählung aller Personen und kein Google-Ads-Kostenbericht.</p></details>
    </section>
    {!current && <p className={styles.loadingBox} role="status">Google-Ads-Auswertung wird geladen …</p>}
    {current?.error && <p className={styles.error} role="alert">{current.error}</p>}
    {data && <>
      {!data.configured && <p className={styles.notice}>Die Messung ist noch nicht verbunden. Die Google-Ads-Konfiguration muss in der Website-Umgebung hinterlegt werden.</p>}
      {data.truncated && <p className={styles.error}>Mehr als 10.000 Datensätze im Zeitraum: Diese Auswertung ist unvollständig. Bitte wähle einen kleineren Zeitraum.</p>}
      <p className={ads.range}>{dateTime(data.start)} bis {dateTime(data.end)} (Ende nicht eingeschlossen)</p>
      <div className={styles.stats}>
        <div className={`${styles.stat} ${styles.statDark}`}><small>Anzeigenbesuche</small><strong>{number(data.visits)}</strong><span>Erfasste Besuche mit Google-Klickkennung</span></div>
        <div className={styles.stat}><small>Besucher-Browser</small><strong>{number(data.visitors)}</strong><span>Wiedererkannt über ein Einwilligungs-Cookie</span></div>
        <div className={styles.stat}><small>Bezahlte Bestellungen</small><strong>{number(data.orders.length)}</strong><span>Stornierte Bestellungen ausgeschlossen</span></div>
        <div className={styles.stat}><small>Zugeordneter Umsatz</small><strong>{euro(data.revenue)}</strong><span>Zahlbetrag nach Rabatten, inkl. Steuern</span></div>
      </div>
      <section className={styles.card}>
        <div className={styles.cardHead}><h2>Verlauf pro Tag</h2></div>
        <div className={ads.tableScroll}>
          <table className={ads.table}>
            <thead><tr><th>Datum</th><th>Besuche</th><th>Bestellungen</th><th>Umsatz</th></tr></thead>
            <tbody>{data.days.map((day) => <tr key={day.date}>
              <td>{day.date.split("-").reverse().join(".")}</td><td>{number(day.visits)}</td>
              <td><div className={ads.barCell}><span>{number(day.orders)}</span><span className={ads.bar} style={{ width: `${day.orders / maxOrders * 90}px` }} /></div></td><td>{euro(day.revenue)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.cardHead}><h2>Bestellungen über Google Ads</h2></div>
        <input className={styles.input} aria-label="Bestellungen durchsuchen" type="search" placeholder="Bestellnummer, Name oder E-Mail suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
        {!orders.length ? <p className={styles.empty}>{data.orders.length ? "Keine passenden Bestellungen." : "Noch keine zugeordneten Bestellungen in diesem Zeitraum. Frühere Bestellungen lassen sich nicht rückwirkend zuordnen."}</p> :
          <div className={`${ads.tableScroll} ${ads.desktopOrders}`}><table className={ads.table}>
            <thead><tr><th>Bestellung</th><th>Kunde</th><th>Bestellt am</th><th>Anzeigenbesuch</th><th>Art</th><th>Zahlbetrag</th></tr></thead>
            <tbody>{orders.map((order) => <tr key={order.id}>
              <td>#{order.number}</td><td><strong>{order.name}</strong><small>{order.email}</small></td>
              <td>{dateTime(order.createdAt)}</td><td>{dateTime(order.clickedAt)}</td><td>{order.orderType}</td><td>{euro(order.value)}</td>
            </tr>)}</tbody>
          </table></div>}
        <ul className={ads.orderCards}>
          {orders.map((order) => <li key={order.id}>
            <div className={ads.orderTop}><strong>#{order.number}</strong><strong>{euro(order.value)}</strong></div>
            <strong>{order.name}</strong><span className={ads.email}>{order.email}</span>
            <dl><div><dt>Bestellung</dt><dd>{dateTime(order.createdAt)}</dd></div>
              <div><dt>Anzeigenbesuch</dt><dd>{dateTime(order.clickedAt)}</dd></div>
              <div><dt>Bestellart</dt><dd>{order.orderType}</dd></div></dl>
          </li>)}
        </ul>
        <p className={ads.note}>Diese Kundendaten sind nur im angemeldeten Admin-Bereich sichtbar. Sie werden durch diese Integration nicht an Google gesendet. Besuche werden nach Besuchsdatum, Bestellungen und Umsatz nach Bestelldatum gezählt. Erstattungen in Stripe werden nicht automatisch abgezogen.</p>
      </section>
    </>}
  </>;
}
