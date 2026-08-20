import type { CapacitorConfig } from "@capacitor/cli";

const serverOrigin =
  process.env.CAPACITOR_SERVER_URL ??
  "https://restaurant-bestellsystem.vercel.app";
const serverUrl = `${serverOrigin.replace(/\/$/, "")}/mobile`;

const config: CapacitorConfig = {
  appId: "com.larosa.bestellsystem",
  appName: "La Rosa",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "restaurant-bestellsystem.vercel.app",
      "localhost",
      "127.0.0.1",
      "192.168.178.105",
    ],
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["apple.com", "google.com"],
    },
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/authentication": { symlink: true },
        },
      },
    },
  },
};

export default config;
