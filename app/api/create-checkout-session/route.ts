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

    if (!data?.orderId) {
      return new Response(
        JSON.stringify({ error: "orderId fehlt" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const origin = new URL(req.url).origin;

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

    if (data.gesamtpreis && data.artikel) {
      const artikelSumme = data.artikel.reduce(
        (sum: number, item: any) =>
          sum + (item.price || 0) * (item.quantity || 1),
        0
      );

      const differenz = Math.round((data.gesamtpreis - artikelSumme) * 100);

      if (differenz > 0) {
        lineItems.push({
          price_data: {
            currency: "eur",
            product_data: {
              name: "Liefergebühr",
            },
            unit_amount: differenz,
          },
          quantity: 1,
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${origin}/order-status?id=${data.orderId}&paid=true`,
      cancel_url: `${origin}`,
      metadata: {
        orderId: String(data.orderId),
        orderNumber: String(data.orderNumber || ""),
      },
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