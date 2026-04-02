import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { sendOrderEmail } from "../../lib/send-order-email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
function istRestaurantGeradeGeoeffnet(date: Date) {
  const tag = date.getDay(); // 0 = Sonntag, 6 = Samstag
  const minuten = date.getHours() * 60 + date.getMinutes();
  const istWochenende = tag === 0 || tag === 6;

  const offenAb = istWochenende ? 14 * 60 : 11 * 60;
  const offenBis = 23 * 60;

  return minuten >= offenAb && minuten <= offenBis;
}

function getNaechsterOeffnungszeitpunkt(fromDate: Date) {
  const d = new Date(fromDate);

  while (true) {
    const tag = d.getDay();
    const istWochenende = tag === 0 || tag === 6;
    const openHour = istWochenende ? 14 : 11;

    const candidate = new Date(d);
    candidate.setHours(openHour, 0, 0, 0);

    if (candidate.getTime() > fromDate.getTime()) {
      return candidate;
    }

    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
}

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
    console.error("❌ Webhook Signatur Fehler:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    const pendingOrderId = session.metadata?.pendingOrderId;

    console.log("👉 checkout.session.completed erhalten");
    console.log("👉 pendingOrderId:", pendingOrderId);

    if (!pendingOrderId) {
      throw new Error("pendingOrderId fehlt in Stripe metadata");
    }

    const pendingOrderRef = doc(db, "pendingOrders", pendingOrderId);
    const pendingOrderSnap = await getDoc(pendingOrderRef);

    if (!pendingOrderSnap.exists()) {
      throw new Error(`pendingOrder nicht gefunden: ${pendingOrderId}`);
    }

    const pendingOrderData = pendingOrderSnap.data();
    console.log("✅ pendingOrder gefunden");

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

    console.log("✅ neue Bestellnummer:", neueBestellnummer);

    const jetzt = new Date();
const istGeradeGeoeffnet = istRestaurantGeradeGeoeffnet(jetzt);

const releaseDate = istGeradeGeoeffnet
  ? jetzt
  : getNaechsterOeffnungszeitpunkt(jetzt);

const finaleBestellung = {
  ...pendingOrderData,
  orderNumber: neueBestellnummer,
  status: "neu",
  bezahlt: true,
  stripeSessionId: session.id,
  releaseAt: Timestamp.fromDate(releaseDate),
  acceptedAt: null,
  createdAt: serverTimestamp(),
};

    await setDoc(doc(db, "bestellungen", pendingOrderId), finaleBestellung);
    console.log("✅ Bestellung in bestellungen gespeichert");

    const kunde = pendingOrderData?.kunde || {};
    const kundenEmail =
      typeof kunde.email === "string" ? kunde.email.trim() : "";

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.headers.get("origin") ||
      "https://restaurant-bestellsystem.vercel.app";

    const statusUrl = `${siteUrl}/order-status?id=${pendingOrderId}`;

    if (kundenEmail) {
      try {
        await sendOrderEmail({
          to: kundenEmail,
          name: kunde.name || "",
          orderNumber: neueBestellnummer,
          statusUrl,
        });
        console.log("✅ Bestellmail gesendet an:", kundenEmail);
      } catch (mailError: any) {
        console.error("❌ Fehler beim Mailversand:", mailError);
      }
    } else {
      console.log("⚠️ Keine Kunden-E-Mail vorhanden, Mail wurde nicht gesendet.");
    }

    await deleteDoc(pendingOrderRef);
    console.log("✅ pendingOrder gelöscht");

    return NextResponse.json({
      received: true,
      success: true,
      pendingOrderId,
    });
  } catch (error: any) {
    console.error("❌ Fehler im Webhook:", error);
    return NextResponse.json(
      {
        received: false,
        error: error?.message || "Unbekannter Webhook-Fehler",
      },
      { status: 500 }
    );
  }
}