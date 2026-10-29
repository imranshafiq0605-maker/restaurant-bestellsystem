import { getAdminDb } from "./firebase-admin";
import { DEFAULT_MENU, normalizeMenu, type MenuData } from "./menu-config";
import { DEFAULT_OPENING_SETTINGS, normalizeOpeningSettings, type OpeningSettings } from "./site-settings";

// Liest Öffnungszeiten und Speisekarte aus Firestore. Kurzer Cache pro Server-Instanz,
// damit nicht jeder Seitenaufruf Firestore liest. Nach dem Speichern im Admin-Panel wird er geleert.

const CACHE_MS = 15_000;
const SETTINGS_DOC = "einstellungen/website";
const MENU_DOC = "einstellungen/speisekarte";

let settingsCache: { at: number; value: OpeningSettings } | null = null;
let menuCache: { at: number; value: MenuData | null } | null = null;

export function clearSiteConfigCache() {
  settingsCache = null;
  menuCache = null;
}

export async function loadOpeningSettings(): Promise<OpeningSettings> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.value;
  try {
    const snapshot = await getAdminDb().doc(SETTINGS_DOC).get();
    const value = snapshot.exists ? normalizeOpeningSettings(snapshot.data()) : DEFAULT_OPENING_SETTINGS;
    settingsCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error("Öffnungszeiten konnten nicht geladen werden:", error);
    return settingsCache?.value ?? DEFAULT_OPENING_SETTINGS;
  }
}

export async function saveOpeningSettings(settings: OpeningSettings, adminEmail: string) {
  await getAdminDb().doc(SETTINGS_DOC).set({ ...settings, updatedAt: new Date().toISOString(), updatedBy: adminEmail });
  clearSiteConfigCache();
}

/** Gespeicherte Speisekarte oder null, wenn noch die Standardkarte aus dem Code gilt. */
export async function loadCustomMenu(): Promise<MenuData | null> {
  if (menuCache && Date.now() - menuCache.at < CACHE_MS) return menuCache.value;
  try {
    const snapshot = await getAdminDb().doc(MENU_DOC).get();
    const data = snapshot.data();
    const value = snapshot.exists && data?.menuJson ? normalizeMenu(JSON.parse(String(data.menuJson))) : null;
    menuCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error("Speisekarte konnte nicht geladen werden:", error);
    return menuCache?.value ?? null;
  }
}

/** Aktuelle Speisekarte fürs Admin-Panel. Die Originalkarte wird dabei bereinigt (z. B. eindeutige IDs). */
export async function loadMenu() {
  return (await loadCustomMenu()) ?? normalizeMenu(DEFAULT_MENU);
}

// Als JSON-Text gespeichert: Firestore erlaubt keine verschachtelten Arrays in allen Fällen und bleibt so unter 1 MB übersichtlich.
export async function saveMenu(menu: MenuData | null, adminEmail: string) {
  const ref = getAdminDb().doc(MENU_DOC);
  if (menu) await ref.set({ menuJson: JSON.stringify(menu), updatedAt: new Date().toISOString(), updatedBy: adminEmail });
  else await ref.delete();
  clearSiteConfigCache();
}
