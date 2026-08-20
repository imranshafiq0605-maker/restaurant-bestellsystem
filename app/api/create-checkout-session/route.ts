import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripeMetadataQuery, verifyFirebaseIdToken } from "../../lib/firebase-rest-auth";
import { getAdminDb } from "../../lib/firebase-admin";

function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(emailBereinigt);
}

export async function POST(req: NextRequest) {
  try {
    const stripeApiKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeApiKey) {
      return NextResponse.json(
        { error: "Stripe ist lokal noch nicht verbunden. Bitte STRIPE_SECRET_KEY in .env.local eintragen oder die App über Vercel veröffentlichen." },
        { status: 503 }
      );
    }
    const stripe = new Stripe(stripeApiKey);
    const body = await req.json();
    const {
      pendingOrderId,
      email,
      gesamtpreis,
      gesamtpreisProdukte,
      rabattBetrag,
      paymentMethod,
      source,
    } = body;

    const allowedPaymentMethods = ["card", "paypal", "klarna"] as const;
    const selectedPaymentMethod = allowedPaymentMethods.includes(paymentMethod)
      ? paymentMethod
      : null;

    if (!pendingOrderId) {
      return NextResponse.json(
        { error: "pendingOrderId fehlt" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || !validiereEmail(email)) {
      return NextResponse.json(
        { error: "E-Mail fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    if (
      typeof gesamtpreis !== "number" ||
      Number.isNaN(gesamtpreis) ||
      gesamtpreis <= 0
    ) {
      return NextResponse.json(
        { error: "Gesamtpreis fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      "https://restaurant-bestellsystem.vercel.app";

    const adminDb = getAdminDb();
    const pendingOrderRef = adminDb.collection("pendingOrders").doc(pendingOrderId);
    const pendingOrderSnap = await pendingOrderRef.get();
    if (!pendingOrderSnap.exists) {
      return NextResponse.json({ error: "Die vorbereitete Bestellung wurde nicht gefunden." }, { status: 404 });
    }
    const pendingOrder = pendingOrderSnap.data();
    const storedTotal = Number(pendingOrder?.gesamtpreis);
    const storedEmail = String(pendingOrder?.kunde?.email || "").trim().toLowerCase();
    if (Math.abs(storedTotal - gesamtpreis) > 0.001 || storedEmail !== email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Bestelldaten und Zahlungsbetrag stimmen nicht überein." }, { status: 400 });
    }

    let stripeCustomerId: string | undefined;
    let firebaseUid: string | undefined;
    const authorization = req.headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
      const account = await verifyFirebaseIdToken(authorization);
      firebaseUid = account.localId;
      const customers = await stripe.customers.search({
        query: stripeMetadataQuery(account.localId),
        limit: 1,
      });
      stripeCustomerId = customers.data[0]?.id;
    }

    // Ein voller Euro entspricht einer Rose. Eine Rose hat einen Gegenwert von 0,03 €.
    const rosenVerdient = firebaseUid ? Math.floor(gesamtpreis) : 0;
    await pendingOrderRef.set({
      paymentMethod: selectedPaymentMethod || "card",
      firebaseUid: firebaseUid || null,
      rosenVerdient,
    }, { merge: true });

    const descriptionParts: string[] = [];

    if (typeof gesamtpreisProdukte === "number") {
      descriptionParts.push(`Zwischensumme: ${gesamtpreisProdukte.toFixed(2)} €`);
    }

    if (typeof rabattBetrag === "number" && rabattBetrag > 0) {
      descriptionParts.push(`10% Rabatt: -${rabattBetrag.toFixed(2)} €`);
    }

    descriptionParts.push(`Endpreis: ${gesamtpreis.toFixed(2)} €`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: selectedPaymentMethod
        ? [selectedPaymentMethod]
        : ["card", "paypal", "klarna"],
      mode: "payment",
      ...(stripeCustomerId
        ? { customer: stripeCustomerId }
        : { customer_email: email.trim() }),
      locale: "de",
      origin_context: "mobile_app",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "La Rosa Bestellung",
              description: descriptionParts.join(" | "),
            },
            unit_amount: Math.round(gesamtpreis * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        pendingOrderId,
        email: email.trim(),
        gesamtpreis: gesamtpreis.toFixed(2),
        rosenVerdient: String(rosenVerdient),
        rabattBetrag:
          typeof rabattBetrag === "number"
            ? rabattBetrag.toFixed(2)
            : "0.00",
      },
      success_url: source === "mobile"
        ? `${origin}/mobile?tab=account&paid=true&orderId=${pendingOrderId}`
        : `${origin}/order-status?paid=true&pendingOrderId=${pendingOrderId}`,
      cancel_url: source === "mobile" ? `${origin}/warenkorb?source=mobile` : `${origin}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Stripe Fehler:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe Session konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
