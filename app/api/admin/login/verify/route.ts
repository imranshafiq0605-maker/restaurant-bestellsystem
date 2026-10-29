import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { ADMIN_CODE_MAX_ATTEMPTS, adminCodeMatches, isAdminEmail, setSessionCookie } from "../../../../lib/admin-auth";

type VerifyResult = { ok: string } | "missing" | "expired" | "locked" | { wrong: number };

// Schritt 2 der Admin-Anmeldung: Code prüfen und die Sitzung starten.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
    const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Bitte gib den 6-stelligen Code aus der E-Mail ein." }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("adminLogins").doc(challengeId);
    const result = await db.runTransaction<VerifyResult>(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!snapshot.exists || typeof data?.codeHash !== "string" || typeof data.email !== "string") return "missing";
      const attempts = Number(data.attempts) || 0;
      if (attempts >= ADMIN_CODE_MAX_ATTEMPTS) return "locked";
      if ((Number(data.expiresAt) || 0) < Date.now()) return "expired";
      if (!adminCodeMatches(data.codeHash, challengeId, data.email, code)) {
        transaction.update(ref, { attempts: attempts + 1 });
        return { wrong: ADMIN_CODE_MAX_ATTEMPTS - attempts - 1 };
      }
      transaction.delete(ref);
      return { ok: data.email };
    });

    if (result === "missing" || result === "expired") return NextResponse.json({ error: "Der Code ist abgelaufen. Bitte melde dich erneut an." }, { status: 400 });
    if (result === "locked") return NextResponse.json({ error: "Zu viele falsche Versuche. Bitte melde dich erneut an." }, { status: 429 });
    if ("wrong" in result) {
      return NextResponse.json({
        error: result.wrong > 0 ? `Der Code stimmt nicht. Noch ${result.wrong} ${result.wrong === 1 ? "Versuch" : "Versuche"}.` : "Der Code stimmt nicht. Bitte melde dich erneut an.",
      }, { status: 400 });
    }
    if (!isAdminEmail(result.ok)) return NextResponse.json({ error: "Diese Adresse ist kein Admin mehr." }, { status: 403 });

    await db.collection("adminAnmeldungen").add({
      email: result.ok,
      at: new Date().toISOString(),
      userAgent: (request.headers.get("user-agent") || "").slice(0, 200),
    });
    const response = NextResponse.json({ email: result.ok });
    setSessionCookie(response, result.ok);
    return response;
  } catch (error) {
    console.error("Admin-Code konnte nicht geprüft werden:", error);
    return NextResponse.json({ error: "Der Code konnte gerade nicht geprüft werden. Bitte versuche es erneut." }, { status: 500 });
  }
}
