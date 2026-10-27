import { Resend } from "resend";

type SendVerificationCodeEmailArgs = { to: string; code: string; siteUrl: string; validMinutes: number };

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Bestätigungscode für neue Kundenkonten. Gestaltung passt zur Bestellbestätigung (send-order-email.ts).
export async function sendVerificationCodeEmail({ to, code, siteUrl, validMinutes }: SendVerificationCodeEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("E-Mail-Versand ist auf diesem Server nicht konfiguriert.");
  const resend = new Resend(apiKey);
  const origin = new URL(siteUrl).origin;
  const logoUrl = `${origin}/images/logo.jpg`;
  const digits = code.split("").map((digit) => `<td style="width:46px;height:58px;border-radius:14px;background:#f3f6fa;border:1px solid #e3e7ee;text-align:center;vertical-align:middle;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:800;color:#17233d">${escapeHtml(digit)}</td>`).join(`<td style="width:8px"></td>`);

  return resend.emails.send({
    from: "La Rosa GmbH <konto@pizzerialarosagmbh.de>",
    to,
    subject: `${code} ist dein La-Rosa-Bestätigungscode`,
    text: `Dein La-Rosa-Bestätigungscode: ${code}\n\nGib diesen Code auf der Website ein, um dein Konto zu bestätigen. Er ist ${validMinutes} Minuten gültig.\n\nDu hast kein Konto erstellt? Dann kannst du diese E-Mail einfach ignorieren.\n\nLa Rosa GmbH · Bahnhofstr. 2 · Mörfelden-Walldorf`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17233d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f6"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 55px rgba(12,35,70,.12)">
      <tr><td style="padding:26px 28px;background:#102e5e;color:#fff"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="${escapeHtml(logoUrl)}" width="56" height="56" alt="La Rosa" style="display:block;border-radius:16px;border:2px solid #fff;object-fit:cover"></td><td style="padding-left:14px"><div style="font-family:Georgia,serif;font-size:23px;font-weight:700;letter-spacing:2px">LA ROSA</div><div style="margin-top:4px;color:#cbd8eb;font-size:10px;letter-spacing:1.5px">PIZZA · PASTA · INDISCH</div></td></tr></table></td></tr>
      <tr><td style="padding:32px 28px 8px"><div style="color:#778094;font-size:11px;font-weight:800;letter-spacing:1px">DEIN LA-ROSA-KONTO</div><h1 style="margin:8px 0 10px;font-size:27px;line-height:1.2">Bestätige deine E-Mail-Adresse</h1><p style="margin:0;color:#657084;font-size:15px;line-height:1.6">Gib diesen Code auf der Website ein, um dein Konto zu aktivieren.</p></td></tr>
      <tr><td align="center" style="padding:24px 28px 8px"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${digits}</tr></table></td></tr>
      <tr><td align="center" style="padding:10px 28px 26px;color:#8991a0;font-size:12px">Der Code ist ${validMinutes} Minuten gültig.</td></tr>
      <tr><td style="padding:0 28px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;background:#f7f8fa;border:1px solid #eceff3"><tr><td style="padding:16px 18px;color:#657084;font-size:13px;line-height:1.55"><strong style="color:#17233d">Danach sammelst du bei jeder Bestellung Rosen.</strong><br>1 € = 1 Rose · ab 100 Rosen bekommst du 3 € Rabatt, auf der Website und in der App.</td></tr></table></td></tr>
    </table><p style="margin:16px auto 0;max-width:520px;color:#9299a5;font-size:11px;line-height:1.5;text-align:center">Du hast kein Konto bei La Rosa erstellt? Dann kannst du diese E-Mail einfach ignorieren.<br>La Rosa GmbH · Bahnhofstr. 2 · Mörfelden-Walldorf</p></td></tr></table></body></html>`,
  });
}
