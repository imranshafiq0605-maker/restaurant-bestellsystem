import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pendingOrderId, artikel } = body;

    if (!pendingOrderId) {
      return NextResponse.json({ error: "pendingOrderId fehlt" }, { status: 400 });
    }

    if (!artikel || !Array.isArray(artikel) || artikel.length === 0) {
      return NextResponse.json({ error: "Artikel fehlen" }, { status: 400 });
    }

    const origin =
      req.headers.get("origin") || "https://restaurant-bestellsystem.vercel.app";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: artikel.map((item: any) => ({
        price_data: {
          currency: "eur",
          product_data: {
            name: item.name || "Artikel",
          },
          unit_amount: Math.round((item.price || 0) * 100),
        },
        quantity: item.quantity || 1,
      })),
      metadata: {
        pendingOrderId,
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