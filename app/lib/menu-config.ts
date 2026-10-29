import { kategorienMap as defaultKategorien, produkte as defaultProdukte, type Cuisine, type Product, type ProductOption } from "../data/menu";

// Speisekarte, wie sie Website und App anzeigen. Im Admin-Panel bearbeitet und in Firestore (einstellungen/speisekarte)
// gespeichert. Solange dort nichts gespeichert ist, gilt die Karte aus app/data/menu.ts.

export type MenuData = { kategorienMap: Record<Cuisine, string[]>; produkte: Product[] };

export const CUISINES: Cuisine[] = ["Italienisch", "Indisch", "Getränke"];

export const DEFAULT_MENU: MenuData = { kategorienMap: defaultKategorien, produkte: defaultProdukte };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const price = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number < 10000 ? Math.round(number * 100) / 100 : null;
};

function cleanOptions(value: unknown): ProductOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .filter((group) => group && typeof group === "object" && Array.isArray(group.items))
    .map((group) => ({
      group: text(group.group, 80) || "Extras",
      ...(group.required === true ? { required: true } : {}),
      ...(group.multiple === true ? { multiple: true } : {}),
      items: (group.items as unknown[])
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && Boolean(text((item as Record<string, unknown>).name, 120)))
        .map((item) => {
          const itemPrice = price(item.price);
          const byVariant = item.priceByVariant && typeof item.priceByVariant === "object"
            ? Object.fromEntries(Object.entries(item.priceByVariant as Record<string, unknown>)
                .map(([key, entry]) => [text(key, 80), price(entry)])
                .filter((entry): entry is [string, number] => Boolean(entry[0]) && entry[1] !== null))
            : null;
          const info = item.info && typeof item.info === "object" ? item.info as Record<string, unknown> : null;
          return {
            name: text(item.name, 120),
            ...(itemPrice !== null ? { price: itemPrice } : {}),
            ...(byVariant && Object.keys(byVariant).length ? { priceByVariant: byVariant } : {}),
            ...(info ? { info: { taste: text(info.taste, 400), ingredients: text(info.ingredients, 1200), allergens: text(info.allergens, 400) } } : {}),
          };
        }),
    }))
    .filter((group) => group.items.length > 0);
  return options.length ? options : undefined;
}

/** Prüft eine Speisekarte aus dem Admin-Panel oder aus Firestore. Wirft einen Fehler mit deutscher Meldung. */
export function normalizeMenu(input: unknown): MenuData {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawCategories = (source.kategorienMap && typeof source.kategorienMap === "object" ? source.kategorienMap : {}) as Record<string, unknown>;
  const kategorienMap = Object.fromEntries(CUISINES.map((cuisine) => {
    const list = Array.isArray(rawCategories[cuisine]) ? (rawCategories[cuisine] as unknown[]) : [];
    return [cuisine, Array.from(new Set(list.map((name) => text(name, 80)).filter(Boolean)))];
  })) as Record<Cuisine, string[]>;

  if (!Array.isArray(source.produkte)) throw new Error("Die Speisekarte enthält keine Produkte.");
  // Die Originalkarte hat einige doppelte IDs; doppelte bekommen hier eine neue, eindeutige ID.
  const usedIds = new Set<number>();
  let nextId = Math.max(0, ...source.produkte.map((raw) => Number((raw as Record<string, unknown>)?.id) || 0)) + 1;
  const produkte = source.produkte.map((raw, index) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = text(item.name, 120);
    if (!name) throw new Error(`Produkt ${index + 1} hat keinen Namen.`);
    const cuisine = CUISINES.includes(item.cuisine as Cuisine) ? (item.cuisine as Cuisine) : null;
    if (!cuisine) throw new Error(`„${name}“ hat keine gültige Küche.`);
    const category = text(item.category, 80);
    if (!kategorienMap[cuisine].includes(category)) throw new Error(`„${name}“: Die Kategorie „${category}“ gibt es unter ${cuisine} nicht.`);
    let id = Number(item.id);
    if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) id = nextId++;
    usedIds.add(id);
    const variants = Array.isArray(item.variants)
      ? (item.variants as Array<Record<string, unknown>>)
          .map((variant) => ({ name: text(variant?.name, 80), price: price(variant?.price) }))
          .filter((variant): variant is { name: string; price: number } => Boolean(variant.name) && variant.price !== null)
      : [];
    const basePrice = price(item.price);
    if (!variants.length && basePrice === null) throw new Error(`„${name}“ hat keinen gültigen Preis.`);
    const number = Number(item.number);
    const options = cleanOptions(item.options);
    const product: Product = {
      id,
      ...(Number.isInteger(number) && number > 0 ? { number } : {}),
      name,
      description: text(item.description, 600),
      category,
      cuisine,
      ...(variants.length ? { variants } : { price: basePrice as number }),
      ...(options ? { options } : {}),
      ...(item.hidden === true ? { hidden: true } : {}),
    };
    return product;
  });
  return { kategorienMap, produkte };
}

/** Produkte, die Kunden sehen dürfen. */
export function visibleProducts(menu: MenuData) {
  return menu.produkte.filter((product) => !product.hidden && menu.kategorienMap[product.cuisine]?.includes(product.category));
}
