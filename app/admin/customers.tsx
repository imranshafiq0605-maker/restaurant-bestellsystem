"use client";

import { useMemo, useState } from "react";
import styles from "./admin.module.css";
import { euro, formatDate, Icon, number, PageHead, type AdminCustomer } from "./ui";
import type { CustomerData } from "./page";

type Props = { data: CustomerData | null; error: string; onReload: () => Promise<void> };

type Filter = "alle" | "konten" | "gaeste" | "rosen" | "newsletter" | "ohne";
type SortKey = "number" | "roses" | "orders" | "revenue" | "created" | "lastOrder" | "name";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "alle", label: "Alle" },
  { id: "konten", label: "Mit Konto" },
  { id: "gaeste", label: "Gäste" },
  { id: "rosen", label: "Mit Rosen" },
  { id: "newsletter", label: "Newsletter" },
  { id: "ohne", label: "Noch nie bestellt" },
];

const sorts: Array<{ id: SortKey; label: string }> = [
  { id: "number", label: "Kundennummer" },
  { id: "roses", label: "Meiste Rosen" },
  { id: "orders", label: "Meiste Bestellungen" },
  { id: "revenue", label: "Höchster Umsatz" },
  { id: "lastOrder", label: "Letzte Bestellung" },
  { id: "created", label: "Neueste Kunden" },
  { id: "name", label: "Name A–Z" },
];

function compare(sort: SortKey) {
  return (a: AdminCustomer, b: AdminCustomer) => {
    switch (sort) {
      case "roses": return b.roses - a.roses || b.orders - a.orders;
      case "orders": return b.orders - a.orders || b.revenue - a.revenue;
      case "revenue": return b.revenue - a.revenue;
      case "lastOrder": return (b.lastOrderAt || "").localeCompare(a.lastOrderAt || "");
      case "created": return (b.createdAt || "").localeCompare(a.createdAt || "");
      case "name": return (a.name || a.email).localeCompare(b.name || b.email, "de");
      default: return (a.customerNumber || 0) - (b.customerNumber || 0);
    }
  };
}

