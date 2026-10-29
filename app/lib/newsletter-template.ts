// Newsletter aus JSON: wird im Admin-Panel als Vorschau gezeigt und beim Versand auf dem Server gerendert.
// Gestaltung passt zu den übrigen La-Rosa-Mails (Bestellbestätigung, Bestätigungscode).

export type NewsletterBlock =
  | { type: "text"; text: string }
  | { type: "image"; src: string; alt?: string }
  | { type: "button"; label: string; url: string }
  | { type: "code"; code: string; text?: string }
  | { type: "products"; items: Array<{ name: string; price?: string; description?: string; image?: string }> };

export type NewsletterCampaign = {
  subject: string;
  preheader?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  image?: string;
  blocks?: NewsletterBlock[];
  button?: { label: string; url: string };
  footer?: string;
};

export const NEWSLETTER_FORMAT_HELP = `{
  "subject": "Betreff der E-Mail (Pflicht)",
  "preheader": "Vorschautext im Postfach",
  "eyebrow": "KLEINE ÜBERSCHRIFT",
  "title": "Große Überschrift (Pflicht)",
  "intro": "Hallo {{name}}, … ({{name}} wird durch den Vornamen ersetzt)",
  "image": "/images/hero-main.jpg",
  "blocks": [
    { "type": "text", "text": "Absatz. Leerzeile = neuer Absatz." },
    { "type": "products", "items": [{ "name": "Pizza Margherita", "price": "9,50 €", "description": "…", "image": "/images/pizza-margherita.jpg" }] },
    { "type": "code", "code": "ROSA10", "text": "Gutscheincode an der Kasse angeben" },
    { "type": "image", "src": "/images/pommes.jpg", "alt": "Pommes" },
    { "type": "button", "label": "Zweiter Button", "url": "https://pizzerialarosagmbh.de" }
  ],
  "button": { "label": "Jetzt bestellen", "url": "https://pizzerialarosagmbh.de" },
  "footer": "Kleiner Text ganz unten"
}`;

const SITE = "https://pizzerialarosagmbh.de";

