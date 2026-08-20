const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyBiJcAuiG7x-kOOrFhLqepLSWw0NSee-BM";

type FirebaseAccount = {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
};

export async function verifyFirebaseIdToken(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) throw new Error("AUTH_REQUIRED");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    }
  );
  const data = await response.json();
  const account = data.users?.[0] as FirebaseAccount | undefined;

  if (!response.ok || !account?.localId) throw new Error("AUTH_INVALID");
  return account;
}

export function stripeMetadataQuery(uid: string) {
  const escapedUid = uid.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `metadata["firebaseUid"]:"${escapedUid}"`;
}
