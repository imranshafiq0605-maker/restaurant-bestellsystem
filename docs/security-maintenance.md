# Website security maintenance

The website runs on Vercel's container runtime to pin both build and serving processes to a patched Node.js release. The current minimum is Node.js 24.22.1. Vercel's managed Node.js Functions had still reported 24.21.0 when this deployment was prepared.

## Node.js and dependency updates

1. Update both Node.js base images in `Dockerfile.vercel` when a new security release is needed. Update `.node-version`, `engines.node` and `scripts/check-node-version.mjs` together.
2. Run `npm ci`, `npm audit`, `npm run test:security` and `npm run build`.
3. Deploy a preview and verify the actual `[runtime] Node.js ...` log, page routes, media, authenticated routes, checkout session creation and webhook signature verification before production.

`tools/next-eslint-glob` replaces only the Next.js ESLint plugin's vulnerable fast-glob dependency. It preserves the directory matching used by that plugin while removing braces/micromatch. The regression tests verify that Next.js lint rules remain active. Review this override when upgrading the Next.js ESLint plugin.

## Secrets

Secret values belong in Vercel's environment settings. `.dockerignore` excludes `.env*` and `.vercel` from container builds. The image does not need payment or database credentials during its build; Vercel provides those at runtime.

Rotate Stripe keys with a short overlap: install the replacement in every environment that used the old key, redeploy, verify checkout and webhook handling, and only then expire the old key. Rotate the webhook signing secret separately, coordinating its overlap and deployment as well. Never commit secrets or paste them into support conversations.

A clean dependency audit is not a guarantee against all vulnerabilities. Check runtime updates and secret usage independently. The native app is outside this website maintenance workflow.
