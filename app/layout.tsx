import "./globals.css";

export const metadata = {
  title: "La Rosa GmbH",
  description: "Italienische und indische Spezialitäten",
  icons: {
    icon: "/favicon.png",
  },
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
