// App links for the micro-mobility operators shown on Go.
//
// Bolt: bolt.onelink.me/UdR6/* is Bolt's AppsFlyer OneLink domain. Its
// apple-app-site-association lists 92U855363F.ee.mtakso.client (the Bolt
// rider app) for /UdR6/*, and its assetlinks.json lists ee.mtakso.client,
// so a tap opens the Bolt app when installed. When it is not, AppsFlyer
// redirects to the store (af_ios_url / af_android_url) or, on desktop, to
// the Cyprus web page (af_web_dp). bolt.eu itself has no app links, which
// is why the old https://bolt.eu/o/... link only opened the website.
// Bolt publishes no pickup/destination parameters, so the app opens on its
// home screen and the rider sets the destination there.
//
// Nextbike: the GBFS rental_uris nextbike publishes for every station are
// https://app.nextbike.net/station?id=<place uid>. app.nextbike.net serves
// app links for the nextbike app (net.nextbike.official2012), and without
// the app it redirects to the station's web page.

const BOLT_IOS_STORE = "https://apps.apple.com/cy/app/bolt-request-a-ride/id675033630";
const BOLT_ANDROID_STORE = "https://play.google.com/store/apps/details?id=ee.mtakso.client";

export function boltAppLink(kind: "ride" | "scooter"): string {
  const params = new URLSearchParams({
    pid: "aloya",
    c: kind === "scooter" ? "aloya_scooter" : "aloya_last_mile",
    af_ios_url: BOLT_IOS_STORE,
    af_android_url: BOLT_ANDROID_STORE,
    af_web_dp:
      kind === "scooter" ? "https://bolt.eu/en-cy/scooters/" : "https://bolt.eu/en-cy/rides/",
  });
  return `https://bolt.onelink.me/UdR6/aloya?${params.toString()}`;
}

export function nextbikeStationLink(placeUid: number | null | undefined, fallback: string): string {
  if (placeUid == null || !Number.isFinite(placeUid) || placeUid <= 0) return fallback;
  return `https://app.nextbike.net/station?id=${Math.round(placeUid)}`;
}
