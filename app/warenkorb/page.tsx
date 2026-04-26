"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type Bestellart = "abholung" | "lieferung";
type Vorbestellung = "sofort" | "spaeter";
type CheckoutStep = "warenkorb" | "daten" | "zeit" | "checkout";

type CartItem = {
  id: number;
  number?: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  cuisine: string;
  variantName?: string;
  selectedOptions?: string[];
  uniqueKey: string;
};

type LiefergebietConfig = {
  city: string;
  minOrder: number;
};

const CART_STORAGE_KEY = "larosa_cart";

const MANUAL_NOTICE_TEXT = "( Heute öffnen wir erst ab 14 Uhr )";
const MANUAL_CHECKOUT_BLOCKED = false;

const liefergebiete: Record<string, LiefergebietConfig> = {
  "64546": { city: "Mörfelden-Walldorf", minOrder: 12 },
  "64331": { city: "Weiterstadt", minOrder: 30 },
  "64572": { city: "Büttelborn", minOrder: 30 },
  "63263": { city: "Neu-Isenburg", minOrder: 40 },
  "63225": { city: "Langen", minOrder: 40 },
  "64283": { city: "Darmstadt", minOrder: 15 },
  "64285": { city: "Darmstadt", minOrder: 15 },
  "64287": { city: "Darmstadt", minOrder: 15 },
  "64289": { city: "Darmstadt", minOrder: 15 },
  "64291": { city: "Darmstadt", minOrder: 15 },
  "64293": { city: "Darmstadt", minOrder: 15 },
  "64295": { city: "Darmstadt", minOrder: 15 },
  "64297": { city: "Darmstadt", minOrder: 15 },
  "64521": { city: "Groß-Gerau", minOrder: 30 },
};

function formatEuro(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function roundUpToNextFiveMinutes(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const next = Math.ceil(minutes / 5) * 5;
  rounded.setMinutes(next);
  return rounded;
}

function getServiceStatus(bestellart: Bestellart) {
  const jetzt = new Date();
  const tag = jetzt.getDay();
  const minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const istWochenende = tag === 0 || tag === 6;

  const offenAb = istWochenende ? 14 * 60 : 11 * 60;
  const offenBis = bestellart === "abholung" ? 23 * 60 : 22 * 60 + 30;

  return {
    isOpen: minuten >= offenAb && minuten <= offenBis,
  };
}

function getPreorderWindowForDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;

  return {
    startHour: isWeekend ? 15 : 12,
    endHour: 22,
    isWeekend,
  };
}

function getAvailablePreorderDates() {
  return [formatDateInput(new Date())];
}

function getAvailableTimeSlots(dateString: string) {
  if (!dateString) return [];

  const { startHour, endHour } = getPreorderWindowForDate(dateString);
  const selectedDate = new Date(`${dateString}T00:00:00`);
  const nowPlusOneHour = new Date(Date.now() + 60 * 60 * 1000);

  const slotStart = new Date(selectedDate);
  slotStart.setHours(startHour, 0, 0, 0);

  const slotEnd = new Date(selectedDate);
  slotEnd.setHours(endHour, 0, 0, 0);

  const effectiveStart =
    selectedDate.toDateString() === new Date().toDateString()
      ? new Date(
          Math.max(
            slotStart.getTime(),
            roundUpToNextFiveMinutes(nowPlusOneHour).getTime()
          )
        )
      : slotStart;

  if (effectiveStart.getTime() > slotEnd.getTime()) return [];

  const slots: string[] = [];
  const cursor = new Date(effectiveStart);

  while (cursor.getTime() <= slotEnd.getTime()) {
    const hours = String(cursor.getHours()).padStart(2, "0");
    const minutes = String(cursor.getMinutes()).padStart(2, "0");
    slots.push(`${hours}:${minutes}`);
    cursor.setMinutes(cursor.getMinutes() + 15);
  }

  return slots;
}

