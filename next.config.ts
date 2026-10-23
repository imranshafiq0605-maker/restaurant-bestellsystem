const nextConfig = {
  output: process.env.LAROSA_CONTAINER === "1" ? "standalone" : undefined,
  allowedDevOrigins: ["127.0.0.1", "192.168.178.105", "localhost"],
  devIndicators: false,
  async headers() {
    return [{
      source: "/.well-known/apple-app-site-association",
      headers: [{ key: "Content-Type", value: "application/json" }],
    }];
  },
};

export default nextConfig;
