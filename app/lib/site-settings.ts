// Öffnungszeiten und besondere Tage der Website. Werden im Admin-Panel gepflegt (Firestore einstellungen/website)
// und von Startseite, Warenkorb und Checkout gelesen. Ohne gespeicherte Einstellungen gelten die Standardzeiten unten.

export type Service = "abholung" | "lieferung";

export type DayHours = { open: boolean; from: string; to: string };

/** Sieben Tage in der Reihenfolge Montag … Sonntag. */
export type WeekHours = DayHours[];

/** Wie ein Dienst an einem besonderen Tag läuft: wie immer, geschlossen oder mit eigenen Zeiten. */
export type SpecialMode = "normal" | "closed" | "custom";
export type SpecialService = { mode: SpecialMode; from: string; to: string };

/** Besondere Öffnungszeiten für einen Tag oder Zeitraum (Datum JJJJ-MM-TT, „bis“ einschließlich). */
export type SpecialDay = {
  id: string;
  from: string;
  to: string;
  reason: string;
  abholung: SpecialService;
  lieferung: SpecialService;
};

export type OpeningSettings = {
  abholung: WeekHours;
  lieferung: WeekHours;
  /**
   * Sofort-Schalter „Geschlossen“. until = Zeitpunkt (ISO), ab dem automatisch wieder geöffnet ist;
   * leer = bis der Schalter im Admin-Panel wieder ausgeschaltet wird.
   */
  closure: { active: boolean; reason: string; until: string };
  /** Feiertage, Urlaub, verkürzte Zeiten usw. Gilt vor den normalen Wochenzeiten. */
  specialDays: SpecialDay[];
};

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const week = (weekday: Omit<DayHours, "open">, weekend: Omit<DayHours, "open">): WeekHours =>
  Array.from({ length: 7 }, (_, index) => ({ open: true, ...(index >= 5 ? weekend : weekday) }));

export const DEFAULT_OPENING_SETTINGS: OpeningSettings = {
  abholung: week({ from: "11:00", to: "23:00" }, { from: "14:00", to: "23:00" }),
  lieferung: week({ from: "11:00", to: "22:30" }, { from: "14:00", to: "22:30" }),
  closure: { active: false, reason: "", until: "" },
  specialDays: [],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function cleanSpecialService(value: unknown): SpecialService {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const from = typeof raw.from === "string" && TIME.test(raw.from) ? raw.from : "12:00";
  const to = typeof raw.to === "string" && TIME.test(raw.to) ? raw.to : "22:00";
  let mode: SpecialMode = raw.mode === "closed" || raw.mode === "custom" ? raw.mode : "normal";
  if (mode === "custom" && toMinutes(to) <= toMinutes(from)) mode = "closed";
  return { mode, from, to };
}

/** Bereinigt Daten aus Firestore oder aus dem Admin-Panel. Ungültige Werte fallen auf die Standardzeiten zurück. */
export function normalizeOpeningSettings(input: unknown): OpeningSettings {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const cleanWeek = (value: unknown, fallback: WeekHours): WeekHours =>
    fallback.map((day, index) => {
      const raw = Array.isArray(value) ? (value[index] as Partial<DayHours> | undefined) : undefined;
      if (!raw || typeof raw !== "object") return { ...day };
      const from = typeof raw.from === "string" && TIME.test(raw.from) ? raw.from : day.from;
      const to = typeof raw.to === "string" && TIME.test(raw.to) ? raw.to : day.to;
      return { open: raw.open !== false && toMinutes(to) > toMinutes(from), from, to };
    });
  const closure = (source.closure && typeof source.closure === "object" ? source.closure : {}) as Record<string, unknown>;
  const until = typeof closure.until === "string" && !Number.isNaN(Date.parse(closure.until)) ? new Date(closure.until).toISOString() : "";

  const reasonText = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 160) : "");
  const specialDays: SpecialDay[] = Array.isArray(source.specialDays)
    ? source.specialDays
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && typeof entry.from === "string" && DATE.test(entry.from))
        .map((entry, index) => {
          const from = entry.from as string;
          const to = typeof entry.to === "string" && DATE.test(entry.to) && entry.to >= from ? entry.to : from;
          return {
            id: typeof entry.id === "string" && entry.id ? entry.id.slice(0, 40) : `${from}-${index}`,
            from,
            to,
            reason: reasonText(entry.reason),
            abholung: cleanSpecialService(entry.abholung),
            lieferung: cleanSpecialService(entry.lieferung),
          };
        })
    : [];
  // Ältere Einstellungen hatten nur einzelne Schließtage.
  if (Array.isArray(source.closedDates)) {
    for (const entry of source.closedDates as Array<Record<string, unknown>>) {
      if (!entry || typeof entry.date !== "string" || !DATE.test(entry.date)) continue;
      const closed: SpecialService = { mode: "closed", from: "12:00", to: "22:00" };
      specialDays.push({ id: `alt-${entry.date}`, from: entry.date, to: entry.date, reason: reasonText(entry.reason), abholung: closed, lieferung: { ...closed } });
    }
  }
  specialDays.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    abholung: cleanWeek(source.abholung, DEFAULT_OPENING_SETTINGS.abholung),
    lieferung: cleanWeek(source.lieferung, DEFAULT_OPENING_SETTINGS.lieferung),
    closure: {
      active: closure.active === true,
      reason: reasonText(closure.reason),
      until: closure.active === true ? until : "",
    },
    specialDays: specialDays.slice(-200),
  };
}

