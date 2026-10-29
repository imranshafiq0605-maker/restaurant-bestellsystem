"use client";

import { useMemo, useState } from "react";
import {
  formatDateKey,
  normalizeOpeningSettings,
  toMinutes,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  type DayHours,
  type OpeningSettings,
  type Service,
  type SpecialDay,
  type SpecialMode,
  type SpecialService,
} from "../lib/site-settings";
import styles from "./admin.module.css";
import ClosureCard from "./closure";
import { adminFetch, Icon, PageHead, Switch } from "./ui";

type Props = {
  opening: OpeningSettings | null;
  onSaved: (opening: OpeningSettings) => void;
  onError: (error: unknown) => string;
};

const SERVICES: Array<{ id: Service; label: string }> = [
  { id: "abholung", label: "Abholung" },
  { id: "lieferung", label: "Lieferung" },
];

const MODES: Array<{ id: SpecialMode; label: string }> = [
  { id: "normal", label: "Wie immer" },
  { id: "closed", label: "Geschlossen" },
  { id: "custom", label: "Andere Zeiten" },
];

const dateLabel = (key: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) =>
  new Intl.DateTimeFormat("de-DE", options).format(new Date(`${key}T12:00:00`));

function rangeLabel(entry: Pick<SpecialDay, "from" | "to">) {
  if (entry.from === entry.to) return dateLabel(entry.from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${dateLabel(entry.from, { weekday: "short", day: "2-digit", month: "2-digit" })} – ${dateLabel(entry.to)}`;
}

function serviceSummary(entry: SpecialService) {
  if (entry.mode === "closed") return "Geschlossen";
  if (entry.mode === "custom") return `${entry.from} – ${entry.to} Uhr`;
  return "Wie immer";
}

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
              <span className={styles.dayName}><span className={styles.dayLong}>{WEEKDAYS[index]}</span><span className={styles.dayShort}>{WEEKDAYS_SHORT[index]}</span></span>
              <Switch on={day.open} onChange={(open) => update(index, { open })} label={`${WEEKDAYS[index]} geöffnet`} />
              {day.open ? (
                <div className={styles.times}>
                  <input type="time" step={300} value={day.from} aria-label={`${WEEKDAYS[index]} von`} onChange={(event) => update(index, { from: event.target.value })} />
                  <span>–</span>
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

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function emptySpecialDay(date: string): SpecialDay {
  return {
    id: newId(),
    from: date,
    to: date,
    reason: "",
    abholung: { mode: "closed", from: "17:00", to: "22:00" },
    lieferung: { mode: "closed", from: "17:00", to: "22:00" },
  };
}

/** Fenster zum Anlegen/Bearbeiten eines besonderen Tags – Abholung und Lieferung einzeln, wie bei Lieferando. */
function SpecialDayDialog({ initial, isNew, opening, busy, error, onCancel, onSave, onDelete }: {
  initial: SpecialDay;
  isNew: boolean;
  opening: OpeningSettings;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (entry: SpecialDay) => void;
  onDelete: () => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [multiDay, setMultiDay] = useState(initial.to !== initial.from);
  const today = formatDateKey(new Date());

  const setService = (service: Service, patch: Partial<SpecialService>) => setEntry({ ...entry, [service]: { ...entry[service], ...patch } });
  const preset = (abholung: SpecialMode, lieferung: SpecialMode) => setEntry({ ...entry, abholung: { ...entry.abholung, mode: abholung }, lieferung: { ...entry.lieferung, mode: lieferung } });
  const weekday = (new Date(`${entry.from}T12:00:00`).getDay() + 6) % 7;

  const problems = [
    !entry.from && "Bitte ein Datum wählen.",
    multiDay && entry.to < entry.from && "„Bis“ muss nach „Von“ liegen.",
    ...SERVICES.map(({ id, label }) => entry[id].mode === "custom" && toMinutes(entry[id].to) <= toMinutes(entry[id].from) && `${label}: „bis“ muss nach „von“ liegen.`),
    entry.abholung.mode === "normal" && entry.lieferung.mode === "normal" && "Abholung und Lieferung sind beide „Wie immer“ – dann braucht es keinen Eintrag.",
  ].filter(Boolean) as string[];

  const isPreset = (a: SpecialMode, l: SpecialMode) => entry.abholung.mode === a && entry.lieferung.mode === l;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="special-title" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={`${styles.dialog} ${styles.sheet}`}>
        <h2 id="special-title">{isNew ? "Besondere Öffnungszeit" : "Besondere Öffnungszeit bearbeiten"}</h2>
        <p>Gilt nur für diesen Tag bzw. Zeitraum. Danach gelten wieder die normalen Zeiten.</p>

        <div className={styles.subhead}>Wann?</div>
        <div className={styles.dateRange}>
          <label className={styles.field}>{multiDay ? "Von" : "Datum"}
            <input type="date" min={isNew ? today : undefined} value={entry.from} onChange={(event) => setEntry({ ...entry, from: event.target.value, to: multiDay && entry.to >= event.target.value ? entry.to : event.target.value })} />
          </label>
          {multiDay && (
            <label className={styles.field}>Bis einschließlich
              <input type="date" min={entry.from} value={entry.to} onChange={(event) => setEntry({ ...entry, to: event.target.value })} />
            </label>
          )}
        </div>
        <label className={styles.checkLine}>
          <input type="checkbox" checked={multiDay} onChange={(event) => { setMultiDay(event.target.checked); if (!event.target.checked) setEntry({ ...entry, to: entry.from }); }} />
          Mehrere Tage (z. B. Urlaub)
        </label>

        <div className={styles.subhead}>Schnellauswahl</div>
        <div className={`${styles.optionGrid} ${styles.optionGrid4}`}>
          <button type="button" className={isPreset("closed", "closed") ? styles.optionActive : ""} onClick={() => preset("closed", "closed")}>Ganz geschlossen</button>
          <button type="button" className={isPreset("normal", "closed") ? styles.optionActive : ""} onClick={() => preset("normal", "closed")}>Nur Abholung</button>
          <button type="button" className={isPreset("closed", "normal") ? styles.optionActive : ""} onClick={() => preset("closed", "normal")}>Nur Lieferung</button>
          <button type="button" className={isPreset("custom", "custom") ? styles.optionActive : ""} onClick={() => preset("custom", "custom")}>Andere Zeiten</button>
        </div>

        {SERVICES.map(({ id, label }) => {
          const normal = opening[id][weekday];
          return (
            <div className={styles.serviceBox} key={id}>
              <div className={styles.serviceHead}>
                <strong>{label}</strong>
                <small>Normal an dem Tag: {normal.open ? `${normal.from} – ${normal.to}` : "Ruhetag"}</small>
              </div>
              <div className={styles.segmented} role="radiogroup" aria-label={label}>
                {MODES.map((mode) => (
                  <button key={mode.id} type="button" role="radio" aria-checked={entry[id].mode === mode.id} className={entry[id].mode === mode.id ? styles.segmentActive : ""} onClick={() => setService(id, { mode: mode.id })}>{mode.label}</button>
                ))}
              </div>
              {entry[id].mode === "custom" && (
                <div className={styles.times} style={{ marginTop: 10 }}>
                  <input type="time" step={300} value={entry[id].from} aria-label={`${label} von`} onChange={(event) => setService(id, { from: event.target.value })} />
                  <span>–</span>
                  <input type="time" step={300} value={entry[id].to} aria-label={`${label} bis`} onChange={(event) => setService(id, { to: event.target.value })} />
                </div>
              )}
            </div>
          );
        })}

        <label className={styles.field} style={{ marginTop: 14 }}>Hinweis für Kunden (optional)
          <input value={entry.reason} maxLength={160} placeholder="z. B. Heiligabend, Betriebsferien, Familienfeier" onChange={(event) => setEntry({ ...entry, reason: event.target.value })} />
        </label>

        {(problems[0] || error) && <p className={styles.error}>{problems[0] || error}</p>}

        <div className={styles.dialogActions}>
          {!isNew && <button type="button" className={styles.danger} disabled={busy} onClick={onDelete} style={{ marginRight: "auto" }}><Icon name="trash" />Löschen</button>}
          <button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>Abbrechen</button>
          <button type="button" className={styles.primary} disabled={busy || problems.length > 0} onClick={() => onSave({ ...entry, to: multiDay ? entry.to : entry.from, reason: entry.reason.trim() })}>{busy ? "Wird gespeichert …" : "Speichern"}</button>
        </div>
      </div>
    </div>
  );
}

export default function HoursEditor({ opening, onSaved, onError }: Props) {
  // Entwurf der Wochenzeiten erst ab der ersten Änderung; bis dahin werden die gespeicherten Zeiten angezeigt.
  const [weekDraft, setWeekDraft] = useState<Pick<OpeningSettings, Service> | null>(null);
  const week = weekDraft ?? opening;
  const [editing, setEditing] = useState<{ entry: SpecialDay; isNew: boolean } | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = useMemo(() => Boolean(weekDraft && opening && JSON.stringify([weekDraft.abholung, weekDraft.lieferung]) !== JSON.stringify([opening.abholung, opening.lieferung])), [weekDraft, opening]);
  const invalid = week ? SERVICES.some(({ id }) => week[id].some((day) => day.open && toMinutes(day.to) <= toMinutes(day.from))) : false;

  if (!opening || !week) return <><PageHead title="Öffnungszeiten" /><div className={styles.loadingBox}>Wird geladen …</div></>;
  const saved = opening;

  async function put(next: OpeningSettings) {
    const result = await adminFetch<{ opening: OpeningSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ opening: normalizeOpeningSettings(next) }) });
    onSaved(result.opening);
    return result.opening;
  }

  async function saveWeek() {
    if (!weekDraft) return;
    setBusy(true);
    setMessage(null);
    try {
      await put({ ...saved, abholung: weekDraft.abholung, lieferung: weekDraft.lieferung });
      setWeekDraft(null);
      setMessage({ ok: true, text: "Gespeichert. Website und App zeigen die neuen Zeiten in wenigen Sekunden." });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy(false);
    }
  }

  // Besondere Tage werden sofort gespeichert – unabhängig von noch offenen Änderungen an den Wochenzeiten.
  async function saveSpecialDays(specialDays: SpecialDay[], text: string) {
    setBusy(true);
    setDialogError("");
    try {
      await put({ ...saved, specialDays });
      setEditing(null);
      setMessage({ ok: true, text });
    } catch (error) {
      setDialogError(onError(error));
    } finally {
      setBusy(false);
    }
  }

  const today = formatDateKey(new Date());
  const upcoming = saved.specialDays.filter((entry) => entry.to >= today);
  const past = saved.specialDays.filter((entry) => entry.to < today).reverse();
  const setWeek = (service: Service, value: DayHours[]) => setWeekDraft({ abholung: week.abholung, lieferung: week.lieferung, [service]: value });

  const specialList = (entries: SpecialDay[]) => (
    <ul className={styles.specialList}>
      {entries.map((entry) => {
        const isToday = entry.from <= today && today <= entry.to;
        const allClosed = entry.abholung.mode === "closed" && entry.lieferung.mode === "closed";
        return (
          <li key={entry.id}>
            <button type="button" onClick={() => { setDialogError(""); setEditing({ entry, isNew: false }); }}>
              <div className={styles.specialMain}>
                <strong>{rangeLabel(entry)}</strong>
                {isToday && <span className={styles.todayTag}>Heute</span>}
                {entry.reason && <small>{entry.reason}</small>}
              </div>
              {allClosed ? (
                <div className={styles.specialServices}><span className={styles.closedTag}>Ganz geschlossen</span></div>
              ) : (
                <div className={styles.specialServices}>
                  {SERVICES.map(({ id, label }) => (
                    <span key={id} className={entry[id].mode === "closed" ? styles.closedTag : entry[id].mode === "custom" ? styles.customTag : styles.normalTag}>
                      {label}: {serviceSummary(entry[id])}
                    </span>
                  ))}
                </div>
              )}
              <span className={styles.chevron} aria-hidden="true">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHead title="Öffnungszeiten" text="Normale Zeiten pro Wochentag, besondere Tage und Sofort-Schließen. Gilt für Website und App." />

      <div className={styles.stack}>
        <ClosureCard opening={saved} onSaved={onSaved} onError={onError} />

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div><h2>Besondere Öffnungszeiten</h2><p>Feiertage, Urlaub oder ein Tag mit anderen Zeiten – Abholung und Lieferung einzeln.</p></div>
            <button type="button" className={styles.primary} onClick={() => { setDialogError(""); setEditing({ entry: emptySpecialDay(today), isNew: true }); }}><Icon name="plus" />Hinzufügen</button>
          </div>
          {upcoming.length === 0 ? <p className={styles.empty}>Keine besonderen Tage eingetragen. Es gelten die normalen Zeiten.</p> : specialList(upcoming)}
          {past.length > 0 && (
            <>
              <button type="button" className={styles.linkButton} onClick={() => setShowPast(!showPast)}>{showPast ? "Vergangene ausblenden" : `Vergangene anzeigen (${past.length})`}</button>
              {showPast && <div className={styles.pastList}>{specialList(past)}</div>}
            </>
          )}
        </section>

        <div className={styles.grid2}>
          <WeekCard
            title="Abholung"
            text="Normale Zeiten für Abholung im Laden"
            week={week.abholung}
            onChange={(value) => setWeek("abholung", value)}
            onCopyFrom={() => setWeek("abholung", week.lieferung.map((day) => ({ ...day })))}
            copyLabel="Von Lieferung übernehmen"
          />
          <WeekCard
            title="Lieferung"
            text="Normale Zeiten für Lieferung"
            week={week.lieferung}
            onChange={(value) => setWeek("lieferung", value)}
            onCopyFrom={() => setWeek("lieferung", week.abholung.map((day) => ({ ...day })))}
            copyLabel="Von Abholung übernehmen"
          />
        </div>
      </div>

      {message && <p className={message.ok ? styles.notice : styles.error}>{message.text}</p>}

      {editing && (
        <SpecialDayDialog
          key={editing.entry.id}
          initial={editing.entry}
          isNew={editing.isNew}
          opening={saved}
          busy={busy}
          error={dialogError}
          onCancel={() => setEditing(null)}
          onSave={(entry) => void saveSpecialDays([...saved.specialDays.filter((item) => item.id !== entry.id), entry], "Besondere Öffnungszeit gespeichert. Kunden sehen sie in wenigen Sekunden.")}
          onDelete={() => void saveSpecialDays(saved.specialDays.filter((item) => item.id !== editing.entry.id), "Besondere Öffnungszeit gelöscht.")}
        />
      )}

      {(dirty || (busy && weekDraft)) && (
        <div className={styles.saveBar}>
          <span>{invalid ? "Bitte prüfe die Zeiten: „bis“ muss nach „von“ liegen." : "Ungespeicherte Änderungen"}</span>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => setWeekDraft(null)}>Verwerfen</button>
            <button type="button" className={styles.primary} disabled={busy || invalid} onClick={() => void saveWeek()}>{busy ? "Wird gespeichert …" : "Speichern"}</button>
          </div>
        </div>
      )}
    </>
  );
}
