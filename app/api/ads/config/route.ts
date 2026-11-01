import { NextRequest, NextResponse } from "next/server";
import { parseAdsConfig } from "../../../lib/ads-measurement";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Runtime config also works with the existing Vercel container deployment.
  const requested = request.nextUrl.searchParams.get("origin") || process.env.GOOGLE_ADS_ORIGIN;
  const origin = [process.env.GOOGLE_ADS_ORIGIN, process.env.GOOGLE_ADS_ALTERNATE_ORIGIN].find((value) => value && value === requested);
  const config = process.env.VERCEL_ENV === "preview" ? null : parseAdsConfig(
    process.env.GOOGLE_ADS_ID, process.env.GOOGLE_ADS_PURCHASE_LABEL, origin,
  );
  return NextResponse.json({ config }, { headers: { "Cache-Control": "no-store" } });
}