export const NEWSLETTER_TEMPLATES: Array<{ id: string; label: string; description: string; campaign: NewsletterCampaign }> = [
  {
    id: "angebot",
    label: "Wochenangebot",
    description: "Aktion mit Produkten und Bestell-Button",
    campaign: {
      subject: "Diese Woche bei La Rosa: 2 Pizzen, 1 Preis 🍕",
      preheader: "Nur bis Sonntag – jetzt online bestellen.",
      eyebrow: "WOCHENANGEBOT",
      title: "Pizza-Woche bei La Rosa",
      intro: "Hallo {{name}},\n\ndiese Woche gibt es unsere beliebtesten Pizzen zum Sonderpreis. Bestell bequem online zur Abholung oder Lieferung.",
      image: "/images/pizza-margherita.jpg",
      blocks: [
        { type: "products", items: [
          { name: "Pizza Margherita", price: "7,90 €", description: "Tomatensoße, Mozzarella, frisches Basilikum", image: "/images/pizza-margherita.jpg" },
          { name: "Cheeseburger Menü", price: "11,90 €", description: "Mit Pommes und Soße nach Wahl", image: "/images/cheeseburger.jpg" },
        ] },
        { type: "text", text: "Das Angebot gilt bis Sonntag, solange der Vorrat reicht." },
      ],
      button: { label: "Jetzt bestellen", url: SITE },
    },
  },
  {
    id: "rosen",
    label: "Rosen-Aktion",
    description: "Doppelte Rosen oder Treue-Aktion",
    campaign: {
      subject: "🌹 Doppelte Rosen am Wochenende",
      preheader: "Sammle bei jeder Bestellung doppelt so viele Rosen.",
      eyebrow: "LA ROSA TREUEPROGRAMM",
      title: "Doppelte Rosen für dich",
      intro: "Hallo {{name}},\n\nvon Freitag bis Sonntag bekommst du für jeden Euro 2 statt 1 Rose. Ab 100 Rosen sparst du 3 € bei deiner nächsten Bestellung.",
      image: "/images/hero-main.jpg",
      blocks: [{ type: "text", text: "Einfach mit deinem Konto auf der Website oder in der App bestellen – die Rosen werden automatisch gutgeschrieben." }],
      button: { label: "Rosen sammeln", url: `${SITE}/konto` },
    },
  },
  {
    id: "neu",
    label: "Neues Gericht",
    description: "Neuheit auf der Karte vorstellen",
    campaign: {
      subject: "Neu bei La Rosa: unsere indischen Spezialitäten",
      preheader: "Frisch auf der Karte – probier sie jetzt.",
      eyebrow: "NEU AUF DER KARTE",
      title: "Frisch aus unserer indischen Küche",
      intro: "Hallo {{name}},\n\nwir haben unsere Karte erweitert. Probier jetzt unsere neuen indischen Gerichte – mild bis feurig, ganz wie du magst.",
      image: "/images/cuisine-indisch.jpg",
      blocks: [{ type: "text", text: "Alle Gerichte bekommst du auch mit Chicken, Lamm, Rind oder Garnelen." }],
      button: { label: "Zur indischen Karte", url: SITE },
    },
  },
  {
    id: "info",
    label: "Info / Öffnungszeiten",
    description: "Feiertag, Urlaub oder geänderte Zeiten",
    campaign: {
      subject: "Wichtige Info: unsere Öffnungszeiten an den Feiertagen",
      preheader: "Damit du weißt, wann wir für dich da sind.",
      eyebrow: "INFO",
      title: "Unsere Feiertags-Öffnungszeiten",
      intro: "Hallo {{name}},\n\nan den Feiertagen haben wir geänderte Öffnungszeiten:",
      blocks: [
        { type: "text", text: "24.12.: geschlossen\n25.12.: 14:00 – 22:00 Uhr\n26.12.: 14:00 – 22:00 Uhr\n31.12.: 11:00 – 18:00 Uhr" },
        { type: "text", text: "Wir wünschen dir schöne Feiertage!\nDein La-Rosa-Team" },
      ],
      button: { label: "Zur Website", url: SITE },
    },
  },
];

