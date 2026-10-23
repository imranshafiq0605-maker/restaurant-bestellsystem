const [major, minor, patch] = process.versions.node.split(".").map(Number);
const supported = major === 24 && (minor > 22 || (minor === 22 && patch >= 1));

if (!supported) {
  console.error(`Node.js ${process.versions.node} is unsupported. Install Node.js 24.22.1 or a newer 24.x security release.`);
  process.exit(1);
}

console.log(`Node.js ${process.versions.node}: security version requirement satisfied.`);
