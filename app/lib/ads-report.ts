export type AdsPeriod = "day" | "week" | "month";
export type AdsReportOrder = {
  id: string; number: string; createdAt: string; name: string; email: string;
  value: number; orderType: string; clickedAt: string;
};
export type AdsReport = {
  start: string; end: string; visits: number; visitors: number; orders: AdsReportOrder[];
  revenue: number; truncated: boolean; configured: boolean;
  days: { date: string; visits: number; orders: number; revenue: number }[];
};

export function berlinDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function midnightBerlin(day: string) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  let result = utc;
  for (let i = 0; i < 2; i++) {
    const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" })
      .formatToParts(new Date(result)).find((part) => part.type === "timeZoneName")!.value;
    const hours = Number(offset.replace("GMT", ""));
    result = utc - hours * 3600000;
  }
  return new Date(result);
}
export function reportRange(period: string, day: string) {
  if (!["day", "week", "month"].includes(period) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  if (period === "week") date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  if (period === "month") date.setUTCDate(1);
  const startDay = date.toISOString().slice(0, 10);
  const days: string[] = [];
  const end = new Date(date);
  if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === "week" ? 7 : 1));
  while (date < end) { days.push(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() + 1); }
  return { start: midnightBerlin(startDay), end: midnightBerlin(end.toISOString().slice(0, 10)), days };
}
