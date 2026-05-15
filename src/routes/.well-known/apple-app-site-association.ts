// Apple Universal Links association file — served at
// /.well-known/apple-app-site-association. iOS fetches this to decide
// whether tapping an https link to app.aloya.cy/group/* or /plan/*
// should open the Aloya app instead of Safari.
//
// TEAM_ID_PLACEHOLDER must be swapped for the actual Apple Team ID from
// developer.apple.com > Membership before the mobile app ships to
// TestFlight/App Store. Bundle id matches mobile/app.json.

import { createFileRoute } from "@tanstack/react-router";

const APPLE_TEAM_ID = "TEAM_ID_PLACEHOLDER";
const BUNDLE_ID = "cy.aloya.app";

const body = {
  applinks: {
    apps: [],
    details: [
      {
        appID: `${APPLE_TEAM_ID}.${BUNDLE_ID}`,
        paths: ["/group/*", "/plan/*", "/eta/*"],
      },
    ],
  },
};

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
};

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      GET: async () => new Response(JSON.stringify(body), { status: 200, headers: HEADERS }),
    },
  },
});
