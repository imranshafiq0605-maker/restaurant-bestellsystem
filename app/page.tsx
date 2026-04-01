"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import {
  kategorienMap,
  produkte,
  type Cuisine,
  type Product,
} from "./data/menu";
import { db } from "./lib/firebase";

type Bestellart = "abholung" | "lieferung";
type ViewStep = "kitchens" | "categories" | "products" | "checkout";

type CartItem = {
  id: number;
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

const offerSlides = [
  {
    title: "Immer 10% Rabatt auf jede Bestellung",
    text: "Premium Genuss, starke Preise und ein Bestellerlebnis auf höchstem Niveau.",
    image: "/Images/offer-1.jpg",
  },
  {
    title: "Versand immer kostenlos",
    text: "Keine Liefergebühr, keine Überraschungen. Du zahlst nur dein Essen.",
    image: "/Images/offer-2.jpg",
  },
  {
    title: "Italienisch, Indisch & Getränke",
    text: "Wähle deine Küche, entdecke Kategorien und bestelle stilvoll in wenigen Klicks.",
    image: "/Images/offer-3.jpg",
  },
];

const cuisineCards: {
  cuisine: Cuisine;
  title: string;
  text: string;
  image: string;
}[] = [
  {
    cuisine: "Italienisch",
    title: "Italienische Küche",
    text: "Pizza, Pasta, Salate, Schnitzel, Fisch, Desserts und mehr.",
    image: "/Images/cuisine-italienisch.jpg",
  },
  {
    cuisine: "Indisch",
    title: "Indische Küche",
    text: "Vorspeisen, Brote, Currys, Reisgerichte und vegetarische Spezialitäten.",
    image: "/Images/cuisine-indisch.jpg",
  },
  {
    cuisine: "Getränke",
    title: "Getränke",
    text: "Softdrinks, Wasser, Ayran und weitere perfekt passende Begleiter.",
    image: "/Images/cuisine-getraenke.jpg",
  },
];

function getServiceStatus(bestellart: Bestellart) {
  const jetzt = new Date();
  const tag = jetzt.getDay();
  const minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const istWochenende = tag === 0 || tag === 6;

  const offenAb = istWochenende ? 14 * 60 : 11 * 60;
  const offenBis = bestellart === "abholung" ? 23 * 60 : 22 * 60 + 30;

  return {
    isOpen: minuten >= offenAb && minuten <= offenBis,
    openFrom: istWochenende ? "14:00" : "11:00",
    openUntil: bestellart === "abholung" ? "23:00" : "22:30",
  };
}

function getJetztStatusText(bestellart: Bestellart) {
  const status = getServiceStatus(bestellart);
  return status.isOpen
    ? bestellart === "abholung"
      ? "Abholung ist aktuell geöffnet"
      : "Lieferung ist aktuell geöffnet"
    : bestellart === "abholung"
    ? "Abholung ist aktuell geschlossen"
    : "Lieferung ist aktuell geschlossen";
}

function validiereTelefonnummer(telefon: string) {
  const erlaubt = /^[\d\s()+/-]+$/;

  if (!telefon.trim()) {
    return {
      ok: false,
      message: "Bitte gib deine Telefonnummer ein.",
    };
  }

  if (!erlaubt.test(telefon)) {
    return {
      ok: false,
      message: "Die Telefonnummer enthält ungültige Zeichen.",
    };
  }

  const nurZiffern = telefon.replace(/\D/g, "");

  if (nurZiffern.length < 8) {
    return {
      ok: false,
      message: "Die Telefonnummer ist zu kurz.",
    };
  }

  if (nurZiffern.length > 15) {
    return {
      ok: false,
      message: "Die Telefonnummer ist zu lang.",
    };
  }

  return {
    ok: true,
    message: "Telefonnummer sieht gültig aus.",
  };
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
    message: `Lieferung nach ${gebiet.city} (${plzBereinigt}) möglich. Mindestbestellwert: ${gebiet.minOrder.toFixed(
      2
    )} €.`,
    city: gebiet.city,
    minOrder: gebiet.minOrder,
  };
}

function getProductBasePrice(produkt: Product) {
  if (typeof produkt.price === "number") return produkt.price;
  if (produkt.variants?.length) return produkt.variants[0].price;
  if (produkt.options?.length) {
    const firstGroup = produkt.options[0];
    if (firstGroup.items.length) return firstGroup.items[0].price;
  }
  return 0;
}

function getMinVorbestellzeit() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 60);

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function istVorbestellungMindestensEineStundeSpaeter(uhrzeit: string) {
  if (!uhrzeit) return false;

  const now = new Date();
  const [hours, minutes] = uhrzeit.split(":").map(Number);

  const selected = new Date();
  selected.setHours(hours, minutes, 0, 0);

  return selected.getTime() - now.getTime() >= 60 * 60 * 1000;
}

