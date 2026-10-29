import { NextResponse } from "next/server";
import { adminRoute } from "../../../lib/admin-api";
import { buildCustomerDirectory } from "../../../lib/customers-server";

// Alle Kunden mit Kundennummer, Rosen, Bestellungen und Newsletter-Status. Vergibt fehlende Kundennummern rückwirkend.
export const GET = adminRoute(async () => {
  const customers = await buildCustomerDirectory();
  const accounts = customers.filter((customer) => customer.type === "konto");
  const stats = {
    registered: accounts.length,
    guests: customers.length - accounts.length,
    withRoses: accounts.filter((customer) => customer.roses > 0).length,
    totalRoses: accounts.reduce((sum, customer) => sum + customer.roses, 0),
    newsletter: accounts.filter((customer) => customer.newsletter).length,
    orders: customers.reduce((sum, customer) => sum + customer.orders, 0),
    revenue: Math.round(customers.reduce((sum, customer) => sum + customer.revenue, 0) * 100) / 100,
    newLast30Days: accounts.filter((customer) => customer.createdAt && Date.now() - new Date(customer.createdAt).getTime() < 30 * 86400000).length,
  };
  return NextResponse.json({ customers, stats });
});
