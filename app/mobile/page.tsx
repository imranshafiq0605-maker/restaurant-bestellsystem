"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth } from "../lib/firebase";
import { produkte, type Product } from "../data/menu";
import styles from "./mobile.module.css";

type PrimaryTab = "home" | "menu" | "cart" | "account";
type Tab = PrimaryTab | "roses";
type AuthMode = "login" | "register";
type AccountView = "overview" | "orders" | "details";

type AccountOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  paid: boolean;
  orderType: "abholung" | "lieferung";
  total: number;
  earnedRoses: number;
  createdAt: string | null;
  confirmedMinutes: number | null;
  preorder: string;
  time: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    variantName: string | null;
    selectedOptions: string[];
  }>;
};

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

type Offer = { title: string; price: number; text: string };

const offers: Offer[] = [
  { title: "Angebot 1", price: 34.5, text: "2× Familienpizza (36 cm) + 1L Getränk nach Wahl" },
  { title: "Angebot 2", price: 24, text: "3× Pizza (24 cm) + 1L Getränk nach Wahl" },
  { title: "Angebot 3", price: 37.5, text: "3× Pizza (31 cm) + 1L Getränk nach Wahl" },
  { title: "Angebot 4", price: 23.5, text: "2× Pasta + 1L Getränk nach Wahl" },
  { title: "Angebot 5", price: 32.5, text: "2× Schnitzel + 1L Getränk nach Wahl" },
  { title: "Angebot 6", price: 53.5, text: "Pizza, Schnitzel, Pasta, Salat + 1L Getränk" },
  { title: "Angebot 452", price: 33.5, text: "2× indische Gerichte + 1L Getränk nach Wahl" },
];

const quickChoices = [
  { label: "Pizza", category: "Pizza / Calzone", emoji: "🍕" },
  { label: "Indische Spezialitäten", category: "Indische Spezialitäten", emoji: "🍛" },
  { label: "Pasta", category: "Pasta", emoji: "🍝" },
  { label: "Salate", category: "Salate", emoji: "🥗" },
] as const;

const primaryTabs: PrimaryTab[] = ["home", "menu", "cart", "account"];
const tabLabels: Record<PrimaryTab, string> = {
  home: "Entdecken",
  menu: "Speisekarte",
  cart: "Warenkorb",
  account: "Account",
};

type Profile = {
  name: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  roses: number;
};

const CART_KEY = "larosa_cart";
const emptyProfile: Profile = {
  name: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  roses: 0,
};

function euro(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function productPrice(product: Product) {
  return product.price ?? product.variants?.[0]?.price ?? 0;
}

function productVariant(product: Product) {
  return product.variants?.[0]?.name;
}

function orderDate(value: string | null) {
  if (!value) return "Gerade eben";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function orderStatus(status: string, paid: boolean) {
  const normalized = status.toLowerCase();
  if (!paid) return { label: "Zahlung wird geprüft", stage: 0, tone: "waiting" };
  if (["abgeschlossen", "fertig", "ausgeliefert", "abgeholt"].some((value) => normalized.includes(value))) return { label: "Abgeschlossen", stage: 3, tone: "done" };
  if (["unterwegs", "lieferung", "abholbereit", "bereit"].some((value) => normalized.includes(value))) return { label: normalized.includes("unterwegs") ? "Unterwegs" : "Abholbereit", stage: 2, tone: "active" };
  if (["angenommen", "bestätigt", "zubereitung"].some((value) => normalized.includes(value))) return { label: "Wird zubereitet", stage: 1, tone: "active" };
  if (normalized.includes("storniert")) return { label: "Storniert", stage: 0, tone: "cancelled" };
  return { label: "Bestellung eingegangen", stage: 0, tone: "waiting" };
}

function authErrorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : "";
  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") return "Das Anmeldefenster wurde geschlossen oder blockiert. Bitte erneut versuchen.";
  if (code === "auth/unauthorized-domain") return "Diese App-Adresse ist in Firebase noch nicht als autorisierte Domain eingetragen.";
  if (code === "auth/operation-not-allowed") return "Diese Anmeldeart ist in Firebase noch nicht aktiviert.";
  if (code === "auth/requires-recent-login") return "Bitte melde dich aus Sicherheitsgründen neu an und versuche es danach erneut.";
  if (code === "auth/account-exists-with-different-credential") return "Für diese E-Mail besteht bereits ein Konto mit einer anderen Anmeldeart.";
  if (code === "auth/network-request-failed") return "Keine Verbindung zu Firebase. Bitte Internetverbindung prüfen.";
  return error instanceof Error ? error.message : "Anmeldung nicht möglich.";
}

function AppleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2 0 1.7-.7 3.2-.7 1.4 0 1.9.7 3.2.7 1.3 0 2.2-1.1 2.9-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.9-1.1-2.9-4.1ZM14.4 6.1c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z"/></svg>;
}

