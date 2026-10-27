"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { sendEmailCode, verifyEmailCode } from "../lib/account-client";
import styles from "./email-code-step.module.css";

// Code-Eingabe nach der Registrierung mit E-Mail und Passwort. Wird auf der Website (/konto) und in der App (/mobile) genutzt.
// Beim ersten Anzeigen wird automatisch ein Code verschickt, sofern noch keiner unterwegs ist.
export default function EmailCodeStep({
  user,
  onVerified,
  onCancel,
  className = "",
}: {
  user: User;
  onVerified: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSent = useRef(false);

  const requestCode = useCallback(async (auto: boolean) => {
    setError("");
    try {
      const result = await sendEmailCode(user, auto);
      if (result.verified) {
        await user.reload();
        onVerified();
        return;
      }
      setRetryAfter(result.retryAfter);
      if (result.sent && !auto) setMessage("Wir haben dir einen neuen Code geschickt.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Der Code konnte nicht gesendet werden.");
    }
  }, [user, onVerified]);

  useEffect(() => {
    if (autoSent.current) return;
    autoSent.current = true;
    void requestCode(true);
  }, [requestCode]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  async function submit(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await verifyEmailCode(user, value);
      onVerified();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Der Code konnte nicht geprüft werden.");
      setCode("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  function changeCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submit(digits);
  }

  return (
    <section className={`${styles.root} ${className}`}>
      <div className={styles.icon}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
      </div>
      <h2 className={styles.title}>E-Mail bestätigen</h2>
      <p className={styles.text}>Wir haben einen 6-stelligen Code an <strong>{user.email}</strong> geschickt. Gib ihn hier ein, um dein Konto zu aktivieren.</p>

      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className={styles.field} onClick={() => inputRef.current?.focus()}>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={`${styles.box} ${focused && index === Math.min(code.length, 5) ? styles.boxActive : ""} ${code[index] ? styles.boxFilled : ""}`}>{code[index] ?? ""}</span>
          ))}
          <input
            ref={inputRef}
            className={styles.input}
            value={code}
            onChange={(event) => changeCode(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            aria-label="6-stelliger Bestätigungscode"
          />
        </div>
        <button className={styles.button} disabled={busy || code.length !== 6}>{busy ? "Wird geprüft …" : "Bestätigen"}</button>
      </form>

      {error && <p className={`${styles.message} ${styles.error}`} role="alert">{error}</p>}
      {message && !error && <p className={styles.message} role="status">{message}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.link} disabled={retryAfter > 0} onClick={() => void requestCode(false)}>
          {retryAfter > 0 ? `Code erneut senden in ${retryAfter} s` : "Code erneut senden"}
        </button>
        <button type="button" className={styles.linkMuted} onClick={onCancel}>Andere E-Mail verwenden</button>
      </div>
      <p className={styles.hint}>Keine E-Mail bekommen? Schau bitte auch im Spam-Ordner nach.</p>
    </section>
  );
}
