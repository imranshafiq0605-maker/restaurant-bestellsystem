import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY fehlt" }),
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey);

    const data = await req.json();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: data.artikel.map((item: any) => ({
        price_data: {
          currency: "eur",
          product_data: {
            name: item.name || "Artikel",
          },
          unit_amount: Math.round((item.price || item.preis || 0) * 100),
        },
        quantity: item.quantity || item.anzahl || 1,
      })),
      success_url: "https://restaurant-bestellsystem-469ctyx5h.vercel.app/order-status",
      cancel_url: "https://restaurant-bestellsystem-469ctyx5h.vercel.app",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe Fehler:", error);
    return new Response(JSON.stringify({ error: "Stripe Fehler" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}