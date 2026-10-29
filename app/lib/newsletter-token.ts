import { createHmac, timingSafeEqual } from "node:crypto";

// Signierter Abmelde-Link für Newsletter-Mails, damit niemand fremde Konten abmelden kann.
function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.EMAIL_CODE_SECRET || process.env.FIREBASE_PRIVATE_KEY;
  if (!value) throw new Error("Newsletter-Abmeldung ist auf diesem Server nicht konfiguriert.");
  return value;
}

export function newsletterToken(uid: string) {
  return createHmac("sha256", secret()).update(`newsletter:${uid}`).digest("base64url").slice(0, 32);
}

export function newsletterTokenValid(uid: string, token: string) {
  const expected = Buffer.from(newsletterToken(uid));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function unsubscribeUrl(siteUrl: string, uid: string) {
  return `${new URL(siteUrl).origin}/api/newsletter/unsubscribe?u=${encodeURIComponent(uid)}&t=${newsletterToken(uid)}`;
}
