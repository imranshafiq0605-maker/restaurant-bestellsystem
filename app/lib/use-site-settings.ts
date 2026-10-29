"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MENU, normalizeMenu, visibleProducts, type MenuData } from "./menu-config";
import { DEFAULT_OPENING_SETTINGS, normalizeOpeningSettings, type OpeningSettings } from "./site-settings";

// Lädt Öffnungszeiten und Speisekarte aus dem Admin-Panel. Bis die Antwort da ist (oder wenn sie fehlschlägt),
// gelten die Standardwerte aus dem Code, die Seite ist also sofort benutzbar.
export function useSiteSettings() {
  const [opening, setOpening] = useState<OpeningSettings>(DEFAULT_OPENING_SETTINGS);
  const [menu, setMenu] = useState<MenuData>(DEFAULT_MENU);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setOpening(normalizeOpeningSettings(data.opening));
        if (data.menu) {
          try {
            setMenu(normalizeMenu(data.menu));
          } catch (error) {
            console.error("Speisekarte aus dem Admin-Panel ist ungültig:", error);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const produkte = useMemo(() => visibleProducts(menu), [menu]);
  return { opening, kategorienMap: menu.kategorienMap, produkte, loaded };
}
