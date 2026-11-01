import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_DAYS, attributionHash, readAttribution, signAttribution } from "../../../lib/ads-attribution";

const headers = { "Cache-Control": "no-store" };
function allowedOrigin(request: NextRequest) {
  return process.env.VERCEL_ENV !== "preview" && Boolean(process.env.GOOGLE_ADS_ORIGIN) &&
    [process.env.GOOGLE_ADS_ORIGIN, process.env.GOOGLE_ADS_ALTERNATE_ORIGIN].some((origin) => origin && origin === request.headers.get("origin"));
}
export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) return new NextResponse(null, { status: 403, headers });
  try {
    const body = await request.json();
    // Marker from Google's auto-tagged landing URL; never store the raw click ID.
    if (body.consent !== true || !["gclid", "dclid", "gbraid", "wbraid"].includes(body.kind) ||
        typeof body.clickId !== "string" || !/^[a-zA-Z0-9_.~-]{1,512}$/.test(body.clickId)) {
      return new NextResponse(null, { status: 400, headers });
    }
    const now = Date.now();
    const previous = readAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value, now);
    const clickHash = attributionHash(`${body.kind}:${body.clickId}`);
    if (previous?.clickHash === clickHash && now - previous.clickedAt < 30 * 60000) {
      return new NextResponse(null, { status: 204, headers });
    }
    const data = { source: "google_ads" as const, visitorId: previous?.visitorId || randomUUID(), visitId: randomUUID(), clickedAt: now, clickHash };
    await getAdminDb().collection("adsVisits").doc(data.visitId).create({
      visitorId: data.visitorId, createdAt: new Date(now), source: "google_ads",
    });
    const response = new NextResponse(null, { status: 204, headers });
    response.cookies.set(ATTRIBUTION_COOKIE, signAttribution(data), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ATTRIBUTION_DAYS * 86400,
    });
    return response;
  } catch { return new NextResponse(null, { status: 503, headers }); }
}
export async function DELETE(request: NextRequest) {
  if (!allowedOrigin(request)) return new NextResponse(null, { status: 403, headers });
  const response = new NextResponse(null, { status: 204, headers });
  response.cookies.set(ATTRIBUTION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