/** Montag = 0 … Sonntag = 6 */
function weekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Ist der Sofort-Schalter zum Zeitpunkt „at“ wirksam? Mit Ablaufzeit öffnet es danach automatisch wieder. */
export function isClosureActive(settings: OpeningSettings, at = new Date()) {
  if (!settings.closure.active) return false;
  return !settings.closure.until || at.getTime() < Date.parse(settings.closure.until);
}

/** Besonderer Eintrag für diesen Tag (der zuletzt beginnende gewinnt, falls sich Zeiträume überschneiden). */
export function specialDayFor(settings: OpeningSettings, date: Date): SpecialDay | null {
  const key = formatDateKey(date);
  let match: SpecialDay | null = null;
  for (const entry of settings.specialDays) if (entry.from <= key && key <= entry.to) match = entry;
  return match;
}

/** Wirksame Zeiten eines Dienstes an einem Tag: Wochenzeiten, außer ein besonderer Tag sagt etwas anderes. */
export function hoursForDate(settings: OpeningSettings, service: Service, date: Date): DayHours & { special: SpecialDay | null } {
  const normal = settings[service][weekdayIndex(date)];
  const special = specialDayFor(settings, date);
  if (!special || special[service].mode === "normal") return { ...normal, special };
  const entry = special[service];
  return entry.mode === "closed" ? { open: false, from: normal.from, to: normal.to, special } : { open: true, from: entry.from, to: entry.to, special };
}

/**
 * Grund (evtl. leer), falls an diesem Tag Abholung UND Lieferung geschlossen sind – durch den Schalter
 * oder durch einen besonderen Tag. null = nicht komplett geschlossen.
 * Für einen Tag in der Zukunft zählt der Schalter nur, wenn er dann noch läuft.
 */
export function closedReasonForDate(settings: OpeningSettings, date: Date): string | null {
  const now = new Date();
  const sameDay = formatDateKey(date) === formatDateKey(now);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59);
  if (isClosureActive(settings, sameDay ? now : endOfDay)) return settings.closure.reason;
  const special = specialDayFor(settings, date);
  if (special && special.abholung.mode === "closed" && special.lieferung.mode === "closed") return special.reason;
  return null;
}

