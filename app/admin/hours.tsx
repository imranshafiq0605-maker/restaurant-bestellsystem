"use client";

import { useMemo, useState } from "react";
import { formatDateKey, normalizeOpeningSettings, toMinutes, WEEKDAYS, type DayHours, type OpeningSettings, type Service } from "../lib/site-settings";
import styles from "./admin.module.css";
import { adminFetch, formatDate, Icon, PageHead, Switch } from "./ui";

type Props = {
  opening: OpeningSettings | null;
  onSaved: (opening: OpeningSettings) => void;
  onError: (error: unknown) => string;
};

function WeekCard({ title, text, week, onChange, onCopyFrom, copyLabel }: {
  title: string;
  text: string;
  week: DayHours[];
  onChange: (week: DayHours[]) => void;
  onCopyFrom: () => void;
  copyLabel: string;
}) {
  const update = (index: number, patch: Partial<DayHours>) => onChange(week.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  const copyToAll = (index: number) => onChange(week.map(() => ({ ...week[index] })));

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div><h2>{title}</h2><p>{text}</p></div>
        <button type="button" className={styles.ghost} onClick={onCopyFrom}><Icon name="copy" />{copyLabel}</button>
      </div>
      <div className={styles.weekTable}>
        {week.map((day, index) => {
          const invalid = day.open && toMinutes(day.to) <= toMinutes(day.from);
          return (
            <div className={styles.dayRow} key={WEEKDAYS[index]}>
              <span className={styles.dayName}>{WEEKDAYS[index]}</span>
              <Switch on={day.open} onChange={(open) => update(index, { open })} label={`${WEEKDAYS[index]} geöffnet`} />
              {day.open ? (
                <div className={styles.times}>
                  <input type="time" step={300} value={day.from} aria-label={`${WEEKDAYS[index]} von`} onChange={(event) => update(index, { from: event.target.value })} />
                  –
                  <input type="time" step={300} value={day.to} aria-label={`${WEEKDAYS[index]} bis`} onChange={(event) => update(index, { to: event.target.value })} style={invalid ? { borderColor: "#b42318" } : undefined} />
                </div>
              ) : <span className={`${styles.times} ${styles.closedLabel}`}>Geschlossen</span>}
              <button type="button" className={styles.iconButton} title="Für alle Tage übernehmen" aria-label={`${WEEKDAYS[index]} für alle Tage übernehmen`} onClick={() => copyToAll(index)}><Icon name="copy" /></button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function HoursEditor({ opening, onSaved, onError }: Props) {
  // Entwurf erst ab der ersten Änderung; bis dahin werden die gespeicherten Zeiten angezeigt.
  const [draftState, setDraft] = useState<OpeningSettings | null>(null);
  const draft = draftState ?? opening;
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = useMemo(() => Boolean(draft && opening && JSON.stringify(draft) !== JSON.stringify(opening)), [draft, opening]);
  const invalid = draft ? (["abholung", "lieferung"] as Service[]).some((service) => draft[service].some((day) => day.open && toMinutes(day.to) <= toMinutes(day.from))) : false;

  if (!draft) return <><PageHead title="Öffnungszeiten" /><div className={styles.loadingBox}>Wird geladen …</div></>;

  const set = (patch: Partial<OpeningSettings>) => setDraft({ ...draft, ...patch });

  async function save() {
    const next = draft;
    if (!next) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ opening: OpeningSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ opening: normalizeOpeningSettings(next) }) });
      onSaved(result.opening);
      setDraft(result.opening);
      setMessage({ ok: true, text: "Gespeichert. Website und App zeigen die neuen Zeiten in wenigen Sekunden." });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy(false);
    }
  }

  // Der Schalter speichert sofort, aber nur den Schalter (und den Grund) – andere offene Änderungen bleiben ungespeichert im Entwurf.
  async function saveClosure(active: boolean) {
    if (!draft || !opening) return;
    const closure = { ...draft.closure, active };
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ opening: OpeningSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ opening: { ...opening, closure } }) });
      onSaved(result.opening);
      setDraft({ ...draft, closure: result.opening.closure });
      setMessage({ ok: true, text: active ? "Geschlossen: Es werden keine Bestellungen mehr angenommen." : "Wieder geöffnet: Bestellungen sind möglich." });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy(false);
    }
  }

  function addDate() {
    if (!newDate || !draft) return;
    const closedDates = [...draft.closedDates.filter((entry) => entry.date !== newDate), { date: newDate, reason: newReason.trim() }].sort((a, b) => a.date.localeCompare(b.date));
    set({ closedDates });
    setNewDate("");
    setNewReason("");
  }

  const today = formatDateKey(new Date());
  const upcoming = draft.closedDates.filter((entry) => entry.date >= today);
  const past = draft.closedDates.filter((entry) => entry.date < today);

  return (
    <>
      <PageHead title="Öffnungszeiten" text="Lege für jeden Tag fest, wann Abholung und Lieferung möglich sind. Gilt für Website und App." />

      <div className={styles.stack}>
        <section className={`${styles.card} ${styles.closureCard} ${draft.closure.active ? styles.closureActive : ""}`}>
          <div>
            <h2>Sofort schließen</h2>
            <p>Solange der Schalter an ist, nehmen Website und App keine Bestellungen an – auch keine Vorbestellungen. Kunden sehen einen Hinweis.</p>
          </div>
          <Switch on={draft.closure.active} danger label="Sofort schließen" disabled={busy} onChange={(active) => void saveClosure(active)} />
          <label className={`${styles.field} ${styles.closureReason}`}>Grund (wird Kunden angezeigt, optional)
            <input value={draft.closure.reason} maxLength={160} placeholder="z. B. Wegen Krankheit heute geschlossen" onChange={(event) => set({ closure: { ...draft.closure, reason: event.target.value } })} />
          </label>
        </section>

        <div className={styles.grid2}>
          <WeekCard
            title="Abholung"
            text="Wann Kunden im Laden abholen können"
            week={draft.abholung}
            onChange={(abholung) => set({ abholung })}
            onCopyFrom={() => set({ abholung: draft.lieferung.map((day) => ({ ...day })) })}
            copyLabel="Von Lieferung übernehmen"
          />
          <WeekCard
            title="Lieferung"
            text="Wann wir ausliefern"
            week={draft.lieferung}
            onChange={(lieferung) => set({ lieferung })}
            onCopyFrom={() => set({ lieferung: draft.abholung.map((day) => ({ ...day })) })}
            copyLabel="Von Abholung übernehmen"
          />
        </div>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div><h2>Geschlossene Tage</h2><p>Feiertage, Urlaub oder Betriebsferien. An diesen Tagen ist Abholung und Lieferung geschlossen.</p></div>
          </div>
          {upcoming.length === 0 ? <p className={styles.empty}>Keine geschlossenen Tage eingetragen.</p> : (
            <ul className={styles.dateList}>
              {upcoming.map((entry) => (
                <li key={entry.date}>
                  <strong>{new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${entry.date}T12:00:00`))}</strong>
                  <span>{entry.reason || "Geschlossen"}</span>
                  <button type="button" className={styles.iconButton} aria-label="Entfernen" title="Entfernen" onClick={() => set({ closedDates: draft.closedDates.filter((item) => item.date !== entry.date) })}><Icon name="trash" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.inlineForm}>
            <input className={styles.input} type="date" min={today} value={newDate} onChange={(event) => setNewDate(event.target.value)} aria-label="Datum" style={{ maxWidth: 200 }} />
            <input className={styles.input} value={newReason} maxLength={160} placeholder="Grund, z. B. Heiligabend" onChange={(event) => setNewReason(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addDate(); }} />
            <button type="button" className={styles.secondary} disabled={!newDate} onClick={addDate}><Icon name="plus" />Tag hinzufügen</button>
          </div>
          {past.length > 0 && <p className={styles.hint}>{past.length} vergangene{past.length === 1 ? "r Tag" : " Tage"} (zuletzt {formatDate(`${past[past.length - 1].date}T12:00:00`)}) werden beim Speichern mitgespeichert, aber nicht mehr angezeigt.</p>}
        </section>
      </div>

      {message && <p className={message.ok ? styles.notice : styles.error}>{message.text}</p>}

      {(dirty || busy) && (
        <div className={styles.saveBar}>
          <span>{invalid ? "Bitte prüfe die Zeiten: „bis“ muss nach „von“ liegen." : "Ungespeicherte Änderungen"}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => setDraft(null)}>Verwerfen</button>
            <button type="button" className={styles.primary} disabled={busy || invalid} onClick={() => void save()}>{busy ? "Wird gespeichert …" : "Speichern"}</button>
          </div>
        </div>
      )}
    </>
  );
}
