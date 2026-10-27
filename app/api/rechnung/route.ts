import { NextRequest, NextResponse } from "next/server";
import { buildInvoiceData } from "../../lib/belege/invoice-data";
import { loadOrderForBeleg } from "../../lib/belege/load-order";
import { createInvoicePdf } from "../../lib/belege/pdf";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const order = await loadOrderForBeleg(params.get("id"), params.get("t"));
    if (!order) {
      return NextResponse.json({ error: "Rechnung nicht gefunden oder Link ungültig." }, { status: 404 });
    }

    const data = buildInvoiceData(order);
    const pdf = await createInvoicePdf(data);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Rechnung-${data.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("❌ Rechnung konnte nicht erstellt werden:", error);
    return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
  }
}