export default function HomePage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [bestellart, setBestellart] = useState<Bestellart>("abholung");
  const [name, setName] = useState("");
  const [telefon, setTelefon] = useState("");
  const [strasse, setStrasse] = useState("");
  const [hausnummer, setHausnummer] = useState("");
  const [plz, setPlz] = useState("");
  const [stadt, setStadt] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [vorbestellung, setVorbestellung] = useState("sofort");
  const [uhrzeit, setUhrzeit] = useState("");
  const [fehlermeldung, setFehlermeldung] = useState("");
  const [erfolgsmeldung, setErfolgsmeldung] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [viewStep, setViewStep] = useState<ViewStep>("kitchens");
  const [activeCuisine, setActiveCuisine] = useState<Cuisine | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartPulse, setCartPulse] = useState(false);
  const [showAddedEffect, setShowAddedEffect] = useState(false);
  const [addedProductName, setAddedProductName] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantName, setSelectedVariantName] = useState("");
  const [selectedVariantPrice, setSelectedVariantPrice] = useState(0);
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, string[]>>({});
  const [selectedOptionsPriceMap, setSelectedOptionsPriceMap] = useState<
    Record<string, number[]>
  >({});
  const [modalError, setModalError] = useState("");

  const [adminClicks, setAdminClicks] = useState(0);
  const [minVorbestellzeit, setMinVorbestellzeit] = useState(getMinVorbestellzeit());
  const [activeSlide, setActiveSlide] = useState(0);

  const abholungStatus = getServiceStatus("abholung");
  const lieferStatus = getServiceStatus("lieferung");
  const status = getServiceStatus(bestellart);

  const zusammengesetzteAdresse = useMemo(() => {
    if (!strasse && !hausnummer && !plz && !stadt) return "";
    return `${strasse.trim()} ${hausnummer.trim()}, ${plz.trim()} ${stadt.trim()}`.trim();
  }, [strasse, hausnummer, plz, stadt]);

  function openCuisine(cuisine: Cuisine) {
    setActiveCuisine(cuisine);

    if (cuisine === "Getränke") {
      setActiveCategory("Getränke");
      setViewStep("products");
      return;
    }

    setActiveCategory(null);
    setViewStep("categories");
  }

  function openCategory(category: string) {
    setActiveCategory(category);
    setViewStep("products");
  }

  function backFromProducts() {
    if (activeCuisine === "Getränke") {
      setActiveCuisine(null);
      setActiveCategory(null);
      setViewStep("kitchens");
      return;
    }

    setActiveCategory(null);
    setViewStep("categories");
  }

  function backFromCategories() {
    setActiveCuisine(null);
    setActiveCategory(null);
    setViewStep("kitchens");
  }

  function openCheckout() {
    setViewStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backFromCheckout() {
    if (activeCategory) {
      setViewStep("products");
      return;
    }
    if (activeCuisine && activeCuisine !== "Getränke") {
      setViewStep("categories");
      return;
    }
    setViewStep("kitchens");
  }

  function resetModal() {
    setSelectedProduct(null);
    setSelectedVariantName("");
    setSelectedVariantPrice(0);
    setSelectedOptionsMap({});
    setSelectedOptionsPriceMap({});
    setModalError("");
  }

  function openProductModal(produkt: Product) {
    const hasVariants = !!produkt.variants?.length;
    const hasOptions = !!produkt.options?.length;

    if (!hasVariants && !hasOptions) {
      addConfiguredProductToCart({
        produkt,
        finalPrice: getProductBasePrice(produkt),
      });
      return;
    }

    setSelectedProduct(produkt);
    setModalError("");

    if (produkt.variants?.length) {
      setSelectedVariantName(produkt.variants[0].name);
      setSelectedVariantPrice(produkt.variants[0].price);
    } else {
      setSelectedVariantName("");
      setSelectedVariantPrice(typeof produkt.price === "number" ? produkt.price : 0);
    }

    const initialOptions: Record<string, string[]> = {};
    const initialOptionPrices: Record<string, number[]> = {};

    produkt.options?.forEach((group) => {
      if (group.required && group.items.length > 0) {
        initialOptions[group.group] = [group.items[0].name];
        initialOptionPrices[group.group] = [group.items[0].price];
      } else {
        initialOptions[group.group] = [];
        initialOptionPrices[group.group] = [];
      }
    });

    setSelectedOptionsMap(initialOptions);
    setSelectedOptionsPriceMap(initialOptionPrices);
  }

  function handleVariantSelect(name: string, price: number) {
    setSelectedVariantName(name);
    setSelectedVariantPrice(price);
  }

  function handleOptionChange(
    groupName: string,
    itemName: string,
    itemPrice: number,
    multiple?: boolean
  ) {
    setSelectedOptionsMap((prev) => {
      const current = prev[groupName] || [];

      if (multiple) {
        const exists = current.includes(itemName);
        return {
          ...prev,
          [groupName]: exists
            ? current.filter((item) => item !== itemName)
            : [...current, itemName],
        };
      }

      return {
        ...prev,
        [groupName]: [itemName],
      };
    });

    setSelectedOptionsPriceMap((prev) => {
      const currentNames = selectedOptionsMap[groupName] || [];
      const currentPrices = prev[groupName] || [];

      if (multiple) {
        const index = currentNames.indexOf(itemName);
        const exists = index !== -1;

        return {
          ...prev,
          [groupName]: exists
            ? currentPrices.filter((_, i) => i !== index)
            : [...currentPrices, itemPrice],
        };
      }

      return {
        ...prev,
        [groupName]: [itemPrice],
      };
    });
  }

  const modalTotalPrice = useMemo(() => {
    if (!selectedProduct) return 0;

    let total = 0;

    if (selectedProduct.variants?.length) {
      total += selectedVariantPrice;
    } else if (typeof selectedProduct.price === "number") {
      total += selectedProduct.price;
    }

    Object.values(selectedOptionsPriceMap).forEach((prices) => {
      prices.forEach((price) => {
        total += price;
      });
    });

    return total;
  }, [selectedProduct, selectedVariantPrice, selectedOptionsPriceMap]);

  function addConfiguredProductToCart({
    produkt,
    finalPrice,
    variantName,
    selectedOptions,
  }: {
    produkt: Product;
    finalPrice: number;
    variantName?: string;
    selectedOptions?: string[];
  }) {
    const uniqueKey = `${produkt.id}-${variantName || "default"}-${
      selectedOptions?.join("|") || "no-options"
    }`;

    setCart((prevCart) => {
      const found = prevCart.find((item) => item.uniqueKey === uniqueKey);

      if (found) {
        return prevCart.map((item) =>
          item.uniqueKey === uniqueKey
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...prevCart,
        {
          id: produkt.id,
          name: produkt.name,
          price: finalPrice,
          quantity: 1,
          category: produkt.category,
          cuisine: produkt.cuisine,
          variantName,
          selectedOptions,
          uniqueKey,
        },
      ];
    });

    setAddedProductName(produkt.name);
    setShowAddedEffect(true);
    setCartPulse(true);

    setTimeout(() => setCartPulse(false), 600);
    setTimeout(() => setShowAddedEffect(false), 1800);
  }

  function confirmModalSelection() {
    if (!selectedProduct) return;

    if (selectedProduct.variants?.length && !selectedVariantName) {
      setModalError("Bitte wähle eine Variante aus.");
      return;
    }

    if (selectedProduct.options?.length) {
      for (const optionGroup of selectedProduct.options) {
        if (optionGroup.required) {
          const selected = selectedOptionsMap[optionGroup.group] || [];
          if (selected.length === 0) {
            setModalError(`Bitte wähle etwas bei "${optionGroup.group}" aus.`);
            return;
          }
        }
      }
    }

    const selectedOptions = Object.entries(selectedOptionsMap).flatMap(([group, items]) =>
      items.map((item) => `${group}: ${item}`)
    );

    addConfiguredProductToCart({
      produkt: selectedProduct,
      finalPrice: modalTotalPrice,
      variantName: selectedVariantName || undefined,
      selectedOptions,
    });

    resetModal();
  }

  function increaseQuantity(uniqueKey: string) {
    setCart((prevCart) =>
      prevCart.map((item) =>
        item.uniqueKey === uniqueKey
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  function decreaseQuantity(uniqueKey: string) {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.uniqueKey === uniqueKey
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const gesamtpreisProdukte = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const rabattBetrag = useMemo(() => {
    return gesamtpreisProdukte * 0.1;
  }, [gesamtpreisProdukte]);

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

  const finaleLiefergebuehr = 0;
  const gesamtpreis = zwischensummeNachRabatt + finaleLiefergebuehr;

  const activeProducts = useMemo(() => {
    if (!activeCuisine || !activeCategory) return [];
    return produkte.filter(
      (produkt) =>
        produkt.cuisine === activeCuisine && produkt.category === activeCategory
    );
  }, [activeCuisine, activeCategory]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinVorbestellzeit(getMinVorbestellzeit());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!status.isOpen) {
      setVorbestellung("spaeter");
    }
  }, [status.isOpen]);

  useEffect(() => {
    if (adminClicks >= 5) {
      setAdminClicks(0);
      window.location.href = "/admin";
    }
  }, [adminClicks]);

  useEffect(() => {
    const slideInterval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % offerSlides.length);
    }, 4500);

    return () => clearInterval(slideInterval);
  }, []);

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

  async function handleStripeCheckout() {
    setFehlermeldung("");
    setErfolgsmeldung("");

    if (cart.length === 0) {
      setFehlermeldung("Bitte füge zuerst Produkte zum Warenkorb hinzu.");
      return;
    }

    if (!name.trim()) {
      setFehlermeldung("Bitte gib deinen Namen ein.");
      return;
    }

    const telefonValidierung = validiereTelefonnummer(telefon);
    if (!telefonValidierung.ok) {
      setFehlermeldung(telefonValidierung.message);
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

      if (!stadt.trim()) {
        setFehlermeldung(
          "Für diese Postleitzahl konnten wir keine belieferbare Stadt finden."
        );
        return;
      }

      const gebiet = pruefeLiefergebiet(plz);
      if (!gebiet.ok) {
        setFehlermeldung(gebiet.message);
        return;
      }

      if (zwischensummeNachRabatt < gebiet.minOrder!) {
        setFehlermeldung(
          `Für ${gebiet.city} (${plz.trim()}) gilt ein Mindestbestellwert von ${gebiet.minOrder!.toFixed(
            2
          )} € nach Rabatt.`
        );
        return;
      }
    }

    if (!status.isOpen && vorbestellung === "sofort") {
      setFehlermeldung("Aktuell geschlossen. Bitte wähle eine Vorbestellung.");
      return;
    }

    if (vorbestellung === "spaeter") {
      if (!uhrzeit.trim()) {
        setFehlermeldung("Bitte wähle eine Uhrzeit für die Vorbestellung.");
        return;
      }

      if (!istVorbestellungMindestensEineStundeSpaeter(uhrzeit)) {
        setFehlermeldung(
          "Vorbestellungen müssen mindestens 1 Stunde in der Zukunft liegen."
        );
        return;
      }
    }

    const artikelOhneUndefined = cart.map((item) => ({
      id: item.id,
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
          name,
          telefon,
          adresse:
            bestellart === "lieferung" ? zusammengesetzteAdresse : "Abholung",
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
        hinweis,
        vorbestellung,
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

      const pendingOrderRef = await addDoc(
        collection(db, "pendingOrders"),
        pendingBestellung
      );

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pendingOrderId: pendingOrderRef.id,
          artikel: artikelOhneUndefined,
          gesamtpreis,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFehlermeldung(
          data.error || "Stripe Checkout konnte nicht gestartet werden."
        );
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setFehlermeldung("Keine Stripe-URL erhalten.");
    } catch (error: any) {
      console.error("Fehler bei pending order oder Stripe:", error);
      setFehlermeldung(
        error?.message || "Bestellung konnte nicht verarbeitet werden."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <main className="page-shell">
        <header className="premium-header">
          <div className="container nav-inner">
            <div className="brand-box">
              <img src="/Images/logo.jpg" alt="La Rosa Logo" className="logo-img" />
              <div>
                <h1 className="brand-title">La Rosa</h1>
                <p className="brand-subtitle">Premium Bestellsystem</p>
              </div>
            </div>

            <div className="nav-right">
              <div className="promo-pill gold">10% Rabatt auf alles</div>
              <div className="promo-pill dark">Versand kostenlos</div>
              <button
                className={`cart-button ${cartPulse ? "pulse" : ""}`}
                onClick={openCheckout}
                type="button"
              >
                Warenkorb
                <span className="cart-count">{gesamtAnzahl}</span>
              </button>
            </div>
          </div>
        </header>

        {showAddedEffect && (
          <div className="added-toast">
            <div className="added-toast-glow" />
            <strong>{addedProductName}</strong>
            <span>wurde zum Warenkorb hinzugefügt</span>
          </div>
        )}

        {viewStep !== "checkout" && (
          <>
            <section
              className="hero-banner"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(7,7,10,0.28), rgba(7,7,10,0.82)), url('/Images/hero-main.jpg')",
              }}
            >
              <div className="container hero-content">
                <div className="hero-badge-row">
                  <span className="hero-chip">High End Food Ordering</span>
                  <span className="hero-chip accent">Italienisch · Indisch · Getränke</span>
                </div>

                <h2 className="hero-headline">
                  Premium Genuss. Elegante Bestellung. Ein Auftritt, der im Kopf bleibt.
                </h2>

                <p className="hero-copy">
                  Bestelle deine Lieblingsgerichte stilvoll online. Immer mit 10%
                  Rabatt und immer ohne Versandkosten.
                </p>

                <div className="hero-actions">
                  <button className="hero-cta primary" onClick={() => setViewStep("kitchens")}>
                    Jetzt bestellen
                  </button>
                  <button className="hero-cta secondary" onClick={openCheckout}>
                    Zum Warenkorb
                  </button>
                </div>

                <div className="hero-stats">
                  <div className="hero-stat-card">
                    <span>Rabatt</span>
                    <strong>10% auf jede Bestellung</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>Versand</span>
                    <strong>Immer kostenlos</strong>
                  </div>
                  <div className="hero-stat-card">
                    <span>Status</span>
                    <strong>{getJetztStatusText(bestellart)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="container section-spacing">
              <div className="section-topline">
                <div>
                  <span className="eyebrow">Angebote & Highlights</span>
                  <h3 className="section-title">Slideshow mit deinen Angeboten</h3>
                </div>
                <div className="slide-dots">
                  {offerSlides.map((_, index) => (
                    <button
                      key={index}
                      className={`slide-dot ${activeSlide === index ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                    />
                  ))}
                </div>
              </div>

              <div className="offer-slider-card">
                {offerSlides.map((slide, index) => (
                  <div
                    key={slide.title}
                    className={`offer-slide ${activeSlide === index ? "active" : ""}`}
                    style={{
                      backgroundImage: `linear-gradient(90deg, rgba(10,10,14,0.84), rgba(10,10,14,0.35)), url('${slide.image}')`,
                    }}
                  >
                    <div className="offer-slide-content">
                      <span className="offer-label">La Rosa Special</span>
                      <h4>{slide.title}</h4>
                      <p>{slide.text}</p>
                      <div className="offer-tags">
                        <span>10% Rabatt</span>
                        <span>Kostenloser Versand</span>
                        <span>Premium Design</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="container section-spacing">
              {viewStep === "kitchens" && (
                <>
                  <div className="section-topline">
                    <div>
                      <span className="eyebrow">Auswahl</span>
                      <h3 className="section-title">Küchen & Getränke</h3>
                    </div>
                    <p className="section-text">
                      Wähle deinen Bereich und gehe direkt in die passende Auswahl.
                    </p>
                  </div>

                  <div className="cuisine-grid">
                    {cuisineCards.map((card) => (
                      <button
                        key={card.cuisine}
                        className="cuisine-card"
                        onClick={() => openCuisine(card.cuisine)}
                        type="button"
                        style={{
                          backgroundImage: `linear-gradient(180deg, rgba(8,8,12,0.1), rgba(8,8,12,0.78)), url('${card.image}')`,
                        }}
                      >
                        <div className="cuisine-card-overlay" />
                        <div className="cuisine-card-content">
                          <span className="cuisine-tag">{card.cuisine}</span>
                          <h4>{card.title}</h4>
                          <p>{card.text}</p>
                          <span className="cuisine-link">
                            {card.cuisine === "Getränke"
                              ? "Direkt zu den Getränken"
                              : "Kategorie öffnen"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {viewStep === "categories" &&
                activeCuisine &&
                activeCuisine !== "Getränke" && (
                  <>
                    <div className="section-topline">
                      <div>
                        <span className="eyebrow">{activeCuisine}</span>
                        <h3 className="section-title">Kategorien</h3>
                      </div>

                      <button
                        className="back-button"
                        onClick={backFromCategories}
                        type="button"
                      >
                        ← Zurück zu Küchen
                      </button>
                    </div>

                    <div className="category-grid">
                      {kategorienMap[activeCuisine].map((kategorie) => (
                        <button
                          key={kategorie}
                          className="category-card"
                          onClick={() => openCategory(kategorie)}
                          type="button"
                        >
                          <div className="category-card-inner">
                            <span className="category-badge">{activeCuisine}</span>
                            <h4>{kategorie}</h4>
                            <p>
                              {
                                produkte.filter(
                                  (produkt) =>
                                    produkt.cuisine === activeCuisine &&
                                    produkt.category === kategorie
                                ).length
                              }{" "}
                              Artikel
                            </p>
                            <span className="category-link">Jetzt öffnen</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

              {viewStep === "products" && activeCuisine && activeCategory && (
                <>
                  <div className="section-topline">
                    <div>
                      <span className="eyebrow">{activeCuisine}</span>
                      <h3 className="section-title">{activeCategory}</h3>
                    </div>

                    <button
                      className="back-button"
                      onClick={backFromProducts}
                      type="button"
                    >
                      ← Zurück
                    </button>
                  </div>

                  <div className="products-grid">
                    {activeProducts.map((produkt) => (
                      <article className="product-card" key={produkt.id}>
                        <div className="product-card-top">
                          <div>
                            <span className="product-number">
                              {produkt.number ? `${produkt.number}` : "La Rosa"}
                            </span>
                            <h4>
                              {produkt.number ? `${produkt.number} ` : ""}
                              {produkt.name}
                            </h4>
                          </div>
                          <span className="product-price">
                            {getProductBasePrice(produkt).toFixed(2)} €
                          </span>
                        </div>

                        <p className="product-desc">{produkt.description}</p>

                        {produkt.variants && (
                          <div className="mini-chip-row">
                            {produkt.variants.map((variant) => (
                              <span className="mini-chip" key={variant.name}>
                                {variant.name}: {variant.price.toFixed(2)} €
                              </span>
                            ))}
                          </div>
                        )}

                        {produkt.options && (
                          <div className="mini-chip-row">
                            {produkt.options.map((option) => (
                              <span className="mini-chip soft" key={option.group}>
                                {option.group}
                              </span>
                            ))}
                          </div>
                        )}

                        <button
                          className="add-button"
                          onClick={() => openProductModal(produkt)}
                          type="button"
                        >
                          Hinzufügen
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="container section-spacing">
              <div className="section-topline">
                <div>
                  <span className="eyebrow">Live Status</span>
                  <h3 className="section-title">Öffnungszeiten</h3>
                </div>
                <p className="section-text">
                  Live sichtbar, ob wir aktuell geöffnet oder geschlossen sind.
                </p>
              </div>

              <div className="hours-grid">
                <div className="hours-card">
                  <div className="hours-card-head">
                    <h4>Abholung</h4>
                    <span className={`status-pill ${abholungStatus.isOpen ? "open" : "closed"}`}>
                      {abholungStatus.isOpen ? "Jetzt geöffnet" : "Geschlossen"}
                    </span>
                  </div>

                  <div className="hours-list">
                    <div className="hours-row">
                      <span>Montag – Freitag</span>
                      <strong>11:00 – 23:00</strong>
                    </div>
                    <div className="hours-row">
                      <span>Samstag – Sonntag</span>
                      <strong>14:00 – 23:00</strong>
                    </div>
                  </div>
                </div>

                <div className="hours-card">
                  <div className="hours-card-head">
                    <h4>Lieferung</h4>
                    <span className={`status-pill ${lieferStatus.isOpen ? "open" : "closed"}`}>
                      {lieferStatus.isOpen ? "Jetzt geöffnet" : "Geschlossen"}
                    </span>
                  </div>

                  <div className="hours-list">
                    <div className="hours-row">
                      <span>Montag – Freitag</span>
                      <strong>11:00 – 22:30</strong>
                    </div>
                    <div className="hours-row">
                      <span>Samstag – Sonntag</span>
                      <strong>14:00 – 22:30</strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {viewStep === "checkout" && (
          <section className="container checkout-section">
            <div className="section-topline checkout-topline">
              <div>
                <span className="eyebrow">Bestellung abschließen</span>
                <h2 className="section-title">Warenkorb & Checkout</h2>
              </div>

              <button
                className="back-button"
                onClick={backFromCheckout}
                type="button"
              >
                ← Zurück
              </button>
            </div>

            <div className="checkout-layout">
              <div className="checkout-main">
                <div className="glass-card">
                  <h3>Deine Artikel</h3>

                  {cart.length === 0 ? (
                    <p className="empty-state">Dein Warenkorb ist leer.</p>
                  ) : (
                    <div className="cart-list">
                      {cart.map((item) => (
                        <div className="cart-item" key={item.uniqueKey}>
                          <div className="cart-item-header">
                            <div>
                              <h4>{item.name}</h4>
                              <small>
                                {item.cuisine} · {item.category}
                                {item.variantName ? ` · ${item.variantName}` : ""}
                              </small>

                              {item.selectedOptions &&
                                item.selectedOptions.length > 0 && (
                                  <div className="cart-option-list">
                                    {item.selectedOptions.map((option) => (
                                      <span className="cart-option-pill" key={option}>
                                        {option}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>

                            <strong>
                              {(item.price * item.quantity).toFixed(2)} €
                            </strong>
                          </div>

                          <div className="quantity-box">
                            <button
                              onClick={() => decreaseQuantity(item.uniqueKey)}
                              type="button"
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              onClick={() => increaseQuantity(item.uniqueKey)}
                              type="button"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card">
                  <h3>Bestellart</h3>

                  <div className="switch-row">
                    <button
                      className={bestellart === "abholung" ? "active" : ""}
                      onClick={() => setBestellart("abholung")}
                      type="button"
                    >
                      Abholung
                    </button>
                    <button
                      className={bestellart === "lieferung" ? "active" : ""}
                      onClick={() => setBestellart("lieferung")}
                      type="button"
                    >
                      Lieferung
                    </button>
                  </div>

                  <div className="helper-box">
                    {bestellart === "abholung"
                      ? "Abholung: Mo–Fr 11:00–23:00 · Sa–So 14:00–23:00"
                      : "Lieferung: Mo–Fr 11:00–22:30 · Sa–So 14:00–22:30"}
                  </div>
                </div>

                <div className="glass-card">
                  <h3>Kundendaten</h3>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="name">Name</label>
                      <input
                        id="name"
                        type="text"
                        placeholder="Dein Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="telefon">Telefonnummer</label>
                      <input
                        id="telefon"
                        type="text"
                        placeholder="Deine Telefonnummer"
                        value={telefon}
                        onChange={(e) => setTelefon(e.target.value)}
                      />
                    </div>
                  </div>

                  {bestellart === "lieferung" && (
                    <>
                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="strasse">Straße</label>
                          <input
                            id="strasse"
                            type="text"
                            placeholder="Straße"
                            value={strasse}
                            onChange={(e) => setStrasse(e.target.value)}
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="hausnummer">Hausnummer</label>
                          <input
                            id="hausnummer"
                            type="text"
                            placeholder="Hausnummer"
                            value={hausnummer}
                            onChange={(e) => setHausnummer(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="plz">Postleitzahl</label>
                          <input
                            id="plz"
                            type="text"
                            inputMode="numeric"
                            maxLength={5}
                            placeholder="PLZ"
                            value={plz}
                            onChange={(e) =>
                              setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))
                            }
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="stadt">Stadt</label>
                          <input
                            id="stadt"
                            type="text"
                            placeholder="Wird automatisch ausgefüllt"
                            value={stadt}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {bestellart === "lieferung" && lieferPruefung && (
                    <p
                      className={`message ${
                        lieferPruefung.ok ? "success" : "error"
                      }`}
                    >
                      {lieferPruefung.message}
                    </p>
                  )}

                  <div className="form-group">
                    <label htmlFor="hinweis">Hinweis zur Bestellung</label>
                    <textarea
                      id="hinweis"
                      placeholder="Zum Beispiel: ohne Zwiebeln"
                      value={hinweis}
                      onChange={(e) => setHinweis(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>

                <div className="glass-card">
                  <h3>Bestellzeit</h3>

                  <div className="switch-row">
                    <button
                      className={vorbestellung === "sofort" ? "active" : ""}
                      onClick={() => setVorbestellung("sofort")}
                      type="button"
                      disabled={!status.isOpen}
                    >
                      Sofort
                    </button>
                    <button
                      className={vorbestellung === "spaeter" ? "active" : ""}
                      onClick={() => setVorbestellung("spaeter")}
                      type="button"
                    >
                      Vorbestellung
                    </button>
                  </div>

                  {!status.isOpen && (
                    <p className="message error">
                      Aktuell geschlossen. Sofort-Bestellung ist deaktiviert.
                    </p>
                  )}

                  {vorbestellung === "spaeter" && (
                    <div className="form-group">
                      <label htmlFor="uhrzeit">Uhrzeit</label>
                      <input
                        id="uhrzeit"
                        type="time"
                        value={uhrzeit}
                        min={minVorbestellzeit}
                        onChange={(e) => setUhrzeit(e.target.value)}
                      />
                      <p className="helper-text">
                        Früheste Vorbestellung: {minVorbestellzeit} Uhr
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <aside className="checkout-sidebar">
                <div className="glass-card sticky-card">
                  <h3>Zusammenfassung</h3>

                  <div className="summary-row">
                    <span>Artikel</span>
                    <span>{gesamtAnzahl}</span>
                  </div>

                  <div className="summary-row">
                    <span>Zwischensumme</span>
                    <span>{gesamtpreisProdukte.toFixed(2)} €</span>
                  </div>

                  <div className="summary-row discount">
                    <span>10% Rabatt</span>
                    <span>-{rabattBetrag.toFixed(2)} €</span>
                  </div>

                  {bestellart === "lieferung" && lieferPruefung?.minOrder ? (
                    <div className="summary-row">
                      <span>Mindestbestellwert</span>
                      <span>{lieferPruefung.minOrder.toFixed(2)} €</span>
                    </div>
                  ) : null}

                  <div className="summary-row free">
                    <span>Versand</span>
                    <span>Kostenlos</span>
                  </div>

                  <div className="summary-row total">
                    <span>Gesamt</span>
                    <span>{gesamtpreis.toFixed(2)} €</span>
                  </div>

                  {fehlermeldung && <p className="message error">{fehlermeldung}</p>}
                  {erfolgsmeldung && (
                    <p className="message success">{erfolgsmeldung}</p>
                  )}

                  <button
                    className="checkout-button"
                    onClick={handleStripeCheckout}
                    type="button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Wird gesendet..." : "Bestellung absenden"}
                  </button>
                </div>
              </aside>
            </div>
          </section>
        )}

        {selectedProduct && (
          <div className="modal-backdrop" onClick={resetModal}>
            <div className="product-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span className="eyebrow">{selectedProduct.category}</span>
                  <h3>{selectedProduct.name}</h3>
                </div>

                <button className="modal-close" onClick={resetModal} type="button">
                  ×
                </button>
              </div>

              <p className="modal-description">{selectedProduct.description}</p>

              {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                <div className="modal-section">
                  <h4>Variante wählen</h4>
                  <div className="modal-choice-list">
                    {selectedProduct.variants.map((variant) => (
                      <button
                        key={variant.name}
                        type="button"
                        className={`modal-choice ${
                          selectedVariantName === variant.name ? "active" : ""
                        }`}
                        onClick={() =>
                          handleVariantSelect(variant.name, variant.price)
                        }
                      >
                        <span>{variant.name}</span>
                        <strong>{variant.price.toFixed(2)} €</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedProduct.options?.map((optionGroup) => (
                <div className="modal-section" key={optionGroup.group}>
                  <h4>{optionGroup.group}</h4>
                  <div className="modal-choice-list">
                    {optionGroup.items.map((item) => {
                      const checked =
                        (selectedOptionsMap[optionGroup.group] || []).includes(
                          item.name
                        );

                      return (
                        <button
                          key={item.name}
                          type="button"
                          className={`modal-choice ${checked ? "active" : ""}`}
                          onClick={() =>
                            handleOptionChange(
                              optionGroup.group,
                              item.name,
                              item.price,
                              optionGroup.multiple
                            )
                          }
                        >
                          <span>{item.name}</span>
                          <strong>
                            {item.price > 0 ? `+${item.price.toFixed(2)} €` : "inkl."}
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {modalError && <p className="message error">{modalError}</p>}

              <div className="modal-footer">
                <div className="modal-price-box">
                  <span>Gesamt</span>
                  <strong>{modalTotalPrice.toFixed(2)} €</strong>
                </div>

                <button
                  className="checkout-button"
                  onClick={confirmModalSelection}
                  type="button"
                >
                  In den Warenkorb
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          onClick={() => setAdminClicks((c) => c + 1)}
          className="secret-admin-dot"
        />
      </main>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background:
            radial-gradient(circle at top left, rgba(184, 134, 11, 0.14), transparent 28%),
            linear-gradient(180deg, #060608 0%, #0d0d11 100%);
          color: #f7f3e9;
          font-family: Inter, Arial, sans-serif;
        }

        button,
        input,
        textarea {
          font: inherit;
        }

        .page-shell {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
        }

        .container {
          width: min(1280px, calc(100% - 32px));
          margin: 0 auto;
        }

        .premium-header {
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(18px);
          background: rgba(8, 8, 12, 0.68);
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        }

        .nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          min-height: 88px;
        }

        .brand-box {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .logo-img {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          object-fit: cover;
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .brand-title {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .brand-subtitle {
          margin: 4px 0 0;
          color: rgba(255, 255, 255, 0.66);
          font-size: 0.9rem;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .promo-pill {
          padding: 10px 14px;
          border-radius: 999px;
          font-size: 0.88rem;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .promo-pill.gold {
          background: linear-gradient(135deg, rgba(205, 147, 22, 0.28), rgba(255, 211, 105, 0.16));
          color: #ffe8a6;
        }

        .promo-pill.dark {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
        }

        .cart-button {
          position: relative;
          border: none;
          border-radius: 999px;
          padding: 14px 18px;
          background: linear-gradient(135deg, #d6a437, #f4d17e);
          color: #18120a;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 14px 30px rgba(214, 164, 55, 0.26);
          transition: transform 0.22s ease, box-shadow 0.22s ease;
        }

        .cart-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 34px rgba(214, 164, 55, 0.34);
        }

        .cart-button.pulse {
          animation: cartPulseAnim 0.6s ease;
        }

        .cart-count {
          margin-left: 10px;
          background: rgba(0, 0, 0, 0.14);
          padding: 4px 10px;
          border-radius: 999px;
        }

        .hero-banner {
          min-height: 86vh;
          background-size: cover;
          background-position: center;
          position: relative;
          display: flex;
          align-items: center;
        }

        .hero-content {
          padding: 70px 0 90px;
        }

        .hero-badge-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .hero-chip {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.09);
          padding: 10px 14px;
          border-radius: 999px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.88);
        }

        .hero-chip.accent {
          color: #ffe3a0;
          background: rgba(214, 164, 55, 0.16);
        }

        .hero-headline {
          max-width: 880px;
          margin: 0;
          font-size: clamp(2.3rem, 5vw, 5rem);
          line-height: 0.98;
          letter-spacing: -0.04em;
          font-weight: 900;
        }

        .hero-copy {
          margin: 22px 0 0;
          max-width: 720px;
          font-size: 1.1rem;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.8);
        }

        .hero-actions {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 28px;
        }

        .hero-cta {
          border: none;
          border-radius: 16px;
          padding: 16px 22px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.22s ease, opacity 0.22s ease;
        }

        .hero-cta:hover {
          transform: translateY(-2px);
        }

        .hero-cta.primary {
          background: linear-gradient(135deg, #d6a437, #f4d17e);
          color: #1c1408;
        }

        .hero-cta.secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .hero-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          margin-top: 34px;
        }

        .hero-stat-card {
          padding: 20px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
        }

        .hero-stat-card span {
          display: block;
          color: rgba(255, 255, 255, 0.62);
          margin-bottom: 8px;
          font-size: 0.92rem;
        }

        .hero-stat-card strong {
          font-size: 1rem;
        }

        .section-spacing {
          padding: 90px 0 0;
        }

        .section-topline {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }

        .eyebrow {
          display: inline-block;
          color: #d8a83a;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.78rem;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .section-title {
          margin: 0;
          font-size: clamp(1.8rem, 3vw, 3rem);
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .section-text {
          max-width: 440px;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.7;
        }

        .slide-dots {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .slide-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }

        .slide-dot.active {
          width: 34px;
          background: linear-gradient(90deg, #d6a437, #f3d07c);
        }

        .offer-slider-card {
          position: relative;
          height: 400px;
          border-radius: 34px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .offer-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.75s ease, transform 0.75s ease;
          transform: scale(1.04);
          background-size: cover;
          background-position: center;
        }

        .offer-slide.active {
          opacity: 1;
          pointer-events: auto;
          transform: scale(1);
        }

        .offer-slide-content {
          height: 100%;
          max-width: 640px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 42px;
        }

        .offer-label {
          display: inline-flex;
          align-self: flex-start;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(214, 164, 55, 0.18);
          color: #ffe8a6;
          font-weight: 800;
          margin-bottom: 18px;
        }

        .offer-slide h4 {
          margin: 0;
          font-size: clamp(2rem, 3.3vw, 3.5rem);
          line-height: 1.04;
          font-weight: 900;
        }

        .offer-slide p {
          margin: 16px 0 0;
          max-width: 560px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.8);
        }

        .offer-tags {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 20px;
        }

        .offer-tags span {
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-weight: 700;
        }

        .cuisine-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        .cuisine-card {
          position: relative;
          min-height: 420px;
          border: none;
          border-radius: 30px;
          overflow: hidden;
          text-align: left;
          cursor: pointer;
          background-size: cover;
          background-position: center;
          transition: transform 0.28s ease, box-shadow 0.28s ease;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
        }

        .cuisine-card:hover {
          transform: translateY(-8px) scale(1.01);
          box-shadow: 0 28px 60px rgba(0, 0, 0, 0.36);
        }

        .cuisine-card-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.56));
        }

        .cuisine-card-content {
          position: absolute;
          inset: auto 0 0 0;
          padding: 28px;
          z-index: 1;
        }

        .cuisine-tag {
          display: inline-block;
          background: rgba(214, 164, 55, 0.2);
          color: #ffe6a0;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 800;
          margin-bottom: 14px;
        }

        .cuisine-card h4 {
          margin: 0;
          font-size: 2rem;
          font-weight: 900;
        }

        .cuisine-card p {
          margin: 14px 0 0;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.85);
        }

        .cuisine-link {
          display: inline-block;
          margin-top: 18px;
          color: #ffe4a0;
          font-weight: 800;
        }

        .category-grid,
        .products-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        .category-card,
        .product-card,
        .hours-card,
        .glass-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 26px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
        }

        .category-card {
          border: none;
          cursor: pointer;
          color: inherit;
          text-align: left;
          transition: transform 0.22s ease, box-shadow 0.22s ease;
        }

        .category-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 24px 56px rgba(0, 0, 0, 0.3);
        }

        .category-card-inner,
        .product-card,
        .hours-card,
        .glass-card {
          padding: 24px;
        }

        .category-badge {
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(214, 164, 55, 0.14);
          color: #ffd875;
          font-weight: 800;
        }

        .category-card h4,
        .product-card h4,
        .hours-card h4,
        .glass-card h3 {
          margin: 0;
        }

        .category-card p,
        .product-desc {
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.7;
        }

        .category-link {
          display: inline-block;
          margin-top: 10px;
          font-weight: 800;
          color: #ffe4a0;
        }

        .product-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .product-card-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: start;
        }

        .product-number {
          display: inline-block;
          font-size: 0.78rem;
          color: #d6a437;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 8px;
          font-weight: 800;
        }

        .product-price {
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(214, 164, 55, 0.14);
          color: #ffe39b;
          font-weight: 800;
          white-space: nowrap;
        }

        .mini-chip-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .mini-chip {
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.86);
        }

        .mini-chip.soft {
          background: rgba(214, 164, 55, 0.12);
          color: #ffe4a0;
        }

        .add-button,
        .back-button,
        .checkout-button {
          border: none;
          border-radius: 16px;
          padding: 15px 18px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .add-button:hover,
        .back-button:hover,
        .checkout-button:hover {
          transform: translateY(-2px);
        }

        .add-button,
        .checkout-button {
          background: linear-gradient(135deg, #d6a437, #f4d17e);
          color: #1c1408;
        }

        .back-button {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .hours-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
        }

        .hours-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
        }

        .status-pill {
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 0.84rem;
          font-weight: 800;
        }

        .status-pill.open {
          background: rgba(29, 181, 88, 0.15);
          color: #8ff0b3;
        }

        .status-pill.closed {
          background: rgba(255, 77, 77, 0.14);
          color: #ffadad;
        }

        .hours-list {
          display: grid;
          gap: 14px;
        }

        .hours-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
        }

        .hours-row span {
          color: rgba(255, 255, 255, 0.72);
        }

        .checkout-section {
          padding: 50px 0 90px;
        }

        .checkout-topline {
          align-items: center;
        }

        .checkout-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) 400px;
          gap: 24px;
        }

        .checkout-main {
          display: grid;
          gap: 20px;
        }

        .sticky-card {
          position: sticky;
          top: 110px;
        }

        .cart-list {
          display: grid;
          gap: 16px;
        }

        .cart-item {
          padding: 18px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
        }

        .cart-item-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: start;
        }

        .cart-item-header small {
          display: inline-block;
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.64);
        }

        .cart-option-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }

        .cart-option-pill {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(214, 164, 55, 0.12);
          color: #ffe29d;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .quantity-box {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 999px;
          padding: 8px 12px;
        }

        .quantity-box button {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          cursor: pointer;
          font-size: 1.1rem;
        }

        .switch-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .switch-row button {
          flex: 1;
          min-width: 130px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border-radius: 16px;
          padding: 14px 16px;
          cursor: pointer;
          font-weight: 800;
        }

        .switch-row button.active {
          background: linear-gradient(135deg, #d6a437, #f4d17e);
          color: #1c1408;
          border-color: transparent;
        }

        .switch-row button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .helper-box,
        .helper-text {
          color: rgba(255, 255, 255, 0.68);
        }

        .helper-box {
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.04);
        }

        .helper-text {
          margin-top: 8px;
          font-size: 0.9rem;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .form-group {
          display: grid;
          gap: 8px;
          margin-top: 16px;
        }

        .form-group label {
          color: rgba(255, 255, 255, 0.84);
          font-weight: 700;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          padding: 15px 16px;
          outline: none;
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .form-group input:disabled {
          opacity: 0.75;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .summary-row.discount span:last-child {
          color: #8ff0b3;
          font-weight: 800;
        }

        .summary-row.free span:last-child {
          color: #ffe6a0;
          font-weight: 800;
        }

        .summary-row.total {
          font-size: 1.1rem;
          font-weight: 900;
          border-bottom: none;
          padding-bottom: 0;
        }

        .message {
          margin-top: 16px;
          padding: 14px 16px;
          border-radius: 16px;
          line-height: 1.6;
        }

        .message.error {
          background: rgba(255, 71, 87, 0.13);
          color: #ffb8c0;
          border: 1px solid rgba(255, 71, 87, 0.18);
        }

        .message.success {
          background: rgba(29, 181, 88, 0.13);
          color: #9ff4bd;
          border: 1px solid rgba(29, 181, 88, 0.18);
        }

        .empty-state {
          color: rgba(255, 255, 255, 0.68);
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 100;
        }

        .product-modal {
          width: min(760px, 100%);
          max-height: 90vh;
          overflow-y: auto;
          border-radius: 28px;
          background: linear-gradient(180deg, #121218, #0c0c10);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
          padding: 24px;
        }

        .modal-header,
        .modal-footer {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .modal-close {
          border: none;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 1.4rem;
        }

        .modal-description {
          margin: 18px 0 0;
          color: rgba(255, 255, 255, 0.76);
          line-height: 1.7;
        }

        .modal-section {
          margin-top: 22px;
        }

        .modal-section h4 {
          margin: 0 0 12px;
        }

        .modal-choice-list {
          display: grid;
          gap: 10px;
        }

        .modal-choice {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          padding: 14px 16px;
          cursor: pointer;
        }

        .modal-choice.active {
          border-color: rgba(214, 164, 55, 0.65);
          background: rgba(214, 164, 55, 0.14);
        }

        .modal-footer {
          margin-top: 22px;
        }

        .modal-price-box {
          display: grid;
          gap: 4px;
        }

        .modal-price-box span {
          color: rgba(255, 255, 255, 0.66);
        }

        .modal-price-box strong {
          font-size: 1.2rem;
        }

        .added-toast {
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 120;
          min-width: 280px;
          padding: 18px 18px;
          border-radius: 22px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(19, 19, 24, 0.92), rgba(31, 23, 10, 0.92));
          border: 1px solid rgba(214, 164, 55, 0.22);
          box-shadow: 0 20px 55px rgba(0, 0, 0, 0.42);
          animation: toastIn 1.8s ease forwards;
        }

        .added-toast-glow {
          position: absolute;
          inset: -30%;
          background: radial-gradient(circle, rgba(214, 164, 55, 0.28), transparent 48%);
          pointer-events: none;
          animation: rotateGlow 2.5s linear infinite;
        }

        .added-toast strong,
        .added-toast span {
          position: relative;
          z-index: 1;
          display: block;
        }

        .added-toast strong {
          color: #ffe8a8;
          margin-bottom: 6px;
        }

        .added-toast span {
          color: rgba(255, 255, 255, 0.8);
        }

        .secret-admin-dot {
          position: fixed;
          bottom: 10px;
          left: 10px;
          width: 16px;
          height: 16px;
          opacity: 0;
          z-index: 2;
        }

        @keyframes cartPulseAnim {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes toastIn {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          12%,
          82% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }
        }

        @keyframes rotateGlow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .hero-stats,
          .cuisine-grid,
          .category-grid,
          .products-grid,
          .hours-grid,
          .checkout-layout {
            grid-template-columns: 1fr;
          }

          .sticky-card {
            position: static;
          }
        }

        @media (max-width: 760px) {
          .nav-inner,
          .section-topline,
          .hero-actions,
          .nav-right {
            flex-direction: column;
            align-items: stretch;
          }

          .brand-box {
            justify-content: center;
          }

          .hero-banner {
            min-height: 74vh;
          }

          .hero-content {
            padding: 50px 0 70px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .offer-slider-card {
            height: 440px;
          }

          .offer-slide-content {
            padding: 24px;
          }

          .cart-item-header,
          .hours-card-head,
          .modal-header,
          .modal-footer {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </>
  );
}