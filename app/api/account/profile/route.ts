import admin from "firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminAuth, getAdminDb } from "../../../lib/firebase-admin";
import { stripeMetadataQuery, verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

const profileFields = ["name", "phone", "street", "houseNumber", "postalCode", "city"] as const;
type ProfileField = (typeof profileFields)[number];
type ProfileInput = Record<ProfileField, string>;

const fieldLimits: Record<ProfileField, number> = {
  name: 120,
  phone: 40,
  street: 160,
  houseNumber: 20,
  postalCode: 12,
  city: 100,
};

function cleanProfile(body: unknown): ProfileInput {
  if (!body || typeof body !== "object") throw new Error("INVALID_PROFILE");
  const source = body as Record<string, unknown>;
  const profile = {} as ProfileInput;
  for (const field of profileFields) {
    const value = typeof source[field] === "string" ? source[field].trim() : "";
    if (value.length > fieldLimits[field]) throw new Error("INVALID_PROFILE");
    profile[field] = value;
  }
  if (!profile.name) throw new Error("NAME_REQUIRED");
  if (profile.postalCode && !/^[0-9A-Za-z -]{3,12}$/.test(profile.postalCode)) {
    throw new Error("INVALID_POSTAL_CODE");
  }
  return profile;
}

function profileResponse(data: FirebaseFirestore.DocumentData | undefined) {
  return {
    name: typeof data?.name === "string" ? data.name : "",
    phone: typeof data?.phone === "string" ? data.phone : "",
    street: typeof data?.street === "string" ? data.street : "",
    houseNumber: typeof data?.houseNumber === "string" ? data.houseNumber : "",
    postalCode: typeof data?.postalCode === "string" ? data.postalCode : "",
    city: typeof data?.city === "string" ? data.city : "",
    roses: Math.max(0, Number(data?.roses) || 0),
  };
}

async function deleteWhere(collectionName: string, field: string, value: string) {
  const db = getAdminDb();
  while (true) {
    const snapshot = await db.collection(collectionName).where(field, "==", value).limit(400).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

export async function GET(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const customer = await getAdminDb().collection("kunden").doc(account.localId).get();
    return NextResponse.json({ profile: profileResponse(customer.data()) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Account profile could not be loaded:", error);
    return NextResponse.json({ error: "Profildaten konnten nicht geladen werden." }, { status: isAuthError ? 401 : 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const profile = cleanProfile(await request.json());
    const customerRef = getAdminDb().collection("kunden").doc(account.localId);
    await customerRef.set({
      ...profile,
      email: account.email || "",
      emailVerified: Boolean(account.emailVerified),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    const customer = await customerRef.get();
    return NextResponse.json({ profile: profileResponse(customer.data()) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["INVALID_PROFILE", "NAME_REQUIRED", "INVALID_POSTAL_CODE"].includes(code)) {
      const message = code === "NAME_REQUIRED"
        ? "Bitte gib deinen Namen ein."
        : code === "INVALID_POSTAL_CODE"
          ? "Bitte gib eine gültige Postleitzahl ein."
          : "Die eingegebenen Profildaten sind ungültig.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Account profile could not be saved:", error);
    return NextResponse.json({ error: "Profildaten konnten nicht gespeichert werden." }, { status: isAuthError ? 401 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const uid = account.localId;
    const db = getAdminDb();

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      const stripe = new Stripe(stripeKey);
      const customers = await stripe.customers.search({ query: stripeMetadataQuery(uid), limit: 100 });
      await Promise.all(customers.data.map((customer) => stripe.customers.del(customer.id)));
    }

    await deleteWhere("bestellungen", "firebaseUid", uid);
    if (account.email) await deleteWhere("bestellungen", "kunde.email", account.email);
    await deleteWhere("pendingOrders", "firebaseUid", uid);
    await deleteWhere("rosenBuchungen", "uid", uid);
    await deleteWhere("rosenEinloesungen", "uid", uid);
    await deleteWhere("rosenReservierungen", "uid", uid);
    await db.collection("kunden").doc(uid).delete();
    await getAdminAuth().deleteUser(uid);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const isAuthError = code === "AUTH_REQUIRED" || code === "AUTH_INVALID";
    if (!isAuthError) console.error("Account could not be deleted:", error);
    const status = isAuthError ? 401 : 500;
    return NextResponse.json({ error: "Account konnte nicht vollständig gelöscht werden. Bitte versuche es erneut." }, { status });
  }
}
