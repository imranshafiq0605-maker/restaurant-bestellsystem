"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { CONSENT_KEY, readConsent, validCheckoutSession, type AdsConfig } from "../lib/ads-measurement";
import { hasAdsConsent, loadGoogleAds, revokeAdsConsent, sendPurchase } from "../lib/google-ads-client";
import styles from "./ads-measurement.module.css";

function WebsiteMeasurement() {
  const pathname = usePathname();
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [config, setConfig] = useState<AdsConfig | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const excluded = pathname.startsWith("/admin") || pathname.startsWith("/api/");

  useEffect(() => {
    if (Capacitor.isNativePlatform() || excluded) return;
    const controller = new AbortController();
    void fetch(`/api/ads/config?origin=${encodeURIComponent(location.origin)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (controller.signal.aborted || !result?.config || result.config.origin !== location.origin) return;
        let consent: boolean | null = null;
        try { consent = readConsent(localStorage.getItem(CONSENT_KEY)); } catch { /* Default denied. */ }
        setConfig(result.config);
        setAllowed(consent === true);
        setShowChoice(consent === null);
      }).catch(() => { /* Measurement must never break ordering. */ });
    const syncConsent = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) {
        if (!hasAdsConsent()) revokeAdsConsent();
        else { setAllowed(true); setShowChoice(false); }
      }
    };
    window.addEventListener("storage", syncConsent);
    return () => { controller.abort(); window.removeEventListener("storage", syncConsent); };
  }, [excluded]);

  useEffect(() => {
    if (!config || !allowed || excluded || Capacitor.isNativePlatform()) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let visitRecorded = false;
    const measure = async () => {
      try {
        if (!hasAdsConsent() || controller.signal.aborted) return;
        if (!visitRecorded) {
          const kind = ["gclid", "dclid", "gbraid", "wbraid"].find((key) => params.get(key));
          if (kind) await fetch("/api/ads/visit", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, clickId: params.get(kind), consent: true }), signal: controller.signal,
          }).catch(() => undefined); // Internal reporting must not block Google purchase measurement.
          visitRecorded = true;
        }
        if (!await loadGoogleAds(config) || controller.signal.aborted || !hasAdsConsent()) return;
        if (!["/order-status", "/mobile"].includes(pathname) || !validCheckoutSession(sessionId)) return;
        const response = await fetch("/api/ads/purchase", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }), cache: "no-store", signal: controller.signal,
        });
        if ((response.status === 202 || response.status >= 500) && ++attempts < 30) {
          timeout = setTimeout(() => { void measure(); }, 2000);
        } else if (response.status === 200) {
          const purchase = await response.json();
          if (!controller.signal.aborted) sendPurchase(config, purchase);
        }
      } catch { /* No conversion on failed verification; checkout continues normally. */ }
    };
    void measure();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [allowed, config, excluded, pathname, sessionId, params]);

  async function choose(value: boolean) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ allowed: value, savedAt: Date.now() })); } catch {
      // Without a durable choice, keep advertising measurement disabled.
      setAllowed(false); setShowChoice(false); return;
    }
    setAllowed(value);
    setShowChoice(false);
    if (!value) {
      await fetch("/api/ads/visit", { method: "DELETE" }).catch(() => undefined);
      if (allowed) revokeAdsConsent();
    }
  }

  if (!config || excluded) return null;
  return showChoice ? (
    <section className={styles.banner} role="region" aria-labelledby="ads-choice-title">
      <h2 id="ads-choice-title">Dürfen wir die Wirkung unserer Werbung messen?</h2>
      <p>Mit deiner Einwilligung verwenden wir Google Ads und Werbe-Cookies, um zu erkennen,
        ob eine Anzeige zu einer Bestellung geführt hat. Dabei werden technische Daten sowie
        Bestellnummer, Bestellwert und Währung an Google übermittelt. Wir ordnen deine Bestellungen
        außerdem bis zu 30 Tage nach einem Anzeigenbesuch dieser Werbung zu. Du kannst auch ohne
        diese Messung bestellen und deine Auswahl jederzeit unter „Datenschutzeinstellungen“ ändern.</p>
      <a href="/datenschutz">Mehr zum Datenschutz</a>
      <div className={styles.actions}>
        <button type="button" onClick={() => choose(false)}>Ohne Werbemessung</button>
        <button type="button" onClick={() => choose(true)}>Werbemessung erlauben</button>
      </div>
    </section>
  ) : <button className={styles.settings} type="button" onClick={() => setShowChoice(true)}>Datenschutzeinstellungen</button>;
}

export default function AdsMeasurement() {
  return <Suspense fallback={null}><WebsiteMeasurement /></Suspense>;
}
