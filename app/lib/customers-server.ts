import admin from "firebase-admin";
import { createHash } from "node:crypto";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

// Kundenverzeichnis für das Admin-Panel. Jeder Kunde bekommt eine feste Kundennummer (ab 10001):
// registrierte Konten in kunden/{uid}.kundennummer, Gastbesteller (nur E-Mail aus Bestellungen) in gaeste/{emailHash}.
// Registriert sich ein Gast später, übernimmt sein Konto die Gast-Kundennummer.

const COUNTER = "system/kundenCounter";
const FIRST_NUMBER = 10001;

export type AdminCustomer = {
  key: string;
  type: "konto" | "gast";
  uid: string | null;
  customerNumber: number | null;
  email: string;
  name: string;
  phone: string;
  address: string;
  provider: string;
  emailVerified: boolean;
  roses: number;
  orders: number;
  revenue: number;
  lastOrderAt: string | null;
  createdAt: string | null;
  newsletter: boolean;
  newsletterSince: string | null;
};

export const guestKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

const toIso = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
};

/** Reserviert `count` aufeinanderfolgende Kundennummern und gibt die erste zurück. */
async function reserveNumbers(count: number) {
  const db = getAdminDb();
  const ref = db.doc(COUNTER);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const last = Math.max(FIRST_NUMBER - 1, Number(snapshot.data()?.last) || 0);
    transaction.set(ref, { last: last + count }, { merge: true });
    return last + 1;
  });
}

/** Sorgt dafür, dass ein Konto eine Kundennummer hat (z. B. direkt nach der Registrierung). */
export async function ensureCustomerNumber(uid: string, email: string | undefined) {
  const db = getAdminDb();
  const ref = db.collection("kunden").doc(uid);
  const existing = Number((await ref.get()).data()?.kundennummer) || 0;
  if (existing) return existing;
  let number = 0;
  if (email) {
    const guest = await db.collection("gaeste").doc(guestKey(email)).get();
    number = Number(guest.data()?.kundennummer) || 0;
  }
  if (!number) number = await reserveNumbers(1);
  await ref.set({ kundennummer: number, ...(email ? { email } : {}) }, { merge: true });
  return number;
}

