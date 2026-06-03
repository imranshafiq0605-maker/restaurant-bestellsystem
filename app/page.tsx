"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
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
    text: "2× Familienpizza (36 cm) + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 2",
    price: 24,
    text: "3× Pizza (24 cm) + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 3",
    price: 37.5,
    text: "3× Pizza (31 cm) + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 4",
    price: 23.5,
    text: "2× Pasta + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 5",
    price: 32.5,
    text: "2× Schnitzel + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 6",
    price: 53.5,
    text: "1× Pizza (31 cm) + 1× Schnitzel + 1× Pasta + 1× Salat + 1L Getränk nach Wahl",
  },
  {
    title: "Angebot 452",
    price: 33.5,
    text: "2× Indisches Gericht + 1L Getränk nach Wahl",
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
function formatDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) {
    return {
      ok: false,
      message: "Bitte gib deine E-Mail-Adresse ein.",
    };
  }

  if (!emailBereinigt.includes("@")) {
    return {
      ok: false,
      message: "Bitte gib eine E-Mail-Adresse mit @ ein.",
    };
  }

  return {
    ok: true,
    message: "E-Mail sieht gültig aus.",
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

function getProductBasePrice(produkt: Product): number {
  if (typeof produkt.price === "number") return produkt.price;

  if (produkt.variants?.length) {
    return produkt.variants[0]?.price ?? 0;
  }

  if (produkt.options?.length) {
    const firstGroup = produkt.options[0];
    const firstItem = firstGroup?.items?.[0];

    if (!firstItem) return 0;

    if (typeof firstItem.price === "number") {
      return firstItem.price;
    }

    if (firstItem.priceByVariant) {
      const firstVariantName = produkt.variants?.[0]?.name;
      if (firstVariantName) {
        return firstItem.priceByVariant[firstVariantName] ?? 0;
      }
    }
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
  const MANUAL_NOTICE_ACTIVE = true;
const MANUAL_NOTICE_TEXT = "( Heute öffnen wir erst ab 17 Uhr )";
const MANUAL_CHECKOUT_BLOCKED = true;
  const [cart, setCart] = useState<CartItem[]>([]);
const [cartLoaded, setCartLoaded] = useState(false);
  const [bestellart, setBestellart] = useState<Bestellart>("abholung");
  const [name, setName] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
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
  const [specialClosed, setSpecialClosed] = useState(false);
const [specialClosedReason, setSpecialClosedReason] = useState("");
const [specialClosedLoading, setSpecialClosedLoading] = useState(true);

  const [viewStep, setViewStep] = useState<ViewStep>("kitchens");
  const [activeCuisine, setActiveCuisine] = useState<Cuisine | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  Record<string, { name: string; price: number }[]>
>({});
  const [modalError, setModalError] = useState("");
  const [activeOffer, setActiveOffer] = useState<OfferSlide | null>(null);
const [offerInputText, setOfferInputText] = useState("");

  const [adminClicks, setAdminClicks] = useState(0);
  const offersTrackRef = useRef<HTMLDivElement | null>(null);

  const baseStatus = getServiceStatus(bestellart);

const status = specialClosed
  ? { isOpen: false }
  : baseStatus;

  const availablePreorderDates = useMemo(() => getAvailablePreorderDates(), []);
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
  localStorage.setItem("larosa_cart", JSON.stringify(cart));
  window.location.href = "/warenkorb";
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
function addOfferToCartWithText(offer: OfferSlide, customText: string) {
  const cleanedText = customText.trim();

  if (!cleanedText) return;

  const uniqueKey = `offer-${offer.title}-${cleanedText}`;

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
        selectedOptions: [cleanedText],
        uniqueKey,
      },
    ];
  });

  triggerAddFeedback(offer.title);
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
    const initialOptionPrices: Record<string, { name: string; price: number }[]> = {};

    produkt.options?.forEach((group) => {
  if (group.required && group.items.length > 0) {
    const firstItem = group.items[0];
    const firstPrice =
      typeof firstItem.price === "number"
        ? firstItem.price
        : firstItem.priceByVariant?.[
            produkt.variants?.[0]?.name || selectedVariantName
          ] || 0;

    initialOptions[group.group] = [firstItem.name];
    initialOptionPrices[group.group] = [
      {
        name: firstItem.name,
        price: firstPrice,
      },
    ];
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
    const currentEntries = prev[groupName] || [];
    const exists = currentEntries.some((entry) => entry.name === itemName);

    if (multiple) {
      return {
        ...prev,
        [groupName]: exists
          ? currentEntries.filter((entry) => entry.name !== itemName)
          : [...currentEntries, { name: itemName, price: itemPrice }],
      };
    }

    return {
      ...prev,
      [groupName]: [{ name: itemName, price: itemPrice }],
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

  selectedProduct.options?.forEach((group) => {
    const selectedEntries = selectedOptionsPriceMap[group.group] || [];

    if (
      selectedProduct.id === 39 &&
      group.group === "Extras Partypizza"
    ) {
      const extraCount = Math.max(0, selectedEntries.length - 1);
      total += extraCount * 4;
      return;
    }

    selectedEntries.forEach((entry) => {
      total += entry.price;
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
    number: produkt.number ? String(produkt.number) : "",
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

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return produkte
      .filter((produkt) => {
        const searchable = [
          produkt.number?.toString() ?? "",
          produkt.name,
          produkt.description,
          produkt.category,
          produkt.cuisine,
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      })
      .slice(0, 8);
  }, [searchQuery]);

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
  try {
    const savedCart = localStorage.getItem("larosa_cart");

    if (savedCart) {
      const parsedCart = JSON.parse(savedCart);

      if (Array.isArray(parsedCart)) {
        setCart(parsedCart);
      }
    }
  } catch (error) {
    console.error("Warenkorb konnte nicht geladen werden:", error);
  } finally {
    setCartLoaded(true);
  }
}, []);

useEffect(() => {
  if (!cartLoaded) return;

  try {
    localStorage.setItem("larosa_cart", JSON.stringify(cart));
  } catch (error) {
    console.error("Warenkorb konnte nicht gespeichert werden:", error);
  }
}, [cart, cartLoaded]);

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
  if (!selectedProduct?.options?.length) return;
  

  const recalculatedPriceMap: Record<string, { name: string; price: number }[]> = {};

  selectedProduct.options.forEach((group) => {
    const selectedNames = selectedOptionsMap[group.group] || [];

    recalculatedPriceMap[group.group] = selectedNames.map((selectedName) => {
      const foundItem = group.items.find((item) => item.name === selectedName);

      const recalculatedPrice =
        typeof foundItem?.price === "number"
          ? foundItem.price
          : foundItem?.priceByVariant?.[selectedVariantName] ?? 0;

      return {
        name: selectedName,
        price: recalculatedPrice,
      };
    });
  });
  

  setSelectedOptionsPriceMap(recalculatedPriceMap);
}, [selectedVariantName, selectedProduct, selectedOptionsMap]);

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
    if (specialClosed) {
  setFehlermeldung(
    specialClosedReason
      ? `Heute geschlossen: ${specialClosedReason}`
      : "Heute nehmen wir keine Bestellungen an."
  );
  return;
}
    setFehlermeldung("");
    setErfolgsmeldung("");
    if (MANUAL_CHECKOUT_BLOCKED) {
  setFehlermeldung(MANUAL_NOTICE_TEXT || "Bestellungen sind aktuell nicht möglich.");
  return;
}

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
    function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) {
    return {
      ok: false,
      message: "Bitte gib deine E-Mail-Adresse ein.",
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(emailBereinigt)) {
    return {
      ok: false,
      message: "Bitte gib eine gültige E-Mail-Adresse ein.",
    };
  }

  return {
    ok: true,
    message: "E-Mail sieht gültig aus.",
  };
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
  name,
  telefon,
  email: email.trim(),
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
          email: email.trim(),
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
    } catch (error: unknown) {
      console.error("Fehler bei pending order oder Stripe:", error);
      const message =
        error instanceof Error ? error.message : "Bestellung konnte nicht verarbeitet werden.";
      setFehlermeldung(
        message || "Bestellung konnte nicht verarbeitet werden."
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
  <div className="brand-logo-shell">
    <img src="/images/logo.jpg" alt="La Rosa Logo" className="logo-img" />
  </div>

  <div className="brand-text">
    <span className="brand-kicker">Restaurant & Lieferservice</span>
    <h1 className="brand-title">La Rosa GmbH</h1>
  </div>
</div>

            <div className="header-search-wrap">
              <div className="header-search-glow" />
              <label className="header-search" htmlFor="produkt-suche">
                <span className="search-symbol" aria-hidden="true" />
                <input
                  id="produkt-suche"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Produkt suchen..."
                  autoComplete="off"
                />
                {searchQuery && (
                  <button
                    className="search-clear"
                    onClick={() => setSearchQuery("")}
                    type="button"
                    aria-label="Suche löschen"
                  >
                    ×
                  </button>
                )}
              </label>

              {searchQuery.trim() && (
                <div className="search-results-panel">
                  {searchResults.length > 0 ? (
                    searchResults.map((produkt) => (
                      <button
                        className="search-result-item"
                        key={produkt.id}
                        onClick={() => {
                          setSearchQuery("");
                          openProductModal(produkt);
                        }}
                        type="button"
                      >
                        <span className="search-result-main">
                          <strong>{produkt.name}</strong>
                          <small>
                            {produkt.cuisine} · {produkt.category}
                          </small>
                        </span>
                        <span className="search-result-price">
                          {formatEuro(getProductBasePrice(produkt))}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="search-empty-state">
                      Kein Produkt gefunden
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="nav-right">
              <a className="call-button" href="tel:06105297883" aria-label="La Rosa anrufen">
                <span className="call-icon" aria-hidden="true">📞</span>
                <span className="call-text">
                  <small>Anrufen</small>
                  <strong>06105 297883</strong>
                </span>
              </a>

              <div className="halal-chip" aria-label="Halal">
                <img src="/images/halal.png" alt="" className="header-halal-badge" />
                <span>Halal</span>
              </div>

              <button
  className={`cart-button compact cart-button-clean ${cartPulse ? "pulse" : ""}`}
  onClick={openCheckout}
  type="button"
  aria-label="Warenkorb öffnen"
>
  <span className="cart-icon" aria-hidden="true">Bag</span>

  <span className="cart-button-text">
    Warenkorb
  </span>

  <span className="cart-count cart-count-clean">{gesamtAnzahl}</span>
</button>
            </div>
          </div>
        </header>
        {MANUAL_NOTICE_ACTIVE && (
  <div className="manual-notice-bar">
    {MANUAL_NOTICE_TEXT}
  </div>
)}

        {showAddedEffect && (
          <div className="added-toast">
            <strong>{addedProductName}</strong>
            <span>wurde zum Warenkorb hinzugefügt</span>
          </div>
        )}

        {viewStep === "kitchens" && (
          <>
          {specialClosed && (
  <section className="container section-spacing">
    <div className="special-closure-banner">
      <span className="special-closure-label">Heute geschlossen</span>
      <h3>Heute nehmen wir keine Bestellungen an</h3>
      {specialClosedReason ? (
        <p>Grund: {specialClosedReason}</p>
      ) : (
        <p>Heute ist eine besondere Schließzeit eingetragen.</p>
      )}
    </div>
  </section>
)}
           <section className="container hero-image-section">
    <div
      className="hero-image-card"
      style={{
        backgroundImage: "url('/images/hero-main.jpg')",
      }}
    >
      <div className="hero-image-overlay" />

      <div className="hero-image-content">
        

        <span className="hero-kicker">Online bestellen</span>
        <h2 className="hero-image-title">La Rosa GmbH</h2>
        <p className="hero-image-text">
          Wähle deine Küche, stelle dein Gericht zusammen und bestelle bequem mit 10% Rabatt.
        </p>
        <div className="hero-actions">
          <a className="hero-primary-link" href="#bestellen">
            Jetzt bestellen
          </a>
          <button
            className="hero-secondary-link"
            onClick={openCheckout}
            type="button"
          >
            Warenkorb ansehen
          </button>
        </div>
      </div>
    </div>
</section>
<section className="container hero-benefits-section">
  <div className="hero-benefits-bar">
    <span className="hero-benefit-pill">1. Küche wählen</span>
    <span className="hero-benefit-divider">•</span>
    <span className="hero-benefit-pill">2. Gericht antippen</span>
    <span className="hero-benefit-divider">/</span>
    <span className="hero-benefit-pill">3. 10% sparen</span>
  </div>
</section>

            <section className="container section-spacing offers-section">
              <div className="section-topline offers-headline">
                <div>
                  <span className="eyebrow">Beliebt</span>
                  <h3 className="section-title">Angebote für Gruppen</h3>
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
                      onClick={() => {
  setActiveOffer(slide);
  setOfferInputText("");
}}
                      type="button"
                    >
                      In den Warenkorb
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="container section-spacing kitchens-section" id="bestellen">
              <div className="section-topline">
                <div>
                  <span className="eyebrow">Speisekarte</span>
                  <h3 className="section-title">Was möchtest du bestellen?</h3>
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
                          ? "Getränke ansehen"
                          : "Kategorien ansehen"}
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

        
  

        {selectedProduct && (
          <div className="modal-backdrop" onClick={resetModal}>
            <div className="product-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <span className="eyebrow">{selectedProduct?.category}</span>
<h3>{selectedProduct?.name}</h3>
                </div>

                <button className="modal-close" onClick={resetModal} type="button">
                  ×
                </button>
              </div>

              <p className="modal-description">{selectedProduct?.description}</p>

              {selectedProduct?.variants && selectedProduct.variants.length > 0 && (
                <div className="modal-section">
                  <h4>Variante wählen</h4>
                  <div className="modal-choice-list">
                    {selectedProduct.variants?.map((variant) => (
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
          (selectedOptionsMap[optionGroup.group] || []).includes(item.name);

        const calculatedPrice =
          typeof item.price === "number"
            ? item.price
            : item.priceByVariant?.[selectedVariantName] ?? 0;

        return (
          <button
            key={item.name}
            type="button"
            className={`modal-choice ${checked ? "active" : ""}`}
            onClick={() =>
              handleOptionChange(
                optionGroup.group,
                item.name,
                calculatedPrice,
                optionGroup.multiple
              )
            }
          >
            <span>{item.name}</span>
            <strong>
  {selectedProduct.id === 39 && optionGroup.group === "Extras Partypizza"
    ? "1 frei / danach +4,00 €"
    : calculatedPrice > 0
    ? `+${calculatedPrice.toFixed(2)} €`
    : "inkl."}
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
        {activeOffer && (
  <div className="modal-backdrop" onClick={() => setActiveOffer(null)}>
    <div className="product-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div>
          <span className="eyebrow">Angebot</span>
          <h3>{activeOffer.title}</h3>
        </div>

        <button
          className="modal-close"
          onClick={() => setActiveOffer(null)}
          type="button"
        >
          ×
        </button>
      </div>

      <p className="modal-description">{activeOffer.text}</p>

      <div className="modal-section">
        <h4>Was möchtest du genau?</h4>

        <textarea
          placeholder="z.B. Pizza Salami, Pizza Spinat, Cola"
          value={offerInputText}
          onChange={(e) => setOfferInputText(e.target.value)}
          rows={5}
        />
      </div>

      <div className="modal-footer">
        <div className="modal-price-box">
          <span>Angebotspreis</span>
          <strong>{activeOffer.price.toFixed(2)} €</strong>
        </div>

        <button
          className="checkout-button"
          type="button"
          onClick={() => {
            if (!offerInputText.trim()) return;

            addOfferToCartWithText(activeOffer, offerInputText);
            setActiveOffer(null);
            setOfferInputText("");
          }}
        >
          In den Warenkorb
        </button>
      </div>
    </div>
  </div>
)}

        {gesamtAnzahl > 0 && (
          <button className="mobile-cart-dock" onClick={openCheckout} type="button">
            <span>{gesamtAnzahl} Artikel</span>
            <strong>{formatEuro(gesamtpreis)}</strong>
            <em>Zum Warenkorb</em>
          </button>
        )}

        <div
          onClick={() => setAdminClicks((c) => c + 1)}
          className="secret-admin-dot"
        />
      </main>

      <style>{`
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
          overflow-x: hidden;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
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
          top: env(safe-area-inset-top, 0);
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
          overflow-wrap: anywhere;
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
          min-height: 44px;
          touch-action: manipulation;
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
          scroll-padding-inline: 2px;
          overscroll-behavior-inline: contain;
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
          scroll-snap-stop: always;
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
          min-width: 0;
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
          flex-shrink: 0;
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
          overflow-wrap: anywhere;
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
            width: min(100%, calc(100% - 16px));
          }

          .nav-inner {
            min-height: 66px;
            gap: 8px;
          }

          .logo-img {
            width: 44px;
            height: 44px;
            border-radius: 14px;
          }

          .brand-title {
            font-size: 0.92rem;
            line-height: 1.15;
          }

          .cart-button.compact {
            min-width: 44px;
            min-height: 44px;
            padding: 10px;
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
            min-height: clamp(220px, 62vw, 300px);
            border-radius: 22px;
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
            margin-inline: -8px;
            padding: 6px 8px 10px;
            scroll-padding-inline: 8px;
          }

          .offer-card {
            min-width: min(86%, 340px);
            max-width: min(86%, 340px);
            padding: 18px;
            border-radius: 20px;
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
            min-height: 250px;
            border-radius: 22px;
          }

          .cuisine-card-content {
            padding: 22px;
          }

          .glass-card,
          .product-card,
          .category-card-inner {
            padding: 16px;
            border-radius: 20px;
          }

          .product-card-top {
            flex-direction: column;
            gap: 10px;
          }

          .product-price {
            align-self: flex-start;
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
            bottom: max(12px, env(safe-area-inset-bottom));
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
            min-width: 88%;
            max-width: 88%;
          }

          .offer-price {
            font-size: 1.2rem;
          }

          .product-price {
            font-size: 0.86rem;
            padding: 8px 10px;
          }

          .quantity-box button {
            width: 36px;
            height: 36px;
          }

          .modal-choice {
            padding: 13px 14px;
          }
        }

        /* Fresh ordering layout */
        body {
          background: #f4f6f8;
          color: #17202a;
        }

        .page-shell {
          padding-bottom: 0;
        }

        .container {
          width: min(1180px, calc(100% - 40px));
        }

        .premium-header {
          background: rgba(255, 255, 255, 0.94);
          border-bottom: 1px solid #dde3ea;
          box-shadow: 0 8px 28px rgba(23, 32, 42, 0.06);
        }

        .nav-inner {
          min-height: 70px;
          padding: 8px 0;
        }

        .brand-box {
          gap: 10px;
        }

        .logo-img {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          box-shadow: none;
        }

        .header-halal-badge {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: none;
          border: 1px solid #dde3ea;
        }

        .brand-title {
          font-size: 1rem;
          letter-spacing: 0;
        }

        .cart-button-clean,
        .cart-button,
        .offer-cart-button,
        .add-button,
        .checkout-button,
        .back-button,
        .hero-primary-link,
        .hero-secondary-link {
          border-radius: 8px;
          min-height: 46px;
          box-shadow: none;
          letter-spacing: 0;
        }

        .cart-button-clean,
        .cart-button,
        .add-button,
        .checkout-button,
        .hero-primary-link {
          background: #17202a;
          color: #ffffff;
        }

        .cart-button-clean:hover,
        .cart-button:hover,
        .offer-cart-button:hover,
        .add-button:hover,
        .checkout-button:hover {
          transform: none;
          box-shadow: none;
        }

        .cart-button-text {
          display: inline-flex;
        }

        .cart-count-clean,
        .cart-count {
          background: #ffffff;
          color: #17202a;
          border: 1px solid rgba(255, 255, 255, 0.28);
          font-weight: 900;
        }

        .hero-image-section {
          padding-top: 20px;
        }

        .hero-image-card {
          min-height: 430px;
          border-radius: 8px;
          box-shadow: none;
          border: 1px solid #dde3ea;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          position: relative;
          background-position: center;
        }

        .hero-image-overlay {
          background:
            linear-gradient(90deg, rgba(9, 15, 22, 0.82), rgba(9, 15, 22, 0.34) 56%, rgba(9, 15, 22, 0.12)),
            linear-gradient(0deg, rgba(9, 15, 22, 0.42), transparent 54%);
          backdrop-filter: none;
        }

        .hero-image-content {
          position: relative;
          z-index: 2;
          width: min(650px, 100%);
          min-height: 0;
          padding: 42px;
          text-align: left;
          color: #ffffff;
          animation: none;
        }

        .hero-kicker,
        .eyebrow,
        .opening-hours-label,
        .checkout-kicker {
          letter-spacing: 0;
          text-transform: none;
        }

        .hero-kicker {
          padding: 7px 10px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          font-size: 0.86rem;
          font-weight: 800;
        }

        .hero-image-title {
          margin: 18px 0 0;
          font-size: 3rem;
          line-height: 1.02;
          letter-spacing: 0;
          color: #ffffff;
          text-shadow: none;
        }

        .hero-image-text {
          margin: 14px 0 0;
          max-width: 560px;
          font-size: 1.08rem;
          line-height: 1.55;
          color: rgba(255, 255, 255, 0.92);
          text-shadow: none;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }

        .hero-primary-link,
        .hero-secondary-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 13px 16px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
          border: 1px solid transparent;
        }

        .hero-secondary-link {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.28);
        }

        .hero-benefits-section {
          padding-top: 12px;
        }

        .hero-benefits-bar {
          justify-content: flex-start;
          padding: 12px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #dde3ea;
          box-shadow: none;
        }

        .hero-benefit-pill {
          color: #17202a;
          font-size: 0.92rem;
          font-weight: 900;
        }

        .hero-benefit-divider {
          color: #b7c0cb;
        }

        .section-spacing {
          padding-top: 52px;
        }

        .section-topline {
          align-items: flex-end;
          margin-bottom: 16px;
        }

        .eyebrow {
          color: #c2410c;
          font-size: 0.85rem;
          margin-bottom: 6px;
        }

        .section-title {
          font-size: 2rem;
          letter-spacing: 0;
          line-height: 1.12;
        }

        .offers-track {
          gap: 12px;
          padding: 2px 2px 12px;
        }

        .offer-card,
        .category-card,
        .product-card,
        .opening-hours-clean-card,
        .special-closure-banner {
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #dde3ea;
          box-shadow: none;
        }

        .offer-card {
          min-width: 310px;
          max-width: 310px;
          padding: 18px;
        }

        .offer-label,
        .category-badge,
        .cuisine-tag {
          border-radius: 8px;
          background: #e11d48;
          color: #ffffff;
          padding: 7px 9px;
          font-size: 0.82rem;
        }

        .offer-price {
          color: #17202a;
          font-size: 1.18rem;
        }

        .offer-card h4 {
          font-size: 1.35rem;
          letter-spacing: 0;
        }

        .offer-card p,
        .cuisine-card p,
        .product-desc,
        .category-card p {
          line-height: 1.55;
        }

        .offer-tags span,
        .mini-chip,
        .cart-option-pill {
          border-radius: 8px;
          background: #edf2f7;
          color: #334155;
          border: 1px solid #dde3ea;
        }

        .offer-cart-button {
          margin-top: auto;
          background: #0f766e;
          color: #ffffff;
        }

        .cuisine-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .cuisine-card {
          min-height: 300px;
          border-radius: 8px;
          box-shadow: none;
          border: 1px solid #dde3ea;
        }

        .cuisine-card:hover,
        .category-card:hover {
          transform: none;
          box-shadow: none;
        }

        .cuisine-card::after {
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.9));
        }

        .cuisine-card-content {
          padding: 20px;
        }

        .cuisine-card h4 {
          font-size: 1.55rem;
          letter-spacing: 0;
        }

        .cuisine-link,
        .category-link {
          color: #c2410c;
        }

        .opening-hours-section {
          padding-top: 52px;
        }

        .opening-hours-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .opening-hours-clean-card {
          padding: 18px;
        }

        .opening-hours-card-head,
        .opening-hours-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .opening-hours-card-head h4 {
          margin: 4px 0 0;
          font-size: 1.2rem;
        }

        .opening-status-pill {
          border-radius: 8px;
          padding: 7px 9px;
          font-size: 0.85rem;
          font-weight: 900;
        }

        .opening-status-pill.open {
          background: #dcfce7;
          color: #166534;
        }

        .opening-status-pill.closed {
          background: #fee2e2;
          color: #991b1b;
        }

        .opening-hours-rows {
          display: grid;
          gap: 10px;
          margin-top: 18px;
        }

        .opening-hours-row {
          padding-top: 10px;
          border-top: 1px solid #edf2f7;
        }

        .category-page-section,
        .product-page-section {
          padding-top: 24px;
        }

        .inner-page-topline {
          position: sticky;
          top: 70px;
          z-index: 50;
          align-items: center;
          padding: 12px 0;
          background: rgba(244, 246, 248, 0.94);
          backdrop-filter: blur(12px);
        }

        .category-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .category-card-inner {
          padding: 18px;
        }

        .category-card h4 {
          font-size: 1.18rem;
          letter-spacing: 0;
        }

        .products-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .product-card {
          padding: 16px;
          gap: 12px;
        }

        .product-card-shine {
          display: none;
        }

        .product-card-top {
          align-items: flex-start;
        }

        .product-number {
          letter-spacing: 0;
          margin-bottom: 6px;
          color: #64748b;
        }

        .product-card h4 {
          font-size: 1.1rem;
          line-height: 1.25;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .product-price {
          border-radius: 8px;
          background: #17202a;
          font-size: 0.9rem;
        }

        .add-button {
          width: 100%;
          margin-top: auto;
          background: #0f766e;
        }

        .site-footer {
          margin-top: 52px;
          background: #ffffff;
          border-top: 1px solid #dde3ea;
        }

        .footer-inner {
          grid-template-columns: 1fr auto;
          padding: 22px 0;
        }

        .footer-copy {
          grid-column: 1 / -1;
        }

        .modal-backdrop {
          background: rgba(23, 32, 42, 0.38);
          padding: 16px;
          align-items: center;
        }

        .product-modal {
          border-radius: 8px;
          background: #ffffff;
          box-shadow: none;
          border: 1px solid #dde3ea;
        }

        .modal-choice {
          border-radius: 8px;
          text-align: left;
        }

        .modal-choice.active {
          background: #ecfdf5;
          border-color: #0f766e;
        }

        .modal-close {
          border-radius: 8px;
        }

        .mobile-cart-dock {
          display: none;
        }

        @media (max-width: 980px) {
          .cuisine-grid,
          .category-grid,
          .products-grid,
          .opening-hours-grid,
          .footer-inner {
            grid-template-columns: 1fr;
          }

          .hero-image-card {
            min-height: 390px;
          }
        }

        @media (max-width: 760px) {
          .container {
            width: min(100%, calc(100% - 16px));
          }

          .nav-inner {
            min-height: 62px;
          }

          .logo-img {
            width: 42px;
            height: 42px;
          }

          .header-halal-badge {
            width: 30px;
            height: 30px;
          }

          .brand-title {
            font-size: 0.95rem;
          }

          .cart-button-text {
            display: none;
          }

          .hero-image-section {
            padding-top: 10px;
          }

          .hero-image-card {
            min-height: 360px;
          }

          .hero-image-overlay {
            background:
              linear-gradient(0deg, rgba(9, 15, 22, 0.84), rgba(9, 15, 22, 0.16)),
              linear-gradient(90deg, rgba(9, 15, 22, 0.46), rgba(9, 15, 22, 0.12));
          }

          .hero-image-content {
            padding: 22px;
            width: 100%;
          }

          .hero-image-title {
            font-size: 2.15rem;
          }

          .hero-image-text {
            font-size: 1rem;
          }

          .hero-actions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .hero-primary-link,
          .hero-secondary-link {
            width: 100%;
          }

          .hero-benefits-bar {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .hero-benefit-divider {
            display: none;
          }

          .section-spacing,
          .opening-hours-section {
            padding-top: 34px;
          }

          .section-title {
            font-size: 1.55rem;
          }

          .section-topline {
            align-items: stretch;
          }

          .offers-track {
            margin-inline: -8px;
            padding-inline: 8px;
          }

          .offer-card {
            min-width: 86%;
            max-width: 86%;
          }

          .cuisine-card {
            min-height: 218px;
          }

          .cuisine-card-content {
            padding: 16px;
          }

          .opening-hours-card-head,
          .opening-hours-row,
          .product-card-top {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .inner-page-topline {
            top: 62px;
            margin-bottom: 14px;
          }

          .back-button {
            width: 100%;
          }

          .products-grid {
            padding-bottom: 74px;
          }

          .product-card {
            padding: 14px;
          }

          .product-desc {
            margin: 0;
          }

          .modal-backdrop {
            align-items: flex-end;
            padding: 10px;
          }

          .product-modal {
            width: 100%;
            max-height: 88vh;
          }

          .modal-footer {
            align-items: stretch;
          }

          .mobile-cart-dock {
            position: fixed;
            left: 8px;
            right: 8px;
            bottom: max(8px, env(safe-area-inset-bottom));
            z-index: 90;
            display: grid;
            grid-template-columns: auto auto 1fr;
            gap: 10px;
            align-items: center;
            min-height: 54px;
            border: none;
            border-radius: 8px;
            padding: 10px 12px;
            background: #17202a;
            color: #ffffff;
            box-shadow: 0 16px 36px rgba(23, 32, 42, 0.24);
            font: inherit;
            text-align: left;
          }

          .mobile-cart-dock span,
          .mobile-cart-dock strong,
          .mobile-cart-dock em {
            font-style: normal;
            font-weight: 900;
            white-space: nowrap;
          }

          .mobile-cart-dock em {
            justify-self: end;
            color: #a7f3d0;
          }

          .site-footer {
            padding-bottom: 74px;
          }
        }

        @media (max-width: 430px) {
          .hero-image-card {
            min-height: 330px;
          }

          .hero-image-title {
            font-size: 1.9rem;
          }

          .offer-card {
            min-width: 90%;
            max-width: 90%;
          }

          .mobile-cart-dock {
            grid-template-columns: 1fr auto;
          }

          .mobile-cart-dock em {
            grid-column: 1 / -1;
            justify-self: stretch;
          }
        }

        /* Polish, motion, and richer visual finish */
        body {
          background:
            radial-gradient(circle at 12% 8%, rgba(225, 29, 72, 0.09), transparent 28%),
            radial-gradient(circle at 88% 18%, rgba(15, 118, 110, 0.1), transparent 26%),
            linear-gradient(180deg, #fbfaf8 0%, #f3f6f8 46%, #eef3f5 100%);
        }

        .premium-header {
          animation: headerDrop 0.6s ease both;
        }

        .logo-img,
        .header-halal-badge {
          transition: transform 0.24s ease, filter 0.24s ease;
        }

        .brand-box:hover .logo-img,
        .brand-box:hover .header-halal-badge {
          transform: translateY(-1px) scale(1.03);
          filter: saturate(1.08);
        }

        .hero-image-card {
          isolation: isolate;
          transform-origin: center;
          animation: heroReveal 0.85s cubic-bezier(.2,.8,.2,1) both;
          box-shadow: 0 24px 80px rgba(23, 32, 42, 0.14);
        }

        .hero-image-card::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          background: inherit;
          background-size: cover;
          background-position: center;
          transform: scale(1.05);
          animation: heroPhotoDrift 13s ease-in-out infinite alternate;
        }

        .hero-image-card > * {
          position: relative;
          z-index: 1;
        }

        .hero-image-overlay {
          z-index: 1;
          background:
            linear-gradient(100deg, rgba(13, 18, 25, 0.88), rgba(13, 18, 25, 0.45) 50%, rgba(13, 18, 25, 0.08)),
            radial-gradient(circle at 18% 78%, rgba(225, 29, 72, 0.34), transparent 34%),
            radial-gradient(circle at 64% 18%, rgba(15, 118, 110, 0.24), transparent 30%);
        }

        .hero-image-content {
          animation: heroTextIn 0.75s ease 0.12s both;
        }

        .hero-kicker {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.22);
        }

        .hero-image-title {
          max-width: 560px;
        }

        .hero-primary-link,
        .hero-secondary-link,
        .cart-button,
        .offer-cart-button,
        .add-button,
        .checkout-button,
        .back-button {
          position: relative;
          overflow: hidden;
          transition:
            transform 0.22s ease,
            box-shadow 0.22s ease,
            background-color 0.22s ease,
            border-color 0.22s ease;
        }

        .hero-primary-link::after,
        .hero-secondary-link::after,
        .cart-button::after,
        .offer-cart-button::after,
        .add-button::after,
        .checkout-button::after {
          content: "";
          position: absolute;
          inset: -40% auto -40% -55%;
          width: 44%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.32), transparent);
          transition: transform 0.55s ease;
        }

        .hero-primary-link:hover::after,
        .hero-secondary-link:hover::after,
        .cart-button:hover::after,
        .offer-cart-button:hover::after,
        .add-button:hover::after,
        .checkout-button:hover::after {
          transform: translateX(360%) skewX(-18deg);
        }

        .hero-primary-link:hover,
        .hero-secondary-link:hover,
        .cart-button:hover,
        .offer-cart-button:hover,
        .add-button:hover,
        .checkout-button:hover,
        .back-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(23, 32, 42, 0.16);
        }

        .hero-primary-link:active,
        .hero-secondary-link:active,
        .cart-button:active,
        .offer-cart-button:active,
        .add-button:active,
        .checkout-button:active,
        .back-button:active,
        .mobile-cart-dock:active {
          transform: translateY(0) scale(0.99);
        }

        .hero-secondary-link {
          backdrop-filter: blur(10px);
        }

        .hero-benefits-bar {
          box-shadow: 0 14px 42px rgba(23, 32, 42, 0.08);
          animation: softRise 0.65s ease 0.22s both;
        }

        .hero-benefit-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .hero-benefit-pill::before {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #0f766e;
          box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.1);
        }

        .offer-card,
        .cuisine-card,
        .category-card,
        .product-card,
        .opening-hours-clean-card {
          transition:
            transform 0.22s ease,
            box-shadow 0.22s ease,
            border-color 0.22s ease,
            filter 0.22s ease;
          animation: cardIn 0.55s ease both;
        }

        .offer-card:nth-child(2),
        .cuisine-card:nth-child(2),
        .category-card:nth-child(2),
        .product-card:nth-child(2) {
          animation-delay: 0.05s;
        }

        .offer-card:nth-child(3),
        .cuisine-card:nth-child(3),
        .category-card:nth-child(3),
        .product-card:nth-child(3) {
          animation-delay: 0.1s;
        }

        .offer-card:hover,
        .cuisine-card:hover,
        .category-card:hover,
        .product-card:hover,
        .opening-hours-clean-card:hover {
          transform: translateY(-4px);
          border-color: rgba(225, 29, 72, 0.24);
          box-shadow: 0 18px 44px rgba(23, 32, 42, 0.12);
          filter: saturate(1.03);
        }

        .offer-card {
          background:
            linear-gradient(180deg, #ffffff, #fff8f2);
          border-color: rgba(225, 29, 72, 0.14);
        }

        .offer-label {
          background: linear-gradient(135deg, #e11d48, #f97316);
        }

        .offer-cart-button,
        .add-button {
          background: linear-gradient(135deg, #0f766e, #10b981);
        }

        .cuisine-card {
          transform-origin: center;
        }

        .cuisine-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0);
          z-index: 1;
          transition: background 0.25s ease;
        }

        .cuisine-card:hover::before {
          background: rgba(255,255,255,0.08);
        }

        .cuisine-card-content {
          transition: transform 0.25s ease;
        }

        .cuisine-card:hover .cuisine-card-content {
          transform: translateY(-4px);
        }

        .cuisine-tag,
        .category-badge {
          background: linear-gradient(135deg, #17202a, #334155);
        }

        .product-card {
          background: linear-gradient(180deg, #ffffff, #f8fbfb);
        }

        .product-price {
          background: linear-gradient(135deg, #17202a, #334155);
          box-shadow: 0 8px 18px rgba(23, 32, 42, 0.12);
        }

        .mini-chip {
          transition: transform 0.18s ease, background-color 0.18s ease;
        }

        .mini-chip:hover {
          transform: translateY(-1px);
          background: #ffffff;
        }

        .opening-status-pill.open {
          animation: statusGlow 2.4s ease-in-out infinite;
        }

        .product-modal {
          animation: modalPop 0.24s ease both;
        }

        .modal-choice {
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            background-color 0.18s ease;
        }

        .modal-choice:hover {
          transform: translateX(3px);
          border-color: rgba(15, 118, 110, 0.38);
        }

        .added-toast {
          animation: toastIn 1.8s ease forwards;
        }

        .mobile-cart-dock {
          animation: dockIn 0.28s ease both;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .mobile-cart-dock:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 44px rgba(23, 32, 42, 0.28);
        }

        @keyframes headerDrop {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes heroReveal {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes heroPhotoDrift {
          from {
            transform: scale(1.05) translate3d(-6px, -4px, 0);
          }
          to {
            transform: scale(1.1) translate3d(8px, 5px, 0);
          }
        }

        @keyframes heroTextIn {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes softRise {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes modalPop {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes dockIn {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes statusGlow {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(22, 101, 52, 0);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(22, 101, 52, 0.1);
          }
        }

        @media (max-width: 760px) {
          .hero-image-card::before {
            animation-duration: 16s;
          }

          .offer-card:hover,
          .cuisine-card:hover,
          .category-card:hover,
          .product-card:hover,
          .opening-hours-clean-card:hover {
            transform: none;
          }

          .modal-choice:hover {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.001ms !important;
          }
        }

        /* Calm glass refinement */
        body {
          background:
            radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.95), transparent 32%),
            radial-gradient(circle at 86% 12%, rgba(226, 232, 240, 0.56), transparent 30%),
            linear-gradient(180deg, #f7f8fa 0%, #eef1f4 100%);
          color: #111827;
        }

        .premium-header {
          background: rgba(255, 255, 255, 0.72);
          border-bottom: 1px solid rgba(148, 163, 184, 0.24);
          box-shadow: 0 12px 36px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(24px) saturate(1.25);
        }

        .hero-image-card {
          border: 1px solid rgba(255, 255, 255, 0.48);
          box-shadow:
            0 34px 90px rgba(15, 23, 42, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .hero-image-overlay {
          background:
            linear-gradient(90deg, rgba(2, 6, 23, 0.92), rgba(2, 6, 23, 0.74) 48%, rgba(2, 6, 23, 0.46)),
            linear-gradient(0deg, rgba(2, 6, 23, 0.72), rgba(2, 6, 23, 0.2));
        }

        .hero-image-content {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.06));
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 18px;
          margin: 0 0 36px 36px;
          padding: 30px;
          max-width: 650px;
          backdrop-filter: blur(18px) saturate(1.15);
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.18);
        }

        .hero-image-title,
        .hero-image-text {
          text-shadow: 0 2px 18px rgba(0, 0, 0, 0.42);
        }

        .hero-kicker {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.24);
        }

        .hero-primary-link,
        .cart-button-clean,
        .cart-button,
        .checkout-button {
          background: linear-gradient(180deg, #1f2937, #111827);
        }

        .hero-secondary-link {
          background: rgba(255, 255, 255, 0.12);
        }

        .offer-cart-button,
        .add-button {
          background: linear-gradient(180deg, #334155, #1f2937);
        }

        .hero-benefits-bar,
        .offer-card,
        .category-card,
        .product-card,
        .opening-hours-clean-card,
        .special-closure-banner,
        .product-modal {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.52));
          border: 1px solid rgba(255, 255, 255, 0.62);
          box-shadow:
            0 18px 52px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(22px) saturate(1.2);
        }

        .offer-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.78), rgba(248,250,252,0.58));
          border-color: rgba(255, 255, 255, 0.66);
        }

        .offer-label,
        .category-badge,
        .cuisine-tag {
          background: rgba(17, 24, 39, 0.88);
          color: #ffffff;
          backdrop-filter: blur(10px);
        }

        .eyebrow,
        .cuisine-link,
        .category-link {
          color: #475569;
        }

        .offer-tags span,
        .mini-chip,
        .cart-option-pill,
        .back-button,
        .modal-choice {
          background: rgba(255, 255, 255, 0.58);
          border-color: rgba(148, 163, 184, 0.26);
          backdrop-filter: blur(14px);
        }

        .hero-benefit-pill::before {
          background: #64748b;
          box-shadow: 0 0 0 4px rgba(100, 116, 139, 0.1);
        }

        .cuisine-card {
          border-color: rgba(255, 255, 255, 0.68);
          box-shadow: 0 20px 54px rgba(15, 23, 42, 0.12);
        }

        .cuisine-card::after {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.86)),
            linear-gradient(0deg, rgba(248,250,252,0.22), rgba(248,250,252,0));
        }

        .product-price {
          background: rgba(17, 24, 39, 0.9);
          box-shadow: none;
        }

        .opening-status-pill.open {
          background: rgba(241, 245, 249, 0.86);
          color: #334155;
          animation: none;
        }

        .opening-status-pill.closed {
          background: rgba(241, 245, 249, 0.86);
          color: #64748b;
        }

        .mobile-cart-dock {
          background: rgba(17, 24, 39, 0.88);
          backdrop-filter: blur(22px) saturate(1.2);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }

        .mobile-cart-dock em {
          color: #e2e8f0;
        }

        @media (max-width: 760px) {
          .hero-image-content {
            margin: 0 12px 12px;
            padding: 18px;
            border-radius: 16px;
          }

          .hero-image-overlay {
            background:
              linear-gradient(0deg, rgba(2, 6, 23, 0.9), rgba(2, 6, 23, 0.42)),
              linear-gradient(90deg, rgba(2, 6, 23, 0.74), rgba(2, 6, 23, 0.32));
          }
        }

        /* Glass product search */
        .header-search-wrap {
          position: relative;
          flex: 1;
          max-width: 520px;
          min-width: 220px;
          z-index: 100;
        }

        .header-search-glow {
          position: absolute;
          inset: -8px;
          border-radius: 22px;
          background:
            radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.9), transparent 34%),
            radial-gradient(circle at 80% 70%, rgba(148, 163, 184, 0.32), transparent 42%);
          filter: blur(14px);
          opacity: 0;
          transform: scale(0.96);
          transition: opacity 0.28s ease, transform 0.28s ease;
          pointer-events: none;
        }

        .header-search {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          padding: 0 12px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.88));
          border: 1px solid rgba(255, 255, 255, 0.94);
          box-shadow:
            0 12px 36px rgba(15, 23, 42, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.84);
          backdrop-filter: blur(34px) saturate(1.45);
          transition:
            border-color 0.22s ease,
            box-shadow 0.22s ease,
            transform 0.22s ease,
            background 0.22s ease;
        }

        .header-search-wrap:focus-within .header-search-glow {
          opacity: 1;
          transform: scale(1);
          animation: searchAura 2.8s ease-in-out infinite;
        }

        .header-search-wrap:focus-within .header-search {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.92);
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94));
          box-shadow:
            0 18px 48px rgba(15, 23, 42, 0.14),
            inset 0 1px 0 rgba(255, 255, 255, 0.92);
        }

        .search-symbol {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
          border: 2px solid #64748b;
          border-radius: 999px;
          opacity: 0.86;
          position: relative;
          transition: transform 0.24s ease, border-color 0.24s ease;
        }

        .search-symbol::after {
          content: "";
          position: absolute;
          width: 7px;
          height: 2px;
          right: -6px;
          bottom: -4px;
          border-radius: 999px;
          background: #64748b;
          transform: rotate(45deg);
          transform-origin: center;
        }

        .header-search-wrap:focus-within .search-symbol {
          transform: rotate(-8deg) scale(1.06);
          border-color: #111827;
        }

        .header-search input {
          min-height: 44px;
          width: 100%;
          padding: 0;
          border: none;
          outline: none;
          background: transparent;
          color: #111827;
          font-weight: 800;
          box-shadow: none;
        }

        .header-search input::placeholder {
          color: #64748b;
          font-weight: 700;
        }

        .header-search input::-webkit-search-decoration,
        .header-search input::-webkit-search-cancel-button {
          display: none;
        }

        .search-clear {
          width: 30px;
          height: 30px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.95);
          color: #334155;
          display: grid;
          place-items: center;
          cursor: pointer;
          font-size: 1.1rem;
          line-height: 1;
          transition: transform 0.18s ease, background-color 0.18s ease;
        }

        .search-clear:hover {
          transform: scale(1.06);
          background: rgba(255, 255, 255, 0.9);
        }

        .search-results-panel {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          right: 0;
          max-height: min(420px, calc(100vh - 120px));
          overflow-y: auto;
          padding: 8px;
          border-radius: 20px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96));
          border: 1px solid rgba(255, 255, 255, 0.96);
          box-shadow:
            0 24px 70px rgba(15, 23, 42, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(40px) saturate(1.35);
          animation: searchPanelIn 0.22s ease both;
        }

        .search-result-item {
          width: 100%;
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: transparent;
          color: #111827;
          cursor: pointer;
          text-align: left;
          transition:
            transform 0.18s ease,
            background-color 0.18s ease,
            border-color 0.18s ease;
        }

        .search-result-item:hover {
          transform: translateY(-1px);
          background: rgba(226, 232, 240, 0.72);
          border-color: rgba(148, 163, 184, 0.22);
        }

        .search-result-main {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .search-result-main strong {
          overflow-wrap: anywhere;
          line-height: 1.25;
        }

        .search-result-main small {
          color: #64748b;
          line-height: 1.35;
        }

        .search-result-price {
          flex: 0 0 auto;
          padding: 7px 9px;
          border-radius: 999px;
          background: rgba(17, 24, 39, 0.9);
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 900;
          white-space: nowrap;
        }

        .search-empty-state {
          padding: 16px;
          color: #64748b;
          font-weight: 800;
          text-align: center;
        }

        @keyframes searchAura {
          0%,
          100% {
            opacity: 0.78;
            transform: scale(0.99);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        @keyframes searchPanelIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 860px) {
          .nav-inner {
            flex-wrap: wrap;
          }

          .header-search-wrap {
            order: 3;
            width: 100%;
            max-width: none;
            flex-basis: 100%;
          }

          .premium-header {
            padding-bottom: 8px;
          }
        }

        @media (max-width: 520px) {
          .header-search {
            min-height: 46px;
            border-radius: 16px;
          }

          .search-results-panel {
            position: fixed;
            top: 118px;
            left: 8px;
            right: 8px;
            max-height: calc(100vh - 132px);
            border-radius: 18px;
          }

          .search-result-item {
            padding: 11px;
          }

          .search-result-price {
            font-size: 0.8rem;
          }
        }

        /* High-end glass header */
        .premium-header {
          padding: 12px 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.52));
          border-bottom: 1px solid rgba(255, 255, 255, 0.7);
          box-shadow:
            0 18px 58px rgba(15, 23, 42, 0.1),
            inset 0 1px 0 rgba(255,255,255,0.82);
          backdrop-filter: blur(30px) saturate(1.35);
        }

        .nav-inner {
          min-height: 76px;
          padding: 0;
          display: grid;
          grid-template-columns: minmax(245px, 0.8fr) minmax(300px, 1.2fr) auto;
          align-items: center;
          gap: 14px;
        }

        .brand-box,
        .header-search,
        .call-button,
        .halal-chip,
        .cart-button-clean {
          border: 1px solid rgba(255, 255, 255, 0.72);
          background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(248,250,252,0.58));
          box-shadow:
            0 14px 40px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255,255,255,0.9);
          backdrop-filter: blur(24px) saturate(1.25);
        }

        .brand-box {
          align-self: stretch;
          border-radius: 24px;
          padding: 10px 14px 10px 10px;
          flex: initial;
          position: relative;
          overflow: hidden;
        }

        .brand-box::after {
          content: "";
          position: absolute;
          inset: -60% auto -60% -48%;
          width: 42%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.48), transparent);
          transform: skewX(-18deg);
          transition: transform 0.7s ease;
          pointer-events: none;
        }

        .brand-box:hover::after {
          transform: translateX(430%) skewX(-18deg);
        }

        .brand-logo-shell {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
          flex: 0 0 auto;
        }

        .logo-img {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          border: none;
          box-shadow: none;
        }

        .brand-text {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .brand-kicker {
          color: #64748b;
          font-size: 0.76rem;
          font-weight: 800;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .brand-title {
          font-size: 1.08rem;
          line-height: 1.1;
          color: #0f172a;
        }

        .header-search-wrap {
          max-width: none;
          min-width: 0;
        }

        .header-search {
          min-height: 58px;
          border-radius: 24px;
          padding: 0 16px;
        }

        .header-search input {
          font-size: 0.98rem;
        }

        .nav-right {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          min-width: max-content;
        }

        .call-button {
          min-height: 58px;
          border-radius: 24px;
          padding: 8px 14px 8px 10px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #0f172a;
          text-decoration: none;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }

        .call-button:hover,
        .halal-chip:hover,
        .cart-button-clean:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.92);
          box-shadow:
            0 20px 52px rgba(15, 23, 42, 0.14),
            inset 0 1px 0 rgba(255,255,255,0.96);
        }

        .call-icon {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: linear-gradient(180deg, #111827, #334155);
          color: #ffffff;
          font-size: 1rem;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.18);
        }

        .call-text {
          display: grid;
          gap: 2px;
          line-height: 1.1;
        }

        .call-text small {
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .call-text strong {
          color: #0f172a;
          font-size: 0.9rem;
          white-space: nowrap;
        }

        .halal-chip {
          min-height: 58px;
          border-radius: 24px;
          padding: 8px 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #0f172a;
          font-weight: 900;
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }

        .halal-chip .header-halal-badge {
          width: 36px;
          height: 36px;
          margin: 0;
          padding: 4px;
          border-radius: 14px;
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: none;
        }

        .cart-button-clean {
          min-height: 58px;
          border-radius: 24px;
          padding: 8px 12px;
          background: linear-gradient(180deg, rgba(17,24,39,0.95), rgba(30,41,59,0.92));
          border-color: rgba(255,255,255,0.18);
          color: #ffffff;
          gap: 8px;
        }

        .cart-icon {
          display: none;
        }

        .cart-count-clean {
          min-width: 28px;
          height: 28px;
          padding: 0 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.96);
          color: #0f172a;
        }

        @media (max-width: 1160px) {
          .nav-inner {
            grid-template-columns: minmax(230px, 1fr) auto;
          }

          .header-search-wrap {
            grid-column: 1 / -1;
            order: 3;
          }
        }

        @media (max-width: 760px) {
          .premium-header {
            padding: 8px 0;
          }

          .nav-inner {
            grid-template-columns: minmax(164px, 1fr) auto;
            gap: 8px;
          }

          .brand-box {
            min-width: 0;
            padding: 8px;
            border-radius: 20px;
            gap: 8px;
          }

          .brand-logo-shell {
            width: 44px;
            height: 44px;
            border-radius: 16px;
          }

          .logo-img {
            width: 38px;
            height: 38px;
            border-radius: 13px;
          }

          .brand-kicker {
            display: none;
          }

          .brand-title {
            font-size: 0.92rem;
            white-space: nowrap;
          }

          .nav-right {
            gap: 7px;
          }

          .call-button {
            min-height: 48px;
            width: 48px;
            padding: 5px;
            border-radius: 18px;
            justify-content: center;
          }

          .call-icon {
            width: 36px;
            height: 36px;
            border-radius: 14px;
          }

          .call-text {
            display: none;
          }

          .halal-chip {
            min-height: 48px;
            padding: 5px;
            border-radius: 18px;
          }

          .halal-chip span {
            display: none;
          }

          .halal-chip .header-halal-badge {
            width: 36px;
            height: 36px;
          }

          .cart-button-clean {
            min-height: 48px;
            border-radius: 18px;
            padding: 8px 10px;
          }

          .header-search {
            min-height: 50px;
            border-radius: 20px;
          }
        }

        @media (max-width: 440px) {
          .brand-title {
            max-width: none;
            white-space: nowrap;
            overflow: visible;
            text-overflow: clip;
          }

          .nav-right {
            gap: 5px;
          }

          .call-button,
          .halal-chip,
          .cart-button-clean {
            width: 46px;
            min-width: 46px;
          }
        }
      `}</style>
    </>
  );
}
