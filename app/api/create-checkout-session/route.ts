import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function validiereEmail(email: string) {
  const emailBereinigt = email.trim();

  if (!emailBereinigt) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(emailBereinigt);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pendingOrderId,
      email,
      gesamtpreis,
      gesamtpreisProdukte,
      rabattBetrag,
    } = body;

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

    const descriptionParts: string[] = [];

    if (typeof gesamtpreisProdukte === "number") {
      descriptionParts.push(`Zwischensumme: ${gesamtpreisProdukte.toFixed(2)} €`);
    }

    if (typeof rabattBetrag === "number" && rabattBetrag > 0) {
      descriptionParts.push(`10% Rabatt: -${rabattBetrag.toFixed(2)} €`);
    }

    descriptionParts.push(`Endpreis: ${gesamtpreis.toFixed(2)} €`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card","paypal","klarna","sofort","giropay",],
      mode: "payment",
      customer_email: email.trim(),
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
        rabattBetrag:
          typeof rabattBetrag === "number"
            ? rabattBetrag.toFixed(2)
            : "0.00",
      },
      success_url: `${origin}/order-status?paid=true&pendingOrderId=${pendingOrderId}`,
      cancel_url: `${origin}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Fehler:", error);
    return NextResponse.json(
      { error: error?.message || "Stripe Session konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}