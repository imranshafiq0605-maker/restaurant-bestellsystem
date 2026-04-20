import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

type SendOrderEmailArgs = {
  to: string;
  name?: string;
  orderNumber?: number;
  statusUrl: string;
};

export async function sendOrderEmail({
  to,
  name,
  orderNumber,
  statusUrl,
}: SendOrderEmailArgs) {
  const response = await resend.emails.send({
    from: "La Rosa GmbH <bestellung@pizzerialarosagmbh.de>",
    to,
    subject: `Deine Bestellung bei La Rosa GmbH${orderNumber ? ` #${orderNumber}` : ""}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; max-width: 620px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px;">Vielen Dank${name ? `, ${name}` : ""}!</h2>

        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 12px;">
          Deine Bestellung bei <strong>La Rosa GmbH</strong> wurde erfolgreich bezahlt.
        </p>

        ${
          orderNumber
            ? `<p style="font-size: 16px; line-height: 1.6; margin: 0 0 12px;">
                <strong>Bestellnummer:</strong> #${orderNumber}
              </p>`
            : ""
        }

        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 18px;">
          Über diesen Link kannst du jederzeit deinen aktuellen Bestellstatus verfolgen.
        </p>

        <p style="margin: 0 0 22px;">
          <a
            href="${statusUrl}"
            style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 700;"
          >
            Bestellstatus öffnen
          </a>
        </p>

        <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin: 0;">
          Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
        </p>

        <p style="font-size: 14px; line-height: 1.6; color: #64748b; word-break: break-all;">
          ${statusUrl}
        </p>
      </div>
    `,
  });

  return response;
}