"use client";

import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";

// Gemeinsame Helfer für das Kundenkonto auf der Website (Konto-Seite, Header, Warenkorb).
// Die App unter /mobile nutzt dieselben API-Routen und dieselben Firestore-Daten.

export const ROSE_VALUE_EUR = 0.03;
export const ROSE_REDEEM_STEP = 100;

export type AccountProfile = {
  name: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  roses: number;
};

export type AccountOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  paid: boolean;
  orderType: "abholung" | "lieferung";
  total: number;
  originalTotal: number;
  earnedRoses: number;
  redeemedRoses: number;
  roseDiscount: number;
  createdAt: string | null;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    variantName: string | null;
    selectedOptions: string[];
  }>;
};

export const emptyProfile: AccountProfile = {
  name: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  roses: 0,
};

async function authorizedFetch(user: User, url: string, init: RequestInit = {}, forceRefresh = false) {
  const token = await user.getIdToken(forceRefresh);
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Die Anfrage konnte nicht verarbeitet werden.");
  return data;
}

function toProfile(data: Record<string, unknown> | undefined): AccountProfile {
  return {
    name: typeof data?.name === "string" ? data.name : "",
    phone: typeof data?.phone === "string" ? data.phone : "",
    street: typeof data?.street === "string" ? data.street : "",
    houseNumber: typeof data?.houseNumber === "string" ? data.houseNumber : "",
    postalCode: typeof data?.postalCode === "string" ? data.postalCode : "",
    city: typeof data?.city === "string" ? data.city : "",
    roses: Math.max(0, Number(data?.roses) || 0),
  };
}

export async function fetchProfile(user: User) {
  const data = await authorizedFetch(user, "/api/account/profile");
  return toProfile(data.profile);
}

export async function saveProfile(user: User, profile: AccountProfile) {
  const data = await authorizedFetch(user, "/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return toProfile(data.profile);
}

export async function fetchOrders(user: User) {
  const data = await authorizedFetch(user, "/api/account/orders");
  return {
    orders: Array.isArray(data.orders) ? (data.orders as AccountOrder[]) : [],
    roses: Math.max(0, Number(data.roses) || 0),
  };
}

export async function deleteAccount(user: User) {
  await authorizedFetch(user, "/api/account/profile", { method: "DELETE" }, true);
}

export async function releaseRoses(user: User, orderId: string) {
  await authorizedFetch(user, "/api/account/release-roses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
}

// Schickt den 6-stelligen Bestätigungscode. auto = nur senden, wenn noch kein gültiger Code unterwegs ist.
export async function sendEmailCode(user: User, auto = false) {
  const data = await authorizedFetch(user, "/api/account/email-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auto }),
  });
  return {
    sent: Boolean(data.sent),
    verified: Boolean(data.verified),
    retryAfter: Math.max(0, Number(data.retryAfter) || 0),
  };
}

export async function verifyEmailCode(user: User, code: string) {
  await authorizedFetch(user, "/api/account/email-code/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  // Firebase-Status und Token neu laden, damit emailVerified sofort überall stimmt.
  await user.reload();
  await user.getIdToken(true);
}

// E-Mail/Passwort-Konten bestätigen ihre Adresse per Code. Apple und Google liefern bereits bestätigte Adressen.
// Geprüft wird bewusst "nicht Apple/Google", weil die App per Custom Token anmeldet.
export function needsEmailCode(user: User | null) {
  if (!user || user.emailVerified || !user.email) return false;
  return !user.providerData.some((provider) => provider.providerId === "google.com" || provider.providerId === "apple.com");
}

export function euro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function formatOrderDate(value: string | null) {
  if (!value) return "Gerade eben";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function orderStatusLabel(order: AccountOrder) {
  const status = order.status.toLowerCase();
  if (!order.paid) return "Zahlung wird geprüft";
  if (status.includes("storniert")) return "Storniert";
  if (["geliefert", "ausgeliefert"].some((value) => status.includes(value))) return "Geliefert";
  if (["abgeschlossen", "fertig", "abgeholt"].some((value) => status.includes(value))) {
    return order.orderType === "lieferung" ? "Geliefert" : "Abgeholt";
  }
  if (status.includes("unterwegs")) return "Unterwegs";
  if (["abholbereit", "bereit"].some((value) => status.includes(value))) return "Abholbereit";
  if (["angenommen", "bestätigt", "zubereitung"].some((value) => status.includes(value))) return "Wird zubereitet";
  return "Bestellung eingegangen";
}

export type OrderTone = "waiting" | "active" | "done" | "cancelled";

export function orderStatusTone(order: AccountOrder): OrderTone {
  const label = orderStatusLabel(order);
  if (label === "Storniert") return "cancelled";
  if (["Geliefert", "Abgeholt", "Abholbereit"].includes(label)) return "done";
  if (["Wird zubereitet", "Unterwegs"].includes(label)) return "active";
  return "waiting";
}

export function authErrorMessage(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "E-Mail oder Passwort ist nicht korrekt.";
  }
  if (code === "auth/email-already-in-use") return "Für diese E-Mail gibt es schon ein Konto. Bitte melde dich an.";
  if (code === "auth/weak-password") return "Bitte wähle ein Passwort mit mindestens 8 Zeichen.";
  if (code === "auth/invalid-email") return "Bitte gib eine gültige E-Mail-Adresse ein.";
  if (code === "auth/too-many-requests") return "Zu viele Versuche. Bitte warte kurz und versuche es erneut.";
  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
    return "Das Anmeldefenster wurde geschlossen oder blockiert. Bitte erneut versuchen.";
  }
  if (code === "auth/unauthorized-domain") return "Diese Website-Adresse ist in Firebase noch nicht als autorisierte Domain eingetragen.";
  if (code === "auth/operation-not-allowed") return "Diese Anmeldeart ist in Firebase noch nicht aktiviert.";
  if (code === "auth/requires-recent-login") return "Bitte melde dich aus Sicherheitsgründen neu an und versuche es danach erneut.";
  if (code === "auth/account-exists-with-different-credential") {
    return "Für diese E-Mail besteht bereits ein Konto mit einer anderen Anmeldeart.";
  }
  if (code === "auth/network-request-failed") return "Keine Verbindung. Bitte Internetverbindung prüfen.";
  return error instanceof Error ? error.message : "Anmeldung nicht möglich.";
}
