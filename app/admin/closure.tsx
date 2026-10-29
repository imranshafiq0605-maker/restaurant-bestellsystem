"use client";

import { useState } from "react";
import { formatDateKey, isClosureActive, type OpeningSettings } from "../lib/site-settings";
import styles from "./admin.module.css";
import { adminFetch, Icon } from "./ui";

type Props = {
  opening: OpeningSettings | null;
  onSaved: (opening: OpeningSettings) => void;
  onError: (error: unknown) => string;
};

type Duration = "30" | "60" | "120" | "today" | "date" | "open";

const DURATIONS: Array<{ id: Duration; label: string }> = [
  { id: "30", label: "30 Min." },
  { id: "60", label: "1 Std." },
  { id: "120", label: "2 Std." },
  { id: "today", label: "Rest des Tages" },
  { id: "date", label: "Bis Datum …" },
  { id: "open", label: "Bis ich wieder öffne" },
];

const timeText = (date: Date) => date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** „bis 18:30 Uhr“ oder „bis Fr., 31.10., 12:00 Uhr“ */
export function closureUntilText(until: string) {
  if (!until) return "bis du wieder öffnest";
  const date = new Date(until);
  if (formatDateKey(date) === formatDateKey(new Date())) return `bis ${timeText(date)} Uhr`;
  return `bis ${date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}, ${timeText(date)} Uhr`;
}

function untilFor(duration: Duration, dateValue: string) {
  const now = new Date();
  if (duration === "open") return "";
  if (duration === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  if (duration === "date") return dateValue ? new Date(dateValue).toISOString() : "";
  return new Date(now.getTime() + Number(duration) * 60_000).toISOString();
}

/** Sofort schließen mit Dauer – wie bei Lieferando „Bestellungen pausieren“. Speichert sofort. */
export default function ClosureCard({ opening, onSaved, onError }: Props) {
  const active = opening ? isClosureActive(opening) : false;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [duration, setDuration] = useState<Duration>("today");
  const [dateValue, setDateValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(closure: OpeningSettings["closure"]) {
    if (!opening) return false;
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ opening: OpeningSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ opening: { ...opening, closure } }) });
      onSaved(result.opening);
      return true;
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const until = untilFor(duration, dateValue);
    if (duration === "date" && (!until || Date.parse(until) <= Date.now())) {
      setMessage({ ok: false, text: "Bitte wähle einen Zeitpunkt in der Zukunft." });
      return;
    }
    if (await save({ active: true, reason: reason.trim(), until })) {
      setSheetOpen(false);
      setMessage(null);
    }
  }

  async function reopen() {
    if (await save({ active: false, reason: "", until: "" })) setMessage(null);
  }

  function openSheet() {
    setReason(opening?.closure.reason ?? "");
    setDuration("today");
    setDateValue("");
    setMessage(null);
    setSheetOpen(true);
  }

  return (
    <>
      <section className={`${styles.card} ${styles.closureCard} ${active ? styles.closureActive : ""}`}>
        <div className={styles.closureText}>
          <span className={`${styles.pill} ${active ? styles.pillClosed : styles.pillOpen}`}>{active ? "Geschlossen" : "Bestellungen aktiv"}</span>
          <h2>{active && opening ? `Geschlossen ${closureUntilText(opening.closure.until)}` : "Sofort schließen"}</h2>
          <p>
            {active && opening
              ? opening.closure.reason ? `Grund für Kunden: ${opening.closure.reason}` : "Website und App nehmen keine Bestellungen an, auch keine Vorbestellungen."
              : "Z. B. bei Krankheit oder zu viel Andrang. Du wählst, wie lange – danach öffnet es automatisch wieder."}
          </p>
        </div>
        {active ? (
          <button type="button" className={styles.primary} disabled={busy || !opening} onClick={() => void reopen()}>{busy ? "Wird gespeichert …" : "Wieder öffnen"}</button>
        ) : (
          <button type="button" className={styles.danger} disabled={busy || !opening} onClick={openSheet}><Icon name="clock" />Schließen</button>
        )}
        {message && !message.ok && !sheetOpen && <p className={styles.error} style={{ flexBasis: "100%", margin: 0 }}>{message.text}</p>}
      </section>

      {sheetOpen && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="closure-title" onClick={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
          <div className={`${styles.dialog} ${styles.sheet}`}>
            <h2 id="closure-title">Bestellungen pausieren</h2>
            <p>Abholung und Lieferung sind geschlossen. Kunden sehen auf Website und App einen Hinweis.</p>
            <div className={styles.subhead}>Für wie lange?</div>
            <div className={styles.optionGrid}>
              {DURATIONS.map((item) => (
                <button key={item.id} type="button" className={duration === item.id ? styles.optionActive : ""} onClick={() => setDuration(item.id)}>{item.label}</button>
              ))}
            </div>
            {duration === "date" && (
              <label className={styles.field} style={{ marginTop: 12 }}>Geschlossen bis
                <input type="datetime-local" value={dateValue} min={`${formatDateKey(new Date())}T00:00`} onChange={(event) => setDateValue(event.target.value)} />
              </label>
            )}
            {duration !== "date" && duration !== "open" && (
              <p className={styles.hint} style={{ marginTop: 10 }}>Geschlossen {closureUntilText(untilFor(duration, ""))}, danach automatisch wieder offen.</p>
            )}
            <label className={styles.field} style={{ marginTop: 12 }}>Grund (sehen Kunden, optional)
              <input value={reason} maxLength={160} placeholder="z. B. Wegen Krankheit geschlossen" onChange={(event) => setReason(event.target.value)} />
            </label>
            {message && !message.ok && <p className={styles.error}>{message.text}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondary} onClick={() => setSheetOpen(false)}>Abbrechen</button>
              <button type="button" className={`${styles.danger} ${styles.dangerSolid}`} disabled={busy} onClick={() => void close()}>{busy ? "Wird gespeichert …" : "Jetzt schließen"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
