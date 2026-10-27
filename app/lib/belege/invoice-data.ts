import { randomBytes, timingSafeEqual } from "node:crypto";

// Speisen außer Haus (Abholung/Lieferung) 7 %, Getränke 19 %.
export const STEUERSATZ_SPEISEN = 7;
export const STEUERSATZ_GETRAENKE = 19;
// Anteil des "1L Getränk nach Wahl" in einem Angebot, bewertet mit dem Einzelpreis Softdrinks 1L.
const ANGEBOT_GETRAENK_ANTEIL = 4.5;

export const FIRMA = {
  name: "La Rosa GmbH",
  zusatz: "Pizzeria & Indische Küche",
  strasse: "Bahnhofstraße 2",
  ort: "64546 Mörfelden-Walldorf",
  telefon: "06105 297883",
  email: "larosa1993@outlook.de",
  geschaeftsfuehrer: "Muhammad Shafiq",
  register: "Amtsgericht Darmstadt, HRB 105429",
  ustId: "DE363846903",
};

export type BelegOrderItem = {
  name?: string;
  number?: string | number;
  price?: number;
  quantity?: number;
  category?: string;
  cuisine?: string;
  variantName?: string | null;
  selectedOptions?: string[];
};

export type BelegOrder = {
  orderNumber?: number;
  rechnungsnummer?: string;
  rechnungsdatum?: unknown;
  belegToken?: string;
  createdAt?: unknown;
  datum?: string;
  uhrzeit?: string;
  bestellart?: string;
  paymentMethod?: string;
  kunde?: {
    name?: string;
    telefon?: string;
    email?: string;
    adresse?: string;
    lieferadresse?: { strasse?: string; hausnummer?: string; plz?: string; stadt?: string };
  };
  artikel?: BelegOrderItem[];
  gesamtpreisProdukte?: number;
  rabattProzent?: number;
  rabattBetrag?: number;
  rosenEingeloest?: number;
  rosenRabattBetrag?: number;
  liefergebuehr?: number;
  gesamtpreis?: number;
  zahlbetrag?: number;
};

export type InvoiceLine = {
  position: number;
  quantity: number;
  name: string;
  details: string[];
  unitPrice: number;
  total: number;
  taxRate: number | "mix";
};

export type TaxRow = { rate: number; net: number; tax: number; gross: number };

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: Date;
  serviceDate: Date;
  orderNumber: number | null;
  orderType: "Lieferung" | "Abholung";
  paymentLabel: string;
  customer: { name: string; lines: string[]; email: string; phone: string };
  lines: InvoiceLine[];
  subtotal: number;
  adjustments: { label: string; amount: number }[];
  deliveryFee: number;
  total: number;
  taxes: TaxRow[];
};

const cents = (value: number) => Math.round(value * 100) / 100;

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function createBelegToken() {
  return randomBytes(18).toString("base64url");
}

