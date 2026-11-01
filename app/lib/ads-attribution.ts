import { createHmac, timingSafeEqual } from "node:crypto";

export const ATTRIBUTION_COOKIE = "larosa_ads_attribution";
export const ATTRIBUTION_DAYS = 30;
export type AdsAttribution = { source: "google_ads"; visitorId: string; visitId: string; clickedAt: number; clickHash: string };

function secret() {
  return process.env.ADS_ATTRIBUTION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.EMAIL_CODE_SECRET || process.env.FIREBASE_PRIVATE_KEY;
}
export function attributionHash(value: string) {
  const key = secret();
  if (!key) throw new Error("Attribution is not configured");
  return createHmac("sha256", key).update(`larosa-ads-v1:${value}`).digest("base64url");
}
export function signAttribution(data: AdsAttribution) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${attributionHash(payload)}`;
}
export function readAttribution(token: string | undefined, now = Date.now()): AdsAttribution | null {
  if (!token || token.length > 2048) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(attributionHash(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdsAttribution;
    if (data.source !== "google_ads" || !/^[\w-]{20,64}$/.test(data.visitorId) ||
        !/^[\w-]{20,64}$/.test(data.visitId) || typeof data.clickedAt !== "number" ||
        data.clickedAt > now || now - data.clickedAt >= ATTRIBUTION_DAYS * 86400000) return null;
    return data;
  } catch { return null; }
}