function pruefeLiefergebiet(plz: string) {
  const plzBereinigt = plz.trim();

  if (!plzBereinigt) {
    return {
      ok: false,
      message: "Bitte gib eine Postleitzahl ein.",
      city: "",
      minOrder: null as number | null,
    };
  }

  if (!/^\d{5}$/.test(plzBereinigt)) {
    return {
      ok: false,
      message: "Bitte gib eine gültige 5-stellige Postleitzahl ein.",
      city: "",
      minOrder: null as number | null,
    };
  }

  const gebiet = liefergebiete[plzBereinigt];

  if (!gebiet) {
    return {
      ok: false,
      message: "Diese Postleitzahl liegt aktuell außerhalb unseres Liefergebiets.",
      city: "",
      minOrder: null as number | null,
    };
  }

  return {
    ok: true,
    message: `Lieferung nach ${gebiet.city} möglich. Mindestbestellwert: ${formatEuro(gebiet.minOrder)}.`,
    city: gebiet.city,
    minOrder: gebiet.minOrder,
  };
}

function validiereTelefonnummer(telefon: string) {
  const erlaubt = /^[\d\s()+/-]+$/;

  if (!telefon.trim()) return { ok: false, message: "Bitte gib deine Telefonnummer ein." };
  if (!erlaubt.test(telefon)) return { ok: false, message: "Die Telefonnummer enthält ungültige Zeichen." };

  const nurZiffern = telefon.replace(/\D/g, "");
  if (nurZiffern.length < 8) return { ok: false, message: "Die Telefonnummer ist zu kurz." };
  if (nurZiffern.length > 15) return { ok: false, message: "Die Telefonnummer ist zu lang." };

  return { ok: true, message: "Telefonnummer sieht gültig aus." };
}

function validiereEmail(email: string) {
  const emailBereinigt = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailBereinigt) return { ok: false, message: "Bitte gib deine E-Mail-Adresse ein." };
  if (!emailRegex.test(emailBereinigt)) return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." };

  return { ok: true, message: "E-Mail sieht gültig aus." };
}

function istGueltigeVorbestellung(datum: string, uhrzeit: string) {
  if (!datum || !uhrzeit) {
    return { ok: false, message: "Bitte wähle Datum und Uhrzeit für die Vorbestellung." };
  }

  const slots = getAvailableTimeSlots(datum);
  if (!slots.includes(uhrzeit)) {
    return { ok: false, message: "Die gewählte Vorbestellzeit ist nicht mehr verfügbar." };
  }

  const selected = new Date(`${datum}T${uhrzeit}:00`);
  const minAllowed = new Date(Date.now() + 60 * 60 * 1000);

  if (selected.getTime() < minAllowed.getTime()) {
    return { ok: false, message: "Vorbestellungen müssen mindestens 1 Stunde in der Zukunft liegen." };
  }

  return { ok: true, message: "Vorbestellung ist gültig." };
}

