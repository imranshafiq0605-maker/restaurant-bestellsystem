"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type Bestellart = "abholung" | "lieferung";
type CheckoutStep = "warenkorb" | "bestellung" | "zeit" | "checkout";

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

function validiereTelefonnummer(telefon: string) {
  const erlaubt = /^[\d\s()+/-]+$/;

  if (!telefon.trim()) {
    return { ok: false, message: "Bitte gib deine Telefonnummer ein." };
  }

  if (!erlaubt.test(telefon)) {
    return { ok: false, message: "Die Telefonnummer enthält ungültige Zeichen." };
  }

  const nurZiffern = telefon.replace(/\D/g, "");

  if (nurZiffern.length < 8) {
    return { ok: false, message: "Die Telefonnummer ist zu kurz." };
  }

  if (nurZiffern.length > 15) {
    return { ok: false, message: "Die Telefonnummer ist zu lang." };
  }

  return { ok: true, message: "Telefonnummer sieht gültig aus." };
}

function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) {
    return { ok: false, message: "Bitte gib deine E-Mail-Adresse ein." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailBereinigt)) {
    return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." };
  }

  return { ok: true, message: "E-Mail sieht gültig aus." };
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
    message: `Lieferung nach ${gebiet.city} (${plzBereinigt}) möglich. Mindestbestellwert: ${gebiet.minOrder.toFixed(2)} € nach Rabatt.`,
    city: gebiet.city,
    minOrder: gebiet.minOrder,
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

function istGueltigeVorbestellung(datum: string, uhrzeit: string) {
  if (!datum || !uhrzeit) {
    return { ok: false, message: "Bitte wähle Datum und Uhrzeit für die Vorbestellung." };
  }

  const slots = getAvailableTimeSlots(datum);
  if (!slots.includes(uhrzeit)) {
    return {
      ok: false,
      message: "Die gewählte Vorbestellzeit ist nicht gültig. Bitte wähle einen verfügbaren Slot.",
    };
  }

  const selected = new Date(`${datum}T${uhrzeit}:00`);
  const minAllowed = new Date(Date.now() + 60 * 60 * 1000);

  if (selected.getTime() < minAllowed.getTime()) {
    return { ok: false, message: "Vorbestellungen müssen mindestens 1 Stunde in der Zukunft liegen." };
  }

  return { ok: true, message: "Vorbestellung ist gültig." };
}

