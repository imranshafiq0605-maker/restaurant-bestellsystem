import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { FIRMA, type InvoiceData, type InvoiceLine } from "./invoice-data";

const A4: [number, number] = [595.28, 841.89];
const LEFT = 50;
const RIGHT = A4[0] - 50;
const TOP = A4[1] - 48;
const FOOTER_TOP = 74;
const LOGO_RATIO = 447 / 480;

const C = {
  navy: rgb(0.071, 0.208, 0.42),
  red: rgb(0.7, 0.125, 0.192),
  ink: rgb(0.09, 0.137, 0.239),
  muted: rgb(0.43, 0.46, 0.53),
  line: rgb(0.89, 0.91, 0.935),
  soft: rgb(0.957, 0.965, 0.976),
  green: rgb(0.086, 0.5, 0.24),
  greenSoft: rgb(0.906, 0.965, 0.925),
  white: rgb(1, 1, 1),
};

export type BewirtungsAngaben = {
  ort?: string;
  bewirtender?: string;
  personen?: string;
  anlass?: string;
  trinkgeld?: number;
};

const euro = (value: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value).replace(/ /g, " ");
const datum = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(date);
const rateLabel = (rate: InvoiceLine["taxRate"]) => (rate === "mix" ? "7/19 %" : `${rate} %`);

let logoBytes: Promise<Buffer | null> | null = null;
function loadLogo() {
  logoBytes ??= readFile(path.join(process.cwd(), "public/images/logo-beleg.png")).catch(() => null);
  return logoBytes;
}

class BelegPdf {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = TOP;
  private charset: Set<number>;

