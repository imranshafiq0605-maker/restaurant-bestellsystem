import "./globals.css";

export const metadata = {
  title: "Restaurant Bestellsystem",
  description: "Eigenes Online-Bestellsystem für Restaurant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
