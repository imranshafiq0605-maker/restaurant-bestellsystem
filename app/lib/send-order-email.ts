import { Resend } from "resend";

type OrderEmailItem = { name: string; quantity: number; price: number; variantName?: string | null; selectedOptions?: string[] };
type SendOrderEmailArgs = { to: string; name?: string; orderNumber?: number; statusUrl: string; items?: OrderEmailItem[]; total?: number; orderType?: string };

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function euro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export async function sendOrderEmail({ to, name, orderNumber, statusUrl, items = [], total, orderType }: SendOrderEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("E-Mail-Versand ist auf diesem Server nicht konfiguriert.");
  const resend = new Resend(apiKey);
  const logoUrl = `${new URL(statusUrl).origin}/images/logo.jpg`;
  const itemRows = items.map((item) => {
    const details = [item.variantName, ...(item.selectedOptions || [])].filter(Boolean).map(escapeHtml).join(" · ");
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #e8ebef;vertical-align:top;color:#17233d;font-size:14px;line-height:1.4"><strong>${Math.max(1, Number(item.quantity) || 1)}× ${escapeHtml(item.name)}</strong>${details ? `<div style="margin-top:3px;color:#778094;font-size:11px">${details}</div>` : ""}</td><td style="padding:14px 0 14px 12px;border-bottom:1px solid #e8ebef;text-align:right;vertical-align:top;color:#17233d;font-size:14px;font-weight:700;white-space:nowrap">${escapeHtml(euro((Number(item.price) || 0) * (Number(item.quantity) || 1)))}</td></tr>`;
  }).join("");

  return resend.emails.send({
    from: "La Rosa GmbH <bestellung@pizzerialarosagmbh.de>",
    to,
    subject: `Bestellung bestätigt${orderNumber ? ` · #${orderNumber}` : ""} · La Rosa`,
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17233d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f6"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 55px rgba(12,35,70,.12)">
      <tr><td style="padding:28px;background:#102e5e;color:#fff"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="${escapeHtml(logoUrl)}" width="64" height="64" alt="La Rosa" style="display:block;border-radius:18px;border:2px solid #fff;object-fit:cover"></td><td style="padding-left:15px"><div style="font-family:Georgia,serif;font-size:25px;font-weight:700;letter-spacing:2px">LA ROSA</div><div style="margin-top:4px;color:#cbd8eb;font-size:10px;letter-spacing:1.5px">PIZZA · PASTA · INDISCH</div></td></tr></table></td></tr>
      <tr><td style="padding:30px 28px 12px"><div style="color:#b32031;font-size:11px;font-weight:800;letter-spacing:1px">ZAHLUNG ERFOLGREICH</div><h1 style="margin:7px 0 9px;font-size:29px;line-height:1.15">Danke${name ? `, ${escapeHtml(name)}` : ""}!</h1><p style="margin:0;color:#657084;font-size:15px;line-height:1.6">Deine Bestellung ist bei uns angekommen und wird jetzt bearbeitet.</p></td></tr>
      <tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;background:#f3f6fa"><tr><td style="padding:16px"><div style="color:#778094;font-size:10px;letter-spacing:.8px">BESTELLNUMMER</div><strong style="display:block;margin-top:4px;font-size:18px">${orderNumber ? `#${orderNumber}` : "Wird erstellt"}</strong></td><td style="padding:16px;text-align:right"><div style="color:#778094;font-size:10px;letter-spacing:.8px">BESTELLART</div><strong style="display:block;margin-top:4px;font-size:15px">${String(orderType).toLowerCase() === "lieferung" ? "Lieferung" : "Abholung"}</strong></td></tr></table></td></tr>
      ${itemRows ? `<tr><td style="padding:16px 28px 0"><h2 style="margin:0 0 3px;font-size:17px">Deine Auswahl</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}</table></td></tr>` : ""}
      ${typeof total === "number" ? `<tr><td style="padding:19px 28px 4px"><table role="presentation" width="100%"><tr><td style="font-size:16px;font-weight:700">Gesamt</td><td style="text-align:right;color:#b32031;font-size:20px;font-weight:800">${escapeHtml(euro(total))}</td></tr></table></td></tr>` : ""}
      <tr><td style="padding:24px 28px 30px;text-align:center"><a href="${escapeHtml(statusUrl)}" style="display:block;padding:15px 20px;border-radius:16px;background:#12356b;color:#fff;text-decoration:none;font-size:15px;font-weight:800">Bestellung in der App ansehen</a><p style="margin:14px 0 0;color:#8991a0;font-size:10px;line-height:1.5">In der App siehst du den aktuellen Status und die verbleibende Zeit.</p></td></tr>
    </table><p style="margin:16px auto 0;max-width:560px;color:#9299a5;font-size:10px;line-height:1.5">La Rosa GmbH · Diese E-Mail wurde automatisch zu deiner Bestellung versendet.</p></td></tr></table></body></html>`,
  });
}
