import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

// Newsletter an- oder abmelden für das eigene Konto.
export async function POST(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const subscribed = body?.subscribed === true;
    await getAdminDb().collection("kunden").doc(account.localId).set({
      email: account.email || "",
      newsletter: { subscribed, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "konto" },
    }, { merge: true });
    return NextResponse.json({ subscribed });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Newsletter-Einstellung konnte nicht gespeichert werden:", error);
    return NextResponse.json({ error: isAuthError ? "Bitte melde dich erneut an." : "Die Einstellung konnte nicht gespeichert werden." }, { status: isAuthError ? 401 : 500 });
  }
}