function exportCsv(customers: AdminCustomer[]) {
  const header = ["Kundennummer", "Typ", "Name", "E-Mail", "Telefon", "Adresse", "Anmeldung", "Rosen", "Bestellungen", "Umsatz", "Letzte Bestellung", "Kunde seit", "Newsletter"];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = customers.map((customer) => [
    customer.customerNumber, customer.type === "konto" ? "Konto" : "Gast", customer.name, customer.email, customer.phone, customer.address, customer.provider,
    customer.roses, customer.orders, customer.revenue.toFixed(2).replace(".", ","), formatDate(customer.lastOrderAt), formatDate(customer.createdAt), customer.newsletter ? "ja" : "nein",
  ].map(cell).join(";"));
  const blob = new Blob([`﻿${[header.map(cell).join(";"), ...rows].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `la-rosa-kunden-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Customers({ data, error, onReload }: Props) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [sort, setSort] = useState<SortKey>("number");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [limit, setLimit] = useState(100);
  const [reloading, setReloading] = useState(false);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.customers ?? [])
      .filter((customer) => {
        if (filter === "konten" && customer.type !== "konto") return false;
        if (filter === "gaeste" && customer.type !== "gast") return false;
        if (filter === "rosen" && customer.roses <= 0) return false;
        if (filter === "newsletter" && !customer.newsletter) return false;
        if (filter === "ohne" && customer.orders > 0) return false;
        if (!needle) return true;
        return `${customer.customerNumber ?? ""} ${customer.name} ${customer.email} ${customer.phone} ${customer.address}`.toLowerCase().includes(needle);
      })
      .sort(compare(sort));
  }, [data, filter, sort, query]);

  async function reload() {
    setReloading(true);
    await onReload();
    setReloading(false);
  }

  const header = (label: string, key: SortKey, numeric = false) => (
    <th className={numeric ? styles.num : undefined}>
      <button type="button" className={sort === key ? styles.sorted : undefined} onClick={() => setSort(key)}>{label}{sort === key ? " ↓" : ""}</button>
    </th>
  );

  return (
    <>
      <PageHead title="Kunden" text={data ? `${number(data.stats.registered)} Konten · ${number(data.stats.guests)} Gastbesteller · ${number(data.stats.newsletter)} Newsletter-Abonnenten` : "Alle Kunden mit Kundennummer"}>
        <button type="button" className={styles.secondary} disabled={!list.length} onClick={() => exportCsv(list)}><Icon name="download" />Als Excel/CSV</button>
        <button type="button" className={styles.secondary} disabled={reloading} onClick={reload}><Icon name="refresh" />{reloading ? "Lädt …" : "Aktualisieren"}</button>
      </PageHead>

      {error && <p className={styles.error}>{error}</p>}
      {!data && !error ? <div className={styles.loadingBox}>Kunden werden geladen …</div> : data && (
        <section className={styles.card}>
          <div className={styles.toolbar}>
            <input className={`${styles.input} ${styles.search}`} type="search" placeholder="Suchen: Name, E-Mail, Telefon oder Kundennummer" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className={styles.select} value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sortieren">
              {sorts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className={styles.chips} style={{ marginBottom: 12 }}>
            {filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? styles.chipActive : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {header("Nr.", "number")}
                  {header("Kunde", "name")}
                  <th>Art</th>
                  {header("Rosen", "roses", true)}
                  {header("Bestellungen", "orders", true)}
                  {header("Umsatz", "revenue", true)}
                  {header("Letzte Bestellung", "lastOrder")}
                  {header("Kunde seit", "created")}
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((customer) => (
                  <tr key={customer.key} onClick={() => setSelected(customer)}>
                    <td className={styles.custNo}>{customer.customerNumber ?? "—"}</td>
                    <td className={styles.custName}><strong>{customer.name || "—"}</strong><small>{customer.email}</small></td>
                    <td>
                      <span className={`${styles.badge} ${customer.type === "konto" ? styles.badgeDark : ""}`}>{customer.type === "konto" ? customer.provider : "Gast"}</span>
                      {customer.newsletter && <span className={`${styles.badge} ${styles.badgeGreen}`} style={{ marginLeft: 6 }}>Newsletter</span>}
                    </td>
                    <td className={styles.num}>{customer.type === "konto" ? number(customer.roses) : "—"}</td>
                    <td className={styles.num}>{customer.orders}</td>
                    <td className={styles.num}>{euro(customer.revenue)}</td>
                    <td>{formatDate(customer.lastOrderAt)}</td>
                    <td>{formatDate(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p className={styles.empty}>Keine Kunden gefunden.</p>}
          <div className={styles.tableFoot}>
            {list.length > limit ? (
              <button type="button" className={styles.secondary} onClick={() => setLimit(limit + 200)}>Weitere anzeigen ({list.length - limit})</button>
            ) : `${list.length} ${list.length === 1 ? "Kunde" : "Kunden"}`}
          </div>
        </section>
      )}

      {selected && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setSelected(null)} />
          <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="customer-title">
            <div className={styles.drawerHead}>
              <div>
                <span className={styles.badge}>Kundennummer {selected.customerNumber ?? "—"}</span>
                <h2 id="customer-title" style={{ marginTop: 10 }}>{selected.name || "Ohne Namen"}</h2>
                <p>{selected.email}</p>
              </div>
              <button type="button" className={styles.iconButton} aria-label="Schließen" onClick={() => setSelected(null)}><Icon name="close" /></button>
            </div>
            <div className={styles.miniStats}>
              <div><small>Rosen</small><strong>{selected.type === "konto" ? number(selected.roses) : "—"}</strong></div>
              <div><small>Bestellungen</small><strong>{selected.orders}</strong></div>
              <div><small>Umsatz</small><strong>{euro(selected.revenue)}</strong></div>
            </div>
            <dl className={styles.kv}>
              <div><dt>Art</dt><dd>{selected.type === "konto" ? `Konto (${selected.provider})` : "Gast ohne Konto"}</dd></div>
              {selected.type === "konto" && <div><dt>E-Mail bestätigt</dt><dd>{selected.emailVerified ? "Ja" : "Nein"}</dd></div>}
              <div><dt>Telefon</dt><dd>{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : "—"}</dd></div>
              <div><dt>Adresse</dt><dd>{selected.address || "—"}</dd></div>
              <div><dt>Kunde seit</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              <div><dt>Letzte Bestellung</dt><dd>{formatDate(selected.lastOrderAt, true)}</dd></div>
              <div><dt>Ø Bestellwert</dt><dd>{euro(selected.orders ? selected.revenue / selected.orders : 0)}</dd></div>
              {selected.type === "konto" && <div><dt>Rosen-Wert</dt><dd>{euro(selected.roses * 0.03)}</dd></div>}
              <div><dt>Newsletter</dt><dd>{selected.newsletter ? `Abonniert${selected.newsletterSince ? ` seit ${formatDate(selected.newsletterSince)}` : ""}` : "Nein"}</dd></div>
            </dl>
            <div className={styles.actions} style={{ marginTop: 18 }}>
              <a className={styles.secondary} href={`mailto:${selected.email}`}><Icon name="mail" />E-Mail schreiben</a>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
