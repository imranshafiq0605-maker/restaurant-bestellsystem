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
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "../lib/firebase";
import EmailCodeStep from "../components/email-code-step";
import {
  authErrorMessage,
  deleteAccount,
  emptyProfile,
  euro,
  fetchOrders,
  fetchProfile,
  formatOrderDate,
  orderStatusLabel,
  orderStatusTone,
  ROSE_REDEEM_STEP,
  ROSE_VALUE_EUR,
  needsEmailCode,
  saveProfile,
  type AccountOrder,
  type AccountProfile,
} from "../lib/account-client";
import styles from "./konto.module.css";

type AuthMode = "register" | "login";
type View = "uebersicht" | "bestellungen" | "rosen" | "daten";

const views: Array<{ id: View; label: string }> = [
  { id: "uebersicht", label: "Übersicht" },
  { id: "bestellungen", label: "Bestellungen" },
  { id: "rosen", label: "Rosen" },
  { id: "daten", label: "Daten" },
];

// Nur interne Pfade als Weiterleitung nach dem Login zulassen.
function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value;
}

type IconName = "rose" | "bag" | "user" | "chevron" | "logout" | "pin" | "clock";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    rose: <><path d="M12 21c0-5 0-9 1-12" /><path d="M13 9c-5-1-6-7-1-7 4 0 7 4 3 8-2 2-5 1-6-1" /><path d="M12 15c-4-3-7-1-7-1 2 4 5 4 7 3M13 13c3-3 6-2 6-2-1 4-4 5-6 4" /></>,
    bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>,
    pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function AppleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.7 3.2-.7 1.4 0 1.9.7 3.2.7 1.3 0 2.2-1.1 2.9-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.9-1.1-2.9-4.1ZM14.4 6.1c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" /></svg>;
}

function GoogleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3a10 10 0 0 0 0 9.1L6.4 14Z" /><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 3 7.5l3.4 2.6C7.2 7.8 9.4 6 12 6Z" /></svg>;
}

