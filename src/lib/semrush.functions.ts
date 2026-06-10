import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/semrush";

type Row = Record<string, string>;

function parseTable(json: any): Row[] {
  const cols: string[] = json?.data?.columnNames ?? [];
  const rows: any[][] = json?.data?.rows ?? [];
  return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, String(r[i] ?? "")])));
}

async function call(path: string, params: Record<string, string>) {
  const lk = process.env.LOVABLE_API_KEY;
  const sk = process.env.SEMRUSH_API_KEY;
  if (!lk || !sk) throw new Error("Semrush connector not configured");
  const url = `${GATEWAY}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lk}`,
      "X-Connection-Api-Key": sk,
      "Allow-Limit-Offset": "true",
    },
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Semrush ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok || json?.error) throw new Error(json?.error || `Semrush ${res.status}`);
  return json;
}

const DOMAINS = ["app.aloya.cy", "intercity-buses.com", "motionbuscard.org.cy"];
const MARKETS = ["cy", "uk", "de"];

export const getSeoPanel = createServerFn({ method: "GET" }).handler(async () => {
  // 1) Domain ranks (organic + paid) per market for each tracked domain.
  const matrix = await Promise.all(
    DOMAINS.flatMap((domain) =>
      MARKETS.map(async (db) => {
        try {
          const j = await call("/domains/domain_ranks", {
            domain,
            database: db,
            export_columns: "Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac",
          });
          const row = parseTable(j)[0] ?? {};
          return { domain, db, ok: true as const, row };
        } catch (e) {
          return { domain, db, ok: false as const, error: (e as Error).message };
        }
      }),
    ),
  );

  // 2) Top organic keywords for the incumbent (CY market).
  let incumbentOrganic: Row[] = [];
  try {
    const j = await call("/domains/domain_organic", {
      domain: "intercity-buses.com",
      database: "cy",
      display_limit: "15",
      export_columns: "Ph,Po,Pp,Nq,Cp,Tr,Ur",
    });
    incumbentOrganic = parseTable(j);
  } catch {}

  // 3) Paid keywords for the incumbent (CY).
  let incumbentPaid: Row[] = [];
  try {
    const j = await call("/domains/domain_adwords", {
      domain: "intercity-buses.com",
      database: "cy",
      display_limit: "10",
      export_columns: "Ph,Po,Pp,Nq,Cp,Tr,Ur",
    });
    incumbentPaid = parseTable(j);
  } catch {}

  // 4) Aloya's own ranking keywords (CY).
  let aloyaOrganic: Row[] = [];
  try {
    const j = await call("/domains/domain_organic", {
      domain: "app.aloya.cy",
      database: "cy",
      display_limit: "15",
      export_columns: "Ph,Po,Pp,Nq,Cp,Tr,Ur",
    });
    aloyaOrganic = parseTable(j);
  } catch {}

  // 5) Backlink profile per tracked domain (root domain).
  const backlinks = await Promise.all(
    DOMAINS.map(async (domain) => {
      try {
        const j = await call("/backlinks/backlinks_overview", {
          target: domain,
          target_type: "root_domain",
          export_columns: "ascore,total,domains_num,urls_num,ips_num,follows_num,nofollows_num",
        });
        const row = parseTable(j)[0] ?? {};
        return { domain, ok: true as const, row };
      } catch (e) {
        return { domain, ok: false as const, error: (e as Error).message };
      }
    }),
  );

  // 6) Top referring domains for the incumbent — where the useful links come from.
  let incumbentRefDomains: Row[] = [];
  try {
    const j = await call("/backlinks/backlinks_refdomains", {
      target: "intercity-buses.com",
      target_type: "root_domain",
      display_limit: "15",
      export_columns: "domain_ascore,domain,backlinks_num,ip",
    });
    incumbentRefDomains = parseTable(j);
  } catch {}

  // 7) Aloya's own referring domains (mostly SEO spam today; useful to track).
  let aloyaRefDomains: Row[] = [];
  try {
    const j = await call("/backlinks/backlinks_refdomains", {
      target: "app.aloya.cy",
      target_type: "root_domain",
      display_limit: "15",
      export_columns: "domain_ascore,domain,backlinks_num,ip",
    });
    aloyaRefDomains = parseTable(j);
  } catch {}

  return {
    fetchedAt: new Date().toISOString(),
    matrix,
    incumbentOrganic,
    incumbentPaid,
    aloyaOrganic,
    backlinks,
    incumbentRefDomains,
    aloyaRefDomains,
  };
});
