import { getAdminDb } from "../firebase-admin";
import { isValidBelegToken, type BelegOrder } from "./invoice-data";

/** Lädt eine bezahlte Bestellung, wenn der Beleg-Link aus der Bestellmail gültig ist. */
export async function loadOrderForBeleg(id: unknown, token: unknown) {
  if (typeof id !== "string" || typeof token !== "string") return null;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id) || token.length > 64) return null;

  const snap = await getAdminDb().collection("bestellungen").doc(id).get();
  const order = snap.data() as BelegOrder & { bezahlt?: boolean } | undefined;
  if (!order?.bezahlt || !isValidBelegToken(order, token)) return null;
  return order;
}