function OrderCard({ order }: { order: AccountOrder }) {
  const tone = orderStatusTone(order);
  const visibleItems = order.items.slice(0, 4);
  const hiddenCount = order.items.length - visibleItems.length;
  return (
    <article className={styles.orderCard}>
      <header className={styles.orderHead}>
        <div>
          <strong>Bestellung #{order.orderNumber ?? "—"}</strong>
          <small>{formatOrderDate(order.createdAt)} · {order.orderType === "lieferung" ? "Lieferung" : "Abholung"}</small>
        </div>
        <span className={`${styles.statusPill} ${styles[`tone_${tone}`]}`}>{orderStatusLabel(order)}</span>
      </header>
      {visibleItems.length > 0 && (
        <ul className={styles.orderItems}>
          {visibleItems.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className={styles.qty}>{item.quantity}×</span>
              <span className={styles.itemName}>
                {item.name}
                {(item.variantName || item.selectedOptions.length > 0) && <small>{[item.variantName, ...item.selectedOptions].filter(Boolean).join(" · ")}</small>}
              </span>
              <span className={styles.itemPrice}>{euro(item.price * item.quantity)}</span>
            </li>
          ))}
          {hiddenCount > 0 && <li className={styles.moreItems}>+ {hiddenCount} weitere Artikel</li>}
        </ul>
      )}
      <footer className={styles.orderFoot}>
        <div className={styles.orderTotal}>
          <small>Gesamt</small>
          <strong>{euro(order.total)}</strong>
        </div>
        <div className={styles.orderRoses}>
          {order.earnedRoses > 0 && <span><Icon name="rose" />+{order.earnedRoses} Rosen</span>}
          {order.redeemedRoses > 0 && <span className={styles.redeemed}>−{order.redeemedRoses} eingelöst</span>}
        </div>
        <a className={styles.orderLink} href={`/order-status?id=${encodeURIComponent(order.id)}`}>Details<Icon name="chevron" /></a>
      </footer>
    </article>
  );
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
  const [verified, setVerified] = useState(false);
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
      // Die stille Aktualisierung lädt nur Rosen und Bestellungen, damit laufende Eingaben im Formular bleiben.
      const [nextProfile, orderData] = await Promise.all([silent ? null : fetchProfile(currentUser), fetchOrders(currentUser)]);
      setProfile((current) => nextProfile
        ? { ...nextProfile, name: nextProfile.name || currentUser.displayName || "", roses: orderData.roses }
        : { ...current, roses: orderData.roses });
      setOrders(orderData.orders);
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Kontodaten konnten nicht geladen werden.");
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, []);

  // Wird nach dem Login und nach der Code-Bestätigung aufgerufen.
  const enterAccount = useCallback((currentUser: User) => {
    setVerified(true);
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    void loadAccount(currentUser);
  }, [loadAccount, nextPath]);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
    if (!nextUser) {
      setVerified(false);
      setProfile(emptyProfile);
      setOrders([]);
      return;
    }
    setEmail(nextUser.email ?? "");
    if (needsEmailCode(nextUser)) {
      setVerified(false);
      return;
    }
    enterAccount(nextUser);
  }), [enterAccount]);

  useEffect(() => {
    if (!user || !verified) return;
    const interval = window.setInterval(() => void loadAccount(user, true), 30000);
    return () => window.clearInterval(interval);
  }, [user, verified, loadAccount]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (authMode === "register") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
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
      if (providerName === "apple") {
        provider.addScope("email");
        provider.addScope("name");
      } else {
        provider.setCustomParameters({ prompt: "select_account" });
      }
      // Popup auch auf dem iPhone: Safari blockiert den Speicher der Firebase-Domain,
      // dadurch geht eine Redirect-Anmeldung dort verloren. Redirect nur, wenn das Popup blockiert wird.
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        if (error instanceof FirebaseError && error.code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw error;
      }
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

  function openView(next: View) {
    setView(next);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const roseOrders = orders.filter((order) => order.earnedRoses > 0 || order.redeemedRoses > 0);
  const earnedTotal = orders.reduce((sum, order) => sum + order.earnedRoses, 0);
  const redeemedTotal = orders.reduce((sum, order) => sum + order.redeemedRoses, 0);
  const progressToNext = profile.roses % ROSE_REDEEM_STEP;
  const redeemableRoses = Math.floor(profile.roses / ROSE_REDEEM_STEP) * ROSE_REDEEM_STEP;
  const firstName = profile.name.trim().split(" ")[0];
  const hasAddress = Boolean(profile.street && profile.city);

  const benefits = (
    <ul className={styles.benefits}>
      <li><span><Icon name="rose" /></span><div><strong>1 € = 1 Rose</strong><small>Bei jeder Bestellung, automatisch gutgeschrieben</small></div></li>
      <li><span>3 €</span><div><strong>100 Rosen = 3 € Rabatt</strong><small>Im Warenkorb einlösen, auf der Website und in der App</small></div></li>
      <li><span><Icon name="pin" /></span><div><strong>Adresse speichern</strong><small>Beim nächsten Mal schneller bestellen</small></div></li>
    </ul>
  );

  const balanceCard = (
    <section className={styles.balanceCard}>
      <div className={styles.balanceTop}>
        <span className={styles.balanceIcon}><Icon name="rose" /></span>
        <div>
          <small>Rosenguthaben</small>
          <strong>{profile.roses} <span>Rosen</span></strong>
        </div>
        <em>{euro(profile.roses * ROSE_VALUE_EUR)}</em>
      </div>
      <div className={styles.progress} aria-label={`${progressToNext} von ${ROSE_REDEEM_STEP} Rosen`}>
        <div style={{ width: `${progressToNext}%` }} />
      </div>
      <p>
        {redeemableRoses >= ROSE_REDEEM_STEP
          ? `${redeemableRoses} Rosen (${euro(redeemableRoses * ROSE_VALUE_EUR)}) kannst du bei deiner nächsten Bestellung einlösen. Noch ${ROSE_REDEEM_STEP - progressToNext} bis zu weiteren 3 €.`
          : `Noch ${ROSE_REDEEM_STEP - progressToNext} Rosen bis zu deinem ersten 3-€-Rabatt.`}
      </p>
    </section>
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
          <Link className={styles.backLink} href="/">Speisekarte</Link>
        </div>
      </header>

      <div className={styles.container}>
        {!authReady ? (
          <p className={styles.loading}>Konto wird geladen …</p>
        ) : !user ? (
          <div className={styles.guestLayout}>
            <section className={`${styles.card} ${styles.authCard}`}>
              <h1 className={styles.authTitle}>{authMode === "register" ? "Konto erstellen" : "Willkommen zurück"}</h1>
              <p className={styles.muted}>{nextPath === "/warenkorb" ? "Danach geht es direkt zurück zu deinem Warenkorb." : "Bestellungen verfolgen, Adresse speichern und Rosen sammeln."}</p>

              <div className={styles.segmented}>
                <button type="button" className={authMode === "register" ? styles.segmentActive : ""} onClick={() => { setAuthMode("register"); setMessage(""); }}>Registrieren</button>
                <button type="button" className={authMode === "login" ? styles.segmentActive : ""} onClick={() => { setAuthMode("login"); setMessage(""); }}>Anmelden</button>
              </div>

              <div className={styles.socialButtons}>
                <button type="button" disabled={busy} onClick={() => socialSignIn("apple")}><span><AppleLogo /></span>Mit Apple fortfahren</button>
                <button type="button" disabled={busy} onClick={() => socialSignIn("google")}><span><GoogleLogo /></span>Mit Google fortfahren</button>
              </div>
              <div className={styles.divider}>oder mit E-Mail</div>

              <form onSubmit={submitAuth}>
                <label>E-Mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@beispiel.de" /></label>
                <label>Passwort<input type="password" minLength={8} required autoComplete={authMode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={authMode === "register" ? "Mindestens 8 Zeichen" : ""} /></label>
                <button className={styles.primaryButton} disabled={busy}>{busy ? "Bitte warten …" : authMode === "register" ? "Weiter" : "Anmelden"}</button>
              </form>
              {authMode === "register" && <p className={styles.smallHint}>Wir schicken dir einen 6-stelligen Code, um deine E-Mail-Adresse zu bestätigen.</p>}
              {authMode === "login" && <button type="button" className={styles.textButton} disabled={busy} onClick={resetPassword}>Passwort vergessen?</button>}
              {message && <p className={styles.message} role="status">{message}</p>}
            </section>

            <section className={styles.benefitsCard}>
              <span className={styles.eyebrow}>La Rosa Treueprogramm</span>
              <h2>Mit jeder Bestellung Rosen sammeln</h2>
              {benefits}
              <p className={styles.smallHint}>Schon ohne Konto bestellt? Registriere dich mit derselben E-Mail-Adresse, dann werden dir die Rosen dieser Bestellungen nachträglich gutgeschrieben.</p>
            </section>
          </div>
        ) : !verified ? (
          <div className={styles.guestLayout}>
            <EmailCodeStep className={`${styles.card} ${styles.authCard}`} user={user} onVerified={() => enterAccount(user)} onCancel={() => void signOut(auth)} />
          </div>
        ) : (
          <div className={styles.accountLayout}>
            <section className={styles.profileHead}>
              <div className={styles.avatar}>{(profile.name[0] || user.email?.[0] || "L").toUpperCase()}</div>
              <div className={styles.profileText}>
                <h1>{firstName ? `Hallo ${firstName}` : "Mein Konto"}</h1>
                <p>{user.email}{user.emailVerified && <span className={styles.verified}>Bestätigt</span>}</p>
              </div>
              <button type="button" className={styles.iconButton} onClick={logout} aria-label="Abmelden" title="Abmelden"><Icon name="logout" /></button>
            </section>

            <nav className={styles.tabs} aria-label="Kontobereiche">
              {views.map((item) => (
                <button key={item.id} type="button" className={view === item.id ? styles.tabActive : ""} aria-current={view === item.id ? "page" : undefined} onClick={() => openView(item.id)}>{item.label}</button>
              ))}
            </nav>

            {message && <p className={styles.message} role="status">{message}</p>}

            {view === "uebersicht" && (
              <div className={styles.overviewGrid}>
                {balanceCard}

                <section className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2>Letzte Bestellung</h2>
                    {orders.length > 1 && <button type="button" onClick={() => openView("bestellungen")}>Alle {orders.length}</button>}
                  </div>
                  {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Wird geladen …</p> : orders.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span><Icon name="bag" /></span>
                      <p>Noch keine Bestellungen. Deine erste Bestellung erscheint hier.</p>
                      <Link className={styles.secondaryButton} href="/">Zur Speisekarte</Link>
                    </div>
                  ) : <OrderCard order={orders[0]} />}
                </section>

                <section className={`${styles.card} ${styles.menuCard}`}>
                  <button type="button" onClick={() => openView("bestellungen")}>
                    <span className={styles.menuIcon}><Icon name="bag" /></span>
                    <span><strong>Bestellungen</strong><small>{orders.length ? `${orders.length} ${orders.length === 1 ? "Bestellung" : "Bestellungen"}` : "Verlauf und Status"}</small></span>
                    <Icon name="chevron" />
                  </button>
                  <button type="button" onClick={() => openView("rosen")}>
                    <span className={styles.menuIcon}><Icon name="rose" /></span>
                    <span><strong>Rosenverlauf</strong><small>{earnedTotal} gesammelt · {redeemedTotal} eingelöst</small></span>
                    <Icon name="chevron" />
                  </button>
                  <button type="button" onClick={() => openView("daten")}>
                    <span className={styles.menuIcon}><Icon name="user" /></span>
                    <span><strong>Kontakt- & Lieferdaten</strong><small>{hasAddress ? `${profile.street} ${profile.houseNumber}, ${profile.city}` : "Noch keine Adresse gespeichert"}</small></span>
                    <Icon name="chevron" />
                  </button>
                </section>
              </div>
            )}

            {view === "bestellungen" && (
              <section className={styles.stack}>
                <h2 className={styles.sectionTitle}>Deine Bestellungen</h2>
                {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Bestellungen werden geladen …</p> : orders.length === 0 ? (
                  <div className={`${styles.card} ${styles.emptyState}`}>
                    <span><Icon name="bag" /></span>
                    <p>Noch keine Bestellungen in diesem Konto.</p>
                    <Link className={styles.secondaryButton} href="/">Jetzt bestellen</Link>
                  </div>
                ) : orders.map((order) => <OrderCard key={order.id} order={order} />)}
              </section>
            )}

            {view === "rosen" && (
              <section className={styles.stack}>
                {balanceCard}
                <div className={styles.statRow}>
                  <div><small>Gesammelt</small><strong>{earnedTotal}</strong></div>
                  <div><small>Eingelöst</small><strong>{redeemedTotal}</strong></div>
                  <div><small>Wert jetzt</small><strong>{euro(profile.roses * ROSE_VALUE_EUR)}</strong></div>
                </div>
                <section className={styles.card}>
                  <h2>Verlauf</h2>
                  {ordersLoading && orders.length === 0 ? <p className={styles.muted}>Wird geladen …</p> : roseOrders.length === 0 ? <p className={styles.muted}>Noch keine Rosen. Nach deiner ersten bezahlten Bestellung erscheint die Gutschrift hier.</p> : (
                    <ul className={styles.historyList}>
                      {roseOrders.map((order) => (
                        <li key={order.id}>
                          <span><strong>Bestellung #{order.orderNumber ?? "—"}</strong><small>{formatOrderDate(order.createdAt)} · {euro(order.total)}</small></span>
                          <span className={styles.historyAmount}>
                            {order.earnedRoses > 0 && <b className={styles.plus}>+{order.earnedRoses}</b>}
                            {order.redeemedRoses > 0 && <b className={styles.minus}>−{order.redeemedRoses}</b>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className={styles.card}>
                  <h2>So funktioniert&apos;s</h2>
                  {benefits}
                </section>
              </section>
            )}

            {view === "daten" && (
              <section className={styles.stack}>
                <section className={styles.card}>
                  <h2>Kontakt- & Lieferdaten</h2>
                  <p className={styles.muted}>Wird beim Bestellen auf der Website und in der App automatisch eingetragen.</p>
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
                <section className={`${styles.card} ${styles.menuCard}`}>
                  <button type="button" onClick={logout}>
                    <span className={styles.menuIcon}><Icon name="logout" /></span>
                    <span><strong>Abmelden</strong><small>{user.email}</small></span>
                    <Icon name="chevron" />
                  </button>
                </section>
                <button type="button" className={styles.deleteLink} onClick={() => setDeleteOpen(true)}>Konto löschen</button>
              </section>
            )}
          </div>
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
