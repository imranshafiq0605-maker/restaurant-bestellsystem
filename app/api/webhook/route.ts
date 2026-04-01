import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook Fehler:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      const pendingOrderId = session.metadata?.pendingOrderId;

      if (!pendingOrderId) {
        console.error("pendingOrderId fehlt in Stripe metadata");
        return NextResponse.json({ received: true });
      }

      const pendingOrderRef = doc(db, "pendingOrders", pendingOrderId);
      const pendingOrderSnap = await getDoc(pendingOrderRef);

      if (!pendingOrderSnap.exists()) {
        console.error("pendingOrder nicht gefunden:", pendingOrderId);
        return NextResponse.json({ received: true });
      }

      const pendingOrderData = pendingOrderSnap.data();

      const counterRef = doc(db, "system", "orderCounter");

      const neueBestellnummer = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);

        if (!counterSnap.exists()) {
          transaction.set(counterRef, { current: 1001 });
          return 1001;
        }

        const current = counterSnap.data().current || 1000;
        const next = current + 1;

        transaction.update(counterRef, { current: next });
        return next;
      });

      const finaleBestellung = {
        ...pendingOrderData,
        orderNumber: neueBestellnummer,
        status: "neu",
        bezahlt: true,
        stripeSessionId: session.id,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "bestellungen", pendingOrderId), finaleBestellung);

      await deleteDoc(pendingOrderRef);

      console.log("✅ Bestellung erfolgreich aus pendingOrders übernommen:", pendingOrderId);
    } catch (error) {
      console.error("Fehler beim Verarbeiten des Webhooks:", error);
    }
  }

  return NextResponse.json({ received: true });
}