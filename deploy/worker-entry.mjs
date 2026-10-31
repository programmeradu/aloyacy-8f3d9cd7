// Aloya Worker entry (D1 build). Exports both handlers of the app server:
//   fetch      — the TanStack Start app (dist/server/server.js)
//   scheduled  — cron dispatcher (src/lib/cron-schedule.ts, bundled into
//                server.js). Maps the 5 triggers
//                  "* * * * *"     snapshot, trip-alerts (+ even minutes:
//                                  departure-tick, arrival-watch-tick, resolve-arrivals)
//                  "*/15 * * * *"  train?mode=fast, archive-lake
//                  "*/30 * * * *"  pulse-weather/marine/air/traffic/flights
//                  "17 * * * *"    pulse-news, email queue
//                  "0 3 * * *"     ingest-schedule, pulse-events/cruises/football/
//                                  met-warnings, train?mode=full, archive-lake,
//                                  eta-backtest, device-reputation, ping-gap-compute
//                and POSTs each hook to the fetch handler in-process as
//                https://app.aloya.cy/<path> with Authorization: Bearer ${CRON_SECRET},
//                via ctx.waitUntil + Promise.allSettled.
import server from "../dist/server/server.js";

// ---------------------------------------------------------------- share meta
// Link previews (WhatsApp, iMessage, Facebook, X, LinkedIn, Slack) read the
// page's og:* tags. Route heads only know the URL, so for shared things that
// live in D1 or the trip index this streams the SSR HTML through
// HTMLRewriter and fills in a specific title, description and card image:
//   /plan/:token   bus, destination, leave and arrive times (Cyprus time)
//   /group/:code   meeting place, host, people on the way
//   /trip/:id, /trip-info/:id   line, destination, departure
//   /eta/:token    destination, minutes away (never a position)
//   app pages      their own card (lines, pulse, pass, saved, planner, airports)
// The images are drawn per link by /api/public/og/* (src/lib/og-runtime.server.ts).