async function listAllAuthUsers() {
  const users: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAdminAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

type OrderStats = { orders: number; revenue: number; lastOrderAt: string | null; name: string; phone: string; address: string; firstOrderAt: string | null };

/**
 * Baut das komplette Kundenverzeichnis: alle Firebase-Konten, alle Kundendaten und alle bezahlten Bestellungen
 * (auch von Gästen ohne Konto). Fehlende Kundennummern werden dabei rückwirkend vergeben.
 */
export async function buildCustomerDirectory(): Promise<AdminCustomer[]> {
  const db = getAdminDb();
  const [users, kundenSnap, gaesteSnap, ordersSnap] = await Promise.all([
    listAllAuthUsers(),
    db.collection("kunden").get(),
    db.collection("gaeste").get(),
    db.collection("bestellungen").select("firebaseUid", "kunde", "gesamtpreis", "zahlbetrag", "bezahlt", "createdAt", "status").get(),
  ]);

  const kunden = new Map(kundenSnap.docs.map((doc) => [doc.id, doc.data()]));
  const gaeste = new Map(gaesteSnap.docs.map((doc) => [doc.id, doc.data()]));
  const userByEmail = new Map(users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));

  // Bestellungen je Konto (über firebaseUid oder gleiche E-Mail) bzw. je Gast-E-Mail zusammenzählen.
  const stats = new Map<string, OrderStats>();
  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    if (order.bezahlt === false) continue;
    if (String(order.status || "").toLowerCase().includes("storniert")) continue;
    const email = typeof order.kunde?.email === "string" ? order.kunde.email.trim().toLowerCase() : "";
    const uid = typeof order.firebaseUid === "string" && order.firebaseUid ? order.firebaseUid : userByEmail.get(email)?.uid;
    const key = uid ? `konto:${uid}` : email ? `gast:${email}` : "";
    if (!key) continue;
    const entry = stats.get(key) || { orders: 0, revenue: 0, lastOrderAt: null, firstOrderAt: null, name: "", phone: "", address: "" };
    const createdAt = toIso(order.createdAt);
    entry.orders += 1;
    entry.revenue += Number(order.zahlbetrag ?? order.gesamtpreis) || 0;
    if (createdAt && (!entry.lastOrderAt || createdAt > entry.lastOrderAt)) {
      entry.lastOrderAt = createdAt;
      entry.name = String(order.kunde?.name || entry.name);
      entry.phone = String(order.kunde?.telefon || entry.phone);
      const address = String(order.kunde?.adresse || "");
      if (address && address !== "Abholung") entry.address = address;
    }
    if (createdAt && (!entry.firstOrderAt || createdAt < entry.firstOrderAt)) entry.firstOrderAt = createdAt;
    if (!entry.name) entry.name = String(order.kunde?.name || "");
    stats.set(key, entry);
  }

  const customers: AdminCustomer[] = users.map((user) => {
    const data = kunden.get(user.uid) || {};
    const orderStats = stats.get(`konto:${user.uid}`);
    const address = [[data.street, data.houseNumber].filter(Boolean).join(" "), [data.postalCode, data.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const provider = user.providerData.map((entry) => entry.providerId).find((id) => id === "apple.com" || id === "google.com") || "password";
    return {
      key: `konto:${user.uid}`,
      type: "konto",
      uid: user.uid,
      customerNumber: Number(data.kundennummer) || null,
      email: user.email || String(data.email || ""),
      name: String(data.name || user.displayName || orderStats?.name || ""),
      phone: String(data.phone || orderStats?.phone || ""),
      address: address || orderStats?.address || "",
      provider: provider === "apple.com" ? "Apple" : provider === "google.com" ? "Google" : "E-Mail",
      emailVerified: user.emailVerified,
      roses: Math.max(0, Number(data.roses) || 0),
      orders: orderStats?.orders || 0,
      revenue: Math.round((orderStats?.revenue || 0) * 100) / 100,
      lastOrderAt: orderStats?.lastOrderAt || null,
      createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null,
      newsletter: data.newsletter?.subscribed === true,
      newsletterSince: toIso(data.newsletter?.updatedAt),
    };
  });

  for (const [key, entry] of stats) {
    if (!key.startsWith("gast:")) continue;
    const email = key.slice(5);
    const data = gaeste.get(guestKey(email)) || {};
    customers.push({
      key,
      type: "gast",
      uid: null,
      customerNumber: Number(data.kundennummer) || null,
      email,
      name: entry.name,
      phone: entry.phone,
      address: entry.address,
      provider: "Gast",
      emailVerified: false,
      roses: 0,
      orders: entry.orders,
      revenue: Math.round(entry.revenue * 100) / 100,
      lastOrderAt: entry.lastOrderAt,
      createdAt: entry.firstOrderAt,
      newsletter: false,
      newsletterSince: null,
    });
  }

  await assignMissingNumbers(customers, gaeste);
  return customers.sort((a, b) => (a.customerNumber || 0) - (b.customerNumber || 0));
}

/** Vergibt rückwirkend Kundennummern – die ältesten Kunden bekommen die kleinsten Nummern. */
async function assignMissingNumbers(customers: AdminCustomer[], gaeste: Map<string, FirebaseFirestore.DocumentData>) {
  const db = getAdminDb();
  for (const customer of customers) {
    // Konto übernimmt die Nummer, die es schon als Gast hatte.
    if (customer.type === "konto" && !customer.customerNumber && customer.email) {
      const guestNumber = Number(gaeste.get(guestKey(customer.email))?.kundennummer) || 0;
      if (guestNumber) {
        customer.customerNumber = guestNumber;
        await db.collection("kunden").doc(customer.uid!).set({ kundennummer: guestNumber }, { merge: true });
      }
    }
  }
  const missing = customers
    .filter((customer) => !customer.customerNumber)
    .sort((a, b) => (a.createdAt || "9999").localeCompare(b.createdAt || "9999"));
  if (!missing.length) return;

  const first = await reserveNumbers(missing.length);
  for (let start = 0; start < missing.length; start += 400) {
    const batch = db.batch();
    missing.slice(start, start + 400).forEach((customer, index) => {
      customer.customerNumber = first + start + index;
      const ref = customer.type === "konto"
        ? db.collection("kunden").doc(customer.uid!)
        : db.collection("gaeste").doc(guestKey(customer.email));
      batch.set(ref, customer.type === "konto"
        ? { kundennummer: customer.customerNumber, email: customer.email }
        : { kundennummer: customer.customerNumber, email: customer.email, createdAt: customer.createdAt }, { merge: true });
    });
    await batch.commit();
  }
}