export default function WarenkorbPage() {
  const [step, setStep] = useState<CheckoutStep>("warenkorb");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [bestellart, setBestellart] = useState<Bestellart>("abholung");
  const [name, setName] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [strasse, setStrasse] = useState("");
  const [hausnummer, setHausnummer] = useState("");
  const [plz, setPlz] = useState("");
  const [stadt, setStadt] = useState("");
  const [hinweis, setHinweis] = useState("");

  const [vorbestellung, setVorbestellung] = useState<"sofort" | "spaeter">("sofort");
  const [vorbestellungDatum, setVorbestellungDatum] = useState(formatDateInput(new Date()));
  const [uhrzeit, setUhrzeit] = useState("");

  const [fehlermeldung, setFehlermeldung] = useState("");
  const [erfolgsmeldung, setErfolgsmeldung] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availablePreorderDates = useMemo(() => getAvailablePreorderDates(), []);
  const availableTimeSlots = useMemo(
    () => getAvailableTimeSlots(vorbestellungDatum),
    [vorbestellungDatum]
  );

  const status = getServiceStatus(bestellart);

  useEffect(() => {
    try {
      const gespeicherterWarenkorb = localStorage.getItem("larosa_cart");
      if (gespeicherterWarenkorb) {
        const parsed = JSON.parse(gespeicherterWarenkorb);
        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      }
    } catch (error) {
      console.error("Warenkorb konnte nicht gelesen werden:", error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("larosa_cart", JSON.stringify(cart));
  }, [cart, loaded]);

  useEffect(() => {
    if (!status.isOpen) {
      setVorbestellung("spaeter");
    }
  }, [status.isOpen]);

  useEffect(() => {
    if (bestellart !== "lieferung") {
      setStadt("");
      return;
    }

    const plzBereinigt = plz.trim();

    if (plzBereinigt.length !== 5) {
      setStadt("");
      return;
    }

    const gebiet = liefergebiete[plzBereinigt];
    setStadt(gebiet ? gebiet.city : "");
  }, [plz, bestellart]);

  useEffect(() => {
    if (vorbestellung !== "spaeter") return;

    if (availableTimeSlots.length === 0) {
      const nextDateWithSlots = availablePreorderDates.find(
        (date) => getAvailableTimeSlots(date).length > 0
      );

      if (nextDateWithSlots && nextDateWithSlots !== vorbestellungDatum) {
        setVorbestellungDatum(nextDateWithSlots);
        return;
      }
    }

    if (!availableTimeSlots.includes(uhrzeit)) {
      setUhrzeit(availableTimeSlots[0] || "");
    }
  }, [vorbestellung, availableTimeSlots, uhrzeit, availablePreorderDates, vorbestellungDatum]);

  const gesamtpreisProdukte = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const rabattBetrag = useMemo(() => gesamtpreisProdukte * 0.1, [gesamtpreisProdukte]);

  const zwischensummeNachRabatt = useMemo(() => {
    return Math.max(gesamtpreisProdukte - rabattBetrag, 0);
  }, [gesamtpreisProdukte, rabattBetrag]);

  const gesamtAnzahl = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const lieferPruefung = useMemo(() => {
    if (bestellart !== "lieferung") return null;
    if (!plz.trim()) return null;
    return pruefeLiefergebiet(plz);
  }, [bestellart, plz]);

  const gesamtpreis = zwischensummeNachRabatt;

  const zusammengesetzteAdresse = useMemo(() => {
    if (!strasse && !hausnummer && !plz && !stadt) return "";
    return `${strasse.trim()} ${hausnummer.trim()}, ${plz.trim()} ${stadt.trim()}`.trim();
  }, [strasse, hausnummer, plz, stadt]);

  function increaseQuantity(uniqueKey: string) {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.uniqueKey === uniqueKey ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  }

  function decreaseQuantity(uniqueKey: string) {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.uniqueKey === uniqueKey ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeItem(uniqueKey: string) {
    setCart((prevCart) => prevCart.filter((item) => item.uniqueKey !== uniqueKey));
  }

  function goToStep(nextStep: CheckoutStep) {
    setFehlermeldung("");
    setErfolgsmeldung("");
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateCartStep() {
    if (cart.length === 0) {
      setFehlermeldung("Dein Warenkorb ist leer. Bitte füge zuerst Produkte hinzu.");
      return false;
    }
    return true;
  }

  function validateBestellungStep() {
    setFehlermeldung("");

    if (!name.trim()) {
      setFehlermeldung("Bitte gib deinen Namen ein.");
      return false;
    }

    const telefonValidierung = validiereTelefonnummer(telefon);
    if (!telefonValidierung.ok) {
      setFehlermeldung(telefonValidierung.message);
      return false;
    }

    const emailValidierung = validiereEmail(email);
    if (!emailValidierung.ok) {
      setFehlermeldung(emailValidierung.message);
      return false;
    }

    if (bestellart === "lieferung") {
      if (!strasse.trim()) {
        setFehlermeldung("Bitte gib deine Straße ein.");
        return false;
      }

      if (!hausnummer.trim()) {
        setFehlermeldung("Bitte gib deine Hausnummer ein.");
        return false;
      }

      if (!plz.trim()) {
        setFehlermeldung("Bitte gib deine Postleitzahl ein.");
        return false;
      }

      const gebiet = pruefeLiefergebiet(plz);
      if (!gebiet.ok) {
        setFehlermeldung(gebiet.message);
        return false;
      }

      if (!stadt.trim()) {
        setFehlermeldung("Für diese Postleitzahl konnten wir keine belieferbare Stadt finden.");
        return false;
      }

      if (zwischensummeNachRabatt < gebiet.minOrder!) {
        setFehlermeldung(
          `Für ${gebiet.city} (${plz.trim()}) gilt ein Mindestbestellwert von ${formatEuro(gebiet.minOrder!)} nach Rabatt.`
        );
        return false;
      }
    }

    return true;
  }

  function validateZeitStep() {
    setFehlermeldung("");

    if (!status.isOpen && vorbestellung === "sofort") {
      setFehlermeldung("Aktuell geschlossen. Bitte wähle eine Vorbestellung.");
      return false;
    }

    if (vorbestellung === "spaeter") {
      const pruefung = istGueltigeVorbestellung(vorbestellungDatum, uhrzeit);
      if (!pruefung.ok) {
        setFehlermeldung(pruefung.message);
        return false;
      }
    }

    return true;
  }

  function nextFromCart() {
    if (!validateCartStep()) return;
    goToStep("bestellung");
  }

  function nextFromBestellung() {
    if (!validateBestellungStep()) return;
    goToStep("zeit");
  }

  function nextFromZeit() {
    if (!validateZeitStep()) return;
    goToStep("checkout");
  }

  async function handleStripeCheckout() {
    setFehlermeldung("");
    setErfolgsmeldung("");

    if (MANUAL_CHECKOUT_BLOCKED) {
      setFehlermeldung(MANUAL_NOTICE_TEXT || "Bestellungen sind aktuell nicht möglich.");
      return;
    }

    if (!validateCartStep()) return;
    if (!validateBestellungStep()) return;
    if (!validateZeitStep()) return;

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

  return (
    <main className="cart-page-shell">
      <header className="premium-header">
        <div className="container nav-inner">
          <button className="brand-box brand-button" onClick={() => (window.location.href = "/")} type="button">
            <img src="/images/logo.jpg" alt="La Rosa Logo" className="logo-img" />
            <div className="brand-text">
              <h1 className="brand-title">La Rosa GmbH</h1>
            </div>
            <img src="/images/halal.png" alt="Halal" className="header-halal-badge" />
          </button>

          <button className="back-button" onClick={() => (window.location.href = "/")} type="button">
            ← Zurück zur Speisekarte
          </button>
        </div>
      </header>

      <section className="container cart-section">
        <div className="checkout-clean-topbar">
          <div>
            <span className="eyebrow">Warenkorb</span>
            <h2 className="section-title">Deine Bestellung</h2>
          </div>
        </div>

        <div className="stepper-card">
          <button className={`step-pill ${step === "warenkorb" ? "active" : ""}`} type="button" onClick={() => goToStep("warenkorb")}>
            <span>1</span> Warenkorb
          </button>
          <button className={`step-pill ${step === "bestellung" ? "active" : ""}`} type="button" onClick={() => validateCartStep() && goToStep("bestellung")}>
            <span>2</span> Bestellung
          </button>
          <button className={`step-pill ${step === "zeit" ? "active" : ""}`} type="button" onClick={() => validateCartStep() && validateBestellungStep() && goToStep("zeit")}>
            <span>3</span> Bestellzeit
          </button>
          <button className={`step-pill ${step === "checkout" ? "active" : ""}`} type="button" onClick={() => validateCartStep() && validateBestellungStep() && validateZeitStep() && goToStep("checkout")}>
            <span>4</span> Checkout
          </button>
        </div>

        <div className="checkout-clean-layout">
          <div className="checkout-clean-main">
            {step === "warenkorb" && (
              <div className="checkout-clean-card checkout-items-card">
                <div className="checkout-card-head">
                  <div>
                    <span className="checkout-kicker">Artikel</span>
                    <h3>Artikel im Warenkorb</h3>
                  </div>
                  <div className="checkout-head-badge">{gesamtAnzahl} Artikel</div>
                </div>

                {!loaded ? (
                  <div className="checkout-empty"><p>Warenkorb wird geladen...</p></div>
                ) : cart.length === 0 ? (
                  <div className="checkout-empty">
                    <p>Dein Warenkorb ist leer.</p>
                    <button className="checkout-button" type="button" onClick={() => (window.location.href = "/")}>Zur Speisekarte</button>
                  </div>
                ) : (
                  <div className="checkout-item-list">
                    {cart.map((item) => (
                      <div className="checkout-item-row" key={item.uniqueKey}>
                        <div className="checkout-item-left">
                          <div className="checkout-item-qty-badge">{item.quantity}x</div>

                          <div className="checkout-item-content">
                            <h4>{item.number ? `${item.number} ` : ""}{item.name}</h4>
                            <div className="checkout-item-meta">
                              {item.cuisine} · {item.category}{item.variantName ? ` · ${item.variantName}` : ""}
                            </div>

                            {item.selectedOptions && item.selectedOptions.length > 0 && (
                              <div className="checkout-option-wrap">
                                {item.selectedOptions.map((option) => (
                                  <span className="checkout-option-pill" key={option}>{option}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="checkout-item-right">
                          <div className="checkout-item-total">{formatEuro(item.price * item.quantity)}</div>
                          <div className="checkout-item-unit-price">Einzelpreis {formatEuro(item.price)}</div>

                          <div className="checkout-item-quantity-box">
                            <button onClick={() => decreaseQuantity(item.uniqueKey)} type="button">−</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => increaseQuantity(item.uniqueKey)} type="button">+</button>
                          </div>

                          <button className="remove-button" type="button" onClick={() => removeItem(item.uniqueKey)}>
                            Entfernen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fehlermeldung && <p className="message error">{fehlermeldung}</p>}

                <div className="step-actions">
                  <button className="back-button" type="button" onClick={() => (window.location.href = "/")}>Weiter einkaufen</button>
                  <button className="checkout-button" type="button" onClick={nextFromCart}>Weiter zur Bestellung</button>
                </div>
              </div>
            )}

            {step === "bestellung" && (
              <div className="checkout-clean-card">
                <div className="checkout-card-head">
                  <div>
                    <span className="checkout-kicker">Bestellung</span>
                    <h3>Lieferung oder Abholung</h3>
                  </div>
                </div>

                <div className="checkout-choice-grid">
                  <button className={`checkout-choice-card ${bestellart === "abholung" ? "active" : ""}`} onClick={() => setBestellart("abholung")} type="button">
                    <span className="checkout-choice-label">Option</span>
                    <strong>Abholung</strong>
                    <small>Du holst deine Bestellung bei uns ab.</small>
                  </button>

                  <button className={`checkout-choice-card ${bestellart === "lieferung" ? "active" : ""}`} onClick={() => setBestellart("lieferung")} type="button">
                    <span className="checkout-choice-label">Option</span>
                    <strong>Lieferung</strong>
                    <small>Wir liefern zu dir nach Hause.</small>
                  </button>
                </div>

                <div className="checkout-card-head data-head">
                  <div>
                    <span className="checkout-kicker">Kunde</span>
                    <h3>Deine Daten</h3>
                  </div>
                </div>

                <div className="checkout-form-grid">
                  <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input id="name" type="text" placeholder="Dein Name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label htmlFor="telefon">Telefonnummer</label>
                    <input id="telefon" type="text" placeholder="Deine Telefonnummer" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
                  </div>
                </div>

                <div className="checkout-form-grid one">
                  <div className="form-group">
                    <label htmlFor="email">E-Mail-Adresse</label>
                    <input id="email" type="email" placeholder="Deine E-Mail-Adresse" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </div>

                {bestellart === "lieferung" && (
                  <>
                    <div className="checkout-form-grid">
                      <div className="form-group">
                        <label htmlFor="strasse">Straße</label>
                        <input id="strasse" type="text" placeholder="Straße" value={strasse} onChange={(e) => setStrasse(e.target.value)} />
                      </div>

                      <div className="form-group">
                        <label htmlFor="hausnummer">Hausnummer</label>
                        <input id="hausnummer" type="text" placeholder="Hausnummer" value={hausnummer} onChange={(e) => setHausnummer(e.target.value)} />
                      </div>
                    </div>

                    <div className="checkout-form-grid">
                      <div className="form-group">
                        <label htmlFor="plz">Postleitzahl</label>
                        <input id="plz" type="text" inputMode="numeric" maxLength={5} placeholder="PLZ" value={plz} onChange={(e) => setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))} />
                      </div>

                      <div className="form-group">
                        <label htmlFor="stadt">Stadt</label>
                        <input id="stadt" type="text" placeholder="Wird automatisch ausgefüllt" value={stadt} readOnly disabled />
                      </div>
                    </div>

                    {lieferPruefung && (
                      <p className={`message ${lieferPruefung.ok ? "success" : "error"}`}>{lieferPruefung.message}</p>
                    )}
                  </>
                )}

                <div className="form-group">
                  <label htmlFor="hinweis">Hinweis zur Bestellung</label>
                  <textarea id="hinweis" placeholder="Zum Beispiel: ohne Zwiebeln, bitte anrufen, Klingel defekt ..." value={hinweis} onChange={(e) => setHinweis(e.target.value)} rows={4} />
                </div>

                {fehlermeldung && <p className="message error">{fehlermeldung}</p>}

                <div className="step-actions">
                  <button className="back-button" type="button" onClick={() => goToStep("warenkorb")}>Zurück</button>
                  <button className="checkout-button" type="button" onClick={nextFromBestellung}>Weiter zur Bestellzeit</button>
                </div>
              </div>
            )}

            {step === "zeit" && (
              <div className="checkout-clean-card">
                <div className="checkout-card-head">
                  <div>
                    <span className="checkout-kicker">Zeit</span>
                    <h3>Bestellzeit</h3>
                  </div>
                </div>

                <div className="checkout-choice-grid">
                  <button className={`checkout-choice-card ${vorbestellung === "sofort" ? "active" : ""}`} onClick={() => setVorbestellung("sofort")} type="button" disabled={!status.isOpen || MANUAL_CHECKOUT_BLOCKED}>
                    <span className="checkout-choice-label">Auswahl</span>
                    <strong>Sofort</strong>
                    <small>{status.isOpen ? "Direkt so schnell wie möglich" : "Aktuell nicht verfügbar"}</small>
                  </button>

                  <button className={`checkout-choice-card ${vorbestellung === "spaeter" ? "active" : ""}`} onClick={() => setVorbestellung("spaeter")} type="button" disabled={MANUAL_CHECKOUT_BLOCKED}>
                    <span className="checkout-choice-label">Auswahl</span>
                    <strong>Vorbestellung</strong>
                    <small>Datum und Uhrzeit selbst wählen</small>
                  </button>
                </div>

                {!status.isOpen && <p className="message error">Aktuell geschlossen. Sofort-Bestellung ist deaktiviert.</p>}

                {vorbestellung === "spaeter" && (
                  <div className="checkout-form-grid preorder-clean-grid">
                    <div className="form-group">
                      <label htmlFor="vorbestellungDatum">Datum</label>
                      <select id="vorbestellungDatum" value={vorbestellungDatum} onChange={(e) => setVorbestellungDatum(e.target.value)}>
                        {availablePreorderDates.map((date) => (
                          <option key={date} value={date}>{formatDateLabel(date)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="uhrzeit">Uhrzeit</label>
                      <select id="uhrzeit" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)}>
                        {availableTimeSlots.length > 0 ? (
                          availableTimeSlots.map((slot) => <option key={slot} value={slot}>{slot} Uhr</option>)
                        ) : (
                          <option value="">Keine Uhrzeiten verfügbar</option>
                        )}
                      </select>
                    </div>

                    <div className="checkout-note-box">
                      {(() => {
                        const { isWeekend } = getPreorderWindowForDate(vorbestellungDatum);
                        return isWeekend ? "Vorbestellungen am Wochenende: 15:00 bis 22:00 Uhr." : "Vorbestellungen Montag bis Freitag: 12:00 bis 22:00 Uhr.";
                      })()}
                    </div>

                    <div className="checkout-note-box muted">Vorbestellungen werden nur angezeigt, wenn sie mindestens 1 Stunde in der Zukunft liegen.</div>
                  </div>
                )}

                {fehlermeldung && <p className="message error">{fehlermeldung}</p>}

                <div className="step-actions">
                  <button className="back-button" type="button" onClick={() => goToStep("bestellung")}>Zurück</button>
                  <button className="checkout-button" type="button" onClick={nextFromZeit}>Weiter zum Checkout</button>
                </div>
              </div>
            )}

            {step === "checkout" && (
              <div className="checkout-clean-card">
                <div className="checkout-card-head">
                  <div>
                    <span className="checkout-kicker">Checkout</span>
                    <h3>Zusammenfassung prüfen</h3>
                  </div>
                </div>

                <div className="final-summary-grid">
                  <div className="final-box">
                    <span>Bestellart</span>
                    <strong>{bestellart === "lieferung" ? "Lieferung" : "Abholung"}</strong>
                    {bestellart === "lieferung" && <p>{zusammengesetzteAdresse}</p>}
                  </div>

                  <div className="final-box">
                    <span>Kundendaten</span>
                    <strong>{name || "-"}</strong>
                    <p>{telefon || "-"}<br />{email || "-"}</p>
                  </div>

                  <div className="final-box">
                    <span>Bestellzeit</span>
                    <strong>{vorbestellung === "sofort" ? "Sofort" : "Vorbestellung"}</strong>
                    {vorbestellung === "spaeter" && <p>{formatDateLabel(vorbestellungDatum)} · {uhrzeit || "--:--"} Uhr</p>}
                  </div>

                  {hinweis.trim() && (
                    <div className="final-box">
                      <span>Hinweis</span>
                      <p>{hinweis}</p>
                    </div>
                  )}
                </div>

                {fehlermeldung && <p className="message error">{fehlermeldung}</p>}
                {erfolgsmeldung && <p className="message success">{erfolgsmeldung}</p>}

                <div className="step-actions">
                  <button className="back-button" type="button" onClick={() => goToStep("zeit")}>Zurück</button>
                  <button className="checkout-button" onClick={handleStripeCheckout} type="button" disabled={isSubmitting || MANUAL_CHECKOUT_BLOCKED}>
                    {isSubmitting ? "Wird gesendet..." : MANUAL_CHECKOUT_BLOCKED ? "Aktuell nicht bestellbar" : "Jetzt sicher bezahlen"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="checkout-clean-sidebar">
            <div className="checkout-summary-card">
              <div className="checkout-card-head">
                <div>
                  <span className="checkout-kicker">Übersicht</span>
                  <h3>Zusammenfassung</h3>
                </div>
              </div>

              <div className="checkout-summary-rows">
                <div className="checkout-summary-row"><span>Artikel</span><span>{gesamtAnzahl}</span></div>
                <div className="checkout-summary-row"><span>Zwischensumme</span><span>{formatEuro(gesamtpreisProdukte)}</span></div>
                <div className="checkout-summary-row discount"><span>10% Rabatt</span><span>-{formatEuro(rabattBetrag)}</span></div>

                {bestellart === "lieferung" && lieferPruefung?.minOrder ? (
                  <div className="checkout-summary-row"><span>Mindestbestellwert</span><span>{formatEuro(lieferPruefung.minOrder)}</span></div>
                ) : null}

                <div className="checkout-summary-row"><span>Versand</span><span>Kostenlos</span></div>
                <div className="checkout-summary-row total"><span>Gesamt</span><span>{formatEuro(gesamtpreis)}</span></div>
              </div>

              <div className="checkout-summary-extra">
                <span>Aktueller Schritt</span>
                <strong>
                  {step === "warenkorb" && "Warenkorb bearbeiten"}
                  {step === "bestellung" && "Bestelldaten eingeben"}
                  {step === "zeit" && "Bestellzeit wählen"}
                  {step === "checkout" && "Bezahlen"}
                </strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
          margin: 0;
          background: radial-gradient(circle at top left, rgba(60, 60, 60, 0.04), transparent 24%), linear-gradient(180deg, #fcfcfd 0%, #f6f7f9 100%);
          color: #101214;
          font-family: Inter, Arial, sans-serif;
        }
        button, input, textarea, select { font: inherit; }
        select { appearance: none; }
        .cart-page-shell { min-height: 100vh; position: relative; overflow-x: hidden; }
        .container { width: min(1220px, calc(100% - 32px)); margin: 0 auto; }
        .premium-header { position: sticky; top: 0; z-index: 80; backdrop-filter: blur(18px); background: rgba(255, 255, 255, 0.86); border-bottom: 1px solid rgba(0, 0, 0, 0.05); }
        .nav-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 78px; padding: 10px 0; }
        .brand-box { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
        .brand-button { border: none; background: transparent; cursor: pointer; text-align: left; padding: 0; }
        .logo-img { width: 52px; height: 52px; border-radius: 16px; object-fit: cover; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.06); background: white; flex-shrink: 0; }
        .brand-title { margin: 0; font-size: 1.08rem; font-weight: 800; letter-spacing: 0.01em; color: #111827; }
        .header-halal-badge { width: 38px; height: 38px; object-fit: contain; }
        .cart-section { padding: 42px 0 82px; }
        .checkout-clean-topbar { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 20px; }
        .eyebrow { display: inline-block; color: #6b7280; text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.75rem; font-weight: 800; margin-bottom: 8px; }
        .section-title { margin: 0; font-size: clamp(1.75rem, 3vw, 2.8rem); font-weight: 900; letter-spacing: -0.04em; color: #111827; }
        .back-button { border: none; border-radius: 15px; padding: 13px 16px; font-weight: 800; cursor: pointer; transition: transform 0.2s ease, opacity 0.2s ease; background: rgba(255, 255, 255, 0.94); color: #374151; border: 1px solid rgba(0, 0, 0, 0.06); }
        .back-button:hover { transform: translateY(-2px); }
        .checkout-button { position: relative; overflow: hidden; border: none; border-radius: 16px; padding: 14px 18px; background: #111827; color: #fff; font-weight: 800; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease; box-shadow: 0 14px 30px rgba(17, 24, 39, 0.14); }
        .checkout-button:hover { transform: translateY(-2px); box-shadow: 0 18px 34px rgba(17, 24, 39, 0.18); }
        .checkout-button:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .stepper-card { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
        .step-pill { border: 1px solid rgba(0,0,0,0.06); background: rgba(255,255,255,0.95); color: #374151; border-radius: 18px; padding: 13px 14px; font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .step-pill span { width: 26px; height: 26px; border-radius: 999px; background: #f3f4f6; display: inline-flex; align-items: center; justify-content: center; }
        .step-pill.active { background: #111827; color: white; }
        .step-pill.active span { background: rgba(255,255,255,0.18); color: white; }
        .checkout-clean-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) 390px; gap: 22px; align-items: start; }
        .checkout-clean-main { display: grid; gap: 18px; }
        .checkout-clean-sidebar { position: sticky; top: 104px; }
        .checkout-clean-card, .checkout-summary-card { background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98)); border: 1px solid rgba(0,0,0,0.05); border-radius: 24px; box-shadow: 0 14px 32px rgba(0,0,0,0.05); padding: 22px; }
        .checkout-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
        .checkout-card-head h3 { margin: 0; color: #111827; font-size: 1.35rem; }
        .checkout-kicker { display: inline-block; color: #6b7280; text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.72rem; font-weight: 800; margin-bottom: 7px; }
        .checkout-head-badge { background: #111827; color: white; padding: 9px 12px; border-radius: 999px; font-weight: 900; }
        .checkout-empty { padding: 26px; border-radius: 18px; background: rgba(255,255,255,0.82); color: #6b7280; display: grid; gap: 14px; }
        .checkout-item-list { display: grid; gap: 14px; }
        .checkout-item-row { display: flex; justify-content: space-between; gap: 18px; padding: 16px; border-radius: 20px; background: rgba(255,255,255,0.9); border: 1px solid rgba(0,0,0,0.05); }
        .checkout-item-left { display: flex; gap: 14px; min-width: 0; }
        .checkout-item-qty-badge { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 999px; background: #111827; color: white; display: flex; align-items: center; justify-content: center; font-weight: 900; }
        .checkout-item-content h4 { margin: 0; color: #111827; }
        .checkout-item-meta { margin-top: 6px; color: #6b7280; line-height: 1.5; }
        .checkout-option-wrap { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .checkout-option-pill { padding: 7px 10px; border-radius: 999px; background: #f3f4f6; color: #374151; font-size: 0.78rem; font-weight: 700; }
        .checkout-item-right { display: grid; justify-items: end; gap: 8px; min-width: 150px; }
        .checkout-item-total { font-weight: 900; color: #111827; font-size: 1.05rem; }
        .checkout-item-unit-price { color: #6b7280; font-size: 0.86rem; }
        .checkout-item-quantity-box { display: inline-flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.96); border-radius: 999px; padding: 8px 12px; border: 1px solid rgba(0,0,0,0.06); }
        .checkout-item-quantity-box button { width: 34px; height: 34px; border: none; border-radius: 999px; background: #111827; color: white; cursor: pointer; font-size: 1.05rem; }
        .remove-button { border: none; background: transparent; color: #991b1b; font-weight: 800; cursor: pointer; padding: 4px; }
        .checkout-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .checkout-choice-card { text-align: left; border: 1px solid rgba(0,0,0,0.06); background: rgba(255,255,255,0.94); color: #374151; border-radius: 20px; padding: 18px; cursor: pointer; display: grid; gap: 8px; }
        .checkout-choice-card.active { background: #111827; color: white; border-color: transparent; }
        .checkout-choice-card:disabled { opacity: 0.55; cursor: not-allowed; }
        .checkout-choice-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 900; opacity: 0.7; }
        .checkout-choice-card strong { font-size: 1.2rem; }
        .checkout-choice-card small { line-height: 1.5; opacity: 0.85; }
        .data-head { margin-top: 24px; }
        .checkout-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .checkout-form-grid.one { grid-template-columns: 1fr; }
        .form-group { display: grid; gap: 8px; margin-top: 14px; }
        .form-group label { color: #374151; font-weight: 700; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; border-radius: 15px; border: 1px solid rgba(0,0,0,0.06); background: rgba(255,255,255,0.98); color: #111827; padding: 14px 15px; outline: none; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: rgba(17,24,39,0.18); box-shadow: 0 0 0 4px rgba(17,24,39,0.05); }
        .form-group input::placeholder, .form-group textarea::placeholder { color: #9ca3af; }
        .form-group input:disabled { opacity: 0.82; }
        .preorder-clean-grid { margin-top: 14px; }
        .checkout-note-box { grid-column: 1 / -1; padding: 14px 15px; border-radius: 15px; background: rgba(255,255,255,0.76); color: #374151; line-height: 1.6; border: 1px solid rgba(0,0,0,0.05); }
        .checkout-note-box.muted { color: #6b7280; }
        .checkout-summary-rows { display: grid; }
        .checkout-summary-row { display: flex; justify-content: space-between; gap: 14px; padding: 13px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
        .checkout-summary-row.discount span:last-child { color: #166534; font-weight: 800; }
        .checkout-summary-row.total { font-size: 1.08rem; font-weight: 900; border-bottom: none; padding-bottom: 0; }
        .checkout-summary-extra { margin-top: 18px; padding: 15px; border-radius: 18px; background: rgba(255,255,255,0.86); border: 1px solid rgba(0,0,0,0.05); }
        .checkout-summary-extra span { display: block; color: #6b7280; margin-bottom: 6px; }
        .checkout-summary-extra strong { color: #111827; line-height: 1.6; }
        .message { margin-top: 16px; padding: 14px 15px; border-radius: 15px; line-height: 1.6; }
        .message.error { background: rgba(239,68,68,0.1); color: #991b1b; border: 1px solid rgba(239,68,68,0.12); }
        .message.success { background: rgba(22,163,74,0.1); color: #166534; border: 1px solid rgba(22,163,74,0.12); }
        .step-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 20px; }
        .final-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .final-box { padding: 16px; border-radius: 18px; background: rgba(255,255,255,0.86); border: 1px solid rgba(0,0,0,0.05); }
        .final-box span { display: block; color: #6b7280; font-size: 0.86rem; margin-bottom: 6px; }
        .final-box strong { color: #111827; }
        .final-box p { margin: 8px 0 0; color: #4b5563; line-height: 1.6; }
        @media (max-width: 1100px) { .checkout-clean-layout { grid-template-columns: 1fr; } .checkout-clean-sidebar { position: static; order: -1; } }
        @media (max-width: 760px) {
          .container { width: min(100%, calc(100% - 18px)); }
          .nav-inner { min-height: 72px; gap: 10px; }
          .logo-img { width: 44px; height: 44px; border-radius: 14px; }
          .brand-title { font-size: 0.98rem; }
          .header-halal-badge { width: 32px; height: 32px; }
          .cart-section { padding: 24px 0 64px; }
          .checkout-clean-topbar, .checkout-item-row, .step-actions { flex-direction: column; align-items: stretch; }
          .stepper-card { grid-template-columns: 1fr 1fr; }
          .checkout-choice-grid, .checkout-form-grid, .final-summary-grid { grid-template-columns: 1fr; }
          .checkout-clean-card, .checkout-summary-card { padding: 18px; border-radius: 22px; }
          .checkout-item-right { justify-items: start; min-width: 0; }
        }
      `}</style>
    </main>
  );
}
