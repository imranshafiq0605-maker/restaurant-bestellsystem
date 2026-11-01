import assert from "node:assert/strict";
import test from "node:test";
import { readConsent, CONSENT_MAX_AGE, measurementLocation, parseAdsConfig, verifiedPurchase } from "../../app/lib/ads-measurement.ts";
import { readAttribution, signAttribution, ATTRIBUTION_DAYS } from "../../app/lib/ads-attribution.ts";
import { berlinDay, reportRange } from "../../app/lib/ads-report.ts";

const session = { id: `cs_live_${"a".repeat(24)}`, livemode: true, mode: "payment", status: "complete", payment_status: "paid", amount_total: 1930, currency: "eur", metadata: { pendingOrderId: "order_123" } };
const order = { bezahlt: true, stripeSessionId: session.id, status: "neu" };

test("only a real, paid Stripe session matching the completed order is measured", () => {
  assert.deepEqual(verifiedPurchase(session, order), { transaction_id: "order_123", value: 19.3, currency: "EUR" });
  for (const change of [{ payment_status: "unpaid" }, { status: "open" }, { livemode: false }, { currency: "usd" }, { amount_total: 0 }, { amount_total: NaN }, { amount_total: 10.5 }, { metadata: null }, { metadata: { pendingOrderId: "../order" } }]) {
    assert.equal(verifiedPurchase({ ...session, ...change }, order), null);
  }
  for (const invalid of [null, { ...order, bezahlt: false }, { ...order, stripeSessionId: "different" }, { ...order, status: "storniert" }]) {
    assert.equal(verifiedPurchase(session, invalid), null);
  }
});
test("unknown, malformed and expired choices never grant consent", () => {
  for (const raw of [null, "broken", "true", '{"allowed":true}', JSON.stringify({ allowed: true, savedAt: 1 })]) assert.equal(readConsent(raw, CONSENT_MAX_AGE + 2), null);
  assert.equal(readConsent(JSON.stringify({ allowed: false, savedAt: 10 }), 20), false);
  assert.equal(readConsent(JSON.stringify({ allowed: true, savedAt: 10 }), 20), true);
  assert.equal(readConsent(JSON.stringify({ allowed: true, savedAt: 30 }), 20), null);
});
test("Google only receives allowlisted attribution parameters", () => {
  assert.equal(measurementLocation("https://example.com/order-status?session_id=secret&email=customer%40example.com&pendingOrderId=123&gclid=abc-123#token"), "https://example.com/order-status?gclid=abc-123");
  assert.equal(parseAdsConfig("AW-123", "label", "https://example.com")?.id, "AW-123");
  assert.equal(parseAdsConfig("AW-123", "label", "https://example.com/"), null);
  assert.equal(parseAdsConfig("AW-123", "label", "http://example.com"), null);
  assert.equal(parseAdsConfig("123", "label", "https://example.com"), null);
});
test("attribution cannot be forged and expires after 30 days; historical reports validate at purchase time", () => {
  process.env.ADS_ATTRIBUTION_SECRET = "local-test-secret-not-used-in-production";
  const data = { source: "google_ads", visitorId: "v".repeat(24), visitId: "s".repeat(24), clickedAt: 100, clickHash: "hash" };
  const token = signAttribution(data);
  assert.deepEqual(readAttribution(token, 101), data);
  assert.equal(readAttribution(`${token}x`, 101), null);
  assert.equal(readAttribution(token, 99), null);
  assert.equal(readAttribution(token, 100 + ATTRIBUTION_DAYS * 86400000), null);
  assert.deepEqual(readAttribution(token, 100 + 86400000), data);
});
test("Berlin calendar periods include DST changes, month boundaries and Monday weeks", () => {
  const spring = reportRange("day", "2026-03-29");
  assert.equal((spring.end - spring.start) / 3600000, 23);
  const autumn = reportRange("day", "2026-10-25");
  assert.equal((autumn.end - autumn.start) / 3600000, 25);
  const week = reportRange("week", "2026-11-01");
  assert.equal(week.days[0], "2026-10-26");
  assert.equal(week.days.at(-1), "2026-11-01");
  assert.equal(reportRange("month", "2028-02-15").days.length, 29);
  assert.equal(reportRange("month", "2026-02-30"), null);
  assert.equal(berlinDay(new Date("2026-11-01T23:30:00Z")), "2026-11-02");
});
