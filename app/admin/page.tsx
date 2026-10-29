"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import type { OpeningSettings } from "../lib/site-settings";
import styles from "./admin.module.css";
import { AdminAuthError, adminFetch, Icon, type AdminCustomer, type CustomerStats, type IconName } from "./ui";
import Overview from "./overview";
import HoursEditor from "./hours";
import MenuEditor from "./menu-editor";
import Customers from "./customers";
import Newsletter from "./newsletter";

type Section = "uebersicht" | "zeiten" | "speisekarte" | "kunden" | "newsletter";

const sections: Array<{ id: Section; label: string; short: string; icon: IconName }> = [
  { id: "uebersicht", label: "Übersicht", short: "Übersicht", icon: "home" },
  { id: "zeiten", label: "Öffnungszeiten", short: "Zeiten", icon: "clock" },
  { id: "speisekarte", label: "Speisekarte", short: "Karte", icon: "menu" },
  { id: "kunden", label: "Kunden", short: "Kunden", icon: "users" },
  { id: "newsletter", label: "Newsletter", short: "Newsletter", icon: "mail" },
];

export type CustomerData = { customers: AdminCustomer[]; stats: CustomerStats };

export default function AdminPage() {
  const [session, setSession] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    adminFetch<{ email: string }>("/api/admin/session")
      .then((data) => setSession(data.email))
      .catch(() => setSession(null));
  }, []);

  if (session === undefined) return <main className={styles.page}><div className={styles.loadingBox}>Wird geladen …</div></main>;
  if (!session) return <Login onDone={setSession} />;
  return <Dashboard email={session} onSignedOut={() => setSession(null)} />;
}

function Brand() {
  return (
    <div className={styles.sideBrand}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo.jpg" alt="" />
      <div>
        <strong>La Rosa</strong>
        <small>Admin-Panel</small>
      </div>
    </div>
  );
}

function Login({ onDone }: { onDone: (email: string) => void }) {
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState({ id: "", masked: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await adminFetch<{ challengeId: string; maskedEmail: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setChallenge({ id: data.challengeId, masked: data.maskedEmail });
      setPassword("");
      setCode("");
      setStep("code");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await adminFetch<{ email: string }>("/api/admin/login/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge.id, code: value }),
      });
      onDone(data.email);
    } catch (codeError) {
      setError(codeError instanceof Error ? codeError.message : "Der Code stimmt nicht.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError("Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice("Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt.");
    } catch {
      setNotice("Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt.");
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.loginWrap}>
        <section className={styles.loginCard}>
          <div className={styles.loginBrand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.jpg" alt="" />
            <div><strong>La Rosa</strong><small>Admin-Panel</small></div>
          </div>

          {step === "password" ? (
            <>
              <h1>Anmelden</h1>
              <p>Mit deiner Admin-E-Mail-Adresse und deinem Passwort. Danach bekommst du einen Code per E-Mail.</p>
              <form onSubmit={submitPassword}>
                <label className={styles.field}>E-Mail-Adresse<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label className={styles.field}>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <button className={`${styles.primary} ${styles.block}`} disabled={busy}>{busy ? "Bitte warten …" : "Weiter"}</button>
              </form>
              <button type="button" className={styles.linkButton} onClick={resetPassword}>Passwort vergessen?</button>
            </>
          ) : (
            <>
              <h1>Code eingeben</h1>
              <p>Wir haben dir einen 6-stelligen Code an <strong>{challenge.masked}</strong> geschickt. Er ist 10 Minuten gültig.</p>
              <form onSubmit={(event) => { event.preventDefault(); void submitCode(); }}>
                <input
                  className={styles.codeInput}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  aria-label="6-stelliger Code"
                  value={code}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(next);
                    if (next.length === 6) void submitCode(next);
                  }}
                />
                <button className={`${styles.primary} ${styles.block}`} disabled={busy || code.length !== 6}>{busy ? "Wird geprüft …" : "Anmelden"}</button>
              </form>
              <button type="button" className={styles.linkButton} onClick={() => { setStep("password"); setError(""); }}>Zurück / neuen Code anfordern</button>
            </>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <p className={styles.hint}>Bei jeder Anmeldung ist ein neuer Code nötig. Die Sitzung endet nach 12 Stunden.</p>
        </section>
      </div>
    </main>
  );
}

function Dashboard({ email, onSignedOut }: { email: string; onSignedOut: () => void }) {
  const [section, setSection] = useState<Section>(() => {
    if (typeof window === "undefined") return "uebersicht";
    const hash = window.location.hash.slice(1) as Section;
    return sections.some((item) => item.id === hash) ? hash : "uebersicht";
  });
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [customerError, setCustomerError] = useState("");
  const [opening, setOpening] = useState<OpeningSettings | null>(null);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof AdminAuthError) onSignedOut();
    return error instanceof Error ? error.message : "Das hat gerade nicht geklappt.";
  }, [onSignedOut]);

  const loadCustomers = useCallback(async () => {
    try {
      setCustomerData(await adminFetch<CustomerData>("/api/admin/customers"));
      setCustomerError("");
    } catch (error) {
      setCustomerError(handleError(error));
    }
  }, [handleError]);

  useEffect(() => {
    let cancelled = false;
    adminFetch<CustomerData>("/api/admin/customers")
      .then((data) => { if (!cancelled) setCustomerData(data); })
      .catch((error) => { if (!cancelled) setCustomerError(handleError(error)); });
    adminFetch<{ opening: OpeningSettings }>("/api/admin/settings")
      .then((data) => { if (!cancelled) setOpening(data.opening); })
      .catch(handleError);
    return () => {
      cancelled = true;
    };
  }, [handleError]);

  function open(next: Section) {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
    window.scrollTo({ top: 0 });
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    onSignedOut();
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <Brand />
          <nav className={styles.nav} aria-label="Admin-Bereiche">
            {sections.map((item) => (
              <button key={item.id} type="button" className={section === item.id ? styles.navActive : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => open(item.id)}>
                <Icon name={item.icon} />{item.label}
              </button>
            ))}
          </nav>
          <div className={styles.sideFoot}>
            <small>Angemeldet als {email}</small>
            <button type="button" className={`${styles.ghost} ${styles.block}`} onClick={logout}><Icon name="logout" />Abmelden</button>
          </div>
        </aside>

        <div>
          <div className={styles.mobileBar}>
            <div className={styles.mobileTop}>
              <Brand />
              <button type="button" className={styles.iconButton} onClick={logout} aria-label="Abmelden" title="Abmelden"><Icon name="logout" /></button>
            </div>
          </div>

          <div className={styles.main}>
            {section === "uebersicht" && <Overview data={customerData} error={customerError} opening={opening} onOpen={open} onReload={loadCustomers} onOpeningChange={setOpening} onError={handleError} />}
            {section === "zeiten" && <HoursEditor opening={opening} onSaved={setOpening} onError={handleError} />}
            {section === "speisekarte" && <MenuEditor onError={handleError} />}
            {section === "kunden" && <Customers data={customerData} error={customerError} onReload={loadCustomers} />}
            {section === "newsletter" && <Newsletter adminEmail={email} subscriberCount={customerData?.stats.newsletter ?? null} onError={handleError} />}
          </div>
        </div>
      </div>

      {/* Auf dem Handy: Navigation unten wie in einer App */}
      <nav className={styles.tabBar} aria-label="Admin-Bereiche">
        {sections.map((item) => (
          <button key={item.id} type="button" className={section === item.id ? styles.tabActive : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => open(item.id)}>
            <Icon name={item.icon} />
            <span>{item.short}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
