"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NEWSLETTER_FORMAT_HELP, NEWSLETTER_TEMPLATES, parseCampaign, renderNewsletter } from "../lib/newsletter-template";
import styles from "./admin.module.css";
import { adminFetch, formatDate, Icon, number, PageHead } from "./ui";

type Props = { adminEmail: string; subscriberCount: number | null; onError: (error: unknown) => string };
type HistoryEntry = { id: string; subject: string; recipients: number; sent: number; failed: number; sentAt: string; sentBy: string };

const DRAFT_KEY = "larosa_admin_newsletter_draft";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export default function Newsletter({ adminEmail, subscriberCount, onError }: Props) {
  const [json, setJson] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) || pretty(NEWSLETTER_TEMPLATES[0].campaign);
    } catch {
      return pretty(NEWSLETTER_TEMPLATES[0].campaign);
    }
  });
  const [testTo, setTestTo] = useState(adminEmail);
  const [subscribers, setSubscribers] = useState<number | null>(subscriberCount);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [origin] = useState(() => (typeof window === "undefined" ? "https://pizzerialarosagmbh.de" : window.location.origin));

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ subscribers: number; history: HistoryEntry[] }>("/api/admin/newsletter");
      setSubscribers(data.subscribers);
      setHistory(data.history);
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    }
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ subscribers: number; history: HistoryEntry[] }>("/api/admin/newsletter")
      .then((data) => {
        if (cancelled) return;
        setSubscribers(data.subscribers);
        setHistory(data.history);
      })
      .catch((error) => { if (!cancelled) setMessage({ ok: false, text: onError(error) }); });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, json);
    } catch {
      // Entwurf wird dann eben nicht gemerkt.
    }
  }, [json]);

  const parsed = useMemo(() => {
    try {
      const campaign = parseCampaign(json);
      return { campaign, error: "", preview: renderNewsletter(campaign, { origin, name: "Max Mustermann", unsubscribeUrl: "#" }) };
    } catch (error) {
      return { campaign: null, error: error instanceof Error ? error.message : "Ungültiges JSON", preview: null };
    }
  }, [json, origin]);

  function format() {
    try {
      setJson(pretty(JSON.parse(json)));
    } catch {
      setMessage({ ok: false, text: "Das JSON kann nicht formatiert werden, weil es Fehler enthält." });
    }
  }

  async function sendTest() {
    if (!parsed.campaign) return;
    setBusy("test");
    setMessage(null);
    try {
      const data = await adminFetch<{ to: string }>("/api/admin/newsletter", { method: "POST", body: JSON.stringify({ action: "test", campaign: parsed.campaign, to: testTo, testName: "Max" }) });
      setMessage({ ok: true, text: `Test-Mail an ${data.to} gesendet. Schau in dein Postfach (auch im Spam-Ordner).` });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy("");
    }
  }

  async function sendAll() {
    if (!parsed.campaign || subscribers === null) return;
    setConfirmOpen(false);
    setBusy("send");
    setMessage(null);
    try {
      const data = await adminFetch<{ sent: number; failed: number }>("/api/admin/newsletter", { method: "POST", body: JSON.stringify({ action: "send", campaign: parsed.campaign, expectedCount: subscribers }) });
      setMessage({ ok: true, text: `Newsletter an ${number(data.sent)} Abonnenten gesendet${data.failed ? `, ${data.failed} fehlgeschlagen` : ""}.` });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead title="Newsletter" text={subscribers === null ? "Abonnenten werden geladen …" : `${number(subscribers)} ${subscribers === 1 ? "Abonnent" : "Abonnenten"} · Kunden melden sich bei der Registrierung oder im Konto an`} />

      {message && <p className={message.ok ? styles.notice : styles.error} style={{ marginBottom: 16 }}>{message.text}</p>}

      <div className={styles.nlLayout}>
        <div className={styles.stack}>
          <section className={styles.card}>
            <div className={styles.cardHead}><div><h2>1. Vorlage wählen</h2><p>Oder eigenes JSON einfügen – die Vorschau aktualisiert sich sofort.</p></div></div>
            <div className={styles.templates}>
              {NEWSLETTER_TEMPLATES.map((template) => (
                <button key={template.id} type="button" onClick={() => setJson(pretty(template.campaign))}>
                  <strong>{template.label}</strong><small>{template.description}</small>
                </button>
              ))}
            </div>
            <div className={styles.cardHead} style={{ marginBottom: 8 }}>
              <h2>2. Inhalt (JSON)</h2>
              <button type="button" className={styles.ghost} onClick={format}>Formatieren</button>
            </div>
            <textarea className={styles.jsonArea} spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} aria-label="Newsletter als JSON" />
            {parsed.error ? <p className={styles.error}>{parsed.error}</p> : <p className={styles.jsonOk}>✓ JSON ist gültig</p>}
            <details className={styles.details} style={{ marginTop: 12 }}>
              <summary>Welche Felder gibt es?</summary>
              <textarea className={styles.code} readOnly value={NEWSLETTER_FORMAT_HELP} style={{ minHeight: 360 }} />
              <p className={styles.hint}>Bilder: eigene Links (https://…) oder Bilder der Website wie /images/pizza-margherita.jpg, /images/cheeseburger.jpg, /images/pommes.jpg, /images/cuisine-indisch.jpg, /images/cuisine-italienisch.jpg, /images/hero-main.jpg.</p>
            </details>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}><div><h2>3. Test-Mail senden</h2><p>Erst an dich selbst schicken und auf dem Handy ansehen.</p></div></div>
            <div className={styles.sendBox}>
              <input className={styles.input} type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} aria-label="Test-Empfänger" />
              <button type="button" className={styles.secondary} disabled={!parsed.campaign || busy !== ""} onClick={sendTest}><Icon name="send" />{busy === "test" ? "Wird gesendet …" : "Test senden"}</button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}><div><h2>4. An alle senden</h2><p>Geht an alle Kunden, die den Newsletter abonniert haben. Jede Mail enthält einen Abmelde-Link.</p></div></div>
            <button type="button" className={`${styles.primary} ${styles.block}`} disabled={!parsed.campaign || !subscribers || busy !== ""} onClick={() => setConfirmOpen(true)}>
              <Icon name="mail" />{busy === "send" ? "Wird gesendet …" : `An ${subscribers ?? "…"} Abonnenten senden`}
            </button>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}><h2>Bisher gesendet</h2></div>
            {history.length === 0 ? <p className={styles.empty}>Noch kein Newsletter verschickt.</p> : (
              <ul className={styles.history}>
                {history.map((entry) => (
                  <li key={entry.id}><strong>{entry.subject}</strong><span>{formatDate(entry.sentAt, true)} · {entry.sent}/{entry.recipients}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={styles.card} style={{ position: "sticky", top: 16 }}>
          <div className={styles.cardHead}><h2>Vorschau</h2><span className={styles.badge}>so sieht die Mail aus</span></div>
          {parsed.preview ? (
            <>
              <div className={styles.previewMeta}><strong>{parsed.preview.subject}</strong><span>{parsed.campaign?.preheader || "Kein Vorschautext"}</span></div>
              <iframe className={styles.previewFrame} title="Newsletter-Vorschau" sandbox="" srcDoc={parsed.preview.html} />
            </>
          ) : <p className={styles.empty}>Sobald das JSON gültig ist, erscheint hier die Vorschau.</p>}
        </section>
      </div>

      {confirmOpen && parsed.campaign && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="send-title">
          <div className={styles.dialog} style={{ maxWidth: 440 }}>
            <h2 id="send-title">Newsletter jetzt senden?</h2>
            <p>„{parsed.campaign.subject}“ geht sofort an <strong>{number(subscribers ?? 0)} Abonnenten</strong>. Das lässt sich nicht rückgängig machen.</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondary} onClick={() => setConfirmOpen(false)}>Abbrechen</button>
              <button type="button" className={styles.primary} onClick={sendAll}>Ja, jetzt senden</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
