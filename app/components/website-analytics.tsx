"use client";

import { Analytics } from "@vercel/analytics/react";

export default function WebsiteAnalytics() {
  return <Analytics beforeSend={(event) => {
    const url = new URL(event.url);
    // Checkout return URLs contain capability tokens. Never pass them to analytics.
    return { ...event, url: `${url.origin}${url.pathname}` };
  }} />;
}
