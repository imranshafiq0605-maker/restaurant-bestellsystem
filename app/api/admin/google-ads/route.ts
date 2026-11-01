import { NextResponse } from "next/server";
import { adminRoute, AdminInputError } from "../../../lib/admin-api";
import { getAdminDb } from "../../../lib/firebase-admin";
import { readAttribution } from "../../../lib/ads-attribution";
import { berlinDay, reportRange, type AdsReport, type AdsReportOrder } from "../../../lib/ads-report";
import { parseAdsConfig } from "../../../lib/ads-measurement";

export const GET = adminRoute(async (request) => {
  const range = reportRange(request.nextUrl.searchParams.get("period") || "day", request.nextUrl.searchParams.get("date") || berlinDay(new Date()));
  if (!range) throw new AdminInputError("Bitte wähle einen gültigen Tag, eine Woche oder einen Monat.");
  const db = getAdminDb();
  const limit = 10000;
  const [visits, orders] = await Promise.all([
    db.collection("adsVisits").where("createdAt", ">=", range.start).where("createdAt", "<", range.end).limit(limit + 1).get(),
    db.collection("bestellungen").where("createdAt", ">=", range.start).where("createdAt", "<", range.end).limit(limit + 1).get(),
  ]);
  const days = range.days.map((date) => ({ date, visits: 0, orders: 0, revenue: 0 }));
  const visitors = new Set<string>();
  for (const doc of visits.docs.slice(0, limit)) {
    const data = doc.data();
    const day = days.find((item) => item.date === berlinDay(data.createdAt.toDate()));
    if (day) day.visits++;
    if (typeof data.visitorId === "string") visitors.add(data.visitorId);
  }
  const attributed: AdsReportOrder[] = [];
  for (const doc of orders.docs.slice(0, limit)) {
    const data = doc.data();
    const created = data.createdAt.toDate() as Date;
    const attribution = readAttribution(data.adsAttribution, created.getTime());
    if (!attribution || data.bezahlt !== true || data.adsPaymentVerified !== true ||
        String(data.status || "").toLowerCase().includes("storn") ||
        typeof data.adsPaidValue !== "number" || !Number.isFinite(data.adsPaidValue) || data.adsPaidValue <= 0) continue;
    const day = days.find((item) => item.date === berlinDay(created));
    if (day) { day.orders++; day.revenue += data.adsPaidValue; }
    attributed.push({
      id: doc.id, number: String(data.orderNumber || doc.id), createdAt: created.toISOString(),
      name: String(data.kunde?.name || "Gast"), email: String(data.kunde?.email || ""),
      value: data.adsPaidValue, orderType: data.bestellart === "lieferung" ? "Lieferung" : "Abholung",
      clickedAt: new Date(attribution.clickedAt).toISOString(),
    });
  }
  const report: AdsReport = {
    start: range.start.toISOString(), end: range.end.toISOString(),
    visits: Math.min(visits.size, limit), visitors: visitors.size,
    orders: attributed.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    revenue: Math.round(attributed.reduce((sum, order) => sum + order.value, 0) * 100) / 100,
    days: days.map((day) => ({ ...day, revenue: Math.round(day.revenue * 100) / 100 })),
    truncated: visits.size > limit || orders.size > limit,
    configured: Boolean(parseAdsConfig(process.env.GOOGLE_ADS_ID, process.env.GOOGLE_ADS_PURCHASE_LABEL, process.env.GOOGLE_ADS_ORIGIN)),
  };
  return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
});
