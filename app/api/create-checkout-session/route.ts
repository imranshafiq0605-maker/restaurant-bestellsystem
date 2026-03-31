import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY fehlt" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const stripe = new Stripe(secretKey);

    const data = await req.json();

    if (!data?.artikel || !Array.isArray(data.artikel) || data.artikel.length === 0) {
      return new Response(
        JSON.stringify({ error: "Keine Artikel erhalten" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const lineItems = data.artikel.map((item: any) => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: item.name || "Artikel",
        },
        unit_amount: Math.round((item.price || 0) * 100),
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url:
        "https://restaurant-bestellsystem.vercel.app/order-status",
      cancel_url:
        "https://restaurant-bestellsystem.vercel.app",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Stripe Fehler in Route:", error);

    return new Response(
      JSON.stringify({ error: error?.message || "Stripe Fehler" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}