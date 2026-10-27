import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// Sechsstellige Bestätigungscodes für Kundenkonten (Website).
// Gespeichert wird nur ein HMAC des Codes in emailCodes/{uid}; nur der Server liest und schreibt dort.

export const EMAIL_CODE_VALID_MINUTES = 15;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_SECONDS = 60;
export const EMAIL_CODE_MAX_SENDS_PER_HOUR = 5;

function secret() {
  const value = process.env.EMAIL_CODE_SECRET || process.env.FIREBASE_PRIVATE_KEY;
  if (!value) throw new Error("Bestätigungscodes sind auf diesem Server nicht konfiguriert.");
  return value;
}

export function createEmailCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailCode(uid: string, email: string, code: string) {
  return createHmac("sha256", secret()).update(`${uid}:${email.toLowerCase()}:${code}`).digest("hex");
}

export function emailCodeMatches(expectedHash: string, uid: string, email: string, code: string) {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashEmailCode(uid, email, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