export function getServiceStatus(settings: OpeningSettings, service: Service, now = new Date()) {
  if (isClosureActive(settings, now)) return { isOpen: false };
  const day = hoursForDate(settings, service, now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return { isOpen: day.open && minutes >= toMinutes(day.from) && minutes <= toMinutes(day.to) };
}

/** Text für einen Dienst an einem besonderen Tag, z. B. „Geschlossen“ oder „17:00 – 22:00 Uhr“. */
export function describeSpecialService(settings: OpeningSettings, service: Service, date: Date) {
  const day = hoursForDate(settings, service, date);
  return day.open ? `${day.from} – ${day.to} Uhr` : "Geschlossen";
}

export type TodayNotice =
  | { kind: "closed"; title: string; reason: string; until: string }
  | { kind: "special"; title: string; reason: string; abholung: string; lieferung: string };

/** Hinweis für Website und App: heute geschlossen oder heute besondere Öffnungszeiten. null = normaler Tag. */
export function getTodayNotice(settings: OpeningSettings, now = new Date()): TodayNotice | null {
  if (isClosureActive(settings, now)) {
    const until = settings.closure.until ? new Date(settings.closure.until) : null;
    const untilText = until
      ? formatDateKey(until) === formatDateKey(now)
        ? `bis ${until.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
        : `bis ${until.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}, ${until.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
      : "";
    return { kind: "closed", title: until ? `Geschlossen ${untilText}` : "Gerade geschlossen", reason: settings.closure.reason, until: untilText };
  }
  const special = specialDayFor(settings, now);
  if (!special) return null;
  if (special.abholung.mode === "closed" && special.lieferung.mode === "closed") {
    const lastDay = new Date(`${special.to}T12:00:00`);
    const until = special.to > formatDateKey(now) ? `bis einschließlich ${lastDay.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}` : "";
    return { kind: "closed", title: "Heute geschlossen", reason: special.reason, until };
  }
  return {
    kind: "special",
    title: "Besondere Öffnungszeiten",
    reason: special.reason,
    abholung: describeSpecialService(settings, "abholung", now),
    lieferung: describeSpecialService(settings, "lieferung", now),
  };
}

/** Kommende besondere Tage (inkl. heute), für Übersichten. */
export function upcomingSpecialDays(settings: OpeningSettings, now = new Date()) {
  const today = formatDateKey(now);
  return settings.specialDays.filter((entry) => entry.to >= today);
}

/**
 * Zeitfenster für Vorbestellungen an einem Tag: frühestens 1 Stunde nach Öffnung,
 * spätestens 30 Minuten (Lieferung) bzw. 60 Minuten (Abholung) vor Schluss.
 */
export function getPreorderWindow(settings: OpeningSettings, service: Service, date: Date) {
  if (closedReasonForDate(settings, date) !== null) return null;
  const day = hoursForDate(settings, service, date);
  if (!day.open) return null;
  const start = toMinutes(day.from) + 60;
  const end = toMinutes(day.to) - (service === "lieferung" ? 30 : 60);
  return end >= start ? { start: fromMinutes(start), end: fromMinutes(end) } : null;
}

/** Fasst gleiche aufeinanderfolgende Tage zusammen, z. B. „Montag – Freitag 11:00 – 23:00“. */
export function summarizeWeek(hours: WeekHours) {
  const rows: Array<{ label: string; value: string }> = [];
  let start = 0;
  for (let index = 1; index <= 7; index += 1) {
    const current = hours[start];
    const next = hours[index];
    const same = next && next.open === current.open && (!current.open || (next.from === current.from && next.to === current.to));
    if (same) continue;
    const label = index - 1 === start ? WEEKDAYS[start] : `${WEEKDAYS[start]} – ${WEEKDAYS[index - 1]}`;
    rows.push({ label, value: current.open ? `${current.from} – ${current.to}` : "Geschlossen" });
    start = index;
  }
  return rows;
}
