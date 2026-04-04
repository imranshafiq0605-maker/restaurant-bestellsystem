import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
import { adminDb } from "../../lib/firebase-admin";
import { sendOrderEmail } from "../../lib/send-order-email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getBerlinDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);

  const getPart = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  const weekday = getPart("weekday").toLowerCase();

  const dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  return {
    day: dayMap[weekday] ?? 1,
    year: Number(getPart("year")),
    month: Number(getPart("month")),
    dayOfMonth: Number(getPart("day")),
    hour: Number(getPart("hour")),
    minute: Number(getPart("minute")),
  };
}

function istRestaurantGeradeGeoeffnet(date: Date) {
  const berlin = getBerlinDateParts(date);
  const minuten = berlin.hour * 60 + berlin.minute;
  const istWochenende = berlin.day === 0 || berlin.day === 6;

  const offenAb = istWochenende ? 14 * 60 : 11 * 60;
  const offenBis = 23 * 60;

  return minuten >= offenAb && minuten <= offenBis;
}

function getNaechsterOeffnungszeitpunkt(fromDate: Date) {
  const nowBerlin = getBerlinDateParts(fromDate);
  const istWochenende = nowBerlin.day === 0 || nowBerlin.day === 6;
  const openHourToday = istWochenende ? 14 : 11;
  const openMinutesToday = openHourToday * 60;
  const currentMinutes = nowBerlin.hour * 60 + nowBerlin.minute;

  if (currentMinutes < openMinutesToday) {
    const result = new Date(fromDate);
    result.setUTCMinutes(
      result.getUTCMinutes() + (openMinutesToday - currentMinutes)
    );
    result.setUTCSeconds(0, 0);
    return result;
  }

  const result = new Date(fromDate);
  result.setUTCDate(result.getUTCDate() + 1);
  result.setUTCHours(0, 0, 0, 0);

  while (true) {
    const berlin = getBerlinDateParts(result);
    const isWeekend = berlin.day === 0 || berlin.day === 6;
    const openHour = isWeekend ? 14 : 11;

    if (berlin.hour == 0 && berlin.minute == 0) {
      result.setUTCMinutes(result.getUTCMinutes() + openHour * 60);
      return result;
    }

    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(0, 0, 0, 0);
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

    const pendingOrderRef = adminDb.collection("pendingOrders").doc(pendingOrderId);
    const pendingOrderSnap = await pendingOrderRef.get();

    if (!pendingOrderSnap.exists) {
      throw new Error(`pendingOrder nicht gefunden: ${pendingOrderId}`);
    }

    const pendingOrderData = pendingOrderSnap.data();

    if (!pendingOrderData) {
      throw new Error("pendingOrderData ist leer");
    }

    console.log("✅ pendingOrder gefunden");

    const counterRef = adminDb.collection("system").doc("orderCounter");

    const neueBestellnummer = await adminDb.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);

      if (!counterSnap.exists) {
        transaction.set(counterRef, { current: 1001 });
        return 1001;
      }

      const current = counterSnap.data()?.current || 1000;
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
      releaseAt: admin.firestore.Timestamp.fromDate(releaseDate),
      acceptedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await adminDb.collection("bestellungen").doc(pendingOrderId).set(finaleBestellung);
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

    await pendingOrderRef.delete();
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