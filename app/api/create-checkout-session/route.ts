import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: Request) {
  const body = await req.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Bestellung",
          },
          unit_amount: Math.round(body.gesamtpreis * 100),
        },
        quantity: 1,
      },
    ],
    success_url: "https://DEINE-DOMAIN/order-status?paid=true",
    cancel_url: "https://DEINE-DOMAIN",
  });

  return NextResponse.json({ url: session.url });
}