const str = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Prüft das JSON aus dem Admin-Panel. Wirft einen Fehler mit deutscher Meldung. */
export function parseCampaign(input: unknown): NewsletterCampaign {
  const source = (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Das JSON muss ein Objekt { … } sein.");
  const subject = str(source.subject, 200);
  const title = str(source.title, 200);
  if (!subject) throw new Error("„subject“ (Betreff) fehlt.");
  if (!title) throw new Error("„title“ (Überschrift) fehlt.");
  const blocks: NewsletterBlock[] = [];
  if (source.blocks !== undefined && !Array.isArray(source.blocks)) throw new Error("„blocks“ muss eine Liste [ … ] sein.");
  ((source.blocks as unknown[]) || []).slice(0, 30).forEach((raw, index) => {
    const block = (raw || {}) as Record<string, unknown>;
    if (block.type === "text" && str(block.text)) blocks.push({ type: "text", text: str(block.text, 5000) });
    else if (block.type === "image" && str(block.src)) blocks.push({ type: "image", src: str(block.src, 500), alt: str(block.alt, 200) });
    else if (block.type === "button" && str(block.label) && str(block.url)) blocks.push({ type: "button", label: str(block.label, 80), url: str(block.url, 500) });
    else if (block.type === "code" && str(block.code)) blocks.push({ type: "code", code: str(block.code, 40), text: str(block.text, 300) });
    else if (block.type === "products" && Array.isArray(block.items)) {
      blocks.push({
        type: "products",
        items: (block.items as Array<Record<string, unknown>>).slice(0, 12).filter((item) => str(item?.name)).map((item) => ({
          name: str(item.name, 120), price: str(item.price, 40), description: str(item.description, 400), image: str(item.image, 500),
        })),
      });
    } else throw new Error(`Block ${index + 1}: unbekannter Typ oder Inhalt fehlt (erlaubt: text, image, button, code, products).`);
  });
  const button = source.button as Record<string, unknown> | undefined;
  return {
    subject,
    title,
    preheader: str(source.preheader, 200),
    eyebrow: str(source.eyebrow, 60),
    intro: str(source.intro, 5000),
    image: str(source.image, 500),
    blocks,
    ...(button && str(button.label) && str(button.url) ? { button: { label: str(button.label, 80), url: str(button.url, 500) } } : {}),
    footer: str(source.footer, 500),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function absoluteUrl(value: string, origin: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  return "";
}

function paragraphs(text: string, style: string) {
  return text.split(/\n{2,}/).map((part) => `<p style="${style}">${escapeHtml(part).replaceAll("\n", "<br>")}</p>`).join("");
}

function buttonHtml(label: string, url: string, origin: string, primary = true) {
  const href = absoluteUrl(url, origin);
  if (!href) return "";
  return `<a href="${escapeHtml(href)}" style="display:block;padding:15px 20px;border-radius:16px;${primary ? "background:#12356b;color:#fff" : "border:1.5px solid #12356b;color:#12356b"};text-decoration:none;font-size:15px;font-weight:800;text-align:center">${escapeHtml(label)}</a>`;
}

export type RenderOptions = { origin: string; name?: string; unsubscribeUrl?: string };

export function renderNewsletter(campaign: NewsletterCampaign, { origin, name, unsubscribeUrl }: RenderOptions) {
  const firstName = (name || "").trim().split(/\s+/)[0] || "";
  // „Hallo {{name}},“ wird zu „Hallo Anna,“ – ohne Namen zu „Hallo,“.
  const personalize = (text = "") => text.replace(/ ?\{\{name\}\}/g, firstName ? ` ${firstName}` : "");
  const p = "margin:0 0 14px;color:#4b5567;font-size:15px;line-height:1.65";
  const hero = campaign.image && absoluteUrl(campaign.image, origin)
    ? `<tr><td style="padding:0"><img src="${escapeHtml(absoluteUrl(campaign.image, origin))}" width="620" alt="" style="display:block;width:100%;max-height:300px;object-fit:cover"></td></tr>`
    : "";

  const blockHtml = (campaign.blocks || []).map((block) => {
    if (block.type === "text") return `<tr><td style="padding:4px 28px 0">${paragraphs(personalize(block.text), p)}</td></tr>`;
    if (block.type === "image") {
      const src = absoluteUrl(block.src, origin);
      return src ? `<tr><td style="padding:8px 28px 14px"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt || "")}" width="564" style="display:block;width:100%;border-radius:18px"></td></tr>` : "";
    }
    if (block.type === "button") return `<tr><td style="padding:6px 28px 14px">${buttonHtml(block.label, block.url, origin, false)}</td></tr>`;
    if (block.type === "code") {
      return `<tr><td style="padding:6px 28px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;border:2px dashed #12356b;background:#f3f6fa"><tr><td align="center" style="padding:18px"><div style="color:#778094;font-size:10px;letter-spacing:1px;font-weight:800">DEIN CODE</div><div style="margin-top:6px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:26px;font-weight:800;letter-spacing:3px;color:#12356b">${escapeHtml(block.code)}</div>${block.text ? `<div style="margin-top:6px;color:#657084;font-size:13px">${escapeHtml(block.text)}</div>` : ""}</td></tr></table></td></tr>`;
    }
    const rows = block.items.map((item) => {
      const image = item.image ? absoluteUrl(item.image, origin) : "";
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e8ebef"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${image ? `<td width="84" style="vertical-align:top"><img src="${escapeHtml(image)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border-radius:14px;object-fit:cover"></td>` : ""}<td style="vertical-align:top"><strong style="font-size:15px;color:#17233d">${escapeHtml(item.name)}</strong>${item.description ? `<div style="margin-top:3px;color:#778094;font-size:13px;line-height:1.45">${escapeHtml(item.description)}</div>` : ""}</td>${item.price ? `<td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:10px;color:#b32031;font-size:16px;font-weight:800">${escapeHtml(item.price)}</td>` : ""}</tr></table></td></tr>`;
    }).join("");
    return `<tr><td style="padding:4px 28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>`;
  }).join("");

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(campaign.subject)}</title></head><body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17233d">${campaign.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(campaign.preheader)}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f6"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;overflow:hidden;border-radius:26px;background:#fff;box-shadow:0 18px 55px rgba(12,35,70,.12)">
      <tr><td style="padding:24px 28px;background:#102e5e;color:#fff"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td><img src="${escapeHtml(origin)}/images/logo.jpg" width="56" height="56" alt="La Rosa" style="display:block;border-radius:16px;border:2px solid #fff;object-fit:cover"></td><td style="padding-left:14px"><div style="font-family:Georgia,serif;font-size:23px;font-weight:700;letter-spacing:2px">LA ROSA</div><div style="margin-top:4px;color:#cbd8eb;font-size:10px;letter-spacing:1.5px">PIZZA · PASTA · INDISCH</div></td></tr></table></td></tr>
      ${hero}
      <tr><td style="padding:28px 28px 6px">${campaign.eyebrow ? `<div style="color:#b32031;font-size:11px;font-weight:800;letter-spacing:1px">${escapeHtml(campaign.eyebrow)}</div>` : ""}<h1 style="margin:8px 0 14px;font-size:28px;line-height:1.2">${escapeHtml(personalize(campaign.title))}</h1>${campaign.intro ? paragraphs(personalize(campaign.intro), p) : ""}</td></tr>
      ${blockHtml}
      ${campaign.button ? `<tr><td style="padding:10px 28px 30px">${buttonHtml(campaign.button.label, campaign.button.url, origin)}</td></tr>` : `<tr><td style="padding:0 0 18px"></td></tr>`}
    </table><p style="margin:16px auto 0;max-width:560px;color:#9299a5;font-size:11px;line-height:1.6;text-align:center">${campaign.footer ? `${escapeHtml(campaign.footer)}<br>` : ""}La Rosa GmbH · Bahnhofstr. 2 · Mörfelden-Walldorf<br>Du bekommst diese E-Mail, weil du den La-Rosa-Newsletter abonniert hast.${unsubscribeUrl ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:#657084">Newsletter abbestellen</a>` : ""}</p></td></tr></table></body></html>`;

  const textBlocks = (campaign.blocks || []).map((block) => {
    if (block.type === "text") return personalize(block.text);
    if (block.type === "button") return `${block.label}: ${absoluteUrl(block.url, origin)}`;
    if (block.type === "code") return `Dein Code: ${block.code}${block.text ? ` – ${block.text}` : ""}`;
    if (block.type === "products") return block.items.map((item) => `• ${item.name}${item.price ? ` – ${item.price}` : ""}${item.description ? `\n  ${item.description}` : ""}`).join("\n");
    return "";
  }).filter(Boolean);
  const text = [personalize(campaign.title), campaign.intro ? personalize(campaign.intro) : "", ...textBlocks, campaign.button ? `${campaign.button.label}: ${absoluteUrl(campaign.button.url, origin)}` : "", "—", "La Rosa GmbH · Bahnhofstr. 2 · Mörfelden-Walldorf", unsubscribeUrl ? `Newsletter abbestellen: ${unsubscribeUrl}` : ""].filter(Boolean).join("\n\n");

  return { subject: personalize(campaign.subject), html, text };
}
