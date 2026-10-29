import { NextResponse } from "next/server";
import { loadCustomMenu, loadOpeningSettings } from "../../lib/site-config-server";

// Öffentliche Einstellungen für Website und App: Öffnungszeiten, Schließtage und (falls im Admin-Panel geändert) die Speisekarte.
export async function GET() {
  const [opening, menu] = await Promise.all([loadOpeningSettings(), loadCustomMenu()]);
  return NextResponse.json({ opening, menu }, { headers: { "Cache-Control": "no-store" } });
}
