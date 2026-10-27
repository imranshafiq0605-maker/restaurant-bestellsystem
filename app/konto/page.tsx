"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import {
  authErrorMessage,
  deleteAccount,
  emptyProfile,
  euro,
  fetchOrders,
  fetchProfile,
  formatOrderDate,
  orderStatusLabel,
  ROSE_REDEEM_STEP,
  ROSE_VALUE_EUR,
  saveProfile,
  type AccountOrder,
  type AccountProfile,
} from "../lib/account-client";
import styles from "./konto.module.css";

type AuthMode = "register" | "login";
type View = "uebersicht" | "rosen" | "bestellungen" | "daten";

const views: Array<{ id: View; label: string }> = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "rosen", label: "Rosen" },
  { id: "bestellungen", label: "Bestellungen" },
  { id: "daten", label: "Meine Daten" },
];

// Nur interne Pfade als Weiterleitung nach dem Login zulassen.
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value;
}

function RoseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21c0-5 0-9 1-12" />
      <path d="M13 9c-5-1-6-7-1-7 4 0 7 4 3 8-2 2-5 1-6-1" />
      <path d="M12 15c-4-3-7-1-7-1 2 4 5 4 7 3M13 13c3-3 6-2 6-2-1 4-4 5-6 4" />
    </svg>
  );
}

function AppleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.7 3.2-.7 1.4 0 1.9.7 3.2.7 1.3 0 2.2-1.1 2.9-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.9-1.1-2.9-4.1ZM14.4 6.1c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" /></svg>;
}

function GoogleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3a10 10 0 0 0 0 9.1L6.4 14Z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 3 7.5l3.4 2.6C7.2 7.8 9.4 6 12 6Z" /></svg>;
}

export default function KontoPage() {
  return (
    <Suspense fallback={<main className={styles.page}><p className={styles.loading}>Konto wird geladen …</p></main>}>
      <KontoContent />
    </Suspense>
  );
}

