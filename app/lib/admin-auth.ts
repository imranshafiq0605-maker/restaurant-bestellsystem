import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// Anmeldung im Admin-Panel (/admin): E-Mail + Passwort des Firebase-Kontos, danach immer ein 6-stelliger Code per E-Mail.
// Erst nach dem Code gibt es ein signiertes Sitzungs-Cookie. Nur Adressen aus ADMIN_EMAILS dürfen sich anmelden.

export const ADMIN_COOKIE = "larosa_admin";
export const ADMIN_SESSION_HOURS = 12;
export const ADMIN_CODE_VALID_MINUTES = 10;
export const ADMIN_CODE_MAX_ATTEMPTS = 5;

/** Admin-Adressen, kommagetrennt in der Umgebungsvariable ADMIN_EMAILS (z. B. in Vercel). */
export function adminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null) {
  return Boolean(email) && adminEmails().includes(String(email).trim().toLowerCase());
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET || process.env.EMAIL_CODE_SECRET || process.env.FIREBASE_PRIVATE_KEY;
  if (!value) throw new Error("Admin-Anmeldung ist auf diesem Server nicht konfiguriert.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(`admin:${value}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newChallengeId() {
  return randomBytes(24).toString("base64url");
}

export function hashAdminCode(challengeId: string, email: string, code: string) {
  return sign(`code:${challengeId}:${email.toLowerCase()}:${code}`);
}

export function adminCodeMatches(expected: string, challengeId: string, email: string, code: string) {
  return safeEqual(expected, hashAdminCode(challengeId, email, code));
}

export function createSessionToken(email: string) {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), exp: Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000 })).toString("base64url");
  return `${payload}.${sign(`session:${payload}`)}`;
}

/** Liefert die Admin-E-Mail aus dem Cookie oder null. Prüft Signatur, Ablauf und ob die Adresse noch Admin ist. */
export function readAdminSession(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value || "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if (!safeEqual(signature, sign(`session:${payload}`))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < Date.now() || !isAdminEmail(data.email)) return null;
    return data.email;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, email: string) {
  response.cookies.set(ADMIN_COOKIE, createSessionToken(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

/** Für Admin-API-Routen: gibt die Admin-E-Mail zurück oder wirft "ADMIN_REQUIRED". */
export function requireAdmin(request: NextRequest) {
  const email = readAdminSession(request);
  if (!email) throw new Error("ADMIN_REQUIRED");
  return email;
}