export function isValidBelegToken(order: BelegOrder | undefined, token: string | null | undefined) {
  const expected = order?.belegToken;
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function invoiceNumberFor(orderNumber: number) {
  return `RE-${orderNumber}`;
}

function isDrink(item: BelegOrderItem) {
  return item.category === "Getränke" || item.cuisine === "Getränke";
}

function isOfferWithDrink(item: BelegOrderItem) {
  const text = [item.name, ...(item.selectedOptions || [])].join(" ");
  return item.category === "Angebote" && /getränk/i.test(text);
}

function paymentLabel(method?: string) {
  switch (method) {
    case "paypal":
      return "PayPal";
    case "klarna":
      return "Klarna";
    case "card":
      return "Karte";
    default:
      return "Online-Zahlung";
  }
}

function serviceDateFor(order: BelegOrder, fallback: Date) {
  if (order.datum && /^\d{4}-\d{2}-\d{2}$/.test(order.datum)) {
    return new Date(`${order.datum}T12:00:00`);
  }
  return fallback;
}

export function buildInvoiceData(order: BelegOrder): InvoiceData {
  const invoiceDate = toDate(order.rechnungsdatum) || toDate(order.createdAt) || new Date();
  const orderNumber = typeof order.orderNumber === "number" ? order.orderNumber : null;
  const invoiceNumber = order.rechnungsnummer || (orderNumber ? invoiceNumberFor(orderNumber) : "Entwurf");
  const lieferung = String(order.bestellart).toLowerCase() === "lieferung";

  const grossByRate = new Map<number, number>();
  const addGross = (rate: number, amount: number) => grossByRate.set(rate, (grossByRate.get(rate) || 0) + amount);

  const lines: InvoiceLine[] = (order.artikel || []).map((item, index) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = cents(Number(item.price) || 0);
    const total = cents(unitPrice * quantity);
    let taxRate: InvoiceLine["taxRate"] = isDrink(item) ? STEUERSATZ_GETRAENKE : STEUERSATZ_SPEISEN;

    if (isOfferWithDrink(item)) {
      const drinkPart = Math.min(total, ANGEBOT_GETRAENK_ANTEIL * quantity);
      addGross(STEUERSATZ_GETRAENKE, drinkPart);
      addGross(STEUERSATZ_SPEISEN, total - drinkPart);
      taxRate = "mix";
    } else {
      addGross(taxRate, total);
    }

    const number = item.number ? `Nr. ${item.number}` : "";
    const details = [item.variantName || "", ...(item.selectedOptions || [])]
      .map((detail) => String(detail).trim())
      .filter(Boolean);

    return {
      position: index + 1,
      quantity,
      name: [number, item.name || "Artikel"].filter(Boolean).join(" · "),
      details,
      unitPrice,
      total,
      taxRate,
    };
  });

  const subtotal = cents(lines.reduce((sum, line) => sum + line.total, 0));
  const discount = cents(Number(order.rabattBetrag) || 0);
  const roseDiscount = cents(Number(order.rosenRabattBetrag) || 0);
  const deliveryFee = cents(Number(order.liefergebuehr) || 0);
  const total = cents(Number(order.zahlbetrag ?? order.gesamtpreis) || Math.max(subtotal - discount - roseDiscount + deliveryFee, 0));

  const adjustments: InvoiceData["adjustments"] = [];
  if (discount > 0) adjustments.push({ label: `${Number(order.rabattProzent) || 10} % Online-Rabatt`, amount: -discount });
  if (roseDiscount > 0) adjustments.push({ label: `Rosen eingelöst (${Number(order.rosenEingeloest) || 0})`, amount: -roseDiscount });

  // Rabatte mindern die Bemessungsgrundlage anteilig je Steuersatz.
  const rates = [...grossByRate.keys()].sort((a, b) => a - b);
  const factor = subtotal > 0 ? total / subtotal : 0;
  let remaining = total;
  const taxes: TaxRow[] = rates.map((rate, index) => {
    const gross = index === rates.length - 1 ? cents(remaining) : cents((grossByRate.get(rate) || 0) * factor);
    remaining -= gross;
    const net = cents(gross / (1 + rate / 100));
    return { rate, net, tax: cents(gross - net), gross };
  });

  const kunde = order.kunde || {};
  const adresse = kunde.lieferadresse;
  const customerLines = lieferung && adresse
    ? [`${adresse.strasse || ""} ${adresse.hausnummer || ""}`.trim(), `${adresse.plz || ""} ${adresse.stadt || ""}`.trim()].filter(Boolean)
    : lieferung && kunde.adresse
      ? [kunde.adresse]
      : [];

  return {
    invoiceNumber,
    invoiceDate,
    serviceDate: serviceDateFor(order, invoiceDate),
    orderNumber,
    orderType: lieferung ? "Lieferung" : "Abholung",
    paymentLabel: paymentLabel(order.paymentMethod),
    customer: {
      name: kunde.name?.trim() || "Kunde",
      lines: customerLines,
      email: kunde.email?.trim() || "",
      phone: kunde.telefon?.trim() || "",
    },
    lines,
    subtotal,
    adjustments,
    deliveryFee,
    total,
    taxes,
  };
}
