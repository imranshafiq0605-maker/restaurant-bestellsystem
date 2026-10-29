import { Resend } from "resend";

type SendAdminCodeEmailArgs = { to: string; code: string; siteUrl: string; validMinutes: number };

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Zwei-Faktor-Code für die Anmeldung im Admin-Panel. Gestaltung wie der Code für Kundenkonten.
export async function sendAdminCodeEmail({ to, code, siteUrl, validMinutes }: SendAdminCodeEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("E-Mail-Versand ist auf diesem Server nicht konfiguriert.");
  const resend = new Resend(apiKey);
  const origin = new URL(siteUrl).origin;
  const time = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date());
  const digits = code.split("").map((digit) => `<td style="width:46px;height:58px;border-radius:14px;background:#f3f6fa;border:1px solid #e3e7ee;text-align:center;vertical-align:middle;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;font-weight:800;color:#17233d">${escapeHtml(digit)}</td>`).join(`<td style="width:8px"></td>`);

  return resend.emails.send({
    from: "La Rosa Admin <konto@pizzerialarosagmbh.de>",
    to,
    subject: `${code} ist dein Admin-Anmeldecode`,
    text: `Dein Anmeldecode für das La-Rosa-Admin-Panel: ${code}\n\nDer Code ist ${validMinutes} Minuten gültig. Anmeldeversuch: ${time}.\n\nWarst du das nicht? Dann ändere bitte sofort dein Passwort.`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17233d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f6"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 55px rgba(12,35,70,.12)">
      <tr><td style="padding:24px 28px;background:#0f172a;color:#fff"><img src="${escapeHtml(origin)}/images/logo.jpg" width="44" height="44" alt="La Rosa" style="display:inline-block;vertical-align:middle;border-radius:12px;border:2px solid #fff"><span style="display:inline-block;vertical-align:middle;margin-left:12px;font-size:17px;font-weight:800;letter-spacing:.5px">La Rosa · Admin</span></td></tr>
      <tr><td style="padding:30px 28px 6px"><h1 style="margin:0 0 10px;font-size:25px;line-height:1.2">Dein Anmeldecode</h1><p style="margin:0;color:#657084;font-size:15px;line-height:1.6">Gib diesen Code im Admin-Panel ein, um die Anmeldung abzuschließen.</p></td></tr>
      <tr><td align="center" style="padding:24px 28px 8px"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${digits}</tr></table></td></tr>
      <tr><td align="center" style="padding:10px 28px 26px;color:#8991a0;font-size:12px">Gültig für ${validMinutes} Minuten · Anmeldeversuch am ${escapeHtml(time)}</td></tr>
      <tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;background:#fff7ed;border:1px solid #fed7aa"><tr><td style="padding:14px 16px;color:#9a3412;font-size:13px;line-height:1.5"><strong>Warst du das nicht?</strong> Dann kennt jemand dein Passwort. Ändere es bitte sofort.</td></tr></table></td></tr>
    </table></td></tr></table></body></html>`,
  });
}
