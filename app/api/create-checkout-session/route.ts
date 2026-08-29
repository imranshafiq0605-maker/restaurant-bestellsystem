import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
import { stripeMetadataQuery, verifyFirebaseIdToken } from "../../lib/firebase-rest-auth";
import { getAdminDb } from "../../lib/firebase-admin";

function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(emailBereinigt);
}

async function releaseRoseReservation(orderId: string, uid: string) {
  const adminDb = getAdminDb();
  const reservationRef = adminDb.collection("rosenReservierungen").doc(orderId);
  const customerRef = adminDb.collection("kunden").doc(uid);
  await adminDb.runTransaction(async (transaction) => {
    const [reservation, customer] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(customerRef),
    ]);
    if (!reservation.exists || reservation.data()?.status !== "reserved") return;
    const amount = Number(reservation.data()?.amount) || 0;
    transaction.set(customerRef, {
      roses: (Number(customer.data()?.roses) || 0) + amount,
      rosesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(reservationRef, {
      status: "released",
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
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
      rosesToRedeem,
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

    const requestedRoses = Number(rosesToRedeem) || 0;
    if (!Number.isInteger(requestedRoses) || requestedRoses < 0 || requestedRoses % 100 !== 0) {
      return NextResponse.json({ error: "Rosen können nur in 100er-Schritten eingelöst werden." }, { status: 400 });
    }
    if (requestedRoses > 0 && source !== "mobile") {
      return NextResponse.json({ error: "Rosen können derzeit ausschließlich in der App eingelöst werden." }, { status: 400 });
    }
    if (requestedRoses > 0 && !firebaseUid) {
      return NextResponse.json({ error: "Bitte melde dich in der App an, um Rosen einzulösen." }, { status: 401 });
    }

    const rosenRabattBetrag = requestedRoses * 0.03;
    const zahlbetrag = Math.round((gesamtpreis - rosenRabattBetrag) * 100) / 100;
    if (zahlbetrag < 0.5) {
      return NextResponse.json({ error: "Nach dem Rosenrabatt müssen mindestens 0,50 € zur Zahlung übrig bleiben." }, { status: 400 });
    }

    if (requestedRoses > 0 && firebaseUid) {
      const customerRef = adminDb.collection("kunden").doc(firebaseUid);
      const reservationRef = adminDb.collection("rosenReservierungen").doc(pendingOrderId);
      try {
        await adminDb.runTransaction(async (transaction) => {
          const [customer, existingReservation] = await Promise.all([
            transaction.get(customerRef),
            transaction.get(reservationRef),
          ]);
          if (existingReservation.exists) {
            const existing = existingReservation.data();
            if (existing?.uid === firebaseUid && existing?.amount === requestedRoses && existing?.status === "reserved") return;
            throw new Error("Für diese Bestellung besteht bereits eine andere Rosenreservierung.");
          }
          const balance = Number(customer.data()?.roses) || 0;
          if (balance < requestedRoses) throw new Error("Dein Rosenguthaben reicht dafür nicht aus.");
          transaction.set(customerRef, {
            roses: balance - requestedRoses,
            rosesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          transaction.set(reservationRef, {
            uid: firebaseUid,
            orderId: pendingOrderId,
            amount: requestedRoses,
            discount: rosenRabattBetrag,
            status: "reserved",
            reservedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "Rosen konnten nicht reserviert werden.",
        }, { status: 409 });
      }
    }

    // Ein voller Euro entspricht einer Rose. Eine Rose hat einen Gegenwert von 0,03 €.
    const rosenVerdient = firebaseUid ? Math.floor(zahlbetrag) : 0;
    try {
      await pendingOrderRef.set({
        paymentMethod: selectedPaymentMethod || "card",
        firebaseUid: firebaseUid || null,
        rosenVerdient,
        rosenEingeloest: requestedRoses,
        rosenRabattBetrag,
        zahlbetrag,
      }, { merge: true });
    } catch (error) {
      if (requestedRoses > 0 && firebaseUid) await releaseRoseReservation(pendingOrderId, firebaseUid);
      throw error;
    }

    const descriptionParts: string[] = [];

    if (typeof gesamtpreisProdukte === "number") {
      descriptionParts.push(`Zwischensumme: ${gesamtpreisProdukte.toFixed(2)} €`);
    }

    if (typeof rabattBetrag === "number" && rabattBetrag > 0) {
      descriptionParts.push(`10% Rabatt: -${rabattBetrag.toFixed(2)} €`);
    }

    if (rosenRabattBetrag > 0) {
      descriptionParts.push(`${requestedRoses} Rosen: -${rosenRabattBetrag.toFixed(2)} €`);
    }
    descriptionParts.push(`Zahlbetrag: ${zahlbetrag.toFixed(2)} €`);

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
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
              unit_amount: Math.round(zahlbetrag * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          pendingOrderId,
          email: email.trim(),
          gesamtpreis: gesamtpreis.toFixed(2),
          zahlbetrag: zahlbetrag.toFixed(2),
          rosenVerdient: String(rosenVerdient),
          rosenEingeloest: String(requestedRoses),
          rabattBetrag:
            typeof rabattBetrag === "number"
              ? rabattBetrag.toFixed(2)
              : "0.00",
        },
        success_url: source === "mobile"
          ? `${origin}/mobile?tab=account&paid=true&orderId=${pendingOrderId}`
          : `${origin}/order-status?paid=true&pendingOrderId=${pendingOrderId}`,
        cancel_url: source === "mobile"
          ? `${origin}/warenkorb?source=mobile&cancelledOrderId=${pendingOrderId}`
          : `${origin}`,
      });
    } catch (error) {
      if (requestedRoses > 0 && firebaseUid) await releaseRoseReservation(pendingOrderId, firebaseUid);
      throw error;
    }

    if (requestedRoses > 0) {
      await adminDb.collection("rosenReservierungen").doc(pendingOrderId).set({
        stripeSessionId: session.id,
      }, { merge: true });
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Stripe Fehler:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe Session konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
