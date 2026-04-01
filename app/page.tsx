"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { kategorienMap, produkte, type Cuisine, type Product } from "./data/menu";
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

const erlaubtePLZ = [
  "64546",
  "64331",
  "64572",
  "63263",
  "63225",
  "64283",
  "64285",
  "64287",
  "64289",
  "64291",
  "64293",
  "64295",
  "64297",
  "64521",
];

const liefergebuehr = 2.5;
const mindestbestellwertLieferung = 15;

function getJetztStatus(bestellart: Bestellart) {
  const jetzt = new Date();
  const tag = jetzt.getDay();
  const minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const istWochenende = tag === 0 || tag === 6;

  let offenAb = 0;
  let offenBis = 0;

  if (istWochenende) {
    offenAb = 14 * 60;
    offenBis = bestellart === "abholung" ? 23 * 60 : 22 * 60 + 30;
  } else {
    offenAb = 11 * 60;
    offenBis = bestellart === "abholung" ? 23 * 60 : 22 * 60 + 30;
  }

  if (minuten >= offenAb && minuten <= offenBis) {
    return {
      isOpen: true,
      text:
        bestellart === "abholung"
          ? "Abholung ist aktuell möglich"
          : "Lieferung ist aktuell möglich",
    };
  }

  return {
    isOpen: false,
    text:
      bestellart === "abholung"
        ? "Aktuell geschlossen – Vorbestellung für Abholung möglich"
        : "Aktuell geschlossen – Vorbestellung für Lieferung möglich",
  };
}

function pruefeLiefergebiet(adresse: string) {
  const plzMatch = adresse.match(/\b\d{5}\b/);

  if (!plzMatch) {
    return {
      ok: false,
      message: "Bitte gib eine Adresse mit Postleitzahl ein.",
    };
  }

  const plz = plzMatch[0];

  if (!erlaubtePLZ.includes(plz)) {
    return {
      ok: false,
      message: "Diese Adresse liegt aktuell außerhalb unseres Liefergebiets.",
    };
  }

  return {
    ok: true,
    message: "Adresse liegt im Liefergebiet.",
  };
}