function GoogleLogo() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3a10 10 0 0 0 0 9.1L6.4 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.7 9.7 0 0 0 3 7.5l3.4 2.6C7.2 7.8 9.4 6 12 6Z"/></svg>;
}

function Icon({ name }: { name: PrimaryTab | "rose" | "chevron" | "plus" | "orders" | "details" | "logout" | "trash" }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></>,
    menu: <><path d="M5 3v18M19 3v18M5 8h14M5 16h14"/><path d="M9 8v8M15 8v8"/></>,
    cart: <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    rose: <><path d="M12 21c0-5 0-9 1-12"/><path d="M13 9c-5-1-6-7-1-7 4 0 7 4 3 8-2 2-5 1-6-1"/><path d="M12 15c-4-3-7-1-7-1 2 4 5 4 7 3M13 13c3-3 6-2 6-2-1 4-4 5-6 4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    orders: <><path d="M7 3h10l2 3v15H5V6l2-3Z"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    details: <><circle cx="8" cy="8" r="3"/><path d="M3.5 17a4.5 4.5 0 0 1 9 0"/><path d="M15 8h6M15 12h6M15 16h4"/></>,
    logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></>,
    trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function MobileAppPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [category, setCategory] = useState("Alle");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [accountView, setAccountView] = useState<AccountView>("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [addedName, setAddedName] = useState("");
  const [cartPulse, setCartPulse] = useState(false);
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [offerText, setOfferText] = useState("");
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [returningFromPayment, setReturningFromPayment] = useState(false);

  const loadProfile = useCallback(async (currentUser: User) => {
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/account/profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Profildaten konnten nicht geladen werden.");
    setProfile({
      name: data.profile?.name ?? "",
      phone: data.profile?.phone ?? "",
      street: data.profile?.street ?? "",
      houseNumber: data.profile?.houseNumber ?? "",
      postalCode: data.profile?.postalCode ?? "",
      city: data.profile?.city ?? "",
      roses: Number(data.profile?.roses) || 0,
    });
  }, []);

  const loadOrders = useCallback(async (currentUser: User, silent = false) => {
    if (!silent) setOrdersBusy(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/account/orders", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bestellungen konnten nicht geladen werden.");
      const nextOrders = Array.isArray(data.orders) ? data.orders as AccountOrder[] : [];
      setOrders(nextOrders);
      setProfile((current) => ({ ...current, roses: Number(data.roses) || 0 }));
      if (selectedOrderId && nextOrders.some((order) => order.id === selectedOrderId)) {
        setReturningFromPayment(false);
      }
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "Bestellungen konnten nicht geladen werden.");
    } finally {
      if (!silent) setOrdersBusy(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab") as Tab | null;
    if (requested && (["home", "menu", "cart", "account", "roses"] as Tab[]).includes(requested)) {
      setTab(requested);
    }
    setCategory(params.get("category") || "Alle");
    if (params.get("paid") === "true") {
      setTab("account");
      setAccountView("orders");
      setReturningFromPayment(true);
      setSelectedOrderId(params.get("orderId") || "");
      setMessage("Zahlung erfolgreich. Deine Bestellung wird gerade bestätigt.");
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch {
      // A damaged legacy cart starts empty without breaking the app.
    } finally {
      setCartLoaded(true);
    }
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(emptyProfile);
        return;
      }
      setEmail(nextUser.email ?? "");
      try {
        await loadProfile(nextUser);
      } catch {
        setMessage("Dein Account ist angemeldet. Gespeicherte Profildaten konnten gerade nicht geladen werden.");
      }
    });
  }, [loadProfile]);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }
    void loadOrders(user);
    const interval = window.setInterval(() => void loadOrders(user, true), 10000);
    return () => window.clearInterval(interval);
  }, [user, loadOrders]);

  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) setMessage("Anmeldung erfolgreich. Willkommen bei La Rosa.");
    }).catch((error: unknown) => {
      setMessage(authErrorMessage(error));
    });
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, cartLoaded]);

  const categories = useMemo(
    () => ["Alle", "Indische Spezialitäten", ...Array.from(new Set(produkte.map((item) => item.category)))],
    []
  );

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return produkte.filter((item) => {
      const inCategory = category === "Alle"
        || (category === "Indische Spezialitäten" ? item.cuisine === "Indisch" : item.category === category);
      const matches = !needle || `${item.name} ${item.description}`.toLowerCase().includes(needle);
      return inCategory && matches;
    });
  }, [category, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const roseOrders = orders.filter((order) => order.earnedRoses > 0);
  const earnedRoseTotal = roseOrders.reduce((sum, order) => sum + order.earnedRoses, 0);
  const activePrimaryTab: PrimaryTab = tab === "roses" ? "home" : tab;
  const activeNavIndex = primaryTabs.indexOf(activePrimaryTab);

  function showAdded(name: string) {
    setAddedName(name);
    setCartPulse(true);
    window.setTimeout(() => setAddedName(""), 1500);
    window.setTimeout(() => setCartPulse(false), 550);
  }

  function addProduct(product: Product, variantName = productVariant(product), options: string[] = [], price = productPrice(product)) {
    const uniqueKey = `mobile-${product.id}-${variantName ?? "standard"}-${options.join("|")}`;
    setCart((current) => {
      const existing = current.find((item) => item.uniqueKey === uniqueKey);
      if (existing) {
        return current.map((item) => item.uniqueKey === uniqueKey
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...current, {
        id: product.id,
        name: product.name,
        price,
        quantity: 1,
        category: product.category,
        cuisine: product.cuisine,
        ...(variantName ? { variantName } : {}),
        ...(options.length ? { selectedOptions: options } : {}),
        uniqueKey,
      }];
    });
    showAdded(product.name);
  }

  function openProduct(product: Product) {
    if (!product.variants?.length && !product.options?.length) {
      addProduct(product);
      return;
    }
    const variant = product.variants?.[0]?.name ?? "";
    const defaults: Record<string, string[]> = {};
    product.options?.forEach((group) => {
      defaults[group.group] = group.required && group.items[0] ? [group.items[0].name] : [];
    });
    setSelectedVariant(variant);
    setSelectedOptions(defaults);
    setSelectedProduct(product);
  }

  function toggleOption(group: string, item: string, multiple = false) {
    setSelectedOptions((current) => {
      const selected = current[group] ?? [];
      return { ...current, [group]: multiple
        ? selected.includes(item) ? selected.filter((name) => name !== item) : [...selected, item]
        : [item] };
    });
  }

  const configuredPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    const base = selectedProduct.variants?.find((item) => item.name === selectedVariant)?.price ?? selectedProduct.price ?? 0;
    return base + Object.entries(selectedOptions).reduce((total, [group, items]) =>
      total + items.reduce((sum, itemName) => {
        const item = selectedProduct.options?.find((option) => option.group === group)?.items.find((entry) => entry.name === itemName);
        return sum + (item?.price ?? item?.priceByVariant?.[selectedVariant] ?? 0);
      }, 0), 0);
  }, [selectedProduct, selectedVariant, selectedOptions]);

  function confirmProduct() {
    if (!selectedProduct) return;
    const options = Object.entries(selectedOptions).flatMap(([group, items]) => items.map((item) => `${group}: ${item}`));
    addProduct(selectedProduct, selectedVariant || undefined, options, configuredPrice);
    setSelectedProduct(null);
  }

  function addOffer(offer: Offer) {
    const description = offerText.trim() || offer.text;
    const uniqueKey = `mobile-offer-${offer.title}-${description}`;
    setCart((current) => [...current, { id: Date.now(), name: offer.title, price: offer.price, quantity: 1, category: "Angebote", cuisine: "Italienisch", selectedOptions: [description], uniqueKey }]);
    showAdded(offer.title);
    setActiveOffer(null);
    setOfferText("");
  }

  function changeQuantity(uniqueKey: string, amount: number) {
    setCart((current) => current
      .map((item) => item.uniqueKey === uniqueKey
        ? { ...item, quantity: item.quantity + amount }
        : item)
      .filter((item) => item.quantity > 0));
  }

  function openCheckout() {
    const serializedCart = JSON.stringify(cart);
    localStorage.setItem(CART_KEY, serializedCart);
    sessionStorage.setItem(CART_KEY, serializedCart);
    window.location.href = "/warenkorb?source=mobile";
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (Capacitor.isNativePlatform()) {
        if (authMode === "register") {
          await FirebaseAuthentication.createUserWithEmailAndPassword({ email: email.trim(), password });
          await FirebaseAuthentication.sendEmailVerification();
        } else {
          await FirebaseAuthentication.signInWithEmailAndPassword({ email: email.trim(), password });
        }
        const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        await completeNativeSignIn(token);
        setMessage(authMode === "register" ? "Account erstellt. Bitte bestätige jetzt deine E-Mail-Adresse." : "Willkommen zurück.");
      } else if (authMode === "register") {
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(result.user);
        setMessage("Account erstellt. Bitte bestätige jetzt deine E-Mail-Adresse.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setMessage("Willkommen zurück.");
      }
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
      if (Capacitor.isNativePlatform()) {
        if (providerName === "apple") await FirebaseAuthentication.signInWithApple();
        else await FirebaseAuthentication.signInWithGoogle();
        const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        await completeNativeSignIn(token);
        setMessage("Anmeldung erfolgreich. Willkommen bei La Rosa.");
        return;
      }
      const provider = providerName === "google"
        ? new GoogleAuthProvider()
        : new OAuthProvider("apple.com");
      if (providerName === "apple") {
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

  async function completeNativeSignIn(nativeIdToken: string) {
    const response = await fetch("/api/auth/native-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${nativeIdToken}` },
    });
    const data = await response.json();
    if (!response.ok || !data.token) {
      throw new Error(data.error || "Die sichere App-Anmeldung konnte nicht abgeschlossen werden.");
    }
    await signInWithCustomToken(auth, data.token);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Speichern nicht möglich.");
      await loadProfile(user);
      setMessage("Deine Angaben wurden gespeichert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  }

  async function signOutAll() {
    await signOut(auth);
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => undefined);
    }
    setAccountView("overview");
    setSelectedOrderId("");
    setMessage("Du wurdest vollständig abgemeldet.");
  }

  async function deleteAccount() {
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/account/profile", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Account konnte nicht gelöscht werden.");
      await signOut(auth).catch(() => undefined);
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut().catch(() => undefined);
      }
      setProfile(emptyProfile);
      setOrders([]);
      setAccountView("overview");
      setSelectedOrderId("");
      setDeleteConfirmOpen(false);
      setMessage("Dein Account wurde vollständig gelöscht.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.appShell}>
      <div className={styles.statusGlow} />
      <section className={styles.content}>
        {tab === "home" && (
          <>
            <header className={styles.header}>
              <div><span className={styles.eyebrow}>Guten Appetit</span><h1>La Rosa</h1></div>
              <button className={styles.avatar} style={user?.photoURL ? { backgroundImage: `url(${user.photoURL})` } : undefined} onClick={() => setTab("account")} aria-label="Profil öffnen">{!user?.photoURL && <Icon name="account" />}</button>
            </header>
            <button className={styles.hero} onClick={() => setTab("menu")}>
              <span className={styles.heroLabel}>Heute empfohlen</span>
              <strong>Dein Lieblingsessen.<br/>Frisch zubereitet.</strong>
              <span className={styles.heroAction}>Speisekarte entdecken <Icon name="chevron" /></span>
            </button>
            <div className={styles.sectionTitle}><h2>Schnell wählen</h2><button onClick={() => setTab("menu")}>Alle ansehen</button></div>
            <div className={styles.quickGrid}>
              {quickChoices.map((item) => (
                <button key={item.label} onClick={() => { setSearch(""); setCategory(item.category); setTab("menu"); }}>
                  <span>{item.emoji}</span><strong>{item.label}</strong>
                </button>
              ))}
            </div>
            <button type="button" className={styles.roseCard} onClick={() => setTab("roses")}>
              <div className={styles.roseIcon}><Icon name="rose" /></div>
              <div><span>Dein Rosenguthaben</span><strong>{profile.roses} Rosen</strong><small>Wert {euro(profile.roses * 0.03)} · nach bezahlten Bestellungen</small></div>
              <Icon name="chevron" />
            </button>
            <div className={styles.sectionTitle}><h2>Angebote</h2><span>Nur in der App</span></div>
            <div className={styles.offerRail}>{offers.map((offer) => <button key={offer.title} onClick={() => setActiveOffer(offer)}>
              <small>LA ROSA ANGEBOT</small><strong>{offer.title}</strong><p>{offer.text}</p><b>{euro(offer.price)}</b>
            </button>)}</div>
          </>
        )}

        {tab === "roses" && (
          <>
            <button className={styles.accountBack} type="button" onClick={() => setTab("home")}>‹ Entdecken</button>
            <header className={styles.header}><div><span className={styles.eyebrow}>La Rosa Treueprogramm</span><h1>Deine Rosen</h1></div></header>
            <section className={styles.roseBalanceHero}>
              <div className={styles.roseBalanceIcon}><Icon name="rose" /></div>
              <div><small>AKTUELLES GUTHABEN</small><strong>{profile.roses} Rosen</strong><span>{euro(profile.roses * 0.03)} verfügbar</span></div>
            </section>
            <section className={styles.roseRuleCard}>
              <span>1 €</span><p><strong>1 Rose pro Euro Umsatz</strong><small>Jede Rose ist 3 Cent wert. Ab 100 Rosen kannst du sie im Checkout einlösen.</small></p>
            </section>
            {!user ? (
              <section className={styles.roseSignInCard}>
                <div>🌹</div><h2>Dein Rosenverlauf wartet</h2><p>Melde dich an, um zu sehen, aus welcher Bestellung deine Rosen stammen.</p>
                <button type="button" onClick={() => { setTab("account"); setAccountView("overview"); }}>Anmelden oder registrieren</button>
              </section>
            ) : (
              <section className={styles.roseHistorySection}>
                <header><div><small>DEINE GUTSCHRIFTEN</small><h2>Rosenverlauf</h2></div><span>{earnedRoseTotal} gesammelt</span></header>
                {ordersBusy && orders.length === 0 ? <p className={styles.roseHistoryEmpty}>Rosenverlauf wird geladen …</p> : roseOrders.length === 0 ? <p className={styles.roseHistoryEmpty}>Noch keine Rosen erhalten. Nach deiner ersten bezahlten Bestellung erscheint die Gutschrift hier.</p> : <div className={styles.roseHistoryList}>{roseOrders.map((order) => {
                  const itemSummary = order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.name}`).join(", ");
                  return <button type="button" key={order.id} onClick={() => setSelectedOrderId(order.id)}>
                    <span className={styles.roseHistoryMark}><Icon name="rose" /></span>
                    <div><strong>Bestellung #{order.orderNumber || "—"}</strong><small>{orderDate(order.createdAt)}</small><p>{itemSummary || (order.orderType === "lieferung" ? "Lieferbestellung" : "Abholbestellung")}{order.items.length > 2 ? ` +${order.items.length - 2} weitere` : ""}</p></div>
                    <b>+{order.earnedRoses}<small>Rosen</small></b>
                  </button>;
                })}</div>}
              </section>
            )}
          </>
        )}

        {tab === "menu" && (
          <>
            <header className={styles.header}><div><span className={styles.eyebrow}>La Rosa</span><h1>Speisekarte</h1></div></header>
            <label className={styles.search}><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Gerichte durchsuchen" /></label>
            <div className={styles.chips}>{categories.map((item) => <button key={item} className={category === item ? styles.activeChip : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
            <div className={styles.productList}>{visibleProducts.map((product, index) => (
              <article className={styles.productCard} key={`${product.id}-${product.name}-${index}`}>
                <div><span>{product.cuisine}</span><h3>{product.name}</h3><p>{product.description || product.category}</p><strong>{product.variants ? `ab ${euro(productPrice(product))}` : euro(productPrice(product))}</strong></div>
                <button aria-label={`${product.name} auswählen`} onClick={() => openProduct(product)}><Icon name="plus" /></button>
              </article>
            ))}</div>
          </>
        )}

        {tab === "cart" && (
          <>
            <header className={styles.header}><div><span className={styles.eyebrow}>Deine Auswahl</span><h1>Warenkorb</h1></div><button className={styles.cartMenuButton} onClick={() => setTab("menu")}>+ Hinzufügen</button></header>
            {cart.length === 0 ? <div className={styles.empty}><span>🛍️</span><h2>Noch nichts ausgewählt</h2><p>Entdecke deine Lieblingsgerichte in der Speisekarte.</p><button onClick={() => setTab("menu")}>Speisekarte öffnen</button></div> : <>
              <section className={styles.cartIntro}><span>{cartCount}</span><div><strong>{cartCount === 1 ? "Ein Gericht wartet auf dich" : `${cartCount} Gerichte warten auf dich`}</strong><small>Prüfe Größen und Extras vor dem Bezahlen.</small></div></section>
              <div className={styles.cartList}>{cart.map((item) => <article key={item.uniqueKey}>
                <div className={styles.cartItemTop}><span className={styles.quantityBadge}>{item.quantity}×</span><div className={styles.cartItemCopy}><h3>{item.name}</h3><small>{item.variantName || item.category}</small></div><strong>{euro(item.price * item.quantity)}</strong></div>
                {!!item.selectedOptions?.length && <div className={styles.cartOptions}>{item.selectedOptions.map((option) => <span key={option}>{option}</span>)}</div>}
                <div className={styles.cartItemBottom}><small>{euro(item.price)} je Stück</small><div className={styles.stepper}><button aria-label={`${item.name} entfernen`} onClick={() => changeQuantity(item.uniqueKey, -1)}>−</button><span>{item.quantity}</span><button aria-label={`${item.name} hinzufügen`} onClick={() => changeQuantity(item.uniqueKey, 1)}>+</button></div></div>
              </article>)}</div>
              <section className={styles.orderSummary}><div className={styles.summaryHeading}><span>Bestellübersicht</span><small>{cartCount} Artikel</small></div><div><span>Zwischensumme</span><strong>{euro(cartTotal)}</strong></div><div className={styles.discountRow}><span>Online-Rabatt</span><strong>− {euro(cartTotal * .1)}</strong></div><div><span>Liefergebühr</span><strong>Kostenlos</strong></div><div className={styles.grandTotal}><span>Gesamt</span><strong>{euro(cartTotal * .9)}</strong></div></section>
              <section className={styles.cartRosePreview}><span><Icon name="rose" /></span><div><strong>Mit dieser Bestellung</strong><small>Nach erfolgreicher Zahlung auf deinem Rosenkonto</small></div><b>+{Math.floor(cartTotal * .9)} Rosen</b></section>
              <button className={styles.checkoutButton} onClick={openCheckout}><span><small>Weiter zu Lieferung & Zahlung</small><strong>{euro(cartTotal * .9)}</strong></span><b>→</b></button>
              <p className={styles.secureNote}>Sicher bezahlen über Stripe</p>
            </>}
          </>
        )}

        {tab === "account" && (
          <>
            <header className={styles.header}><div><span className={styles.eyebrow}>Persönlicher Bereich</span><h1>Account</h1></div></header>
            {!user ? <form className={styles.formCard} onSubmit={submitAuth}>
              <div className={styles.segmented}><button type="button" className={authMode === "register" ? styles.segmentActive : ""} onClick={() => setAuthMode("register")}>Registrieren</button><button type="button" className={authMode === "login" ? styles.segmentActive : ""} onClick={() => setAuthMode("login")}>Anmelden</button></div>
              <h2>{authMode === "register" ? "Dein La-Rosa-Konto" : "Willkommen zurück"}</h2>
              <p>Adressen speichern, Bestellungen verfolgen und Rosen sammeln.</p>
              <div className={styles.socialButtons}>
                <button type="button" disabled={busy} onClick={() => socialSignIn("apple")}><span><AppleLogo /></span> Mit Apple fortfahren</button>
                <button type="button" disabled={busy} onClick={() => socialSignIn("google")}><span><GoogleLogo /></span> Mit Google fortfahren</button>
              </div>
              <div className={styles.divider}><span>oder</span></div>
              <label>E-Mail-Adresse<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label>Passwort<input type="password" minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <button className={styles.primaryButton} disabled={busy}>{busy ? "Bitte warten …" : authMode === "register" ? "Account erstellen" : "Anmelden"}</button>
              {message && <p className={styles.message}>{message}</p>}
            </form> : <>
              {accountView === "overview" && <>
                <div className={styles.accountHero}><div className={styles.largeAvatar}>{profile.name[0] || user.email?.[0]?.toUpperCase()}</div><div><h2>{profile.name || "Dein Account"}</h2><p>{user.email}</p><span className={user.emailVerified ? styles.verified : styles.unverified}>{user.emailVerified ? "✓ E-Mail bestätigt" : "E-Mail noch bestätigen"}</span></div></div>
                <section className={styles.roseWallet}><div className={styles.roseIcon}><Icon name="rose" /></div><div><small>DEIN ROSENKONTO</small><strong>{profile.roses} Rosen</strong><span>Wert: {euro(profile.roses * 0.03)} · 1 € Umsatz = 1 Rose</span></div></section>
                <section className={styles.accountMenu}>
                  <button type="button" onClick={() => setAccountView("orders")}><span><Icon name="orders" /></span><div><strong>Bestellungen</strong><small>{orders.length ? `${orders.length} ${orders.length === 1 ? "Bestellung" : "Bestellungen"} ansehen` : "Bestellverlauf und Status ansehen"}</small></div><Icon name="chevron" /></button>
                  <button type="button" onClick={() => setAccountView("details")}><span><Icon name="details" /></span><div><strong>Kontakt- & Rechnungsdaten</strong><small>Name, Telefon und Rechnungsadresse</small></div><Icon name="chevron" /></button>
                </section>
                <section className={styles.accountActions}>
                  <button type="button" onClick={signOutAll}><Icon name="logout" /><span>Abmelden</span></button>
                  <button type="button" className={styles.deleteAccountButton} onClick={() => setDeleteConfirmOpen(true)}><Icon name="trash" /><span>Account löschen</span></button>
                </section>
                {message && <p className={styles.message} aria-live="polite">{message}</p>}
              </>}

              {accountView === "orders" && <>
                <button className={styles.accountBack} type="button" onClick={() => setAccountView("overview")}>‹ Account</button>
                <section className={styles.ordersSection}>
                  <header><div><small>DEIN BESTELLVERLAUF</small><h2>Bestellungen</h2></div><button type="button" aria-label="Bestellungen aktualisieren" disabled={ordersBusy} onClick={() => loadOrders(user)}>↻</button></header>
                  {returningFromPayment && !selectedOrder && <div className={styles.orderProcessing}><i /><div><strong>Zahlung erfolgreich</strong><small>Deine Bestellung wird gerade bestätigt und erscheint gleich hier.</small></div></div>}
                  {ordersBusy && orders.length === 0 ? <p className={styles.ordersEmpty}>Bestellungen werden geladen …</p> : orders.length === 0 && !returningFromPayment ? <p className={styles.ordersEmpty}>Noch keine Bestellungen in diesem Account.</p> : <div className={styles.orderList}>{orders.map((order) => {
                    const status = orderStatus(order.status, order.paid);
                    return <button type="button" key={order.id} onClick={() => setSelectedOrderId(order.id)}><span className={`${styles.orderStatusDot} ${styles[status.tone]}`} /><div><strong>Bestellung #{order.orderNumber || "—"}</strong><small>{orderDate(order.createdAt)} · {order.orderType === "lieferung" ? "Lieferung" : "Abholung"}</small><b>{status.label}</b></div><span>{euro(order.total)} ›</span></button>;
                  })}</div>}
                </section>
              </>}

              {accountView === "details" && <>
                <button className={styles.accountBack} type="button" onClick={() => setAccountView("overview")}>‹ Account</button>
                <form className={styles.formCard} onSubmit={saveProfile}>
                  <h2>Kontakt- & Rechnungsdaten</h2>
                  <p>Diese Angaben bleiben in deinem Account gespeichert und stehen beim Bestellen wieder bereit.</p>
                  <h3 className={styles.formSectionTitle}>Kontaktdaten</h3>
                  <div className={styles.inputGrid}>
                    <label className={styles.full}>Name<input autoComplete="name" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
                    <label className={styles.full}>E-Mail-Adresse<input type="email" autoComplete="email" disabled value={user.email || ""} /></label>
                    <label className={styles.full}>Telefon<input type="tel" autoComplete="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
                  </div>
                  <h3 className={styles.formSectionTitle}>Rechnungsadresse</h3>
                  <div className={styles.inputGrid}>
                    <label>Straße<input autoComplete="address-line1" value={profile.street} onChange={(e) => setProfile({ ...profile, street: e.target.value })} /></label>
                    <label>Nr.<input value={profile.houseNumber} onChange={(e) => setProfile({ ...profile, houseNumber: e.target.value })} /></label>
                    <label>PLZ<input inputMode="numeric" autoComplete="postal-code" value={profile.postalCode} onChange={(e) => setProfile({ ...profile, postalCode: e.target.value })} /></label>
                    <label>Ort<input autoComplete="address-level2" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></label>
                  </div>
                  <button className={styles.primaryButton} disabled={busy}>{busy ? "Wird gespeichert …" : "Daten speichern"}</button>
                  {message && <p className={styles.message} aria-live="polite">{message}</p>}
                </form>
              </>}
            </>}
          </>
        )}
      </section>

      {addedName && <div className={styles.addedToast}><span>✓</span><div><strong>Im Warenkorb</strong><small>{addedName}</small></div></div>}

      {deleteConfirmOpen && <div className={styles.sheetBackdrop} onClick={() => !busy && setDeleteConfirmOpen(false)}>
        <section className={`${styles.productSheet} ${styles.deleteSheet}`} onClick={(event) => event.stopPropagation()}>
          <div className={styles.sheetHandle} />
          <header><div><small>ACCOUNT & DATEN</small><h2>Account endgültig löschen?</h2><p>Dein Login, deine gespeicherten Angaben, Bestellungen und Rosen werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.</p></div><button disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>×</button></header>
          <div className={styles.deleteSheetActions}>
            <button type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>Abbrechen</button>
            <button type="button" disabled={busy} onClick={deleteAccount}>{busy ? "Wird gelöscht …" : "Account endgültig löschen"}</button>
          </div>
          {message && <p className={styles.message} aria-live="polite">{message}</p>}
        </section>
      </div>}

      {selectedProduct && <div className={styles.sheetBackdrop} onClick={() => setSelectedProduct(null)}>
        <section className={styles.productSheet} onClick={(event) => event.stopPropagation()}>
          <div className={styles.sheetHandle} />
          <header><div><small>{selectedProduct.category}</small><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p></div><button onClick={() => setSelectedProduct(null)}>×</button></header>
          <div className={styles.sheetScroll}>
            {!!selectedProduct.variants?.length && <div className={styles.optionGroup}><h3>Größe wählen <span>Erforderlich</span></h3>{selectedProduct.variants.map((variant) => <button key={variant.name} className={selectedVariant === variant.name ? styles.choiceActive : ""} onClick={() => setSelectedVariant(variant.name)}><i /> <span>{variant.name}</span><strong>{euro(variant.price)}</strong></button>)}</div>}
            {selectedProduct.options?.map((group) => <div className={styles.optionGroup} key={group.group}><h3>{group.group} <span>{group.required ? "Erforderlich" : group.multiple ? "Mehrfachauswahl" : "Optional"}</span></h3>{group.items.map((item) => {
              const checked = (selectedOptions[group.group] ?? []).includes(item.name);
              const price = item.price ?? item.priceByVariant?.[selectedVariant] ?? 0;
              return <button key={item.name} className={checked ? styles.choiceActive : ""} onClick={() => toggleOption(group.group, item.name, group.multiple)}><i /> <span>{item.name}</span><strong>{price ? `+ ${euro(price)}` : "inklusive"}</strong></button>;
            })}</div>)}
          </div>
          <footer><button onClick={confirmProduct}><span>In den Warenkorb</span><strong>{euro(configuredPrice)}</strong></button></footer>
        </section>
      </div>}

      {activeOffer && <div className={styles.sheetBackdrop} onClick={() => setActiveOffer(null)}><section className={styles.productSheet} onClick={(event) => event.stopPropagation()}>
        <div className={styles.sheetHandle} /><header><div><small>ANGEBOT</small><h2>{activeOffer.title}</h2><p>{activeOffer.text}</p></div><button onClick={() => setActiveOffer(null)}>×</button></header>
        <div className={styles.offerForm}><label>Deine Auswahl<textarea rows={5} value={offerText} onChange={(event) => setOfferText(event.target.value)} placeholder="z. B. Pizza Salami, Pizza Spinat und Cola" /></label></div>
        <footer><button onClick={() => addOffer(activeOffer)}><span>Angebot hinzufügen</span><strong>{euro(activeOffer.price)}</strong></button></footer>
      </section></div>}

      {selectedOrder && (() => {
        const status = orderStatus(selectedOrder.status, selectedOrder.paid);
        const steps = ["Eingegangen", "Zubereitung", selectedOrder.orderType === "lieferung" ? "Unterwegs" : "Abholbereit", "Abgeschlossen"];
        return <div className={styles.sheetBackdrop} onClick={() => setSelectedOrderId("")}><section className={`${styles.productSheet} ${styles.orderSheet}`} onClick={(event) => event.stopPropagation()}>
          <div className={styles.sheetHandle} /><header><div><small>BESTELLUNG #{selectedOrder.orderNumber || "—"}</small><h2>{status.label}</h2><p>{orderDate(selectedOrder.createdAt)} · {selectedOrder.orderType === "lieferung" ? "Lieferung" : "Abholung"}</p></div><button onClick={() => setSelectedOrderId("")}>×</button></header>
          <div className={styles.orderSheetScroll}>
            <section className={styles.orderLiveCard}><span className={`${styles.orderStatusDot} ${styles[status.tone]}`} /><div><small>AKTUELLER STATUS</small><strong>{status.label}</strong>{selectedOrder.confirmedMinutes && <p>Bestätigte Zeit: ungefähr {selectedOrder.confirmedMinutes} Minuten</p>}</div><b>{euro(selectedOrder.total)}</b></section>
            <div className={styles.orderTimeline}>{steps.map((step, index) => <div key={step} className={index <= status.stage ? styles.timelineActive : ""}><i>{index < status.stage ? "✓" : index + 1}</i><span>{step}</span></div>)}</div>
            <section className={styles.orderItems}><h3>Deine Bestellung</h3>{selectedOrder.items.map((item, index) => <article key={`${item.name}-${index}`}><span>{item.quantity}×</span><div><strong>{item.name}</strong>{item.variantName && <small>{item.variantName}</small>}{item.selectedOptions.map((option) => <small key={option}>{option}</small>)}</div><b>{euro(item.price * item.quantity)}</b></article>)}</section>
            {selectedOrder.earnedRoses > 0 && <div className={styles.orderRoseEarned}>🌹 <strong>+{selectedOrder.earnedRoses} Rosen</strong><span>für diese Bestellung</span></div>}
          </div>
          <footer><button onClick={() => setSelectedOrderId("")}><span>Schließen</span><strong>✓</strong></button></footer>
        </section></div>;
      })()}

      <nav className={`${styles.tabBar} ${cartPulse ? styles.cartPulse : ""}`} style={{ "--active-index": activeNavIndex } as CSSProperties} aria-label="Hauptnavigation">
        <span className={styles.liquidIndicator} aria-hidden="true"><span key={activePrimaryTab} className={styles.liquidIndicatorCore}><Icon name={activePrimaryTab} />{activePrimaryTab === "cart" && cartCount > 0 && <i>{cartCount}</i>}</span></span>
        {primaryTabs.map((item) => (
        <button key={item} className={activePrimaryTab === item ? styles.activeTab : ""} aria-current={activePrimaryTab === item ? "page" : undefined} onClick={() => { setTab(item); if (item === "account") setAccountView("overview"); }}>
          <span className={styles.tabIcon}><Icon name={item} />{item === "cart" && cartCount > 0 && <i>{cartCount}</i>}</span>
          <small>{tabLabels[item]}</small>
        </button>
      ))}</nav>
    </main>
  );
}
