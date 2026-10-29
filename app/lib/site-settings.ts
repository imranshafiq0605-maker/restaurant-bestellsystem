// Öffnungszeiten und Schließtage der Website. Werden im Admin-Panel gepflegt (Firestore einstellungen/website)
// und von Startseite, Warenkorb und Checkout gelesen. Ohne gespeicherte Einstellungen gelten die Standardzeiten unten.

export type Service = "abholung" | "lieferung";

export type DayHours = { open: boolean; from: string; to: string };

/** Sieben Tage in der Reihenfolge Montag … Sonntag. */
export type WeekHours = DayHours[];

export type ClosedDate = { date: string; reason: string };

export type OpeningSettings = {
  abholung: WeekHours;
  lieferung: WeekHours;
  /** Sofort-Schalter „Geschlossen“: gilt, bis er im Admin-Panel wieder ausgeschaltet wird. */
  closure: { active: boolean; reason: string };
  /** Einzelne Schließtage, z. B. Feiertage oder Betriebsferien (Datum im Format JJJJ-MM-TT). */
  closedDates: ClosedDate[];
};

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const week = (weekday: Omit<DayHours, "open">, weekend: Omit<DayHours, "open">): WeekHours =>
  Array.from({ length: 7 }, (_, index) => ({ open: true, ...(index >= 5 ? weekend : weekday) }));

export const DEFAULT_OPENING_SETTINGS: OpeningSettings = {
  abholung: week({ from: "11:00", to: "23:00" }, { from: "14:00", to: "23:00" }),
  lieferung: week({ from: "11:00", to: "22:30" }, { from: "14:00", to: "22:30" }),
  closure: { active: false, reason: "" },
  closedDates: [],
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
  const closedDates = Array.isArray(source.closedDates)
    ? source.closedDates
        .filter((entry): entry is ClosedDate => Boolean(entry) && typeof entry.date === "string" && DATE.test(entry.date))
        .map((entry) => ({ date: entry.date, reason: typeof entry.reason === "string" ? entry.reason.slice(0, 160) : "" }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 100)
    : [];
  return {
    abholung: cleanWeek(source.abholung, DEFAULT_OPENING_SETTINGS.abholung),
    lieferung: cleanWeek(source.lieferung, DEFAULT_OPENING_SETTINGS.lieferung),
    closure: {
      active: closure.active === true,
      reason: typeof closure.reason === "string" ? closure.reason.slice(0, 160) : "",
    },
    closedDates,
  };
}

/** Montag = 0 … Sonntag = 6 */
function weekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Grund (evtl. leer), falls an diesem Tag komplett geschlossen ist – durch den Schalter, solange er an ist,
 * oder durch einen eingetragenen Schließtag. null = nicht geschlossen.
 */
export function closedReasonForDate(settings: OpeningSettings, date: Date): string | null {
  if (settings.closure.active) return settings.closure.reason;
  const entry = settings.closedDates.find((item) => item.date === formatDateKey(date));
  return entry ? entry.reason : null;
}

export function hoursForDate(settings: OpeningSettings, service: Service, date: Date) {
  return settings[service][weekdayIndex(date)];
}

export function getServiceStatus(settings: OpeningSettings, service: Service, now = new Date()) {
  if (closedReasonForDate(settings, now) !== null) return { isOpen: false };
  const day = hoursForDate(settings, service, now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return { isOpen: day.open && minutes >= toMinutes(day.from) && minutes <= toMinutes(day.to) };
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
