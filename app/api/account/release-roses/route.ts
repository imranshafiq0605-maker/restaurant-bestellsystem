import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import Stripe from "stripe";
import { getAdminDb } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

export async function POST(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const { orderId } = await request.json();
    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "Bestell-ID fehlt." }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const reservationRef = adminDb.collection("rosenReservierungen").doc(orderId);
    const customerRef = adminDb.collection("kunden").doc(account.localId);
    const orderRef = adminDb.collection("bestellungen").doc(orderId);
    const reservationSnapshot = await reservationRef.get();
    const reservationData = reservationSnapshot.data();
    if (!reservationSnapshot.exists || reservationData?.uid !== account.localId || reservationData?.status !== "reserved") {
      return NextResponse.json({ released: 0 });
    }

    const stripeSessionId = typeof reservationData.stripeSessionId === "string" ? reservationData.stripeSessionId : "";
    if (stripeSessionId) {
      const stripeApiKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeApiKey) {
        return NextResponse.json({ error: "Die Zahlungsreservierung konnte nicht sicher beendet werden." }, { status: 503 });
      }
      const stripe = new Stripe(stripeApiKey);
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
      if (session.payment_status === "paid" || session.status === "complete") {
        return NextResponse.json({ error: "Diese Bestellung wurde bereits bezahlt." }, { status: 409 });
      }
      if (session.status === "open") await stripe.checkout.sessions.expire(stripeSessionId);
    }
    let released = 0;

    await adminDb.runTransaction(async (transaction) => {
      const [reservation, customer, order] = await Promise.all([
        transaction.get(reservationRef),
        transaction.get(customerRef),
        transaction.get(orderRef),
      ]);
      const data = reservation.data();
      if (!reservation.exists || data?.uid !== account.localId || data?.status !== "reserved") return;
      if (order.data()?.bezahlt === true) return;
      released = Number(data.amount) || 0;
      transaction.set(customerRef, {
        roses: (Number(customer.data()?.roses) || 0) + released,
        rosesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(reservationRef, {
        status: "released",
        releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return NextResponse.json({ released });
  } catch (error) {
    console.error("Rosenreservierung konnte nicht freigegeben werden:", error);
    return NextResponse.json({ error: "Rosen konnten nicht freigegeben werden." }, { status: 401 });
  }
}
