import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

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
    <html lang="de">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}