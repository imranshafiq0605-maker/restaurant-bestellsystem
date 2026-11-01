// Shared validation only: this module must not contain credentials or customer data.
export type AdsConfig = { id: string; label: string; origin: string };
export type PurchaseConversion = { transaction_id: string; value: number; currency: "EUR" };
export const CONSENT_KEY = "larosa_ads_consent_v1";
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;

export function parseAdsConfig(id?: string, label?: string, origin?: string): AdsConfig | null {
  if (!id || !/^AW-\d+$/.test(id) || !label || !/^[\w-]+$/.test(label) || !origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
    return { id, label, origin };
  } catch { return null; }
}

export function readConsent(raw: string | null, now = Date.now()): boolean | null {
  try {
    const consent = JSON.parse(raw || "null");
    if (typeof consent?.allowed !== "boolean" || typeof consent?.savedAt !== "number" ||
        consent.savedAt > now || now - consent.savedAt >= CONSENT_MAX_AGE) return null;
    return consent.allowed;
  } catch { return null; }
}

export function validCheckoutSession(value: unknown): value is string {
  return typeof value === "string" && /^cs_live_[a-zA-Z0-9]{16,240}$/.test(value);
}

// Retain only attribution parameters. Never send order IDs, Stripe session IDs,
// receipt tokens, email addresses or arbitrary query strings to Google.
export function measurementLocation(location: string): string {
  const url = new URL(location);
  const clean = new URL(url.pathname, url.origin);
  for (const key of ["gclid", "dclid", "gbraid", "wbraid"]) {
    const value = url.searchParams.get(key);
    if (value && /^[a-zA-Z0-9_.~-]{1,512}$/.test(value)) clean.searchParams.set(key, value);
  }
  return clean.href;
}

type PaymentSession = {
  id: string; livemode: boolean; mode: string | null; status: string | null;
  payment_status: string; amount_total: number | null; currency: string | null;
  metadata: { [key: string]: string } | null;
};
type CompletedOrder = { stripeSessionId?: unknown; bezahlt?: unknown; status?: unknown };

export function verifiedPurchase(session: PaymentSession, order: CompletedOrder | null): PurchaseConversion | null {
  const orderId = session.metadata?.pendingOrderId;
  if (!validCheckoutSession(session.id) || !session.livemode || session.mode !== "payment" ||
      session.status !== "complete" || session.payment_status !== "paid" || session.currency !== "eur" ||
      !Number.isSafeInteger(session.amount_total) || (session.amount_total ?? 0) <= 0 ||
      !orderId || !/^[a-zA-Z0-9_-]{1,128}$/.test(orderId) ||
      order?.bezahlt !== true || order.stripeSessionId !== session.id ||
      String(order.status || "").toLowerCase().includes("storn")) return null;
  return { transaction_id: orderId, value: session.amount_total! / 100, currency: "EUR" };
}
