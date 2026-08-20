import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "../../../lib/firebase-admin";
import { verifyFirebaseIdToken } from "../../../lib/firebase-rest-auth";

export async function POST(request: NextRequest) {
  try {
    const account = await verifyFirebaseIdToken(request.headers.get("authorization"));
    const token = await getAdminAuth().createCustomToken(account.localId);
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Native Firebase token could not be created:", error);
    return NextResponse.json(
      { error: "Die sichere iPhone-Anmeldung konnte nicht vorbereitet werden." },
      { status: 401 }
    );
  }
}
