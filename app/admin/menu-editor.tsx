"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cuisine, Product, ProductOption } from "../data/menu";
import { CUISINES, normalizeMenu, type MenuData } from "../lib/menu-config";
import styles from "./admin.module.css";
import { adminFetch, euro, Icon, PageHead, Switch } from "./ui";

type Props = { onError: (error: unknown) => string };

type ProductDraft = {
  id: number | null;
  number: string;
  name: string;
  description: string;
  category: string;
  priceMode: "single" | "variants";
  price: string;
  variants: Array<{ name: string; price: string }>;
  optionsJson: string;
  hidden: boolean;
};

const priceText = (value: number | undefined) => (typeof value === "number" ? value.toFixed(2).replace(".", ",") : "");
const parsePrice = (value: string) => {
  const parsed = Number(value.replace(/\s|€/g, "").replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
};

function productPriceLabel(product: Product) {
  if (product.variants?.length) {
    const prices = product.variants.map((variant) => variant.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? euro(min) : `${euro(min)} – ${euro(max)}`;
  }
  return euro(product.price ?? 0);
}

function toDraft(product: Product | null, category: string): ProductDraft {
  return {
    id: product?.id ?? null,
    number: product?.number ? String(product.number) : "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: product?.category ?? category,
    priceMode: product?.variants?.length ? "variants" : "single",
    price: priceText(product?.price),
    variants: product?.variants?.length ? product.variants.map((variant) => ({ name: variant.name, price: priceText(variant.price) })) : [{ name: "", price: "" }],
    optionsJson: product?.options?.length ? JSON.stringify(product.options, null, 2) : "",
    hidden: Boolean(product?.hidden),
  };
}

export default function MenuEditor({ onError }: Props) {
  const [saved, setSaved] = useState<MenuData | null>(null);
  const [draft, setDraft] = useState<MenuData | null>(null);
  const [customized, setCustomized] = useState(false);
  const [cuisine, setCuisine] = useState<Cuisine>("Italienisch");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminFetch<{ menu: MenuData; customized: boolean }>("/api/admin/menu")
      .then((data) => {
        setSaved(data.menu);
        setDraft(data.menu);
        setCustomized(data.customized);
      })
      .catch((error) => setMessage({ ok: false, text: onError(error) }));
  }, [onError]);

  const categories = useMemo(() => draft?.kategorienMap[cuisine] ?? [], [draft, cuisine]);
  const activeCategory = categories.includes(category) ? category : categories[0] ?? "";
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

  const visibleProducts = useMemo(() => {
    if (!draft) return [];
    const needle = search.trim().toLowerCase();
    if (needle) {
      return draft.produkte.filter((product) => `${product.number ?? ""} ${product.name} ${product.description} ${product.category}`.toLowerCase().includes(needle));
    }
    return draft.produkte.filter((product) => product.cuisine === cuisine && product.category === activeCategory);
  }, [draft, search, cuisine, activeCategory]);

  if (!draft) {
    return <><PageHead title="Speisekarte" />{message ? <p className={styles.error}>{message.text}</p> : <div className={styles.loadingBox}>Speisekarte wird geladen …</div>}</>;
  }

  const countIn = (name: string) => draft.produkte.filter((product) => product.cuisine === cuisine && product.category === name).length;
  const setCategories = (list: string[]) => setDraft({ ...draft, kategorienMap: { ...draft.kategorienMap, [cuisine]: list } });

  function addCategory() {
    const name = newCategory.trim();
    if (!name || !draft) return;
    if (categories.includes(name)) {
      setMessage({ ok: false, text: `Die Kategorie „${name}“ gibt es schon.` });
      return;
    }
    setCategories([...categories, name]);
    setCategory(name);
    setNewCategory("");
  }

  function moveCategory(name: string, direction: -1 | 1) {
    const index = categories.indexOf(name);
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const list = [...categories];
    [list[index], list[target]] = [list[target], list[index]];
    setCategories(list);
  }

  function renameCategory() {
    if (!renaming || !draft) return;
    const to = renaming.to.trim();
    if (!to || to === renaming.from) return setRenaming(null);
    if (categories.includes(to)) {
      setMessage({ ok: false, text: `Die Kategorie „${to}“ gibt es schon.` });
      return;
    }
    setDraft({
      kategorienMap: { ...draft.kategorienMap, [cuisine]: categories.map((name) => (name === renaming.from ? to : name)) },
      produkte: draft.produkte.map((product) => (product.cuisine === cuisine && product.category === renaming.from ? { ...product, category: to } : product)),
    });
    setCategory(to);
    setRenaming(null);
  }

  function deleteCategory(name: string) {
    if (!draft) return;
    const count = countIn(name);
    if (!window.confirm(count ? `Kategorie „${name}“ mit ${count} Produkten löschen? Die Produkte werden ebenfalls entfernt.` : `Kategorie „${name}“ löschen?`)) return;
    setDraft({
      kategorienMap: { ...draft.kategorienMap, [cuisine]: categories.filter((item) => item !== name) },
      produkte: draft.produkte.filter((product) => !(product.cuisine === cuisine && product.category === name)),
    });
  }

  function patchProduct(id: number, patch: Partial<Product>) {
    if (!draft) return;
    setDraft({ ...draft, produkte: draft.produkte.map((product) => (product.id === id ? { ...product, ...patch } : product)) });
  }

  function removeProduct(product: Product) {
    if (!draft || !window.confirm(`„${product.name}“ aus der Speisekarte löschen?\n\nTipp: Mit dem Auge-Symbol kannst du es auch nur ausblenden.`)) return;
    setDraft({ ...draft, produkte: draft.produkte.filter((item) => item.id !== product.id) });
  }

  function moveProduct(product: Product, direction: -1 | 1) {
    if (!draft) return;
    const siblings = draft.produkte.filter((item) => item.cuisine === product.cuisine && item.category === product.category);
    const neighbor = siblings[siblings.indexOf(product) + direction];
    if (!neighbor) return;
    const list = [...draft.produkte];
    const a = list.indexOf(product);
    const b = list.indexOf(neighbor);
    [list[a], list[b]] = [list[b], list[a]];
    setDraft({ ...draft, produkte: list });
  }

  function saveProduct() {
    if (!editing || !draft) return;
    setEditError("");
    const name = editing.name.trim();
    if (!name) return setEditError("Bitte gib einen Namen ein.");
    let options: ProductOption[] | undefined;
    if (editing.optionsJson.trim()) {
      try {
        const parsed = JSON.parse(editing.optionsJson);
        if (!Array.isArray(parsed)) throw new Error();
        options = parsed;
      } catch {
        return setEditError("Die Extras/Optionen sind kein gültiges JSON (Liste [ … ]).");
      }
    }
    const base = {
      name,
      description: editing.description.trim(),
      category: editing.category,
      cuisine: draft.produkte.find((item) => item.id === editing.id)?.cuisine ?? cuisine,
      ...(Number(editing.number) > 0 ? { number: Math.floor(Number(editing.number)) } : {}),
      ...(options?.length ? { options } : {}),
      ...(editing.hidden ? { hidden: true } : {}),
    };
    let product: Product;
    if (editing.priceMode === "variants") {
      const variants = editing.variants.filter((variant) => variant.name.trim() || variant.price.trim()).map((variant) => ({ name: variant.name.trim(), price: parsePrice(variant.price) }));
      if (!variants.length || variants.some((variant) => !variant.name || variant.price === null)) return setEditError("Bitte gib für jede Größe einen Namen und einen Preis ein.");
      product = { id: editing.id ?? 0, ...base, variants: variants as Array<{ name: string; price: number }> };
    } else {
      const price = parsePrice(editing.price);
      if (price === null) return setEditError("Bitte gib einen gültigen Preis ein, z. B. 9,50.");
      product = { id: editing.id ?? 0, ...base, price };
    }
    let next: MenuData;
    if (editing.id === null) {
      product.id = Math.max(0, ...draft.produkte.map((item) => item.id)) + 1;
      // Neues Produkt am Ende seiner Kategorie einfügen.
      const lastIndex = draft.produkte.map((item) => item.cuisine === product.cuisine && item.category === product.category).lastIndexOf(true);
      const list = [...draft.produkte];
      list.splice(lastIndex >= 0 ? lastIndex + 1 : list.length, 0, product);
      next = { ...draft, produkte: list };
    } else {
      next = { ...draft, produkte: draft.produkte.map((item) => (item.id === editing.id ? product : item)) };
    }
    try {
      normalizeMenu(next);
    } catch (error) {
      return setEditError(error instanceof Error ? error.message : "Das Produkt ist ungültig.");
    }
    setDraft(next);
    setEditing(null);
  }

  async function saveMenu() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await adminFetch<{ menu: MenuData; customized: boolean }>("/api/admin/menu", { method: "PUT", body: JSON.stringify({ menu: draft }) });
      setSaved(data.menu);
      setDraft(data.menu);
      setCustomized(true);
      setMessage({ ok: true, text: "Speisekarte gespeichert. Website und App zeigen sie in wenigen Sekunden." });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function resetMenu() {
    if (!window.confirm("Alle Änderungen an der Speisekarte verwerfen und die ursprüngliche Karte wiederherstellen?")) return;
    setBusy(true);
    try {
      const data = await adminFetch<{ menu: MenuData; customized: boolean }>("/api/admin/menu", { method: "DELETE" });
      setSaved(data.menu);
      setDraft(data.menu);
      setCustomized(false);
      setMessage({ ok: true, text: "Die ursprüngliche Speisekarte ist wiederhergestellt." });
    } catch (error) {
      setMessage({ ok: false, text: onError(error) });
    } finally {
      setBusy(false);
    }
  }

  const total = draft.produkte.length;
  const hidden = draft.produkte.filter((product) => product.hidden).length;

  return (
    <>
      <PageHead title="Speisekarte" text={`${total} Produkte${hidden ? ` · ${hidden} ausgeblendet` : ""}${customized ? "" : " · Originalkarte"}`}>
        {customized && <button type="button" className={styles.ghost} disabled={busy} onClick={resetMenu}>Originalkarte wiederherstellen</button>}
        <button type="button" className={styles.primary} onClick={() => { setEditError(""); setEditing(toDraft(null, activeCategory)); }} disabled={!activeCategory}><Icon name="plus" />Produkt hinzufügen</button>
      </PageHead>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {CUISINES.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={cuisine === item} className={cuisine === item ? styles.tabActive : ""} onClick={() => { setCuisine(item); setCategory(""); setSearch(""); }}>{item}</button>
          ))}
        </div>
        <input className={`${styles.input} ${styles.search}`} type="search" placeholder="Produkt suchen (Name oder Nummer) …" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {message && <p className={message.ok ? styles.notice : styles.error}>{message.text}</p>}

      <div className={styles.menuLayout}>
        <section className={styles.card}>
          <div className={styles.cardHead}><h2>Kategorien</h2></div>
          <ul className={styles.catList}>
            {categories.map((name, index) => (
              <li key={name} className={!search && name === activeCategory ? styles.catActive : ""}>
                {renaming?.from === name ? (
                  <input className={styles.input} autoFocus value={renaming.to} onChange={(event) => setRenaming({ ...renaming, to: event.target.value })} onBlur={renameCategory} onKeyDown={(event) => { if (event.key === "Enter") renameCategory(); if (event.key === "Escape") setRenaming(null); }} />
                ) : (
                  <>
                    <button type="button" className={styles.catButton} onClick={() => { setCategory(name); setSearch(""); }}>
                      <span>{name}</span><span className={styles.count}>{countIn(name)}</span>
                    </button>
                    <span className={styles.catTools}>
                      <button type="button" title="Nach oben" aria-label="Nach oben" disabled={index === 0} onClick={() => moveCategory(name, -1)}><Icon name="up" className="" /></button>
                      <button type="button" title="Nach unten" aria-label="Nach unten" disabled={index === categories.length - 1} onClick={() => moveCategory(name, 1)}><Icon name="down" className="" /></button>
                      <button type="button" title="Umbenennen" aria-label="Umbenennen" onClick={() => setRenaming({ from: name, to: name })}><Icon name="edit" className="" /></button>
                      <button type="button" title="Löschen" aria-label="Löschen" onClick={() => deleteCategory(name)}><Icon name="trash" className="" /></button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className={styles.inlineForm}>
            <input className={styles.input} placeholder="Neue Kategorie" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addCategory(); }} />
            <button type="button" className={styles.iconButton} aria-label="Kategorie hinzufügen" title="Kategorie hinzufügen" disabled={!newCategory.trim()} onClick={addCategory}><Icon name="plus" /></button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2>{search ? `Suchergebnisse für „${search}“` : activeCategory || "Keine Kategorie"}</h2>
              <p>{visibleProducts.length} {visibleProducts.length === 1 ? "Produkt" : "Produkte"}</p>
            </div>
          </div>
          {visibleProducts.length === 0 ? <p className={styles.empty}>{search ? "Nichts gefunden." : "Noch keine Produkte in dieser Kategorie."}</p> : (
            <ul className={styles.productList}>
              {visibleProducts.map((product, index) => (
                <li key={product.id} className={`${styles.productRow} ${product.hidden ? styles.productHidden : ""}`}>
                  <span className={styles.productNo}>{product.number ? `#${product.number}` : ""}</span>
                  <div className={styles.productInfo}>
                    <strong>{product.name}{product.hidden && <span className={styles.badge} style={{ marginLeft: 8 }}>ausgeblendet</span>}</strong>
                    <small>{search ? `${product.cuisine} · ${product.category} · ` : ""}{product.description || "Keine Beschreibung"}{product.options?.length ? ` · ${product.options.length} Extra-Gruppe${product.options.length === 1 ? "" : "n"}` : ""}</small>
                  </div>
                  <span className={styles.productPrice}>{productPriceLabel(product)}</span>
                  <span className={styles.productTools}>
                    {!search && <>
                      <button type="button" className={styles.iconButton} title="Nach oben" aria-label="Nach oben" disabled={index === 0} onClick={() => moveProduct(product, -1)}><Icon name="up" /></button>
                      <button type="button" className={styles.iconButton} title="Nach unten" aria-label="Nach unten" disabled={index === visibleProducts.length - 1} onClick={() => moveProduct(product, 1)}><Icon name="down" /></button>
                    </>}
                    <button type="button" className={styles.iconButton} title={product.hidden ? "Wieder anzeigen" : "Ausblenden (z. B. ausverkauft)"} aria-label={product.hidden ? "Wieder anzeigen" : "Ausblenden"} onClick={() => patchProduct(product.id, { hidden: !product.hidden })}><Icon name={product.hidden ? "eyeOff" : "eye"} /></button>
                    <button type="button" className={styles.iconButton} title="Bearbeiten" aria-label="Bearbeiten" onClick={() => { setEditError(""); setEditing(toDraft(product, product.category)); }}><Icon name="edit" /></button>
                    <button type="button" className={styles.iconButton} title="Löschen" aria-label="Löschen" onClick={() => removeProduct(product)}><Icon name="trash" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(dirty || busy) && (
        <div className={styles.saveBar}>
          <span>Ungespeicherte Änderungen an der Speisekarte</span>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} disabled={busy} onClick={() => setDraft(saved)}>Verwerfen</button>
            <button type="button" className={styles.primary} disabled={busy} onClick={saveMenu}>{busy ? "Wird gespeichert …" : "Speichern & veröffentlichen"}</button>
          </div>
        </div>
      )}

      {editing && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="product-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <div className={styles.dialog}>
            <h2 id="product-title">{editing.id === null ? "Neues Produkt" : "Produkt bearbeiten"}</h2>
            <p>{cuisine} · {editing.category}</p>
            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.full}`}>Name<input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="z. B. Pizza Diavolo" /></label>
              <label className={styles.field}>Nummer auf der Karte<input inputMode="numeric" value={editing.number} onChange={(event) => setEditing({ ...editing, number: event.target.value.replace(/\D/g, "") })} placeholder="optional" /></label>
              <label className={styles.field}>Kategorie
                <select value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>
                  {(draft.kategorienMap[draft.produkte.find((item) => item.id === editing.id)?.cuisine ?? cuisine] || []).map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
              <label className={`${styles.field} ${styles.full}`}>Beschreibung<textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} placeholder="Zutaten, Hinweise …" /></label>
            </div>

            <p className={styles.subhead}>Preis</p>
            <div className={styles.tabs} style={{ marginBottom: 12 }}>
              <button type="button" className={editing.priceMode === "single" ? styles.tabActive : ""} onClick={() => setEditing({ ...editing, priceMode: "single" })}>Ein Preis</button>
              <button type="button" className={editing.priceMode === "variants" ? styles.tabActive : ""} onClick={() => setEditing({ ...editing, priceMode: "variants" })}>Mehrere Größen</button>
            </div>
            {editing.priceMode === "single" ? (
              <label className={styles.field}>Preis in €<input inputMode="decimal" value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })} placeholder="9,50" style={{ maxWidth: 180 }} /></label>
            ) : (
              <>
                {editing.variants.map((variant, index) => (
                  <div className={styles.variantRow} key={index}>
                    <input className={styles.input} value={variant.name} placeholder="Größe, z. B. 30 cm" onChange={(event) => setEditing({ ...editing, variants: editing.variants.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)) })} />
                    <input className={styles.input} inputMode="decimal" value={variant.price} placeholder="Preis" onChange={(event) => setEditing({ ...editing, variants: editing.variants.map((item, i) => (i === index ? { ...item, price: event.target.value } : item)) })} />
                    <button type="button" className={styles.iconButton} aria-label="Größe entfernen" disabled={editing.variants.length === 1} onClick={() => setEditing({ ...editing, variants: editing.variants.filter((_, i) => i !== index) })}><Icon name="trash" /></button>
                  </div>
                ))}
                <button type="button" className={styles.secondary} onClick={() => setEditing({ ...editing, variants: [...editing.variants, { name: "", price: "" }] })}><Icon name="plus" />Größe hinzufügen</button>
                <p className={styles.hint}>Extras mit Preis je Größe (z. B. bei Pizza) beziehen sich auf den Namen der Größe. Beim Umbenennen einer Größe bitte die Extras unten mit anpassen.</p>
              </>
            )}

            <div className={styles.toggleLine} style={{ marginTop: 16 }}>
              <span>Auf Website und App anzeigen<small>Aus = ausgeblendet, z. B. wenn etwas ausverkauft ist</small></span>
              <Switch on={!editing.hidden} onChange={(on) => setEditing({ ...editing, hidden: !on })} label="Anzeigen" />
            </div>

            <details className={styles.details} open={false}>
              <summary>Extras & Auswahl-Optionen (für Fortgeschrittene)</summary>
              <textarea className={styles.code} spellCheck={false} value={editing.optionsJson} placeholder={`[\n  {\n    "group": "Extras",\n    "multiple": true,\n    "items": [{ "name": "Extra Käse", "price": 1.5 }]\n  }\n]`} onChange={(event) => setEditing({ ...editing, optionsJson: event.target.value })} />
              <p className={styles.hint}>„required“: Pflichtauswahl, „multiple“: mehrere wählbar. Preis pro Extra mit „price“ oder je Größe mit „priceByVariant“.</p>
            </details>

            {editError && <p className={styles.error}>{editError}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondary} onClick={() => setEditing(null)}>Abbrechen</button>
              <button type="button" className={styles.primary} onClick={saveProduct}>{editing.id === null ? "Hinzufügen" : "Übernehmen"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
