import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { newsletterTokenValid } from "../../../lib/newsletter-token";

async function unsubscribe(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("u") || "";
  const token = request.nextUrl.searchParams.get("t") || "";
  if (!uid || !token || uid.length > 128 || !newsletterTokenValid(uid, token)) return false;
  const ref = getAdminDb().collection("kunden").doc(uid);
  if (!(await ref.get()).exists) return true;
  await ref.set({ newsletter: { subscribed: false, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "abmeldelink" } }, { merge: true });
  return true;
}

function page(ok: boolean) {
  const title = ok ? "Du bist abgemeldet" : "Link ungültig";
  const text = ok
    ? "Du bekommst keinen Newsletter mehr von La Rosa. In deinem Konto kannst du ihn jederzeit wieder einschalten."
    : "Dieser Abmelde-Link ist nicht gültig. Du kannst den Newsletter auch in deinem Konto ausschalten.";
  return new NextResponse(`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · La Rosa</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17233d"><main style="max-width:420px;margin:24px;padding:32px;border-radius:24px;background:#fff;box-shadow:0 18px 55px rgba(12,35,70,.12);text-align:center"><img src="/images/logo.jpg" width="64" height="64" alt="La Rosa" style="border-radius:18px"><h1 style="font-size:24px;margin:18px 0 8px">${title}</h1><p style="color:#657084;line-height:1.6;margin:0 0 22px">${text}</p><a href="/konto" style="display:inline-block;padding:13px 20px;border-radius:14px;background:#12356b;color:#fff;text-decoration:none;font-weight:700">Zum Konto</a></main></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  try {
    return page(await unsubscribe(request));
  } catch (error) {
    console.error("Newsletter-Abmeldung fehlgeschlagen:", error);
    return page(false);
  }
}

// Ein-Klick-Abmeldung aus dem Mailprogramm (List-Unsubscribe-Post).
export async function POST(request: NextRequest) {
  try {
    const ok = await unsubscribe(request);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  } catch (error) {
    console.error("Newsletter-Abmeldung fehlgeschlagen:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
