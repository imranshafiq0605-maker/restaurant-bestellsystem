"use client";

import { useState } from "react";
import { getServiceStatus, summarizeWeek, type OpeningSettings } from "../lib/site-settings";
import styles from "./admin.module.css";
import { adminFetch, euro, Icon, number, PageHead, Switch, type AdminCustomer } from "./ui";
import type { CustomerData } from "./page";

type Props = {
  data: CustomerData | null;
  error: string;
  opening: OpeningSettings | null;
  onOpen: (section: "zeiten" | "kunden") => void;
  onReload: () => Promise<void>;
  onOpeningChange: (opening: OpeningSettings) => void;
  onError: (error: unknown) => string;
};

function Ranking({ title, customers, value }: { title: string; customers: AdminCustomer[]; value: (customer: AdminCustomer) => string }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}><h2>{title}</h2></div>
      {customers.length === 0 ? <p className={styles.empty}>Noch keine Daten</p> : (
        <ol className={styles.rankList}>
          {customers.map((customer, index) => (
            <li key={customer.key}>
              <span className={styles.rankNo}>{index + 1}</span>
              <span className={styles.rankName}><strong>{customer.name || customer.email}</strong><small>Nr. {customer.customerNumber ?? "—"} · {customer.email}</small></span>
              <span className={styles.rankValue}>{value(customer)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Overview({ data, error, opening, onOpen, onReload, onOpeningChange, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const stats = data?.stats;
  const accounts = data?.customers.filter((customer) => customer.type === "konto") ?? [];
  const topRoses = [...accounts].filter((customer) => customer.roses > 0).sort((a, b) => b.roses - a.roses).slice(0, 5);
  const topOrders = [...(data?.customers ?? [])].filter((customer) => customer.orders > 0).sort((a, b) => b.orders - a.orders || b.revenue - a.revenue).slice(0, 5);

  async function toggleClosure(active: boolean) {
    if (!opening) return;
    setBusy(true);
    setMessage("");
    try {
      const next = { ...opening, closure: { ...opening.closure, active } };
      const result = await adminFetch<{ opening: OpeningSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ opening: next }) });
      onOpeningChange(result.opening);
    } catch (toggleError) {
      setMessage(onError(toggleError));
    } finally {
      setBusy(false);
    }
  }

  const statusBox = (label: string, service: "abholung" | "lieferung") => {
    const open = opening ? getServiceStatus(opening, service).isOpen : false;
    const today = opening ? opening[service][(new Date().getDay() + 6) % 7] : null;
    return (
      <div className={styles.statusBox}>
        <div>
          <strong>{label}</strong>
          <small>{today ? (today.open ? `Heute ${today.from} – ${today.to}` : "Heute Ruhetag") : "…"}</small>
        </div>
        <span className={`${styles.pill} ${open ? styles.pillOpen : styles.pillClosed}`}>{open ? "Geöffnet" : "Geschlossen"}</span>
      </div>
    );
  };

  return (
    <>
      <PageHead title="Übersicht" text="Alles Wichtige zu Kunden, Rosen und Öffnungszeiten auf einen Blick.">
        <button type="button" className={styles.secondary} onClick={() => void onReload()}><Icon name="refresh" />Aktualisieren</button>
      </PageHead>

      <section className={`${styles.card} ${styles.closureCard} ${opening?.closure.active ? styles.closureActive : ""}`} style={{ marginBottom: 16 }}>
        <div>
          <h2>{opening?.closure.active ? "Bestellungen sind pausiert" : "Bestellungen sind aktiv"}</h2>
          <p>{opening?.closure.active ? `Website und App nehmen keine Bestellungen an${opening.closure.reason ? ` · Grund: ${opening.closure.reason}` : ""}.` : "Schalter umlegen, um sofort zu schließen (z. B. bei Krankheit oder zu viel Andrang)."}</p>
        </div>
        <Switch on={Boolean(opening?.closure.active)} onChange={toggleClosure} label="Sofort schließen" danger disabled={!opening || busy} />
      </section>
      {message && <p className={styles.error}>{message}</p>}

      <div className={styles.statusRow}>
        {statusBox("Abholung", "abholung")}
        {statusBox("Lieferung", "lieferung")}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!data && !error ? <div className={styles.loadingBox}>Kundendaten werden geladen …</div> : stats && (
        <>
          <div className={styles.stats}>
            <div className={`${styles.stat} ${styles.statDark}`}><small>Registrierte Kunden</small><strong>{number(stats.registered)}</strong><span>+{number(stats.newLast30Days)} in den letzten 30 Tagen</span></div>
            <div className={styles.stat}><small>Kunden mit Rosen</small><strong>{number(stats.withRoses)}</strong><span>{stats.registered ? Math.round((stats.withRoses / stats.registered) * 100) : 0} % aller Konten</span></div>
            <div className={styles.stat}><small>Rosen bei Kunden</small><strong>{number(stats.totalRoses)}</strong><span>Wert {euro(stats.totalRoses * 0.03)}</span></div>
            <div className={styles.stat}><small>Newsletter-Abonnenten</small><strong>{number(stats.newsletter)}</strong><span>{stats.registered ? Math.round((stats.newsletter / stats.registered) * 100) : 0} % aller Konten</span></div>
            <div className={styles.stat}><small>Gastbesteller</small><strong>{number(stats.guests)}</strong><span>ohne Konto, mit Kundennummer</span></div>
            <div className={styles.stat}><small>Bestellungen gesamt</small><strong>{number(stats.orders)}</strong><span>bezahlte Online-Bestellungen</span></div>
            <div className={styles.stat}><small>Online-Umsatz</small><strong>{euro(stats.revenue)}</strong><span>Website und App</span></div>
            <div className={styles.stat}><small>Ø pro Bestellung</small><strong>{euro(stats.orders ? stats.revenue / stats.orders : 0)}</strong><span>über alle Kunden</span></div>
          </div>

          <div className={styles.grid2}>
            <Ranking title="Meiste Rosen" customers={topRoses} value={(customer) => `${number(customer.roses)} 🌹`} />
            <Ranking title="Meiste Bestellungen" customers={topOrders} value={(customer) => `${customer.orders}×`} />
          </div>
          <div className={styles.actions} style={{ marginTop: 14 }}>
            <button type="button" className={styles.secondary} onClick={() => onOpen("kunden")}><Icon name="users" />Alle Kunden ansehen</button>
            <button type="button" className={styles.secondary} onClick={() => onOpen("zeiten")}><Icon name="clock" />Öffnungszeiten bearbeiten</button>
          </div>
        </>
      )}

      {opening && (
        <section className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.cardHead}><h2>Aktuelle Öffnungszeiten</h2></div>
          <div className={styles.grid2}>
            {(["abholung", "lieferung"] as const).map((service) => (
              <div key={service}>
                <p className={styles.subhead}>{service === "abholung" ? "Abholung" : "Lieferung"}</p>
                <dl className={styles.kv}>
                  {summarizeWeek(opening[service]).map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
