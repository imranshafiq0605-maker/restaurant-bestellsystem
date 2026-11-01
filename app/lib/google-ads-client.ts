import { CONSENT_KEY, measurementLocation, readConsent, type AdsConfig, type PurchaseConversion } from "./ads-measurement";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loading: Promise<boolean> | null = null;
let configured = false;
const sent = new Set<string>();
const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };

export function hasAdsConsent() {
  try { return readConsent(localStorage.getItem(CONSENT_KEY)) === true; } catch { return false; }
}

export function revokeAdsConsent() {
  window.gtag?.("consent", "update", denied);
  // Remove first-party Google attribution cookies on this host and parent domains.
  const parts = location.hostname.split(".");
  const domains = ["", ...parts.map((_, index) => `; domain=.${parts.slice(index).join(".")}`)];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!name.startsWith("_gcl_")) continue;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax; Secure`;
  }
  // A reload removes the already-loaded tag and cancels any pending tracking work.
  window.location.reload();
}

export async function loadGoogleAds(config: AdsConfig): Promise<boolean> {
  if (!hasAdsConsent() || location.origin !== config.origin) return false;
  if (loading) return loading;
  window.dataLayer = window.dataLayer || [];
  // Google gtag expects an Arguments object in the data layer (official queue snippet).
  // eslint-disable-next-line prefer-rest-params
  window.gtag = window.gtag || function () { window.dataLayer!.push(arguments); };
  window.gtag("consent", "default", denied);
  window.gtag("set", "ads_data_redaction", true);
  // Avoid referrer/query data leaking through the tag request or later events.
  window.gtag("set", { page_location: measurementLocation(location.href), page_referrer: "" });
  loading = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.id}`;
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      if (!hasAdsConsent()) { resolve(false); return; }
      window.gtag!("consent", "update", { ...denied, ad_storage: "granted", ad_user_data: "granted" });
      if (!configured) {
        window.gtag!("js", new Date());
        window.gtag!("config", config.id, {
          send_page_view: false,
          allow_ad_personalization_signals: false,
          allow_enhanced_conversions: false,
          page_location: measurementLocation(location.href),
          page_referrer: "",
        });
        configured = true;
      }
      resolve(true);
    };
    script.onerror = () => { script.remove(); loading = null; resolve(false); };
    document.head.appendChild(script);
  });
  return loading;
}

export function sendPurchase(config: AdsConfig, purchase: PurchaseConversion) {
  if (!hasAdsConsent() || !configured || !window.gtag || location.origin !== config.origin ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(purchase.transaction_id) || purchase.currency !== "EUR" ||
      !Number.isFinite(purchase.value) || purchase.value <= 0) return;
  const key = `larosa_ads_sent:${config.id}/${config.label}:${purchase.transaction_id}`;
  if (sent.has(key)) return;
  try { if (localStorage.getItem(key)) return; } catch { /* Google also deduplicates by transaction_id. */ }
  sent.add(key);
  window.gtag("event", "conversion", {
    send_to: `${config.id}/${config.label}`,
    transaction_id: purchase.transaction_id,
    value: purchase.value,
    currency: purchase.currency,
    page_location: measurementLocation(location.href),
    page_referrer: "",
    event_callback: () => {
      if (!hasAdsConsent()) return;
      try { localStorage.setItem(key, String(Date.now())); } catch { /* Storage may be blocked. */ }
    },
  });
}