function getProductBasePrice(produkt: Product) {
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
  const [adresse, setAdresse] = useState("");
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
  const status = getJetztStatus(bestellart);

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

    setCartPulse(true);
    setTimeout(() => setCartPulse(false), 450);
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

  const gesamtAnzahl = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const lieferPruefung = useMemo(() => {
    if (bestellart !== "lieferung") return null;
    if (!adresse.trim()) return null;
    return pruefeLiefergebiet(adresse);
  }, [bestellart, adresse]);

  const finaleLiefergebuehr =
    bestellart === "lieferung" && lieferPruefung?.ok ? liefergebuehr : 0;

  const gesamtpreis = gesamtpreisProdukte + finaleLiefergebuehr;

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

    if (!telefon.trim()) {
      setFehlermeldung("Bitte gib deine Telefonnummer ein.");
      return;
    }

    if (bestellart === "lieferung") {
      if (!adresse.trim()) {
        setFehlermeldung("Bitte gib deine Lieferadresse ein.");
        return;
      }

      const gebiet = pruefeLiefergebiet(adresse);
      if (!gebiet.ok) {
        setFehlermeldung(gebiet.message);
        return;
      }

      if (gesamtpreisProdukte < mindestbestellwertLieferung) {
        setFehlermeldung(
          `Für Lieferung gilt ein Mindestbestellwert von ${mindestbestellwertLieferung.toFixed(
            2
          )} €.`
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
          adresse: bestellart === "lieferung" ? adresse : "Abholung",
        },
        bestellart,
        hinweis,
        vorbestellung,
        uhrzeit: vorbestellung === "spaeter" ? uhrzeit : "sofort",
        artikel: artikelOhneUndefined,
        gesamtpreisProdukte,
        liefergebuehr: finaleLiefergebuehr,
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
    <main className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <div className="brand-mark">LR</div>
            <div>
              <h1 className="brand-title">La Rosa</h1>
              <p className="brand-subtitle">Premium Bestellsystem</p>
            </div>
          </div>

          <div className="topbar-actions">
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

      {viewStep !== "checkout" && (
        <>
          <section className="hero-shell">
            <div className="container hero-shell-inner">
              <span className="eyebrow red">Online bestellen</span>
              <h2 className="hero-title">
                Elegante Speisekarte mit klarer Navigation.
              </h2>
              <p className="hero-copy">
                Kunden wählen zuerst die Küche, dann die Kategorie und sehen
                danach nur die passenden Gerichte. Produkte mit Varianten öffnen
                ein Auswahlfenster.
              </p>

              <div className="hero-info-grid">
                <div className="info-card">
                  <span className="info-label">Status</span>
                  <strong>{status.text}</strong>
                </div>
                <div className="info-card">
                  <span className="info-label">Lieferung</span>
                  <strong>PLZ-basierte Zustellung aktiv</strong>
                </div>
                <div className="info-card">
                  <span className="info-label">Service</span>
                  <strong>Abholung & Lieferung verfügbar</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="container content-section">
            {viewStep === "kitchens" && (
              <>
                <div className="section-header">
                  <div>
                    <span className="eyebrow light">Auswahl</span>
                    <h3>Küchen & Getränke</h3>
                  </div>
                  <p>Wähle zuerst aus, welcher Bereich angezeigt werden soll.</p>
                </div>

                <div className="selection-grid three-col">
                  <button
                    className="selection-card cuisine-card"
                    onClick={() => openCuisine("Italienisch")}
                    type="button"
                  >
                    <span className="selection-tag">Italienisch</span>
                    <h4>Italienische Küche</h4>
                    <p>
                      Salate, Pizza / Calzone, Partypizza, Pizzabrot, Pasta,
                      Schnitzel, Fisch Spezialitäten, Fast Food Menus, Desserts.
                    </p>
                    <span className="selection-link">Kategorien öffnen →</span>
                  </button>

                  <button
                    className="selection-card cuisine-card"
                    onClick={() => openCuisine("Indisch")}
                    type="button"
                  >
                    <span className="selection-tag">Indisch</span>
                    <h4>Indische Küche</h4>
                    <p>
                      Indische Vorspeisen, Brotsorten nach indischer Art,
                      Hauptspeisen, Reisgerichte und vegetarische Speisen.
                    </p>
                    <span className="selection-link">Kategorien öffnen →</span>
                  </button>

                  <button
                    className="selection-card cuisine-card"
                    onClick={() => openCuisine("Getränke")}
                    type="button"
                  >
                    <span className="selection-tag">Getränke</span>
                    <h4>Getränke</h4>
                    <p>
                      Softgetränke, Wasser, Ayran, alkoholfreies Bier und mehr.
                    </p>
                    <span className="selection-link">Direkt öffnen →</span>
                  </button>
                </div>
              </>
            )}

            {viewStep === "categories" &&
              activeCuisine &&
              activeCuisine !== "Getränke" && (
                <>
                  <div className="section-header">
                    <div>
                      <span className="eyebrow light">{activeCuisine}</span>
                      <h3>Kategorien</h3>
                    </div>

                    <button
                      className="back-button"
                      onClick={backFromCategories}
                      type="button"
                    >
                      ← Zurück zu Küchen
                    </button>
                  </div>

                  <div className="selection-grid">
                    {kategorienMap[activeCuisine].map((kategorie) => (
                      <button
                        key={kategorie}
                        className="selection-card category-card"
                        onClick={() => openCategory(kategorie)}
                        type="button"
                      >
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
                        <span className="selection-link">Kategorie öffnen →</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

            {viewStep === "products" && activeCuisine && activeCategory && (
              <>
                <div className="section-header">
                  <div>
                    <span className="eyebrow light">{activeCuisine}</span>
                    <h3>{activeCategory}</h3>
                  </div>

                  <button
                    className="back-button"
                    onClick={backFromProducts}
                    type="button"
                  >
                    ← Zurück
                  </button>
                </div>

                <div className="products-clean-list">
                  {activeProducts.map((produkt) => (
                    <article className="product-row-clean" key={produkt.id}>
                      <div className="product-row-main">
                        <div className="product-row-top">
                          <h4>
                            {produkt.number ? `${produkt.number} ` : ""}
                            {produkt.name}
                          </h4>
                          <span>{getProductBasePrice(produkt).toFixed(2)} €</span>
                          
                        </div>
                        <p>{produkt.description}</p>

                        {produkt.variants && (
                          <div className="variant-chips">
                            {produkt.variants.map((variant) => (
                              <span className="variant-chip" key={variant.name}>
                                {variant.name}: {variant.price.toFixed(2)} €
                              </span>
                            ))}
                          </div>
                        )}

                        {produkt.options && (
                          <div className="variant-chips">
                            {produkt.options.map((option) => (
                              <span className="variant-chip" key={option.group}>
                                {option.group}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

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
        </>
      )}

      {viewStep === "checkout" && (
        <section className="checkout-section container">
          <div className="checkout-header">
            <div>
              <span className="eyebrow red">Bestellung abschließen</span>
              <h2>Warenkorb & Checkout</h2>
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
              <div className="checkout-card">
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

              <div className="checkout-card">
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

              <div className="checkout-card">
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
                  <div className="form-group">
                    <label htmlFor="adresse">Lieferadresse</label>
                    <input
                      id="adresse"
                      type="text"
                      placeholder="Straße, Hausnummer, PLZ, Ort"
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                    />
                  </div>
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

              <div className="checkout-card">
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
<p style={{ marginTop: 8, fontSize: 14, color: "#64748b" }}>
  Früheste Vorbestellung: {minVorbestellzeit} Uhr
</p>
                  </div>
                )}
              </div>
            </div>

            <aside className="checkout-sidebar">
              <div className="checkout-card sticky-card">
                <h3>Zusammenfassung</h3>

                <div className="summary-row">
                  <span>Artikel</span>
                  <span>{gesamtAnzahl}</span>
                </div>

                <div className="summary-row">
                  <span>Zwischensumme</span>
                  <span>{gesamtpreisProdukte.toFixed(2)} €</span>
                </div>

                <div className="summary-row">
                  <span>Liefergebühr</span>
                  <span>{finaleLiefergebuehr.toFixed(2)} €</span>
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
                  className="primary-button full-width"
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
                <span className="eyebrow light">{selectedProduct.category}</span>
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
                className="primary-button"
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
  );
}