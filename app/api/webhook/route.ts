import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook Fehler:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session.metadata?.orderId;

    if (orderId) {
      try {
        const orderRef = doc(db, "bestellungen", orderId);

        await updateDoc(orderRef, {
          status: "bezahlt",
          bezahlt: true,
          stripeSessionId: session.id,
        });

        console.log("✅ Bestellung erfolgreich auf bezahlt gesetzt:", orderId);
      } catch (error) {
        console.error("Fehler beim Aktualisieren der Bestellung:", error);
      }
    }
  }

  return NextResponse.json({ received: true });
}