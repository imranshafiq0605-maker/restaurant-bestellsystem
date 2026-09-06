import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import Stripe from "stripe";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

type OrderRecord = FirebaseFirestore.DocumentData & {
  firebaseUid?: string;
  bezahlt?: boolean;
  gesamtpreis?: number;
  zahlbetrag?: number;
  rosenVerdient?: number;
  rosenEingeloest?: number;
  rosenRabattBetrag?: number;
  kunde?: { email?: string };
};

function timestampToIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function timestampToMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  const parsed = typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function automaticFinalStatus(order: OrderRecord) {
  if (!order.bezahlt) return null;
  const minutes = Number(order.annahmeZeitMinuten ?? order.confirmedMinutes ?? order.lieferzeitMinuten ?? order.estimatedMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const start = timestampToMillis(order.confirmedAt ?? order.acceptedAt ?? order.updatedAt ?? order.createdAt);
  if (start === null || Date.now() < start + minutes * 60_000) return null;
  const current = String(order.status || "").toLowerCase();
  if (["storniert", "geliefert", "ausgeliefert", "abgeholt", "abgeschlossen"].some((status) => current.includes(status))) return null;
  return String(order.bestellart || "abholung").toLowerCase() === "lieferung" ? "geliefert" : "abholbereit";
}

function serializeOrder(id: string, data: OrderRecord) {
  return {
    id,
    orderNumber: data.orderNumber ?? null,
    status: data.status ?? "neu",
    paid: Boolean(data.bezahlt),
    orderType: data.bestellart ?? "abholung",
    total: Number(data.zahlbetrag ?? data.gesamtpreis) || 0,
    originalTotal: Number(data.gesamtpreis) || 0,
    earnedRoses: Number(data.rosenVerdient) || 0,
    redeemedRoses: Number(data.rosenEingeloest) || 0,
    roseDiscount: Number(data.rosenRabattBetrag) || 0,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    confirmedAt: timestampToIso(data.confirmedAt),
    acceptedAt: timestampToIso(data.acceptedAt),
    confirmedMinutes: Number(data.annahmeZeitMinuten ?? data.confirmedMinutes ?? data.lieferzeitMinuten ?? data.estimatedMinutes) || null,
    preorder: data.vorbestellung ?? "sofort",
    time: data.uhrzeit ?? "sofort",
    items: Array.isArray(data.artikel) ? data.artikel.map((item: FirebaseFirestore.DocumentData) => ({
      name: String(item.name || "Artikel"),
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
      variantName: item.variantName ? String(item.variantName) : null,
      selectedOptions: Array.isArray(item.selectedOptions) ? item.selectedOptions.map(String) : [],
    })) : [],
  };
}

async function reconcileRoses(
  uid: string,
  email: string | undefined,
  orderId: string,
  order: OrderRecord
) {
  if (!order.bezahlt || typeof order.rosenVerdient !== "number") return;

  const adminDb = getAdminDb();
  const earned = Math.max(0, Math.floor(Number(order.zahlbetrag ?? order.gesamtpreis) || 0));
  const customerRef = adminDb.collection("kunden").doc(uid);
  const ledgerRef = adminDb.collection("rosenBuchungen").doc(orderId);
  const reservationRef = adminDb.collection("rosenReservierungen").doc(orderId);
  const redemptionRef = adminDb.collection("rosenEinloesungen").doc(orderId);
  const orderRef = adminDb.collection("bestellungen").doc(orderId);

  await adminDb.runTransaction(async (transaction) => {
    const [ledger, reservation] = await Promise.all([
      transaction.get(ledgerRef),
      transaction.get(reservationRef),
    ]);
    const previous = ledger.exists ? Number(ledger.data()?.amount) || 0 : 0;
    const difference = earned - previous;

    transaction.set(customerRef, {
      ...(email ? { email } : {}),
      ...(difference !== 0 ? { roses: admin.firestore.FieldValue.increment(difference) } : {}),
      rosesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(ledgerRef, {
      uid,
      amount: earned,
      orderId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(!ledger.exists ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    transaction.set(orderRef, { firebaseUid: uid, rosenVerdient: earned }, { merge: true });
    const redeemed = Math.max(0, Math.floor(Number(order.rosenEingeloest) || 0));
    if (redeemed > 0 && reservation.data()?.uid === uid && reservation.data()?.status === "reserved") {
      transaction.set(reservationRef, {
        status: "redeemed",
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(redemptionRef, {
        uid,
        amount: -redeemed,
        orderId,
        reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

async function releaseExpiredReservations(uid: string) {
  const adminDb = getAdminDb();
  const snapshot = await adminDb.collection("rosenReservierungen")
    .where("uid", "==", uid)
    .limit(20)
    .get();
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeApiKey ? new Stripe(stripeApiKey) : null;
  for (const reservation of snapshot.docs) {
    const data = reservation.data();
    const reservedAt = data.reservedAt?.toMillis?.() ?? Date.now();
    if (data.status !== "reserved" || reservedAt > cutoff) continue;
    const stripeSessionId = typeof data.stripeSessionId === "string" ? data.stripeSessionId : "";
    if (stripeSessionId) {
      if (!stripe) continue;
      try {
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
        if (session.payment_status === "paid" || session.status === "complete") continue;
        if (session.status === "open") await stripe.checkout.sessions.expire(stripeSessionId);
      } catch (error) {
        console.error("Abgelaufene Rosenreservierung konnte nicht geprüft werden:", error);
        continue;
      }
    }
    const customerRef = adminDb.collection("kunden").doc(uid);
    const orderRef = adminDb.collection("bestellungen").doc(reservation.id);
    await adminDb.runTransaction(async (transaction) => {
      const [freshReservation, customer, order] = await Promise.all([
        transaction.get(reservation.ref),
        transaction.get(customerRef),
        transaction.get(orderRef),
      ]);
      if (freshReservation.data()?.status !== "reserved") return;
      if (order.data()?.bezahlt === true) {
        transaction.set(reservation.ref, {
          status: "redeemed",
          redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
      }
      const amount = Number(freshReservation.data()?.amount) || 0;
      transaction.set(customerRef, {
        roses: (Number(customer.data()?.roses) || 0) + amount,
        rosesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(reservation.ref, {
        status: "expired",
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(req.headers.get("authorization"));
    const adminDb = getAdminDb();
    await releaseExpiredReservations(account.localId);
    const documents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

    const uidSnapshot = await adminDb.collection("bestellungen")
      .where("firebaseUid", "==", account.localId)
      .limit(30)
      .get();
    uidSnapshot.docs.forEach((document) => documents.set(document.id, document));

    if (account.email && account.emailVerified) {
      const emailSnapshot = await adminDb.collection("bestellungen")
        .where("kunde.email", "==", account.email)
        .limit(30)
        .get();
      emailSnapshot.docs.forEach((document) => documents.set(document.id, document));
    }

    const reconciledOrders: Array<{ id: string; data: OrderRecord }> = [];
    for (const document of documents.values()) {
      const order = document.data() as OrderRecord;
      if (!order.firebaseUid && account.emailVerified) {
        await document.ref.set({ firebaseUid: account.localId }, { merge: true });
        order.firebaseUid = account.localId;
      }
      const finalStatus = automaticFinalStatus(order);
      if (finalStatus) {
        await document.ref.set({
          status: finalStatus,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        order.status = finalStatus;
      }
      await reconcileRoses(account.localId, account.email, document.id, order);
      if (order.bezahlt && typeof order.rosenVerdient === "number") {
        order.rosenVerdient = Math.max(0, Math.floor(Number(order.zahlbetrag ?? order.gesamtpreis) || 0));
      }
      reconciledOrders.push({ id: document.id, data: order });
    }

    const orders = reconciledOrders
      .map((order) => serializeOrder(order.id, order.data))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const customer = await adminDb.collection("kunden").doc(account.localId).get();
    return NextResponse.json({
      orders,
      roses: Number(customer.data()?.roses) || 0,
      roseValueCents: 3,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bestellungen konnten nicht geladen werden.";
    const status = message === "AUTH_REQUIRED" || message === "AUTH_INVALID" ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "Bitte melde dich erneut an." : message }, { status });
  }
}
