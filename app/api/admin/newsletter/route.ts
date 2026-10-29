import { NextResponse } from "next/server";
import { Resend } from "resend";
import { AdminInputError, adminRoute } from "../../../lib/admin-api";
import { getAdminDb } from "../../../lib/firebase-admin";
import { parseCampaign, renderNewsletter, type NewsletterCampaign } from "../../../lib/newsletter-template";
import { unsubscribeUrl } from "../../../lib/newsletter-token";

const FROM = "La Rosa GmbH <newsletter@pizzerialarosagmbh.de>";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function subscribers() {
  const snapshot = await getAdminDb().collection("kunden").where("newsletter.subscribed", "==", true).get();
  return snapshot.docs
    .map((doc) => ({ uid: doc.id, email: String(doc.data().email || "").trim(), name: String(doc.data().name || "") }))
    .filter((entry) => EMAIL.test(entry.email));
}

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new AdminInputError("E-Mail-Versand ist auf diesem Server nicht konfiguriert (RESEND_API_KEY fehlt).");
  return new Resend(apiKey);
}

function readCampaign(value: unknown): NewsletterCampaign {
  try {
    return parseCampaign(value);
  } catch (error) {
    throw new AdminInputError(error instanceof SyntaxError ? `Das JSON ist ungültig: ${error.message}` : error instanceof Error ? error.message : "Das JSON ist ungültig.");
  }
}

export const GET = adminRoute(async () => {
  const [list, history] = await Promise.all([
    subscribers(),
    getAdminDb().collection("newsletterVersand").orderBy("sentAt", "desc").limit(20).get(),
  ]);
  return NextResponse.json({
    subscribers: list.length,
    history: history.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
});

// action "test": eine Test-Mail an eine Adresse. action "send": an alle Abonnenten.
export const POST = adminRoute(async (request, adminEmail) => {
  const body = await request.json().catch(() => ({}));
  const campaign = readCampaign(body?.campaign);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "https://pizzerialarosagmbh.de";
  const resend = resendClient();

  if (body?.action === "test") {
    const to = typeof body.to === "string" && EMAIL.test(body.to.trim()) ? body.to.trim() : adminEmail;
    const testName = typeof body.testName === "string" ? body.testName.slice(0, 60) : "";
    const rendered = renderNewsletter(campaign, { origin, name: testName });
    const { error } = await resend.emails.send({ from: FROM, to, subject: `[TEST] ${rendered.subject}`, html: rendered.html, text: rendered.text });
    if (error) throw new AdminInputError(`Die Test-Mail konnte nicht gesendet werden: ${error.message}`);
    return NextResponse.json({ sent: 1, to });
  }

  if (body?.action !== "send") throw new AdminInputError("Unbekannte Aktion.");
  const list = await subscribers();
  if (!list.length) throw new AdminInputError("Es gibt noch keine Newsletter-Abonnenten.");
  // Schutz vor Doppelklick bzw. veralteter Anzeige: die bestätigte Anzahl muss stimmen.
  if (Number(body.expectedCount) !== list.length) {
    throw new AdminInputError(`Die Zahl der Abonnenten hat sich geändert (jetzt ${list.length}). Bitte lade die Seite neu und bestätige erneut.`);
  }

  let sent = 0;
  const failed: string[] = [];
  for (let start = 0; start < list.length; start += 100) {
    const chunk = list.slice(start, start + 100);
    const { data, error } = await resend.batch.send(chunk.map((entry) => {
      const unsubscribe = unsubscribeUrl(origin, entry.uid);
      const rendered = renderNewsletter(campaign, { origin, name: entry.name, unsubscribeUrl: unsubscribe });
      return {
        from: FROM,
        to: entry.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    }));
    if (error) failed.push(...chunk.map((entry) => entry.email));
    else sent += data?.data?.length ?? chunk.length;
  }

  await getAdminDb().collection("newsletterVersand").add({
    subject: campaign.subject,
    recipients: list.length,
    sent,
    failed: failed.length,
    sentAt: new Date().toISOString(),
    sentBy: adminEmail,
    campaignJson: JSON.stringify(campaign),
  });
  if (!sent) throw new AdminInputError("Der Newsletter konnte nicht gesendet werden. Bitte prüfe die Einstellungen bei Resend.");
  return NextResponse.json({ sent, failed: failed.length });
});
