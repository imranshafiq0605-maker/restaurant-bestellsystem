import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, readAdminSession } from "../../../lib/admin-auth";

export async function GET(request: NextRequest) {
  const email = readAdminSession(request);
  return NextResponse.json({ email }, { status: email ? 200 : 401 });
}

// Abmelden
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
