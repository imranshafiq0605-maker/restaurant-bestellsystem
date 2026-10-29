import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import type { Viewport } from "next";
import { Playfair_Display } from "next/font/google";

// Schrift für den Schriftzug „LA ROSA“ in der Kopfleiste der Website.
const brandFont = Playfair_Display({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-brand",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata = {
  title: "La Rosa GmbH | Italienisch & Indisch online bestellen",
  description:
    "Pizza, Pasta & indische Spezialitäten in Mörfelden-Walldorf online bestellen. La Rosa GmbH – Lieferung & Abholung mit 10% Rabatt und kostenlosem Versand",
  icons: {
    icon: "/images/logo.jpg",
    apple: "/images/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={brandFont.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
