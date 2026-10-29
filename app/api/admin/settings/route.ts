import { NextResponse } from "next/server";
import { adminRoute } from "../../../lib/admin-api";
import { loadOpeningSettings, saveOpeningSettings } from "../../../lib/site-config-server";
import { normalizeOpeningSettings } from "../../../lib/site-settings";

export const GET = adminRoute(async () => NextResponse.json({ opening: await loadOpeningSettings() }));

export const PUT = adminRoute(async (request, adminEmail) => {
  const body = await request.json().catch(() => ({}));
  const opening = normalizeOpeningSettings(body?.opening);
  await saveOpeningSettings(opening, adminEmail);
  return NextResponse.json({ opening });
});
