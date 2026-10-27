import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";
import {
  createEmailCode,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_MAX_SENDS_PER_HOUR,
  EMAIL_CODE_RESEND_SECONDS,
  EMAIL_CODE_VALID_MINUTES,
  hashEmailCode,
} from "../../../lib/email-code";
import { sendVerificationCodeEmail } from "../../../lib/send-verification-code-email";

type SendResult =
  | { status: "send"; code: string }
  | { status: "pending"; retryAfter: number }
  | { status: "cooldown"; retryAfter: number }
  | { status: "limit" };

// Schickt einen sechsstelligen Bestätigungscode an die E-Mail-Adresse des angemeldeten Kontos.
// { auto: true } schickt nur, wenn noch kein gültiger Code unterwegs ist (z. B. beim erneuten Öffnen der Seite).
export async function POST(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    if (account.emailVerified) return NextResponse.json({ verified: true });
    const email = account.email?.trim();
    if (!email) return NextResponse.json({ error: "Für dieses Konto ist keine E-Mail-Adresse hinterlegt." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const auto = body?.auto === true;
    const codeRef = getAdminDb().collection("emailCodes").doc(account.localId);
    const now = Date.now();

    const result = await getAdminDb().runTransaction<SendResult>(async (transaction) => {
      const snapshot = await transaction.get(codeRef);
      const data = snapshot.data();
      const sameEmail = data?.email === email.toLowerCase();
      const sentAt = sameEmail ? Number(data?.sentAt) || 0 : 0;
      const expiresAt = sameEmail ? Number(data?.expiresAt) || 0 : 0;
      const attempts = sameEmail ? Number(data?.attempts) || 0 : 0;
      const sinceSent = Math.floor((now - sentAt) / 1000);
      const retryAfter = Math.max(0, EMAIL_CODE_RESEND_SECONDS - sinceSent);

      if (auto && expiresAt > now && attempts < EMAIL_CODE_MAX_ATTEMPTS) return { status: "pending", retryAfter };
      if (retryAfter > 0) return { status: "cooldown", retryAfter };

      const windowOpen = now - (Number(data?.windowStart) || 0) < 60 * 60 * 1000;
      const windowStart = windowOpen ? Number(data?.windowStart) : now;
      const sendCount = windowOpen ? Number(data?.sendCount) || 0 : 0;
      if (sendCount >= EMAIL_CODE_MAX_SENDS_PER_HOUR) return { status: "limit" };

      const code = createEmailCode();
      transaction.set(codeRef, {
        email: email.toLowerCase(),
        codeHash: hashEmailCode(account.localId, email, code),
        expiresAt: now + EMAIL_CODE_VALID_MINUTES * 60 * 1000,
        attempts: 0,
        sentAt: now,
        windowStart,
        sendCount: sendCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: "send", code };
    });

    if (result.status === "pending" || result.status === "cooldown") {
      return NextResponse.json({ sent: false, retryAfter: result.retryAfter });
    }
    if (result.status === "limit") {
      return NextResponse.json({ error: "Du hast zu viele Codes angefordert. Bitte versuche es in einer Stunde erneut." }, { status: 429 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "https://pizzerialarosagmbh.de";
    const { error } = await sendVerificationCodeEmail({ to: email, code: result.code, siteUrl, validMinutes: EMAIL_CODE_VALID_MINUTES });
    if (error) {
      // Ohne zugestellte E-Mail darf der Nutzer sofort erneut anfordern.
      await codeRef.set({ sentAt: 0, expiresAt: 0 }, { merge: true });
      throw new Error(`Resend: ${error.message}`);
    }
    return NextResponse.json({ sent: true, retryAfter: EMAIL_CODE_RESEND_SECONDS });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Bestätigungscode konnte nicht gesendet werden:", error);
    return NextResponse.json(
      { error: isAuthError ? "Bitte melde dich erneut an." : "Der Code konnte gerade nicht gesendet werden. Bitte versuche es gleich noch einmal." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