export default function WarenkorbPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("warenkorb");

  const [bestellart, setBestellart] = useState<Bestellart>("abholung");
  const [name, setName] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [strasse, setStrasse] = useState("");
  const [hausnummer, setHausnummer] = useState("");
  const [plz, setPlz] = useState("");
  const [stadt, setStadt] = useState("");
  const [hinweis, setHinweis] = useState("");

  const [vorbestellung, setVorbestellung] = useState<Vorbestellung>("sofort");
  const [vorbestellungDatum, setVorbestellungDatum] = useState(formatDateInput(new Date()));
  const [uhrzeit, setUhrzeit] = useState("");

  const [fehlermeldung, setFehlermeldung] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch (_) {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart, loaded]);

  const gesamtpreisProdukte = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const rabattBetrag = useMemo(() => gesamtpreisProdukte * 0.1, [gesamtpreisProdukte]);
  const zwischensummeNachRabatt = useMemo(
    () => Math.max(gesamtpreisProdukte - rabattBetrag, 0),
    [gesamtpreisProdukte, rabattBetrag]
  );
  const gesamtAnzahl = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const gesamtpreis = zwischensummeNachRabatt;

  const lieferPruefung = useMemo(() => {
    if (bestellart !== "lieferung") return null;
    if (!plz.trim()) return null;
    return pruefeLiefergebiet(plz);
  }, [bestellart, plz]);

  const status = getServiceStatus(bestellart);
  const availablePreorderDates = useMemo(() => getAvailablePreorderDates(), []);
  const availableTimeSlots = useMemo(() => getAvailableTimeSlots(vorbestellungDatum), [vorbestellungDatum]);

  const zusammengesetzteAdresse = useMemo(() => {
    if (!strasse && !hausnummer && !plz && !stadt) return "";
    return `${strasse.trim()} ${hausnummer.trim()}, ${plz.trim()} ${stadt.trim()}`.trim();
  }, [strasse, hausnummer, plz, stadt]);

  useEffect(() => {
    if (bestellart !== "lieferung") return;

    const plzBereinigt = plz.trim();
    if (plzBereinigt.length !== 5) {
      setStadt("");
      return;
    }

    const gebiet = liefergebiete[plzBereinigt];
    setStadt(gebiet ? gebiet.city : "");
  }, [plz, bestellart]);

  useEffect(() => {
    if (!status.isOpen) setVorbestellung("spaeter");
  }, [status.isOpen]);

  useEffect(() => {
    if (vorbestellung !== "spaeter") return;
    if (!availableTimeSlots.includes(uhrzeit)) {
      setUhrzeit(availableTimeSlots[0] || "");
    }
  }, [vorbestellung, availableTimeSlots, uhrzeit]);

  function updateQuantity(uniqueKey: string, change: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.uniqueKey === uniqueKey
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function goHome() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    window.location.href = "/";
  }

  function nextFromCart() {
    setFehlermeldung("");
    if (cart.length === 0) {
      setFehlermeldung("Dein Warenkorb ist leer.");
      return;
    }
    setStep("daten");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextFromDaten() {
    setFehlermeldung("");

    if (!name.trim()) {
      setFehlermeldung("Bitte gib deinen Namen ein.");
      return;
    }

    const telefonValidierung = validiereTelefonnummer(telefon);
    if (!telefonValidierung.ok) {
      setFehlermeldung(telefonValidierung.message);
      return;
    }

    const emailValidierung = validiereEmail(email);
    if (!emailValidierung.ok) {
      setFehlermeldung(emailValidierung.message);
      return;
    }

    if (bestellart === "lieferung") {
      if (!strasse.trim()) {
        setFehlermeldung("Bitte gib deine Straße ein.");
        return;
      }
      if (!hausnummer.trim()) {
        setFehlermeldung("Bitte gib deine Hausnummer ein.");
        return;
      }
      if (!plz.trim()) {
        setFehlermeldung("Bitte gib deine Postleitzahl ein.");
        return;
      }

      const gebiet = pruefeLiefergebiet(plz);
      if (!gebiet.ok) {
        setFehlermeldung(gebiet.message);
        return;
      }

      if (zwischensummeNachRabatt < gebiet.minOrder!) {
        setFehlermeldung(
          `Für ${gebiet.city} gilt ein Mindestbestellwert von ${formatEuro(gebiet.minOrder!)} nach Rabatt.`
        );
        return;
      }
    }

    setStep("zeit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextFromZeit() {
    setFehlermeldung("");

    if (!status.isOpen && vorbestellung === "sofort") {
      setFehlermeldung("Aktuell geschlossen. Bitte wähle eine Vorbestellung.");
      return;
    }

    if (vorbestellung === "spaeter") {
      const pruefung = istGueltigeVorbestellung(vorbestellungDatum, uhrzeit);
      if (!pruefung.ok) {
        setFehlermeldung(pruefung.message);
        return;
      }
    }

    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStripeCheckout() {
    setFehlermeldung("");

    if (MANUAL_CHECKOUT_BLOCKED) {
      setFehlermeldung(MANUAL_NOTICE_TEXT || "Bestellungen sind aktuell nicht möglich.");
      return;
    }

    const artikelOhneUndefined = cart.map((item) => ({
      id: item.id,
      ...(item.number ? { number: item.number } : {}),
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      category: item.category,
      cuisine: item.cuisine,
      uniqueKey: item.uniqueKey,
      ...(item.variantName ? { variantName: item.variantName } : {}),
      ...(item.selectedOptions && item.selectedOptions.length > 0
        ? { selectedOptions: item.selectedOptions }
        : {}),
    }));

    try {
      setIsSubmitting(true);

      const pendingBestellung = {
        kunde: {
          name: name.trim(),
          telefon: telefon.trim(),
          email: email.trim(),
          adresse: bestellart === "lieferung" ? zusammengesetzteAdresse : "Abholung",
          ...(bestellart === "lieferung"
            ? {
                lieferadresse: {
                  strasse: strasse.trim(),
                  hausnummer: hausnummer.trim(),
                  plz: plz.trim(),
                  stadt: stadt.trim(),
                },
              }
            : {}),
        },
        bestellart,
        hinweis: hinweis.trim(),
        vorbestellung,
        datum: vorbestellung === "spaeter" ? vorbestellungDatum : formatDateInput(new Date()),
        uhrzeit: vorbestellung === "spaeter" ? uhrzeit : "sofort",
        artikel: artikelOhneUndefined,
        gesamtpreisProdukte,
        rabattProzent: 10,
        rabattBetrag,
        liefergebuehr: 0,
        versandKostenlos: true,
        gesamtpreis,
        status: "pending_payment",
        createdAt: serverTimestamp(),
      };

      const pendingOrderRef = await addDoc(collection(db, "pendingOrders"), pendingBestellung);

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingOrderId: pendingOrderRef.id,
          email: email.trim(),
          artikel: artikelOhneUndefined,
          gesamtpreisProdukte,
          rabattBetrag,
          gesamtpreis,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFehlermeldung(data.error || "Stripe Checkout konnte nicht gestartet werden.");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setFehlermeldung("Keine Stripe-URL erhalten.");
    } catch (error: any) {
      console.error("Fehler bei pending order oder Stripe:", error);
      setFehlermeldung(error?.message || "Bestellung konnte nicht verarbeitet werden.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepNumber = step === "warenkorb" ? 1 : step === "daten" ? 2 : step === "zeit" ? 3 : 4;

  return (
    <main className="cart-page">
      <header className="cart-header">
        <div className="cart-container cart-nav">
          <button className="plain-back" onClick={goHome} type="button">
            ← Weiter einkaufen
          </button>
          <div className="brand-mini">La Rosa GmbH</div>
        </div>
      </header>

      <section className="cart-container cart-wrap">
        <div className="progress-card">
          <span>Schritt {stepNumber} von 4</span>
          <h1>
            {step === "warenkorb" && "Dein Warenkorb"}
            {step === "daten" && "Bestelldaten"}
            {step === "zeit" && "Bestellzeit"}
            {step === "checkout" && "Zusammenfassung"}
          </h1>
          <div className="progress-line">
            <div style={{ width: `${stepNumber * 25}%` }} />
          </div>
        </div>

        {fehlermeldung && <p className="message error">{fehlermeldung}</p>}

        <div className="layout">
          <div className="main-card">
            {step === "warenkorb" && (
              <>
                {cart.length === 0 ? (
                  <div className="empty-box">
                    <h2>Dein Warenkorb ist leer.</h2>
                    <p>Füge zuerst Produkte hinzu, bevor du zur Bestellung gehst.</p>
                    <button className="primary-button" onClick={goHome} type="button">
                      Zur Speisekarte
                    </button>
                  </div>
                ) : (
                  <div className="item-list">
                    {cart.map((item) => (
                      <article className="cart-item" key={item.uniqueKey}>
                        <div className="item-top">
                          <div>
                            <h3>{item.name}</h3>
                            <p>
                              {item.cuisine} · {item.category}
                              {item.variantName ? ` · ${item.variantName}` : ""}
                            </p>
                          </div>
                          <strong>{formatEuro(item.price * item.quantity)}</strong>
                        </div>

                        {item.selectedOptions && item.selectedOptions.length > 0 && (
                          <div className="option-list">
                            {item.selectedOptions.map((option) => (
                              <span key={option}>{option}</span>
                            ))}
                          </div>
                        )}

                        <div className="qty-row">
                          <button onClick={() => updateQuantity(item.uniqueKey, -1)} type="button">
                            −
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.uniqueKey, 1)} type="button">
                            +
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === "daten" && (
              <div className="form-stack">
                <div className="choice-grid">
                  <button
                    className={`choice ${bestellart === "abholung" ? "active" : ""}`}
                    onClick={() => setBestellart("abholung")}
                    type="button"
                  >
                    <strong>Abholung</strong>
                    <span>Du holst deine Bestellung selbst ab.</span>
                  </button>

                  <button
                    className={`choice ${bestellart === "lieferung" ? "active" : ""}`}
                    onClick={() => setBestellart("lieferung")}
                    type="button"
                  >
                    <strong>Lieferung</strong>
                    <span>Wir liefern zu dir nach Hause.</span>
                  </button>
                </div>

                <div className="input-grid">
                  <label>
                    Name
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" />
                  </label>
                  <label>
                    Telefon
                    <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefonnummer" />
                  </label>
                </div>

                <label>
                  E-Mail-Adresse
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail-Adresse" />
                </label>

                {bestellart === "lieferung" && (
                  <>
                    <div className="input-grid">
                      <label>
                        Straße
                        <input value={strasse} onChange={(e) => setStrasse(e.target.value)} placeholder="Straße" />
                      </label>
                      <label>
                        Hausnummer
                        <input value={hausnummer} onChange={(e) => setHausnummer(e.target.value)} placeholder="Hausnummer" />
                      </label>
                    </div>

                    <div className="input-grid">
                      <label>
                        Postleitzahl
                        <input
                          value={plz}
                          inputMode="numeric"
                          maxLength={5}
                          onChange={(e) => setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))}
                          placeholder="PLZ"
                        />
                      </label>
                      <label>
                        Stadt
                        <input value={stadt} placeholder="Wird automatisch ausgefüllt" disabled readOnly />
                      </label>
                    </div>

                    {lieferPruefung && (
                      <p className={`message ${lieferPruefung.ok ? "success" : "error"}`}>
                        {lieferPruefung.message}
                      </p>
                    )}
                  </>
                )}

                <label>
                  Hinweis zur Bestellung
                  <textarea value={hinweis} onChange={(e) => setHinweis(e.target.value)} rows={4} placeholder="z. B. ohne Zwiebeln" />
                </label>
              </div>
            )}

            {step === "zeit" && (
              <div className="form-stack">
                <div className="choice-grid">
                  <button
                    className={`choice ${vorbestellung === "sofort" ? "active" : ""}`}
                    onClick={() => setVorbestellung("sofort")}
                    type="button"
                    disabled={!status.isOpen || MANUAL_CHECKOUT_BLOCKED}
                  >
                    <strong>Sofort</strong>
                    <span>{status.isOpen ? "So schnell wie möglich" : "Aktuell geschlossen"}</span>
                  </button>

                  <button
                    className={`choice ${vorbestellung === "spaeter" ? "active" : ""}`}
                    onClick={() => setVorbestellung("spaeter")}
                    type="button"
                    disabled={MANUAL_CHECKOUT_BLOCKED}
                  >
                    <strong>Vorbestellung</strong>
                    <span>Datum und Uhrzeit auswählen</span>
                  </button>
                </div>

                {!status.isOpen && (
                  <p className="message error">Aktuell geschlossen. Bitte wähle eine Vorbestellung.</p>
                )}

                {vorbestellung === "spaeter" && (
                  <>
                    <div className="input-grid">
                      <label>
                        Datum
                        <select value={vorbestellungDatum} onChange={(e) => setVorbestellungDatum(e.target.value)}>
                          {availablePreorderDates.map((date) => (
                            <option key={date} value={date}>
                              {formatDateLabel(date)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Uhrzeit
                        <select value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)}>
                          {availableTimeSlots.length > 0 ? (
                            availableTimeSlots.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot} Uhr
                              </option>
                            ))
                          ) : (
                            <option value="">Keine Uhrzeiten verfügbar</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <p className="soft-note">Vorbestellungen sind mindestens 1 Stunde in der Zukunft möglich.</p>
                  </>
                )}
              </div>
            )}

            {step === "checkout" && (
              <div className="checkout-final">
                <h2>Bitte prüfe deine Bestellung</h2>

                <div className="review-box">
                  <span>Bestellart</span>
                  <strong>{bestellart === "lieferung" ? "Lieferung" : "Abholung"}</strong>
                </div>

                <div className="review-box">
                  <span>Kunde</span>
                  <strong>{name}</strong>
                  <small>{telefon} · {email}</small>
                  {bestellart === "lieferung" && <small>{zusammengesetzteAdresse}</small>}
                </div>

                <div className="review-box">
                  <span>Zeit</span>
                  <strong>{vorbestellung === "sofort" ? "So schnell wie möglich" : `${formatDateLabel(vorbestellungDatum)} · ${uhrzeit} Uhr`}</strong>
                </div>

                {hinweis.trim() && (
                  <div className="review-box">
                    <span>Hinweis</span>
                    <strong>{hinweis}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="summary-card">
            <h2>Übersicht</h2>
            <div className="summary-row"><span>Artikel</span><strong>{gesamtAnzahl}</strong></div>
            <div className="summary-row"><span>Zwischensumme</span><strong>{formatEuro(gesamtpreisProdukte)}</strong></div>
            <div className="summary-row discount"><span>10% Rabatt</span><strong>-{formatEuro(rabattBetrag)}</strong></div>
            <div className="summary-row"><span>Versand</span><strong>Kostenlos</strong></div>
            <div className="summary-row total"><span>Gesamt</span><strong>{formatEuro(gesamtpreis)}</strong></div>

            <div className="action-row">
              {step !== "warenkorb" && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setFehlermeldung("");
                    setStep(step === "daten" ? "warenkorb" : step === "zeit" ? "daten" : "zeit");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  type="button"
                >
                  Zurück
                </button>
              )}

              {step === "warenkorb" && <button className="primary-button" onClick={nextFromCart} type="button">Weiter</button>}
              {step === "daten" && <button className="primary-button" onClick={nextFromDaten} type="button">Weiter</button>}
              {step === "zeit" && <button className="primary-button" onClick={nextFromZeit} type="button">Zur Zahlung</button>}
              {step === "checkout" && (
                <button className="primary-button" onClick={handleStripeCheckout} type="button" disabled={isSubmitting || MANUAL_CHECKOUT_BLOCKED}>
                  {isSubmitting ? "Wird gesendet..." : "Jetzt sicher bezahlen"}
                </button>
              )}
            </div>
          </aside>
        </div>
      </section>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f6f7f9; color: #111827; font-family: Inter, Arial, sans-serif; }
        button, input, textarea, select { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .55; }

        .cart-page { min-height: 100vh; }
        .cart-container { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
        .cart-header { position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,.88); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(0,0,0,.06); }
        .cart-nav { height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .plain-back { border: 1px solid rgba(0,0,0,.08); background: #fff; color: #111827; border-radius: 14px; padding: 11px 14px; font-weight: 800; }
        .brand-mini { font-weight: 900; }

        .cart-wrap { padding: 28px 0 60px; }
        .progress-card, .main-card, .summary-card { background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 26px; box-shadow: 0 14px 34px rgba(17,24,39,.05); }
        .progress-card { padding: 20px; margin-bottom: 18px; }
        .progress-card span { color: #6b7280; font-weight: 800; font-size: .82rem; text-transform: uppercase; letter-spacing: .12em; }
        .progress-card h1 { margin: 8px 0 14px; font-size: clamp(1.65rem, 4vw, 2.4rem); letter-spacing: -.04em; }
        .progress-line { height: 8px; background: #eef0f3; border-radius: 999px; overflow: hidden; }
        .progress-line div { height: 100%; background: #111827; border-radius: 999px; transition: width .25s ease; }

        .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start; }
        .main-card, .summary-card { padding: 20px; }
        .summary-card { position: sticky; top: 92px; }
        .summary-card h2, .checkout-final h2 { margin: 0 0 16px; }

        .item-list { display: grid; gap: 12px; }
        .cart-item { border: 1px solid rgba(0,0,0,.06); background: #fafafa; border-radius: 20px; padding: 16px; }
        .item-top { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .item-top h3 { margin: 0 0 5px; font-size: 1.02rem; }
        .item-top p { margin: 0; color: #6b7280; line-height: 1.45; font-size: .92rem; }
        .item-top strong { white-space: nowrap; }
        .option-list { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
        .option-list span { padding: 6px 9px; border-radius: 999px; background: #fff; border: 1px solid rgba(0,0,0,.06); color: #4b5563; font-size: .8rem; font-weight: 700; }
        .qty-row { margin-top: 14px; display: inline-flex; align-items: center; gap: 12px; border-radius: 999px; padding: 7px 9px; background: #fff; border: 1px solid rgba(0,0,0,.06); }
        .qty-row button { width: 32px; height: 32px; border: none; border-radius: 999px; background: #111827; color: #fff; font-weight: 900; }
        .qty-row span { min-width: 20px; text-align: center; font-weight: 900; }

        .empty-box { text-align: center; padding: 26px 10px; }
        .empty-box h2 { margin: 0 0 8px; }
        .empty-box p { margin: 0 0 18px; color: #6b7280; }

        .form-stack { display: grid; gap: 14px; }
        .choice-grid, .input-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .choice { text-align: left; border-radius: 20px; padding: 16px; background: #fafafa; border: 1px solid rgba(0,0,0,.07); color: #111827; }
        .choice.active { background: #111827; color: #fff; border-color: #111827; }
        .choice strong, .choice span { display: block; }
        .choice span { margin-top: 6px; opacity: .72; line-height: 1.45; }

        label { display: grid; gap: 8px; color: #374151; font-weight: 800; }
        input, textarea, select { width: 100%; border-radius: 16px; border: 1px solid rgba(0,0,0,.08); background: #fff; color: #111827; padding: 14px 15px; outline: none; }
        input:focus, textarea:focus, select:focus { border-color: rgba(17,24,39,.32); box-shadow: 0 0 0 4px rgba(17,24,39,.06); }
        input:disabled { background: #f3f4f6; }
        textarea { resize: vertical; }

        .message { margin: 0 0 16px; padding: 13px 14px; border-radius: 16px; line-height: 1.5; font-weight: 700; }
        .message.error { background: rgba(239,68,68,.1); color: #991b1b; border: 1px solid rgba(239,68,68,.15); }
        .message.success { background: rgba(22,163,74,.1); color: #166534; border: 1px solid rgba(22,163,74,.15); }
        .soft-note { margin: 0; padding: 13px 14px; border-radius: 16px; color: #4b5563; background: #f3f4f6; line-height: 1.5; }

        .review-box { display: grid; gap: 5px; padding: 14px 0; border-bottom: 1px solid rgba(0,0,0,.08); }
        .review-box span { color: #6b7280; font-weight: 800; font-size: .86rem; }
        .review-box strong { line-height: 1.45; }
        .review-box small { color: #4b5563; line-height: 1.45; }

        .summary-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,.08); }
        .summary-row span { color: #4b5563; }
        .summary-row.discount strong { color: #166534; }
        .summary-row.total { border-bottom: none; font-size: 1.12rem; padding-top: 16px; }
        .summary-row.total span, .summary-row.total strong { color: #111827; font-weight: 900; }

        .action-row { display: grid; gap: 10px; margin-top: 16px; }
        .primary-button, .secondary-button { border: none; border-radius: 16px; padding: 14px 16px; font-weight: 900; width: 100%; }
        .primary-button { background: #111827; color: #fff; box-shadow: 0 14px 28px rgba(17,24,39,.14); }
        .secondary-button { background: #f3f4f6; color: #111827; }

        @media (max-width: 880px) {
          .cart-container { width: min(100%, calc(100% - 18px)); }
          .cart-nav { height: 64px; }
          .cart-wrap { padding: 16px 0 34px; }
          .layout { grid-template-columns: 1fr; }
          .summary-card { position: static; order: -1; }
          .progress-card, .main-card, .summary-card { border-radius: 22px; }
          .progress-card, .main-card, .summary-card { padding: 16px; }
          .choice-grid, .input-grid { grid-template-columns: 1fr; }
          .item-top { flex-direction: column; gap: 8px; }
          .item-top strong { align-self: flex-start; }
          .plain-back { padding: 10px 12px; font-size: .92rem; }
          .brand-mini { font-size: .95rem; }
        }
      `}</style>
    </main>
  );
}
