import { NextRequest, NextResponse } from "next/server";
import { buildInvoiceData } from "../../lib/belege/invoice-data";
import { loadOrderForBeleg } from "../../lib/belege/load-order";
import { createBewirtungsbelegPdf } from "../../lib/belege/pdf";

function field(form: FormData, name: string, maxLength: number) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseEuro(value: string) {
  const amount = Number(value.replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? Math.min(Math.round(amount * 100) / 100, 1000) : 0;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const order = await loadOrderForBeleg(form.get("id"), form.get("t"));
    if (!order) {
      return NextResponse.json({ error: "Bestellung nicht gefunden oder Link ungültig." }, { status: 404 });
    }

    const data = buildInvoiceData(order);
    const pdf = await createBewirtungsbelegPdf(data, {
      ort: field(form, "ort", 200),
      bewirtender: field(form, "bewirtender", 200),
      personen: field(form, "personen", 1000),
      anlass: field(form, "anlass", 500),
      trinkgeld: parseEuro(field(form, "trinkgeld", 20)),
    });

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Bewirtungsbeleg-${data.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("❌ Bewirtungsbeleg konnte nicht erstellt werden:", error);
    return NextResponse.json({ error: "Bewirtungsbeleg konnte nicht erstellt werden." }, { status: 500 });
  }
}
