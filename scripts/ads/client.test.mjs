import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

test("browser measurement: no script without consent, no event after withdrawal, retries and deduplication", async () => {
  const dir = mkdtempSync(join(tmpdir(), "larosa-ads-test-"));
  const originals = new Map(["window", "document", "location", "localStorage"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const name of ["ads-measurement", "google-ads-client"]) {
      writeFileSync(join(dir, `${name}.js`), ts.transpileModule(readFileSync(new URL(`../../app/lib/${name}.ts`, import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText);
    }
    const storage = new Map();
    const scripts = [];
    const location = { origin: "https://example.com", href: "https://example.com/order-status?session_id=secret", hostname: "example.com", reload() {} };
    globalThis.window = { location };
    globalThis.location = location;
    globalThis.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    globalThis.document = { cookie: "", head: { appendChild: (script) => scripts.push(script) }, createElement: () => ({ remove() {} }) };
    const client = createRequire(import.meta.url)(join(dir, "google-ads-client.js"));
    const config = { id: "AW-123", label: "test-label", origin: location.origin };
    assert.equal(await client.loadGoogleAds(config), false);
    assert.equal(scripts.length, 0);
    storage.set("larosa_ads_consent_v1", JSON.stringify({ allowed: true, savedAt: Date.now() }));
    const blocked = client.loadGoogleAds(config);
    scripts[0].onerror();
    assert.equal(await blocked, false);
    const loaded = client.loadGoogleAds(config);
    scripts[1].onload();
    assert.equal(await loaded, true);
    assert.equal(scripts[1].referrerPolicy, "no-referrer");
    const purchase = { transaction_id: "order_1", value: 19.3, currency: "EUR" };
    client.sendPurchase(config, purchase);
    client.sendPurchase(config, purchase);
    const events = window.dataLayer.filter((args) => args[0] === "event");
    assert.equal(events.length, 1);
    assert.equal(events[0][2].page_location, "https://example.com/order-status");
    assert.equal(events[0][2].send_to, "AW-123/test-label");
    events[0][2].event_callback();
    assert.ok([...storage.keys()].some((key) => key.endsWith(":order_1")));
    storage.set("larosa_ads_consent_v1", JSON.stringify({ allowed: false, savedAt: Date.now() }));
    client.sendPurchase(config, { ...purchase, transaction_id: "order_2" });
    assert.equal(window.dataLayer.filter((args) => args[0] === "event").length, 1);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
