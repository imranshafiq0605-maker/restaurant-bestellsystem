import { NextResponse } from "next/server";
import { AdminInputError, adminRoute } from "../../../lib/admin-api";
import { normalizeMenu } from "../../../lib/menu-config";
import { loadCustomMenu, loadMenu, saveMenu } from "../../../lib/site-config-server";

export const GET = adminRoute(async () => {
  const [menu, custom] = await Promise.all([loadMenu(), loadCustomMenu()]);
  return NextResponse.json({ menu, customized: Boolean(custom) });
});

export const PUT = adminRoute(async (request, adminEmail) => {
  const body = await request.json().catch(() => ({}));
  let menu;
  try {
    menu = normalizeMenu(body?.menu);
  } catch (error) {
    throw new AdminInputError(error instanceof Error ? error.message : "Die Speisekarte ist ungültig.");
  }
  await saveMenu(menu, adminEmail);
  return NextResponse.json({ menu, customized: true });
});

// Setzt die Speisekarte auf den Stand aus dem Code zurück.
export const DELETE = adminRoute(async (_request, adminEmail) => {
  await saveMenu(null, adminEmail);
  return NextResponse.json({ menu: await loadMenu(), customized: false });
});
