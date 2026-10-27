import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../../lib/firebase-rest-auth";
import { EMAIL_CODE_MAX_ATTEMPTS, emailCodeMatches } from "../../../../lib/email-code";

type VerifyResult = "ok" | "missing" | "expired" | "locked" | { wrong: number };

// Prüft den sechsstelligen Code und markiert die E-Mail-Adresse des Kontos in Firebase als bestätigt.
export async function POST(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    if (account.emailVerified) return NextResponse.json({ verified: true });
    const email = account.email?.trim().toLowerCase();
    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Bitte gib den 6-stelligen Code aus der E-Mail ein." }, { status: 400 });
    }

    const db = getAdminDb();
    const codeRef = db.collection("emailCodes").doc(account.localId);
    const result = await db.runTransaction<VerifyResult>(async (transaction) => {
      const snapshot = await transaction.get(codeRef);
      const data = snapshot.data();
      if (!snapshot.exists || data?.email !== email || typeof data?.codeHash !== "string") return "missing";
      const attempts = Number(data.attempts) || 0;
      if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) return "locked";
      if ((Number(data.expiresAt) || 0) < Date.now()) return "expired";
      if (!emailCodeMatches(data.codeHash, account.localId, email, code)) {
        transaction.update(codeRef, { attempts: attempts + 1 });
        return { wrong: EMAIL_CODE_MAX_ATTEMPTS - attempts - 1 };
      }
      transaction.delete(codeRef);
      return "ok";
    });

    if (result === "missing") return NextResponse.json({ error: "Bitte fordere einen neuen Code an." }, { status: 400 });
    if (result === "expired") return NextResponse.json({ error: "Der Code ist abgelaufen. Bitte fordere einen neuen an." }, { status: 400 });
    if (result === "locked") return NextResponse.json({ error: "Zu viele falsche Versuche. Bitte fordere einen neuen Code an." }, { status: 429 });
    if (typeof result === "object") {
      return NextResponse.json({
        error: result.wrong > 0
          ? `Der Code stimmt nicht. Noch ${result.wrong} ${result.wrong === 1 ? "Versuch" : "Versuche"}.`
          : "Der Code stimmt nicht. Bitte fordere einen neuen Code an.",
      }, { status: 400 });
    }

    await getAdminAuth().updateUser(account.localId, { emailVerified: true });
    await db.collection("kunden").doc(account.localId).set({
      email: account.email,
      emailVerified: true,
      emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ verified: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Bestätigungscode konnte nicht geprüft werden:", error);
    return NextResponse.json(
      { error: isAuthError ? "Bitte melde dich erneut an." : "Der Code konnte gerade nicht geprüft werden. Bitte versuche es erneut." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
