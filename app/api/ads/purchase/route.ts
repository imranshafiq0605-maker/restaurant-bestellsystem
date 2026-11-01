import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDb } from "../../../lib/firebase-admin";
import { parseAdsConfig, validCheckoutSession, verifiedPurchase } from "../../../lib/ads-measurement";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const config = parseAdsConfig(process.env.GOOGLE_ADS_ID, process.env.GOOGLE_ADS_PURCHASE_LABEL, process.env.GOOGLE_ADS_ORIGIN);
  if (!config || process.env.VERCEL_ENV === "preview" || !process.env.STRIPE_SECRET_KEY) {
    return new NextResponse(null, { status: 503, headers });
  }
  if (![config.origin, process.env.GOOGLE_ADS_ALTERNATE_ORIGIN].some((origin) => origin && origin === request.headers.get("origin"))) {
    return new NextResponse(null, { status: 403, headers });
  }
  let sessionId: unknown;
  try { sessionId = (await request.json()).sessionId; } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  if (!validCheckoutSession(sessionId)) return new NextResponse(null, { status: 400, headers });
  try {
    // The unguessable Stripe session ID is a capability, never a customer-supplied
    // amount or a claim such as ?paid=true. Return only measurement fields.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.pendingOrderId;
    if (!session.livemode || session.payment_status !== "paid" || session.status !== "complete" ||
        !orderId || !/^[a-zA-Z0-9_-]{1,128}$/.test(orderId)) {
      return new NextResponse(null, { status: 204, headers });
    }
    const order = await getAdminDb().collection("bestellungen").doc(orderId).get();
    // The webhook can arrive after the browser returns from Checkout.
    if (!order.exists) return new NextResponse(null, { status: 202, headers });
    const conversion = verifiedPurchase(session, order.data() || null);
    if (!conversion) return new NextResponse(null, { status: 204, headers });
    return NextResponse.json(conversion, { headers });
  } catch (error) {
    // Do not log the capability, customer data or Stripe's full error object.
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return new NextResponse(null, { status: 404, headers });
    }
    return new NextResponse(null, { status: 503, headers });
  }
}