const TRIP_SHARDS = 64;
const tripShard = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TRIP_SHARDS;
};
const AIRPORT_STOP = { lca: "6117", pfo: "1813" };
const PAGE_CARD = { "/lines": "lines", "/pulse": "pulse", "/wallet": "pass", "/saved": "saved", "/trips": "planner", "/el": "default", "/green-line": "default", "/welcome": "default", "/": "default" };
// Share copy for the app's own pages (og and twitter alike; the tab title is left alone).
const PAGE_COPY = {
  "/lines": ["Every bus line in Cyprus | Aloya", "Nicosia, Limassol, Larnaca, Paphos, Famagusta and intercity lines, with live buses on each."],
  "/pulse": ["Cyprus today | Aloya", "How the island is moving today: weather, the buses right now, live sightings and a Greek word of the day."],
  "/wallet": ["Motion pass | Aloya", "Balance, top ups and a scan ready Motion card, always with you."],
  "/saved": ["Saved places | Aloya", "Home, work and the stops you use most, with live buses for each."],
  "/trips": ["Plan a trip | Aloya", "Door to door across Cyprus. Live buses, walking and changes in one calm view."],
  "/green-line": ["The Green Line | Aloya", "Aloya runs the Republic of Cyprus bus network. What we know about crossing at Ledra, and what we do not."],
  "/el": ["Aloya | Λεωφορεία Κύπρου, ζωντανά", "Ζωντανές αφίξεις, σχέδια διαδρομής και ομαδικά ταξίδια σε κάθε γραμμή λεωφορείου στην Κύπρο."],
};
const AIRPORT_COPY = {
  lca: ["Larnaca Airport by bus | Aloya", "Live coach and town bus departures from Larnaca Airport, with the lines to Nicosia, Limassol, Larnaca, Ayia Napa and Protaras."],
  pfo: ["Paphos Airport by bus | Aloya", "Live coach and town bus departures from Paphos Airport, with the lines to Paphos, Limassol and Nicosia."],
};
const isHere = (s) => /^(your|current|my) location$/i.test(String(s ?? "").trim());
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tidy = (s) => String(s ?? "").replace(/\s+-\s+/g, ", ").replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/\s+/g, " ").trim();
const cy = (unix, o) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Nicosia", ...o }).format(new Date(unix * 1000));
const hm = (u) => cy(u, { hour: "2-digit", minute: "2-digit", hour12: false });
const day = (u) => cy(u, { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

async function shareMeta(url, env) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const o = url.origin;
  let m;
  if ((m = p.match(/^\/plan\/([A-Za-z0-9]{8,64})$/)) && env.DB) {
    const r = await env.DB.prepare(
      "SELECT creator_name, origin_label, destination_label, departure_unix, arrival_unix, total_duration_sec, transfers, legs FROM trip_plan_shares WHERE token = ? LIMIT 1",
    ).bind(m[1]).first();
    if (!r) return null;
    let bus = "";
    try {
      const legs = JSON.parse(r.legs || "[]");
      bus = (legs.find((l) => l && l.routeShort) || {}).routeShort || "";
    } catch {}
    const dest = tidy(r.destination_label);
    const t = r.departure_unix ? `, leave ${hm(r.departure_unix)}` : "";
    const changes = r.transfers ? `${r.transfers} ${r.transfers === 1 ? "change" : "changes"}` : "direct";
    return {
      title: `${bus ? `Bus ${bus} to ${dest}` : `Trip to ${dest}`}${t} | Aloya`,
      desc: `${isHere(r.origin_label) ? "" : `From ${tidy(r.origin_label)} to ${dest}. `}${r.departure_unix ? `Leave ${hm(r.departure_unix)} ${day(r.departure_unix)}, ` : ""}${r.arrival_unix ? `arrive ${hm(r.arrival_unix)}, ` : ""}${r.total_duration_sec ? `${Math.round(r.total_duration_sec / 60)} min, ` : ""}${changes}.${r.creator_name ? ` Shared by ${tidy(r.creator_name)}.` : ""}`,
      image: `${o}/api/public/og/plan/${m[1]}`,
    };
  }
  if ((m = p.match(/^\/group\/([A-Za-z0-9]{3,16})$/)) && env.DB) {
    const code = m[1].toUpperCase();
    const r = await env.DB.prepare(
      "SELECT g.destination_label, g.created_by_name, (SELECT count(*) FROM trip_group_members x WHERE x.group_id = g.id AND x.status != 'left') AS members FROM trip_groups g WHERE g.code = ? LIMIT 1",
    ).bind(code).first();
    if (!r) return null;
    const n = Number(r.members) || 0;
    return {
      title: `Meet at ${tidy(r.destination_label)}, group trip ${code} | Aloya`,
      desc: `${r.created_by_name ? `Hosted by ${tidy(r.created_by_name)}. ` : ""}${n ? `${n} ${n === 1 ? "person" : "people"} on the way. ` : ""}Join and watch each other arrive live.`,
      image: `${o}/api/public/og/group/${code}?v=${Math.floor(Date.now() / 300000)}`,
    };
  }
  if ((m = p.match(/^\/(?:trip|trip-info)\/([A-Za-z0-9_-]{1,32})$/)) && env.ASSETS) {
    const res = await env.ASSETS.fetch(new Request(`https://assets.local/og/trips/${tripShard(m[1])}.json`));
    if (!res.ok) return null;
    const v = (await res.json())[m[1]];
    if (!Array.isArray(v)) return null;
    const [, dep, from, to, short] = v;
    if (!short || !to) return null;
    return {
      title: `Bus ${short} to ${tidy(to)}${dep ? `, leaves ${dep}` : ""} | Aloya`,
      desc: `${from ? `From ${tidy(from)} to ${tidy(to)}. ` : ""}Follow this bus live on Aloya: where it is, the stops still to go and when it gets in.`,
      image: `${o}/api/public/og/trip/${m[1]}`,
    };
  }
  if ((m = p.match(/^\/eta\/([A-Za-z0-9]{8,64})$/)) && env.DB) {
    const r = await env.DB.prepare(
      "SELECT origin_label, destination_label, eta_minutes, status FROM shared_trips WHERE token = ? LIMIT 1",
    ).bind(m[1]).first();
    if (!r) return null;
    const live = r.status === "active" && r.eta_minutes != null;
    return {
      title: `On the way to ${tidy(r.destination_label)} | Aloya`,
      desc: `${r.origin_label ? `From ${tidy(r.origin_label)}. ` : ""}${live ? `About ${r.eta_minutes} min away. ` : ""}Follow along live on Aloya.`,
      image: `${o}/api/public/og/default?p=trip`,
    };
  }
  if ((m = p.match(/^\/airport\/(lca|pfo)$/i))) {
    const c = m[1].toLowerCase();
    return { image: `${o}/api/public/og/stop/${AIRPORT_STOP[c]}?airport=${c}`, title: AIRPORT_COPY[c][0], desc: AIRPORT_COPY[c][1], keepTab: true };
  }
  if (/^\/(?:route|stop)\/[A-Za-z0-9_-]{1,32}$/.test(p)) return { dedash: true };
  if (PAGE_CARD[p]) {
    const copy = PAGE_COPY[p] || [];
    return { image: `${o}/api/public/og/default${PAGE_CARD[p] === "default" ? "" : `?p=${PAGE_CARD[p]}`}`, keepImage: p === "/" || p === "/welcome", title: copy[0], desc: copy[1], keepTab: true };
  }
  return null;
}

function rewrite(res, m) {
  const seen = new Set();
  const want = [];
  if (m.title) want.push(["property", "og:title", m.title], ["name", "twitter:title", m.title]);
  if (m.desc) want.push(["property", "og:description", m.desc], ["name", "twitter:description", m.desc], ["name", "description", m.desc]);
  if (m.image)
    want.push(
      ["property", "og:image", m.image],
      ["property", "og:image:secure_url", m.image],
      ["name", "twitter:image", m.image],
      ["property", "og:image:width", "1200"],
      ["property", "og:image:height", "630"],
      ["property", "og:image:type", "image/png"],
      ["name", "twitter:card", "summary_large_image"],
    );
  let rw = new HTMLRewriter();
  for (const [attr, key, val] of want) {
    rw = rw.on(`meta[${attr}="${key}"]`, {
      element(e) {
        seen.add(key);
        if (!(m.keepImage && /image/.test(key) && e.getAttribute("content"))) e.setAttribute("content", val);
      },
    });
  }
  if (m.title && !m.keepTab) rw = rw.on("title", { element(e) { e.setInnerContent(m.title); } });
  if (m.dedash)
    rw = rw.on('title, meta[name="description"], meta[property="og:description"], meta[name="twitter:description"], meta[property="og:title"], meta[name="twitter:title"]', {
      element(e) {
        const c = e.getAttribute("content");
        if (c) e.setAttribute("content", tidy(c));
      },
      text(t) {
        if (t.text && / - /.test(t.text)) t.replace(esc(tidy(t.text)), { html: true });
      },
    });
  rw = rw.on("head", {
    element(e) {
      e.onEndTag((end) => {
        const add = want.filter(([, k]) => !seen.has(k)).map(([a, k, v]) => `<meta ${a}="${k}" content="${esc(v)}">`);
        if (add.length) end.before(add.join(""), { html: true });
      });
    },
  });
  return rw.transform(res);
}

async function withShareMeta(req, env, ctx) {
  const res = await server.fetch(req, env, ctx);
  try {
    if (req.method !== "GET" || res.status !== 200) return res;
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    const m = await shareMeta(new URL(req.url), env);
    return m ? rewrite(res, m) : res;
  } catch (e) {
    console.warn("share meta skipped", String(e && e.message ? e.message : e));
    return res;
  }
}

export default {
  fetch: (req, env, ctx) => withShareMeta(req, env, ctx),
  scheduled: (event, env, ctx) => {
    if (typeof server.scheduled !== "function") {
      throw new Error("dist/server/server.js has no scheduled(); rebuild from feat/cloudflare-d1");
    }
    return server.scheduled(event, env, ctx);
  },
};
