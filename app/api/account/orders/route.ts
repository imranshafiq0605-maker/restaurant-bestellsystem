import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

type OrderRecord = FirebaseFirestore.DocumentData & {
  firebaseUid?: string;
  bezahlt?: boolean;
  gesamtpreis?: number;
  rosenVerdient?: number;
  kunde?: { email?: string };
};

function timestampToIso(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function serializeOrder(id: string, data: OrderRecord) {
  return {
    id,
    orderNumber: data.orderNumber ?? null,
    status: data.status ?? "neu",
    paid: Boolean(data.bezahlt),
    orderType: data.bestellart ?? "abholung",
    total: Number(data.gesamtpreis) || 0,
    earnedRoses: Number(data.rosenVerdient) || 0,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    confirmedAt: timestampToIso(data.confirmedAt),
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
  const earned = Math.max(0, Math.floor(Number(order.gesamtpreis) || 0));
  const customerRef = adminDb.collection("kunden").doc(uid);
  const ledgerRef = adminDb.collection("rosenBuchungen").doc(orderId);
  const orderRef = adminDb.collection("bestellungen").doc(orderId);

  await adminDb.runTransaction(async (transaction) => {
    const ledger = await transaction.get(ledgerRef);
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
  });
}

export async function GET(req: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(req.headers.get("authorization"));
    const adminDb = getAdminDb();
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
      await reconcileRoses(account.localId, account.email, document.id, order);
      if (order.bezahlt && typeof order.rosenVerdient === "number") {
        order.rosenVerdient = Math.max(0, Math.floor(Number(order.gesamtpreis) || 0));
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