  private constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly logo: PDFImage | null,
    readonly title: string,
  ) {
    this.charset = new Set(font.getCharacterSet());
  }

  static async create(title: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setAuthor(FIRMA.name);
    doc.setCreator(FIRMA.name);
    doc.setLanguage("de-DE");
    const [font, bold, logoData] = await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
      loadLogo(),
    ]);
    const logo = logoData ? await doc.embedPng(logoData) : null;
    return new BelegPdf(doc, font, bold, logo, title);
  }

  /** Entfernt Zeichen, die die Standardschrift nicht darstellen kann (z. B. Emojis). */
  clean(text: string) {
    return [...String(text ?? "").replace(/[‘’]/g, "'").replace(/[“”„]/g, '"')]
      .filter((char) => char === " " || this.charset.has(char.codePointAt(0) || 0))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  width(text: string, size: number, bold = false) {
    return (bold ? this.bold : this.font).widthOfTextAtSize(this.clean(text), size);
  }

  text(text: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center" } = {}) {
    const size = opts.size ?? 9;
    const value = this.clean(text);
    const w = this.width(value, size, opts.bold);
    const dx = opts.align === "right" ? -w : opts.align === "center" ? -w / 2 : 0;
    this.page.drawText(value, { x: x + dx, y, size, font: opts.bold ? this.bold : this.font, color: opts.color ?? C.ink });
  }

  wrap(text: string, size: number, maxWidth: number, bold = false) {
    const lines: string[] = [];
    for (const paragraph of String(text ?? "").split(/\n+/)) {
      let current = "";
      for (const word of this.clean(paragraph).split(" ").filter(Boolean)) {
        const next = current ? `${current} ${word}` : word;
        if (this.width(next, size, bold) <= maxWidth || !current) {
          current = next;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  roundedRect(x: number, yTop: number, w: number, h: number, r: number, color: ReturnType<typeof rgb>, border?: ReturnType<typeof rgb>) {
    const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(d, { x, y: yTop, color, borderColor: border, borderWidth: border ? 0.8 : 0 });
  }

  hline(y: number, x1 = LEFT, x2 = RIGHT, color = C.line, thickness = 0.8) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
  }

  addPage(continuation: boolean) {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    if (continuation) {
      if (this.logo) this.page.drawImage(this.logo, { x: LEFT, y: TOP - 34 * LOGO_RATIO, width: 34, height: 34 * LOGO_RATIO });
      this.text(this.title, LEFT + 46, TOP - 14, { size: 11, bold: true });
      this.text("Fortsetzung", LEFT + 46, TOP - 28, { size: 8, color: C.muted });
      this.hline(TOP - 46);
      this.y = TOP - 70;
    } else {
      this.y = TOP;
    }
  }

  ensure(space: number, onBreak?: () => void) {
    if (this.y - space >= FOOTER_TOP + 14) return;
    this.addPage(true);
    onBreak?.();
  }

  firstPageHeader() {
    this.addPage(false);
    if (this.logo) this.page.drawImage(this.logo, { x: LEFT, y: TOP - 66 * LOGO_RATIO, width: 66, height: 66 * LOGO_RATIO });
    const lines = [FIRMA.strasse, FIRMA.ort, `Tel. ${FIRMA.telefon}`, FIRMA.email];
    this.text(FIRMA.name, RIGHT, TOP - 8, { size: 11, bold: true, align: "right" });
    this.text(FIRMA.zusatz, RIGHT, TOP - 21, { size: 8, color: C.red, align: "right" });
    lines.forEach((line, i) => this.text(line, RIGHT, TOP - 36 - i * 11, { size: 8, color: C.muted, align: "right" }));
    this.hline(TOP - 84);
    this.y = TOP - 106;
  }

  /** Empfänger links, Info-Box rechts. */
  addressAndMeta(recipientLabel: string, recipient: string[], meta: [string, string][]) {
    const top = this.y;
    this.text(`${FIRMA.name} · ${FIRMA.strasse} · ${FIRMA.ort}`, LEFT, top, { size: 6.5, color: C.muted });
    this.text(recipientLabel.toUpperCase(), LEFT, top - 22, { size: 7, bold: true, color: C.muted });
    recipient.forEach((line, i) =>
      this.text(line, LEFT, top - 38 - i * 13, { size: i === 0 ? 11 : 9.5, bold: i === 0, color: i > 2 ? C.muted : C.ink }),
    );

    const boxX = 330;
    const boxW = RIGHT - boxX;
    const rowH = 16;
    const boxH = meta.length * rowH + 16;
    this.roundedRect(boxX, top + 6, boxW, boxH, 10, C.soft);
    meta.forEach(([label, value], i) => {
      const y = top - 8 - i * rowH;
      this.text(label, boxX + 14, y, { size: 8, color: C.muted });
      this.text(value, RIGHT - 14, y, { size: 8.5, bold: true, align: "right" });
    });
    this.y = Math.min(top - 38 - recipient.length * 13, top + 6 - boxH) - 28;
  }

  heading(title: string, subtitle?: string) {
    this.text(title, LEFT, this.y, { size: 24, bold: true });
    this.y -= 17;
    if (subtitle) {
      for (const line of this.wrap(subtitle, 9.5, RIGHT - LEFT)) {
        this.text(line, LEFT, this.y, { size: 9.5, color: C.muted });
        this.y -= 13;
      }
    }
    this.y -= 8;
  }

  private tableHeader() {
    const y = this.y;
    this.roundedRect(LEFT, y, RIGHT - LEFT, 22, 6, C.soft);
    const ty = y - 14;
    const o = { size: 7, bold: true, color: C.muted } as const;
    this.text("POS", LEFT + 10, ty, o);
    this.text("ARTIKEL", LEFT + 36, ty, o);
    this.text("MENGE", 360, ty, { ...o, align: "right" });
    this.text("MWST", 405, ty, { ...o, align: "right" });
    this.text("EINZELPREIS", 470, ty, { ...o, align: "right" });
    this.text("GESAMT", RIGHT - 10, ty, { ...o, align: "right" });
    this.y -= 30;
  }

  table(lines: InvoiceLine[]) {
    this.ensure(60);
    this.tableHeader();
    for (const line of lines) {
      const nameLines = this.wrap(line.name, 9.5, 250, true);
      const detailLines = this.wrap(line.details.join(" · "), 7.5, 250);
      const h = nameLines.length * 12 + detailLines.length * 10 + 13;
      this.ensure(h, () => this.tableHeader());
      const top = this.y - 2;
      this.text(String(line.position), LEFT + 10, top, { size: 8.5, color: C.muted });
      nameLines.forEach((t, i) => this.text(t, LEFT + 36, top - i * 12, { size: 9.5, bold: true }));
      detailLines.forEach((t, i) => this.text(t, LEFT + 36, top - nameLines.length * 12 - i * 10 + 1, { size: 7.5, color: C.muted }));
      this.text(`${line.quantity}×`, 360, top, { size: 9, align: "right" });
      this.text(rateLabel(line.taxRate), 405, top, { size: 8.5, color: C.muted, align: "right" });
      this.text(euro(line.unitPrice), 470, top, { size: 9, align: "right" });
      this.text(euro(line.total), RIGHT - 10, top, { size: 9.5, bold: true, align: "right" });
      this.y -= h;
      this.hline(this.y + 7);
    }
    this.y -= 10;
  }

  /** Summen rechts, Umsatzsteuer links. */
  totals(data: InvoiceData, extra: { label: string; amount: number }[] = [], totalLabel = "Gesamtbetrag") {
    const rows: [string, string][] = [["Zwischensumme", euro(data.subtotal)]];
    data.adjustments.forEach((a) => rows.push([a.label, euro(a.amount)]));
    if (data.orderType === "Lieferung") rows.push(["Lieferung", data.deliveryFee > 0 ? euro(data.deliveryFee) : "kostenlos"]);
    const grand = data.total + extra.reduce((s, e) => s + e.amount, 0);
    const needed = Math.max(rows.length * 16 + 60 + extra.length * 16, data.taxes.length * 15 + 70);
    this.ensure(needed);

    const top = this.y;
    const x1 = 340;
    rows.forEach(([label, value], i) => {
      const y = top - i * 16;
      this.text(label, x1, y, { size: 9, color: C.muted });
      this.text(value, RIGHT - 10, y, { size: 9, align: "right", color: value.startsWith("-") ? C.red : C.ink });
    });
    let y = top - rows.length * 16;
    if (extra.length) {
      this.text("Summe laut Rechnung", x1, y, { size: 9, bold: true });
      this.text(euro(data.total), RIGHT - 10, y, { size: 9, bold: true, align: "right" });
      y -= 16;
      extra.forEach((e) => {
        this.text(e.label, x1, y, { size: 9, color: C.muted });
        this.text(euro(e.amount), RIGHT - 10, y, { size: 9, align: "right" });
        y -= 16;
      });
    }
    this.roundedRect(x1 - 10, y + 4, RIGHT - x1 + 10, 32, 8, C.navy);
    this.text(totalLabel, x1, y - 15, { size: 10, bold: true, color: C.white });
    this.text(euro(grand), RIGHT - 10, y - 16, { size: 14, bold: true, color: C.white, align: "right" });
    const totalsBottom = y - 28;

    this.text("ENTHALTENE UMSATZSTEUER", LEFT, top, { size: 7, bold: true, color: C.muted });
    this.text("Netto", 190, top - 16, { size: 7.5, color: C.muted, align: "right" });
    this.text("USt.", 240, top - 16, { size: 7.5, color: C.muted, align: "right" });
    this.text("Brutto", 300, top - 16, { size: 7.5, color: C.muted, align: "right" });
    data.taxes.forEach((t, i) => {
      const ty = top - 32 - i * 15;
      this.text(`${t.rate} % USt.`, LEFT, ty, { size: 8.5 });
      this.text(euro(t.net), 190, ty, { size: 8.5, align: "right" });
      this.text(euro(t.tax), 240, ty, { size: 8.5, align: "right" });
      this.text(euro(t.gross), 300, ty, { size: 8.5, align: "right" });
    });
    const taxBottom = top - 32 - data.taxes.length * 15;
    this.text("Speisen außer Haus 7 % · Getränke 19 %", LEFT, taxBottom - 4, { size: 7, color: C.muted });
    this.y = Math.min(totalsBottom, taxBottom - 4) - 22;
  }

  note(lines: string[], size = 8) {
    for (const raw of lines) {
      for (const line of this.wrap(raw, size, RIGHT - LEFT)) {
        this.ensure(size + 4);
        this.text(line, LEFT, this.y, { size, color: C.muted });
        this.y -= size + 4;
      }
      this.y -= 3;
    }
  }

  pill(text: string, fg = C.green, bg = C.greenSoft) {
    const w = this.width(text, 8.5, true) + 24;
    this.ensure(28);
    this.roundedRect(LEFT, this.y + 4, w, 22, 11, bg);
    this.text(text, LEFT + 12, this.y - 10, { size: 8.5, bold: true, color: fg });
    this.y -= 30;
  }

  async finish() {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      this.page = page;
      this.hline(FOOTER_TOP - 6);
      const cols: string[][] = [
        [FIRMA.name, FIRMA.strasse, FIRMA.ort],
        [`Tel. ${FIRMA.telefon}`, FIRMA.email],
        [`Geschäftsführer: ${FIRMA.geschaeftsfuehrer}`, FIRMA.register, `USt-IdNr. ${FIRMA.ustId}`],
      ];
      const xs = [LEFT, 180, 300];
      cols.forEach((col, ci) =>
        col.forEach((line, li) => this.text(line, xs[ci], FOOTER_TOP - 20 - li * 10, { size: 7, color: C.muted, bold: li === 0 && ci === 0 })),
      );
      this.text(`Seite ${i + 1} von ${total}`, RIGHT, FOOTER_TOP - 20, { size: 7, color: C.muted, align: "right" });
    });
    return this.doc.save();
  }
}

function recipientLines(data: InvoiceData) {
  return [data.customer.name, ...data.customer.lines, data.customer.email, data.customer.phone].filter(Boolean);
}

export async function createInvoicePdf(data: InvoiceData) {
  const pdf = await BelegPdf.create(`Rechnung ${data.invoiceNumber}`);
  pdf.firstPageHeader();
  pdf.addressAndMeta("Rechnung an", recipientLines(data), [
    ["Rechnungsnummer", data.invoiceNumber],
    ["Rechnungsdatum", datum(data.invoiceDate)],
    ["Leistungsdatum", datum(data.serviceDate)],
    ["Bestellnummer", data.orderNumber ? `#${data.orderNumber}` : "–"],
    ["Bestellart", data.orderType],
    ["Zahlungsart", data.paymentLabel],
  ]);
  pdf.heading("Rechnung", "Vielen Dank für Ihre Bestellung bei La Rosa. Wir berechnen Ihnen folgende Leistungen:");
  pdf.table(data.lines);
  pdf.totals(data);
  pdf.pill(`Bezahlt am ${datum(data.invoiceDate)} per ${data.paymentLabel}`);
  pdf.note([
    "Der Rechnungsbetrag wurde bereits online beglichen. Für geschäftliche Bewirtungen können Sie über den Link in Ihrer Bestellbestätigung einen Bewirtungsbeleg zu dieser Rechnung erstellen.",
  ]);
  return pdf.finish();
}

export async function createBewirtungsbelegPdf(data: InvoiceData, angaben: BewirtungsAngaben) {
  const pdf = await BelegPdf.create(`Bewirtungsbeleg zu ${data.invoiceNumber}`);
  const trinkgeld = Math.max(0, Number(angaben.trinkgeld) || 0);
  pdf.firstPageHeader();
  pdf.addressAndMeta("Rechnungsempfänger", recipientLines(data), [
    ["Zu Rechnung", data.invoiceNumber],
    ["Rechnungsdatum", datum(data.invoiceDate)],
    ["Bestellnummer", data.orderNumber ? `#${data.orderNumber}` : "–"],
    ["Bestellart", data.orderType],
    ["Rechnungsbetrag", euro(data.total)],
  ]);
  pdf.heading("Bewirtungsbeleg", "Angaben zum Nachweis der Höhe und der betrieblichen Veranlassung von Bewirtungsaufwendungen (§ 4 Abs. 5 Satz 1 Nr. 2 EStG)");

  const fields: { label: string; value: string; blankLines: number }[] = [
    { label: "Tag der Bewirtung", value: datum(data.serviceDate), blankLines: 1 },
    { label: "Ort der Bewirtung", value: angaben.ort || "", blankLines: 1 },
    { label: "Bewirtende Person / Unternehmen", value: angaben.bewirtender || "", blankLines: 1 },
    { label: "Bewirtete Personen", value: angaben.personen || "", blankLines: 3 },
    { label: "Anlass der Bewirtung", value: angaben.anlass || "", blankLines: 2 },
    {
      label: "Höhe der Aufwendungen",
      value: trinkgeld > 0
        ? `${euro(data.total)} laut Rechnung + ${euro(trinkgeld)} Trinkgeld = ${euro(data.total + trinkgeld)}`
        : `${euro(data.total)} laut Rechnung ${data.invoiceNumber}`,
      blankLines: 1,
    },
  ];
  const labelW = 150;
  const valueX = LEFT + labelW + 12;
  const valueW = RIGHT - valueX - 12;
  pdf.y -= 6;
  pdf.text("ANGABEN ZUR BEWIRTUNG", LEFT, pdf.y, { size: 7, bold: true, color: C.muted });
  pdf.y -= 12;
  pdf.hline(pdf.y);
  for (const field of fields) {
    const valueLines = field.value ? pdf.wrap(field.value, 9.5, valueW) : [];
    const h = (valueLines.length ? valueLines.length * 13 : field.blankLines * 20) + 15;
    pdf.ensure(h);
    const top = pdf.y - 16;
    pdf.text(field.label, LEFT + 2, top, { size: 8.5, bold: true, color: C.muted });
    if (valueLines.length) {
      valueLines.forEach((line, i) => pdf.text(line, valueX, top - i * 13, { size: 9.5 }));
    } else {
      for (let i = 0; i < field.blankLines; i++) pdf.hline(top - 4 - i * 20, valueX, RIGHT - 4, C.muted, 0.4);
    }
    pdf.y -= h;
    pdf.hline(pdf.y);
  }
  pdf.y -= 26;

  pdf.ensure(40);
  pdf.text("LEISTUNGEN LAUT RECHNUNG", LEFT, pdf.y, { size: 7, bold: true, color: C.muted });
  pdf.y -= 14;
  pdf.table(data.lines);
  pdf.totals(data, trinkgeld > 0 ? [{ label: "Trinkgeld", amount: trinkgeld }] : [], "Bewirtungsaufwand");

  pdf.ensure(90);
  pdf.y -= 26;
  const sigY = pdf.y;
  pdf.hline(sigY, LEFT, 250, C.ink, 0.6);
  pdf.hline(sigY, 300, RIGHT, C.ink, 0.6);
  pdf.text("Ort, Datum", LEFT, sigY - 12, { size: 8, color: C.muted });
  pdf.text("Unterschrift des Bewirtenden", 300, sigY - 12, { size: 8, color: C.muted });
  pdf.y = sigY - 40;
  pdf.note([
    `Bitte unterschreiben und zusammen mit der Rechnung ${data.invoiceNumber} aufbewahren. Die Leistungen wurden von ${FIRMA.name}, ${FIRMA.strasse}, ${FIRMA.ort} erbracht und maschinell abgerechnet.`,
  ], 7.5);
  return pdf.finish();
}
