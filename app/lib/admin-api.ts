import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "./admin-auth";

/** Admin-Route: ohne gültige Sitzung 401, Fehler mit deutscher Meldung als 400, sonst 500. */
export function adminRoute(handler: (request: NextRequest, adminEmail: string) => Promise<NextResponse>) {
  return async (request: NextRequest) => {
    try {
      const adminEmail = requireAdmin(request);
      return await handler(request, adminEmail);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_REQUIRED") {
        return NextResponse.json({ error: "Bitte melde dich erneut an." }, { status: 401 });
      }
      if (error instanceof AdminInputError) return NextResponse.json({ error: error.message }, { status: 400 });
      console.error("Admin-Anfrage fehlgeschlagen:", error);
      return NextResponse.json({ error: "Das hat gerade nicht geklappt. Bitte versuche es erneut." }, { status: 500 });
    }
  };
}

export class AdminInputError extends Error {}
