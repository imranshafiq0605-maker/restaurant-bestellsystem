import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

export const metadata = {
  title: "La Rosa GmbH",
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