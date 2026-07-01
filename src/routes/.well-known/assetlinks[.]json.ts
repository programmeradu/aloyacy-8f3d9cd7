// Android App Links verification file — served at
// /.well-known/assetlinks.json. Android fetches this to verify that
// tapping an https link to app.aloya.cy/group/* or /plan/* belongs to
// the Aloya app and can open it directly (without the "open with"
// picker) when App Links auto-verification runs at install time.
//
// SHA256_FINGERPRINT_PLACEHOLDER must be swapped for the release
// signing-key SHA-256 fingerprint from Play Console > Setup > App
// signing before shipping.

import { createFileRoute } from "@tanstack/react-router";

const PACKAGE_NAME = "cy.aloya.app";
const SHA256 = "SHA256_FINGERPRINT_PLACEHOLDER";

const body = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PACKAGE_NAME,
      sha256_cert_fingerprints: [SHA256],
    },
  },
];

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
};

export const Route = createFileRoute("/.well-known/assetlinks[.]json")({
  server: {
    handlers: {
      GET: async () => new Response(JSON.stringify(body), { status: 200, headers: HEADERS }),
    },
  },
});