function KontoContent() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(() => (searchParams.get("mode") === "login" ? "login" : "register"));
  const [view, setView] = useState<View>(() => {
    const requested = searchParams.get("view");
    return views.find((item) => item.id === requested)?.id ?? "uebersicht";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    getRedirectResult(auth).catch((error: unknown) => setMessage(authErrorMessage(error)));
  }, []);

  const loadAccount = useCallback(async (currentUser: User, silent = false) => {
    if (!silent) setOrdersLoading(true);
    try {
      const [nextProfile, orderData] = await Promise.all([fetchProfile(currentUser), fetchOrders(currentUser)]);
      setProfile({ ...nextProfile, roses: orderData.roses });
      setOrders(orderData.orders);
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Kontodaten konnten nicht geladen werden.");
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
    if (!nextUser) {
      setProfile(emptyProfile);
      setOrders([]);
      return;
    }
    setEmail(nextUser.email ?? "");
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    void loadAccount(nextUser);
  }), [loadAccount, nextPath]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => void loadAccount(user, true), 30000);
    return () => window.clearInterval(interval);
  }, [user, loadAccount]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (authMode === "register") {
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(result.user);
        setMessage("Konto erstellt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setMessage("Willkommen zurück.");
      }
      setPassword("");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function socialSignIn(providerName: "google" | "apple") {
    setBusy(true);
    setMessage("");
    try {
      const provider = providerName === "google" ? new GoogleAuthProvider() : new OAuthProvider("apple.com");
      if (provider instanceof OAuthProvider) {
        provider.addScope("email");
        provider.addScope("name");
      } else {
        provider.setCustomParameters({ prompt: "select_account" });
      }
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Wir haben dir einen Link zum Zurücksetzen des Passworts geschickt.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!user) return;
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMessage("Bestätigungslink wurde erneut gesendet.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveProfile(user, profile);
      setProfile((current) => ({ ...saved, roses: current.roses }));
      setMessage("Deine Angaben wurden gespeichert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteAccount(user);
      await signOut(auth).catch(() => undefined);
      setDeleteOpen(false);
      setView("uebersicht");
      setMessage("Dein Konto wurde vollständig gelöscht.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut(auth);
    setView("uebersicht");
    setMessage("Du wurdest abgemeldet.");
  }

  const roseOrders = orders.filter((order) => order.earnedRoses > 0 || order.redeemedRoses > 0);
  const earnedTotal = orders.reduce((sum, order) => sum + order.earnedRoses, 0);
  const redeemedTotal = orders.reduce((sum, order) => sum + order.redeemedRoses, 0);
  const progressToNext = profile.roses % ROSE_REDEEM_STEP;
  const redeemableRoses = Math.floor(profile.roses / ROSE_REDEEM_STEP) * ROSE_REDEEM_STEP;

  const roseRules = (
    <ul className={styles.ruleList}>
      <li><b>1 €</b><span><strong>1 Rose pro Euro</strong>Für jeden bezahlten Euro bekommst du eine Rose gutgeschrieben.</span></li>
      <li><b>3 ct</b><span><strong>Jede Rose ist 3 Cent wert</strong>100 Rosen = 3,00 € Rabatt auf deine nächste Bestellung.</span></li>
      <li><b>100</b><span><strong>Ab 100 Rosen einlösen</strong>Im Warenkorb auf der Website oder in der La Rosa App.</span></li>
    </ul>
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.container}>
          <Link className={styles.brand} href="/">
            {/* eslint-disable-next-line @next/next/no-img-element -- gleiches Logo wie im Website-Header */}
            <img src="/images/logo.jpg" alt="" />
            <span><small>Restaurant & Lieferservice</small><strong>La Rosa GmbH</strong></span>
          </Link>
          <Link className={styles.backLink} href="/">← Zur Speisekarte</Link>
        </div>
      </header>

      <div className={styles.container}>
        {!authReady ? (
          <p className={styles.loading}>Konto wird geladen …</p>
        ) : !user ? (
          <div className={styles.guestGrid}>
            <section className={styles.promo}>
              <span className={styles.eyebrow}>La Rosa Treueprogramm</span>
              <h1>Bestellen, Rosen sammeln, sparen.</h1>
              <p>Mit deinem kostenlosen La-Rosa-Konto bekommst du für jede Bestellung Rosen gutgeschrieben. Dasselbe Konto funktioniert auf der Website und in der La Rosa App.</p>
              {roseRules}
              <p className={styles.hint}>Schon ohne Konto bestellt? Registriere dich mit derselben E-Mail-Adresse und bestätige sie. Dann werden dir die Rosen deiner bisherigen Bestellungen nachträglich gutgeschrieben.</p>
            </section>

            <section className={styles.card}>
              <div className={styles.segmented}>
                <button type="button" className={authMode === "register" ? styles.segmentActive : ""} onClick={() => setAuthMode("register")}>Registrieren</button>
                <button type="button" className={authMode === "login" ? styles.segmentActive : ""} onClick={() => setAuthMode("login")}>Anmelden</button>
              </div>
              <h2>{authMode === "register" ? "Konto erstellen" : "Willkommen zurück"}</h2>
              <p className={styles.muted}>{nextPath === "/warenkorb" ? "Nach der Anmeldung geht es direkt zurück zu deinem Warenkorb." : "Adressen speichern, Bestellungen verfolgen und Rosen sammeln."}</p>

              <div className={styles.socialButtons}>
                <button type="button" disabled={busy} onClick={() => socialSignIn("apple")}><span><AppleLogo /></span>Mit Apple fortfahren</button>
                <button type="button" disabled={busy} onClick={() => socialSignIn("google")}><span><GoogleLogo /></span>Mit Google fortfahren</button>
              </div>
              <div className={styles.divider}>oder mit E-Mail</div>

              <form onSubmit={submitAuth}>
                <label>E-Mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <label>Passwort<input type="password" minLength={8} required autoComplete={authMode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <button className={styles.primaryButton} disabled={busy}>{busy ? "Bitte warten …" : authMode === "register" ? "Konto erstellen" : "Anmelden"}</button>
              </form>
              {authMode === "login" && <button type="button" className={styles.textButton} disabled={busy} onClick={resetPassword}>Passwort vergessen?</button>}
              {message && <p className={styles.message} role="status">{message}</p>}
            </section>
          </div>
        ) : (
          <>
            <section className={styles.accountHero}>
              <div className={styles.avatar}>{(profile.name[0] || user.email?.[0] || "L").toUpperCase()}</div>
              <div className={styles.heroText}>
                <span className={styles.eyebrow}>Mein Konto</span>
                <h1>{profile.name ? `Hallo ${profile.name.split(" ")[0]}` : "Dein La-Rosa-Konto"}</h1>
                <p>{user.email}</p>
                {user.emailVerified ? (
                  <span className={styles.verified}>✓ E-Mail bestätigt</span>
                ) : (
                  <span className={styles.unverified}>E-Mail noch nicht bestätigt · <button type="button" disabled={busy} onClick={resendVerification}>Link erneut senden</button></span>
                )}
              </div>
              <div className={styles.heroWallet}>
                <span className={styles.walletIcon}><RoseIcon /></span>
                <div><small>Dein Rosenguthaben</small><strong>{profile.roses} Rosen</strong><span>Wert {euro(profile.roses * ROSE_VALUE_EUR)}</span></div>
              </div>
            </section>

            <nav className={styles.tabs} aria-label="Kontobereiche">
              {views.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? styles.tabActive : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setMessage(""); }}>{item.label}</button>
              ))}
            </nav>

            {message && <p className={styles.message} role="status">{message}</p>}

            {view === "uebersicht" && (
              <div className={styles.dashboard}>
                <section className={styles.roseCard}>
                  <span className={styles.eyebrowLight}>Rosenkonto</span>
                  <strong>{profile.roses} Rosen</strong>
                  <p>{redeemableRoses >= ROSE_REDEEM_STEP ? `Du kannst jetzt ${redeemableRoses} Rosen (${euro(redeemableRoses * ROSE_VALUE_EUR)}) im Warenkorb einlösen.` : `Noch ${ROSE_REDEEM_STEP - progressToNext} Rosen bis zu deinem ersten 3-€-Rabatt.`}</p>
                  <div className={styles.progress} aria-label={`${progressToNext} von ${ROSE_REDEEM_STEP} Rosen`}><div style={{ width: `${redeemableRoses >= ROSE_REDEEM_STEP ? 100 : progressToNext}%` }} /></div>
                  <Link className={styles.lightButton} href="/">Jetzt bestellen und sammeln</Link>
                </section>
                <section className={styles.card}>
                  <h2>So funktioniert&apos;s</h2>
                  {roseRules}
                </section>
                <section className={styles.card}>
                  <div className={styles.cardHead}><h2>Letzte Bestellungen</h2><button type="button" onClick={() => setView("bestellungen")}>Alle ansehen</button></div>
                  {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Wird geladen …</p> : orders.length === 0 ? <p className={styles.muted}>Noch keine Bestellungen in diesem Konto.</p> : (
                    <ul className={styles.orderList}>
                      {orders.slice(0, 3).map((order) => (
                        <li key={order.id}>
                          <a href={`/order-status?id=${encodeURIComponent(order.id)}`}>
                            <span><strong>Bestellung #{order.orderNumber ?? "—"}</strong><small>{formatOrderDate(order.createdAt)} · {orderStatusLabel(order)}</small></span>
                            <span className={styles.orderMeta}><strong>{euro(order.total)}</strong>{order.earnedRoses > 0 && <small>+{order.earnedRoses} Rosen</small>}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className={styles.card}>
                  <h2>Konto</h2>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => setView("daten")}>Kontakt- & Lieferdaten bearbeiten</button>
                    <button type="button" onClick={logout}>Abmelden</button>
                    <button type="button" className={styles.danger} onClick={() => setDeleteOpen(true)}>Konto löschen</button>
                  </div>
                </section>
              </div>
            )}

            {view === "rosen" && (
              <section className={styles.card}>
                <div className={styles.statRow}>
                  <div><small>Aktuell</small><strong>{profile.roses}</strong></div>
                  <div><small>Gesammelt</small><strong>{earnedTotal}</strong></div>
                  <div><small>Eingelöst</small><strong>{redeemedTotal}</strong></div>
                </div>
                <h2>Rosenverlauf</h2>
                {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Rosenverlauf wird geladen …</p> : roseOrders.length === 0 ? <p className={styles.muted}>Noch keine Rosen erhalten. Nach deiner ersten bezahlten Bestellung erscheint die Gutschrift hier.</p> : (
                  <ul className={styles.historyList}>
                    {roseOrders.map((order) => (
                      <li key={order.id}>
                        <span className={styles.historyIcon}><RoseIcon /></span>
                        <span><strong>Bestellung #{order.orderNumber ?? "—"}</strong><small>{formatOrderDate(order.createdAt)} · {euro(order.total)} bezahlt</small></span>
                        <span className={styles.historyAmount}>
                          {order.earnedRoses > 0 && <b className={styles.plus}>+{order.earnedRoses}</b>}
                          {order.redeemedRoses > 0 && <b className={styles.minus}>−{order.redeemedRoses}</b>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view === "bestellungen" && (
              <section className={styles.card}>
                <h2>Deine Bestellungen</h2>
                {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Bestellungen werden geladen …</p> : orders.length === 0 ? <p className={styles.muted}>Noch keine Bestellungen in diesem Konto.</p> : (
                  <ul className={styles.orderList}>
                    {orders.map((order) => (
                      <li key={order.id}>
                        <a href={`/order-status?id=${encodeURIComponent(order.id)}`}>
                          <span>
                            <strong>Bestellung #{order.orderNumber ?? "—"} · {order.orderType === "lieferung" ? "Lieferung" : "Abholung"}</strong>
                            <small>{formatOrderDate(order.createdAt)} · {orderStatusLabel(order)}</small>
                            <small className={styles.items}>{order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}</small>
                          </span>
                          <span className={styles.orderMeta}>
                            <strong>{euro(order.total)}</strong>
                            {order.earnedRoses > 0 && <small>+{order.earnedRoses} Rosen</small>}
                            {order.redeemedRoses > 0 && <small>−{order.redeemedRoses} Rosen eingelöst</small>}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {view === "daten" && (
              <section className={styles.card}>
                <h2>Kontakt- & Lieferdaten</h2>
                <p className={styles.muted}>Diese Angaben werden beim Bestellen auf der Website und in der App automatisch eingetragen.</p>
                <form onSubmit={submitProfile} className={styles.formGrid}>
                  <label className={styles.full}>Name<input required autoComplete="name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
                  <label className={styles.full}>Telefon<input type="tel" autoComplete="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
                  <label>Straße<input autoComplete="address-line1" value={profile.street} onChange={(event) => setProfile({ ...profile, street: event.target.value })} /></label>
                  <label>Hausnr.<input value={profile.houseNumber} onChange={(event) => setProfile({ ...profile, houseNumber: event.target.value })} /></label>
                  <label>PLZ<input inputMode="numeric" autoComplete="postal-code" value={profile.postalCode} onChange={(event) => setProfile({ ...profile, postalCode: event.target.value })} /></label>
                  <label>Ort<input autoComplete="address-level2" value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label>
                  <button className={`${styles.primaryButton} ${styles.full}`} disabled={busy}>{busy ? "Wird gespeichert …" : "Speichern"}</button>
                </form>
              </section>
            )}
          </>
        )}
      </div>

      {deleteOpen && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className={styles.dialog}>
            <h2 id="delete-title">Konto endgültig löschen?</h2>
            <p>Dein Login, deine gespeicherten Angaben, Bestellungen und alle Rosen werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.</p>
            <div className={styles.dialogActions}>
              <button type="button" disabled={busy} onClick={() => setDeleteOpen(false)}>Abbrechen</button>
              <button type="button" className={styles.danger} disabled={busy} onClick={confirmDelete}>{busy ? "Wird gelöscht …" : "Endgültig löschen"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
