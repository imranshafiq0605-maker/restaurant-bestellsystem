"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type OfferSlide = {
  title: string;
  price: number;
  text: string;
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

const offerSlides: OfferSlide[] = [
  {
    title: "Angebot 1",
    price: 34.5,
    text: "2 Familien Pizzen 36 cm nach Wahl / 1 Liter Cola, Fanta oder Bizzi nach Wahl",
  },
  {
    title: "Angebot 2",
    price: 22.5,
    text: "3 kleine Pizzen 24 cm nach Wahl / 1 Liter Cola, Fanta oder Bizzi nach Wahl",
  },
  {
    title: "Angebot 3",
    price: 37.5,
    text: "3 normale Pizzen 31 cm nach Wahl / 1 Liter Cola, Fanta oder Bizzi nach Wahl",
  },
  {
    title: "Angebot 4",
    price: 23.5,
    text: "2 Nudeln nach Wahl / 1 Liter Cola, Fanta oder Bizzi",
  },
  {
    title: "Angebot 5",
    price: 32.5,
    text: "2x Schnitzel nach Wahl / 1 Liter Cola, Fanta oder Bizzi nach Wahl",
  },
  {
    title: "Angebot 6",
    price: 53.5,
    text: "1 normale Pizza 31 cm nach Ihrer Wahl / 1 Schnitzel nach Ihrer Wahl / 1 Nudel nach Ihrer Wahl / 1 Salat nach Ihrer Wahl / 1 Liter Cola, Fanta oder Bizzi",
  },
  {
    title: "Angebot 452",
    price: 33.5,
    text: "2 indische Gerichte nach Ihrer Wahl / 1 Liter Cola, Fanta oder Bizzi",
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
    image: "/images/cuisine-italienisch.jpg",
  },
  {
    cuisine: "Indisch",
    title: "Indische Küche",
    text: "Vorspeisen, Brote, Currys, Reisgerichte und vegetarische Spezialitäten.",
    image: "/images/cuisine-indisch.jpg",
  },
  {
    cuisine: "Getränke",
    title: "Getränke",
    text: "Softdrinks, Wasser, Ayran und weitere perfekt passende Begleiter.",
    image: "/images/cuisine-getraenke.jpg",
  },
];

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

