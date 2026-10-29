import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyEmailPassword } from "../../../lib/firebase-rest-auth";
import { createEmailCode } from "../../../lib/email-code";
import { sendAdminCodeEmail } from "../../../lib/send-admin-code-email";
import { ADMIN_CODE_VALID_MINUTES, adminEmails, hashAdminCode, isAdminEmail, newChallengeId } from "../../../lib/admin-auth";

const MAX_CODES_PER_HOUR = 6;
const WRONG_LOGIN = "E-Mail-Adresse oder Passwort ist falsch.";

// Schritt 1 der Admin-Anmeldung: Passwort prüfen, dann einen 6-stelligen Code an die Admin-Adresse schicken.
export async function POST(request: NextRequest) {
  try {
    if (!adminEmails().length) {
      return NextResponse.json({ error: "Der Admin-Zugang ist noch nicht eingerichtet: In Vercel fehlt die Variable ADMIN_EMAILS." }, { status: 503 });
    }
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Bitte gib E-Mail-Adresse und Passwort ein." }, { status: 400 });

    const db = getAdminDb();
    const throttleRef = db.collection("adminLoginLimits").doc(createHash("sha256").update(email).digest("hex"));
    const throttle = (await throttleRef.get()).data();
    const now = Date.now();
    const windowOpen = now - (Number(throttle?.windowStart) || 0) < 3600 * 1000;
    const count = windowOpen ? Number(throttle?.count) || 0 : 0;
    if (count >= MAX_CODES_PER_HOUR) {
      return NextResponse.json({ error: "Zu viele Anmeldeversuche. Bitte warte eine Stunde." }, { status: 429 });
    }
    await throttleRef.set({ windowStart: windowOpen ? Number(throttle?.windowStart) : now, count: count + 1 });

    if (!isAdminEmail(email)) return NextResponse.json({ error: WRONG_LOGIN }, { status: 401 });
    const check = await verifyEmailPassword(email, password);
    if (!check.ok) {
      return NextResponse.json({ error: check.tooMany ? "Zu viele Versuche. Bitte versuche es später erneut." : WRONG_LOGIN }, { status: check.tooMany ? 429 : 401 });
    }

    const challengeId = newChallengeId();
    const code = createEmailCode();
    const challengeRef = db.collection("adminLogins").doc(challengeId);
    await challengeRef.set({
      email,
      codeHash: hashAdminCode(challengeId, email, code),
      attempts: 0,
      createdAt: now,
      expiresAt: now + ADMIN_CODE_VALID_MINUTES * 60 * 1000,
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "https://pizzerialarosagmbh.de";
    const { error } = await sendAdminCodeEmail({ to: email, code, siteUrl, validMinutes: ADMIN_CODE_VALID_MINUTES });
    if (error) {
      await challengeRef.delete();
      throw new Error(`Resend: ${error.message}`);
    }
    const [name, domain] = email.split("@");
    return NextResponse.json({ challengeId, maskedEmail: `${name.slice(0, 2)}${"•".repeat(Math.max(2, name.length - 2))}@${domain}` });
  } catch (error) {
    console.error("Admin-Anmeldung fehlgeschlagen:", error);
    return NextResponse.json({ error: "Der Code konnte gerade nicht gesendet werden. Bitte versuche es erneut." }, { status: 500 });
  }
}
