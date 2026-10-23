export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info(`[runtime] Node.js ${process.versions.node}`);
  }
}