function getAvailablePreorderDates(days = 21) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() + index);
    return formatDateInput(d);
  });
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
    return {
      ok: false,
      message: "Bitte wähle Datum und Uhrzeit für die Vorbestellung.",
    };
  }

  const slots = getAvailableTimeSlots(datum);
  if (!slots.includes(uhrzeit)) {
    return {
      ok: false,
      message:
        "Die gewählte Vorbestellzeit ist nicht gültig. Bitte wähle einen verfügbaren Slot.",
    };
  }

  const selected = new Date(`${datum}T${uhrzeit}:00`);
  const minAllowed = new Date(Date.now() + 60 * 60 * 1000);

  if (selected.getTime() < minAllowed.getTime()) {
    return {
      ok: false,
      message: "Vorbestellungen müssen mindestens 1 Stunde in der Zukunft liegen.",
    };
  }

  return {
    ok: true,
    message: "Vorbestellung ist gültig.",
  };
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
  const [vorbestellungDatum, setVorbestellungDatum] = useState(
    formatDateInput(new Date())
  );
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
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<
    Record<string, string[]>
  >({});
  const [selectedOptionsPriceMap, setSelectedOptionsPriceMap] = useState<
    Record<string, number[]>
  >({});
  const [modalError, setModalError] = useState("");

  const [adminClicks, setAdminClicks] = useState(0);
  const offersTrackRef = useRef<HTMLDivElement | null>(null);

  const status = getServiceStatus(bestellart);

  const availablePreorderDates = useMemo(() => getAvailablePreorderDates(21), []);
  const availableTimeSlots = useMemo(
    () => getAvailableTimeSlots(vorbestellungDatum),
    [vorbestellungDatum]
  );

  const zusammengesetzteAdresse = useMemo(() => {
    if (!strasse && !hausnummer && !plz && !stadt) return "";
    return `${strasse.trim()} ${hausnummer.trim()}, ${plz.trim()} ${stadt.trim()}`.trim();
  }, [strasse, hausnummer, plz, stadt]);

  function openCuisine(cuisine: Cuisine) {
    setActiveCuisine(cuisine);

    if (cuisine === "Getränke") {
      setActiveCategory("Getränke");
      setViewStep("products");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveCategory(null);
    setViewStep("categories");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCategory(category: string) {
    setActiveCategory(category);
    setViewStep("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backFromProducts() {
    if (activeCuisine === "Getränke") {
      setActiveCuisine(null);
      setActiveCategory(null);
      setViewStep("kitchens");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setActiveCategory(null);
    setViewStep("categories");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backFromCategories() {
    setActiveCuisine(null);
    setActiveCategory(null);
    setViewStep("kitchens");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function triggerAddFeedback(productName: string) {
    setAddedProductName(productName);
    setShowAddedEffect(true);
    setCartPulse(true);

    setTimeout(() => setCartPulse(false), 700);
    setTimeout(() => setShowAddedEffect(false), 1800);
  }

  function addOfferToCart(offer: OfferSlide) {
    const uniqueKey = `offer-${offer.title}`;

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
          id: Date.now(),
          name: offer.title,
          price: offer.price,
          quantity: 1,
          category: "Angebote",
          cuisine: "Angebote",
          selectedOptions: [offer.text],
          uniqueKey,
        },
      ];
    });

    triggerAddFeedback(offer.title);
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

    triggerAddFeedback(produkt.name);
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

    const selectedOptions = Object.entries(selectedOptionsMap).flatMap(
      ([group, items]) => items.map((item) => `${group}: ${item}`)
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

  const rabattBetrag = useMemo(
    () => gesamtpreisProdukte * 0.1,
    [gesamtpreisProdukte]
  );

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

  function scrollOffers(direction: "left" | "right") {
    const container = offersTrackRef.current;
    if (!container) return;

    const amount = container.clientWidth * 0.86;
    container.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

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
    if (!availablePreorderDates.includes(vorbestellungDatum)) {
      setVorbestellungDatum(availablePreorderDates[0]);
    }
  }, [availablePreorderDates, vorbestellungDatum]);

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
  }, [
    vorbestellung,
    availableTimeSlots,
    uhrzeit,
    availablePreorderDates,
    vorbestellungDatum,
  ]);

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
      const pruefung = istGueltigeVorbestellung(vorbestellungDatum, uhrzeit);
      if (!pruefung.ok) {
        setFehlermeldung(pruefung.message);
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
        datum:
          vorbestellung === "spaeter"
            ? vorbestellungDatum
            : formatDateInput(new Date()),
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
          gesamtpreisProdukte,
          rabattBetrag,
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
              <img src="/images/logo.jpg" alt="La Rosa Logo" className="logo-img" />
              <div className="brand-text">
                <h1 className="brand-title">La Rosa GmbH</h1>
              </div>
            </div>

            <div className="nav-right">
              <button
  className={`cart-button compact cart-button-clean ${cartPulse ? "pulse" : ""}`}
  onClick={openCheckout}
  type="button"
  aria-label="Warenkorb öffnen"
>
  <span className="cart-icon">🛒</span>

  <span className="cart-button-text">
    Warenkorb
  </span>

  <span className="cart-count cart-count-clean">{gesamtAnzahl}</span>
</button>
            </div>
          </div>
        </header>

        {showAddedEffect && (
          <div className="added-toast">
            <strong>{addedProductName}</strong>
            <span>wurde zum Warenkorb hinzugefügt</span>
          </div>
        )}

        {viewStep === "kitchens" && (
          <>
            <section className="hero-image-section">
  <div className="container">
    <div
      className="hero-image-card"
      style={{
        backgroundImage: "url('/images/hero-main.jpg')",
      }}
    >
      <div className="hero-image-overlay" />

      <div className="hero-image-content">
        <span className="hero-kicker">Willkommen</span>
        <h2 className="hero-image-title">Willkommen bei La Rosa GmbH</h2>
        <p className="hero-image-text">
          Italienische und indische Spezialitäten direkt online bestellen.
        </p>
      </div>
    </div>
  </div>
</section>

            <section className="container section-spacing offers-section">
              <div className="section-topline offers-headline">
                <div>
                  <span className="eyebrow">Angebote</span>
                  <h3 className="section-title">Unsere Angebote</h3>
                </div>

                <div className="offers-nav-desktop">
                  <button
                    type="button"
                    className="offer-nav-button"
                    onClick={() => scrollOffers("left")}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="offer-nav-button"
                    onClick={() => scrollOffers("right")}
                  >
                    →
                  </button>
                </div>
              </div>

              <div className="offers-track" ref={offersTrackRef}>
                {offerSlides.map((slide) => (
                  <article className="offer-card" key={slide.title}>
                    <div className="offer-card-top">
                      <span className="offer-label">La Rosa Angebot</span>
                      <div className="offer-price">{formatEuro(slide.price)}</div>
                    </div>

                    <h4>{slide.title}</h4>
                    <p>{slide.text}</p>

                    <div className="offer-tags">
                      <span>10% Rabatt</span>
                      <span>Versand kostenlos</span>
                    </div>

                    <button
                      className="offer-cart-button"
                      onClick={() => addOfferToCart(slide)}
                      type="button"
                    >
                      In den Warenkorb
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="container section-spacing kitchens-section">
              <div className="section-topline">
                <div>
                  <span className="eyebrow">Auswahl</span>
                  <h3 className="section-title">Küchen & Getränke</h3>
                </div>
              </div>

              <div className="cuisine-grid">
                {cuisineCards.map((card) => (
                  <button
                    key={card.cuisine}
                    className="cuisine-card"
                    onClick={() => openCuisine(card.cuisine)}
                    type="button"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.82)), url('${card.image}')`,
                    }}
                  >
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
            </section>
<section className="container opening-hours-section">
  <div className="opening-hours-topline">
    <div>
      <span className="eyebrow">Öffnungszeiten</span>
      <h3 className="section-title">Abholung & Lieferung</h3>
    </div>
  </div>

  <div className="opening-hours-grid">
    <div className="opening-hours-clean-card">
      <div className="opening-hours-card-head">
        <div>
          <span className="opening-hours-label">Service</span>
          <h4>Abholung</h4>
        </div>

        <span
          className={`opening-status-pill ${
            getServiceStatus("abholung").isOpen ? "open" : "closed"
          }`}
        >
          {getServiceStatus("abholung").isOpen ? "Jetzt geöffnet" : "Geschlossen"}
        </span>
      </div>

      <div className="opening-hours-rows">
        <div className="opening-hours-row">
          <span>Montag – Freitag</span>
          <strong>11:00 – 23:00</strong>
        </div>
        <div className="opening-hours-row">
          <span>Samstag – Sonntag</span>
          <strong>14:00 – 23:00</strong>
        </div>
      </div>
    </div>

    <div className="opening-hours-clean-card">
      <div className="opening-hours-card-head">
        <div>
          <span className="opening-hours-label">Service</span>
          <h4>Lieferung</h4>
        </div>

        <span
          className={`opening-status-pill ${
            getServiceStatus("lieferung").isOpen ? "open" : "closed"
          }`}
        >
          {getServiceStatus("lieferung").isOpen ? "Jetzt geöffnet" : "Geschlossen"}
        </span>
      </div>

      <div className="opening-hours-rows">
        <div className="opening-hours-row">
          <span>Montag – Freitag</span>
          <strong>11:00 – 22:30</strong>
        </div>
        <div className="opening-hours-row">
          <span>Samstag – Sonntag</span>
          <strong>14:00 – 22:30</strong>
        </div>
      </div>
    </div>
  </div>
</section>
            <footer className="site-footer">
              <div className="container footer-inner">
                <div>
                  <strong>La Rosa GmbH</strong>
                </div>
                <div className="footer-links">
                  <a href="/datenschutz">Datenschutz</a>
                  <a href="/agb">AGB</a>
                  <a href="/widerruf">Widerruf</a>
                  <a href="/impressum">Impressum</a>
                </div>
                <div className="footer-copy">© 2026 Alle Rechte vorbehalten.</div>
              </div>
            </footer>
          </>
        )}

        {viewStep === "categories" &&
          activeCuisine &&
          activeCuisine !== "Getränke" && (
            <section className="container category-page-section">
              <div className="section-topline inner-page-topline">
                <div>
                  <h3 className="section-title">{activeCuisine}</h3>
                </div>

                <button
                  className="back-button"
                  onClick={backFromCategories}
                  type="button"
                >
                  ← Zurück
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
            </section>
          )}

        {viewStep === "products" && activeCuisine && activeCategory && (
          <section className="container product-page-section">
            <div className="section-topline inner-page-topline">
              <div>
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
                  <div className="product-card-shine" />
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
          </section>
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
                    <div className="preorder-grid">
                      <div className="form-group">
                        <label htmlFor="vorbestellungDatum">Datum</label>
                        <select
                          id="vorbestellungDatum"
                          value={vorbestellungDatum}
                          onChange={(e) => setVorbestellungDatum(e.target.value)}
                        >
                          {availablePreorderDates.map((date) => (
                            <option key={date} value={date}>
                              {formatDateLabel(date)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="uhrzeit">Uhrzeit</label>
                        <select
                          id="uhrzeit"
                          value={uhrzeit}
                          onChange={(e) => setUhrzeit(e.target.value)}
                        >
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
                      </div>

                      <div className="preorder-note">
                        {(() => {
                          const { isWeekend } =
                            getPreorderWindowForDate(vorbestellungDatum);
                          return isWeekend
                            ? "Vorbestellungen am Wochenende: 15:00 bis 22:00 Uhr."
                            : "Vorbestellungen Montag bis Freitag: 12:00 bis 22:00 Uhr.";
                        })()}
                      </div>

                      <div className="preorder-note secondary">
                        Vorbestellungen werden nur angezeigt, wenn sie mindestens 1 Stunde in der Zukunft liegen.
                      </div>
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

                  {vorbestellung === "spaeter" && (
                    <div className="selected-preorder-box">
                      <span>Vorbestellung</span>
                      <strong>
                        {formatDateLabel(vorbestellungDatum)} · {uhrzeit || "--:--"} Uhr
                      </strong>
                    </div>
                  )}

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
            radial-gradient(circle at top left, rgba(60, 60, 60, 0.04), transparent 24%),
            linear-gradient(180deg, #fcfcfd 0%, #f6f7f9 100%);
          color: #101214;
          font-family: Inter, Arial, sans-serif;
        }

        button,
        input,
        textarea,
        select {
          font: inherit;
        }

        select {
          appearance: none;
        }

        .page-shell {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
        }

        .container {
          width: min(1220px, calc(100% - 32px));
          margin: 0 auto;
        }

        .premium-header {
          position: sticky;
          top: 0;
          z-index: 80;
          backdrop-filter: blur(18px);
          background: rgba(255, 255, 255, 0.86);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        .nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 78px;
          padding: 10px 0;
        }

        .brand-box {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1;
        }

        .logo-img {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          object-fit: cover;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: white;
          flex-shrink: 0;
        }

        .brand-title {
          margin: 0;
          font-size: 1.08rem;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: #111827;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .cart-button,
        .offer-cart-button,
        .add-button,
        .checkout-button {
          position: relative;
          overflow: hidden;
          border: none;
          border-radius: 16px;
          padding: 14px 18px;
          background: #111827;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease;
          box-shadow: 0 14px 30px rgba(17, 24, 39, 0.14);
        }

        .cart-button:hover,
        .offer-cart-button:hover,
        .add-button:hover,
        .checkout-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 34px rgba(17, 24, 39, 0.18);
        }

        .cart-button.compact {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 13px;
          min-width: 48px;
          min-height: 44px;
          border-radius: 14px;
        }

        .cart-button.pulse {
          animation: cartPulseAnim 0.7s ease;
        }

        .cart-icon {
          font-size: 1rem;
          line-height: 1;
        }

        .cart-count {
          background: rgba(255, 255, 255, 0.16);
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 0.82rem;
          line-height: 1;
        }

        .hero-image-section {
          padding-top: 22px;
        }

        .hero-image-card {
          width: 100%;
          min-height: 540px;
          border-radius: 34px;
          background-size: cover;
          background-position: center;
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.04);
        }

        .section-spacing {
          padding: 78px 0 0;
        }

        .offers-section {
          padding-top: 34px;
        }

        .kitchens-section {
          padding-bottom: 12px;
        }

        .category-page-section,
        .product-page-section {
          padding: 36px 0 72px;
        }

        .section-topline {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 22px;
        }

        .inner-page-topline {
          align-items: center;
          margin-bottom: 28px;
        }

        .eyebrow {
          display: inline-block;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.75rem;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .section-title {
          margin: 0;
          font-size: clamp(1.75rem, 3vw, 2.8rem);
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #111827;
        }

        .offers-headline {
          margin-bottom: 18px;
        }

        .offers-nav-desktop {
          display: inline-flex;
          gap: 10px;
        }

        .offer-nav-button {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.94);
          color: #111827;
          font-size: 1.1rem;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.05);
        }

        .offers-track {
          display: flex;
          gap: 18px;
          overflow-x: auto;
          padding: 6px 2px 10px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .offers-track::-webkit-scrollbar {
          display: none;
        }

        .offer-card {
          min-width: 360px;
          max-width: 360px;
          scroll-snap-align: start;
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 24px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
          border: 1px solid rgba(0, 0, 0, 0.05);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
        }

        .offer-card-top {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 14px;
        }

        .offer-label {
          display: inline-flex;
          padding: 8px 12px;
          border-radius: 999px;
          background: #111827;
          color: white;
          font-weight: 800;
          font-size: 0.85rem;
        }

        .offer-price {
          font-size: 1.35rem;
          font-weight: 900;
          color: #111827;
          white-space: nowrap;
        }

        .offer-card h4 {
          margin: 0;
          font-size: 1.55rem;
          line-height: 1.05;
          color: #111827;
        }

        .offer-card p {
          margin: 0;
          line-height: 1.78;
          color: #4b5563;
        }

        .offer-tags {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .offer-tags span {
          padding: 9px 11px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(0, 0, 0, 0.06);
          font-weight: 700;
          color: #4b5563;
          font-size: 0.88rem;
        }

        .cuisine-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .cuisine-card {
          position: relative;
          min-height: 360px;
          border: none;
          border-radius: 28px;
          overflow: hidden;
          text-align: left;
          cursor: pointer;
          background-size: cover;
          background-position: center;
          transition: transform 0.28s ease, box-shadow 0.28s ease;
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.08);
        }

        .cuisine-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 24px 52px rgba(0, 0, 0, 0.12);
        }

        .cuisine-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.82));
        }

        .cuisine-card-content {
          position: absolute;
          inset: auto 0 0 0;
          padding: 26px;
          z-index: 2;
        }

        .cuisine-tag {
          display: inline-block;
          background: #111827;
          color: white;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 800;
          margin-bottom: 14px;
        }

        .cuisine-card h4 {
          margin: 0;
          font-size: 1.9rem;
          font-weight: 900;
          color: #111827;
        }

        .cuisine-card p {
          margin: 12px 0 0;
          line-height: 1.65;
          color: #374151;
        }

        .cuisine-link {
          display: inline-block;
          margin-top: 16px;
          color: #111827;
          font-weight: 800;
        }

        .category-grid,
        .products-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .category-card,
        .product-card,
        .glass-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98));
          border: 1px solid rgba(0, 0, 0, 0.05);
          border-radius: 24px;
          box-shadow: 0 14px 32px rgba(0, 0, 0, 0.05);
        }

        .category-card {
          border: none;
          cursor: pointer;
          color: inherit;
          text-align: left;
          transition: transform 0.24s ease, box-shadow 0.24s ease;
        }

        .category-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.07);
        }

        .category-card-inner,
        .product-card,
        .glass-card {
          padding: 22px;
        }

        .category-badge {
          display: inline-block;
          margin-bottom: 14px;
          padding: 8px 12px;
          border-radius: 999px;
          background: #111827;
          color: white;
          font-weight: 800;
        }

        .category-card h4,
        .product-card h4,
        .glass-card h3 {
          margin: 0;
          color: #111827;
        }

        .category-card p,
        .product-desc {
          color: #4b5563;
          line-height: 1.7;
        }

        .category-link {
          display: inline-block;
          margin-top: 10px;
          font-weight: 800;
          color: #111827;
        }

        .product-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: relative;
          overflow: hidden;
        }

        .product-card-shine {
          position: absolute;
          inset: -200% auto auto -40%;
          width: 110px;
          height: 240%;
          transform: rotate(18deg);
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0),
            rgba(255,255,255,0.25),
            rgba(255,255,255,0)
          );
          transition: transform 0.7s ease;
          pointer-events: none;
        }

        .product-card:hover .product-card-shine {
          transform: translateX(420px) rotate(18deg);
        }

        .product-card-top {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: start;
        }

        .product-number {
          display: inline-block;
          font-size: 0.74rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 8px;
          font-weight: 800;
        }

        .product-price {
          padding: 9px 11px;
          border-radius: 13px;
          background: #111827;
          color: white;
          font-weight: 800;
          white-space: nowrap;
          font-size: 0.94rem;
        }

        .mini-chip-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .mini-chip {
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.94);
          color: #374151;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .mini-chip.soft {
          background: #f3f4f6;
          color: #374151;
        }

        .back-button {
          border: none;
          border-radius: 15px;
          padding: 13px 16px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.2s ease, opacity 0.2s ease;
          background: rgba(255, 255, 255, 0.94);
          color: #374151;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .back-button:hover {
          transform: translateY(-2px);
        }

        .site-footer {
          margin-top: 80px;
          border-top: 1px solid rgba(0, 0, 0, 0.05);
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(12px);
        }

        .footer-inner {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 18px;
          align-items: center;
          padding: 24px 0;
        }

        .footer-copy {
          margin: 0;
          color: #6b7280;
        }

        .footer-links {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .footer-links a {
          color: #374151;
          text-decoration: none;
          font-weight: 700;
        }

        .checkout-section {
          padding: 42px 0 82px;
        }

        .checkout-topline {
          align-items: center;
        }

        .checkout-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) 390px;
          gap: 22px;
        }

        .checkout-main {
          display: grid;
          gap: 18px;
        }

        .sticky-card {
          position: sticky;
          top: 104px;
        }

        .cart-list {
          display: grid;
          gap: 14px;
        }

        .cart-item {
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.84);
        }

        .cart-item-header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: start;
        }

        .cart-item-header small {
          display: inline-block;
          margin-top: 6px;
          color: #6b7280;
          line-height: 1.5;
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
          background: #f3f4f6;
          color: #374151;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .quantity-box {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          background: rgba(255, 255, 255, 0.96);
          border-radius: 999px;
          padding: 8px 12px;
          border: 1px solid rgba(0, 0, 0, 0.06);
        }

        .quantity-box button {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 999px;
          background: #111827;
          color: white;
          cursor: pointer;
          font-size: 1.05rem;
        }

        .switch-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .switch-row button {
          flex: 1;
          min-width: 130px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.94);
          color: #374151;
          border-radius: 15px;
          padding: 13px 15px;
          cursor: pointer;
          font-weight: 800;
        }

        .switch-row button.active {
          background: #111827;
          color: white;
          border-color: transparent;
        }

        .switch-row button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .helper-box,
        .helper-text {
          color: #6b7280;
        }

        .helper-box {
          margin-top: 14px;
          padding: 14px 15px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.74);
        }

        .helper-text {
          margin-top: 8px;
          font-size: 0.9rem;
        }

        .form-grid,
        .preorder-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .form-group {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .form-group label {
          color: #374151;
          font-weight: 700;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          border-radius: 15px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          background: rgba(255, 255, 255, 0.98);
          color: #111827;
          padding: 14px 15px;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          border-color: rgba(17, 24, 39, 0.18);
          box-shadow: 0 0 0 4px rgba(17, 24, 39, 0.05);
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: #9ca3af;
        }

        .form-group input:disabled {
          opacity: 0.82;
        }

        .preorder-note {
          grid-column: 1 / -1;
          padding: 14px 15px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.76);
          color: #374151;
          line-height: 1.6;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .preorder-note.secondary {
          color: #6b7280;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }

        .summary-row.discount span:last-child {
          color: #166534;
          font-weight: 800;
        }

        .summary-row.free span:last-child {
          color: #111827;
          font-weight: 800;
        }

        .summary-row.total {
          font-size: 1.08rem;
          font-weight: 900;
          border-bottom: none;
          padding-bottom: 0;
        }

        .selected-preorder-box {
          margin-top: 18px;
          padding: 15px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .selected-preorder-box span {
          display: block;
          color: #6b7280;
          margin-bottom: 6px;
        }

        .selected-preorder-box strong {
          color: #111827;
          line-height: 1.6;
        }

        .message {
          margin-top: 16px;
          padding: 14px 15px;
          border-radius: 15px;
          line-height: 1.6;
        }

        .message.error {
          background: rgba(239, 68, 68, 0.1);
          color: #991b1b;
          border: 1px solid rgba(239, 68, 68, 0.12);
        }

        .message.success {
          background: rgba(22, 163, 74, 0.1);
          color: #166534;
          border: 1px solid rgba(22, 163, 74, 0.12);
        }

        .empty-state {
          color: #6b7280;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          z-index: 100;
          backdrop-filter: blur(8px);
        }

        .product-modal {
          width: min(720px, 100%);
          max-height: 90vh;
          overflow-y: auto;
          border-radius: 26px;
          background: linear-gradient(180deg, #ffffff, #f8f9fb);
          border: 1px solid rgba(0, 0, 0, 0.07);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.12);
          padding: 22px;
        }

        .modal-header,
        .modal-footer {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: center;
        }

        .modal-close {
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          cursor: pointer;
          background: #111827;
          color: white;
          font-size: 1.3rem;
        }

        .modal-description {
          margin: 18px 0 0;
          color: #4b5563;
          line-height: 1.7;
        }

        .modal-section {
          margin-top: 20px;
        }

        .modal-section h4 {
          margin: 0 0 12px;
          color: #111827;
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
          border: 1px solid rgba(0, 0, 0, 0.07);
          border-radius: 17px;
          background: rgba(255, 255, 255, 0.94);
          color: #111827;
          padding: 14px 15px;
          cursor: pointer;
        }

        .modal-choice.active {
          border-color: rgba(17, 24, 39, 0.22);
          background: rgba(243, 244, 246, 0.96);
        }

        .modal-footer {
          margin-top: 22px;
        }

        .modal-price-box {
          display: grid;
          gap: 4px;
        }

        .modal-price-box span {
          color: #6b7280;
        }

        .modal-price-box strong {
          font-size: 1.15rem;
          color: #111827;
        }

        .added-toast {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 120;
          min-width: 260px;
          max-width: calc(100vw - 28px);
          padding: 16px 16px;
          border-radius: 20px;
          background: rgba(17, 24, 39, 0.97);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 38px rgba(17, 24, 39, 0.18);
          animation: toastIn 1.8s ease forwards;
        }

        .added-toast strong,
        .added-toast span {
          display: block;
        }

        .added-toast strong {
          margin-bottom: 6px;
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
          35% {
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

        @media (max-width: 1100px) {
          .cuisine-grid,
          .category-grid,
          .products-grid,
          .checkout-layout,
          .footer-inner {
            grid-template-columns: 1fr;
          }

          .sticky-card {
            position: static;
          }

          .checkout-sidebar {
            order: -1;
          }
        }

        @media (max-width: 900px) {
          .hero-image-card {
            min-height: 430px;
          }

          .offer-card {
            min-width: 320px;
            max-width: 320px;
          }
        }

        @media (max-width: 760px) {
          .container {
            width: min(100%, calc(100% - 18px));
          }

          .nav-inner {
            min-height: 72px;
            gap: 10px;
          }

          .logo-img {
            width: 44px;
            height: 44px;
            border-radius: 14px;
          }

          .brand-title {
            font-size: 0.98rem;
          }

          .cart-button.compact {
            min-width: 42px;
            min-height: 42px;
            padding: 10px 11px;
          }

          .cart-icon {
            font-size: 0.95rem;
          }

          .cart-count {
            padding: 4px 7px;
            font-size: 0.76rem;
          }

          .hero-image-section {
            padding-top: 14px;
          }

          .hero-image-card {
            min-height: 240px;
            border-radius: 24px;
            background-position: center;
          }

          .section-spacing {
            padding-top: 42px;
          }

          .offers-section {
            padding-top: 20px;
          }

          .category-page-section,
          .product-page-section,
          .checkout-section {
            padding: 24px 0 64px;
          }

          .section-topline,
          .modal-header,
          .modal-footer,
          .cart-item-header {
            flex-direction: column;
            align-items: stretch;
          }

          .offers-nav-desktop {
            display: none;
          }

          .offers-track {
            gap: 14px;
            padding-bottom: 6px;
          }

          .offer-card {
            min-width: 86%;
            max-width: 86%;
            padding: 20px;
            border-radius: 22px;
          }

          .offer-card h4 {
            font-size: 1.35rem;
          }

          .cuisine-grid,
          .form-grid,
          .preorder-grid {
            grid-template-columns: 1fr;
          }

          .cuisine-card {
            min-height: 280px;
            border-radius: 24px;
          }

          .cuisine-card-content {
            padding: 22px;
          }

          .glass-card,
          .product-card,
          .category-card-inner {
            padding: 18px;
          }

          .switch-row button {
            min-width: 0;
          }

          .product-modal {
            padding: 18px;
            border-radius: 22px;
          }

          .footer-inner {
            gap: 14px;
            padding: 22px 0;
          }

          .footer-links {
            gap: 12px;
          }

          .added-toast {
            right: 10px;
            left: 10px;
            bottom: 12px;
            min-width: auto;
          }
        }

        @media (max-width: 480px) {
          .hero-image-card {
            min-height: 210px;
          }

          .section-title {
            font-size: 1.55rem;
          }

          .offer-card {
            min-width: 90%;
            max-width: 90%;
          }

          .offer-price {
            font-size: 1.2rem;
          }

          .product-price {
            font-size: 0.86rem;
            padding: 8px 10px;
          }

          .quantity-box button {
            width: 32px;
            height: 32px;
          }

          .modal-choice {
            padding: 13px 14px;
          }
        }
      `}</style>
    </>
  );
}