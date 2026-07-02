import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getSeoPanel } from "@/lib/semrush.functions";

export const Route = createFileRoute("/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO panel — Aloya admin" },
      { name: "description", content: "Live Semrush rankings, traffic and paid-search visibility for Aloya and competitors." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SeoPanel,
});

function num(s: string) {
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString() : s || "—";
}

function SeoPanel() {
  const fetchPanel = useServerFn(getSeoPanel);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["seo-panel"],
    queryFn: () => fetchPanel(),
    staleTime: 1000 * 60 * 60,
  });

  return (
    <div className="min-h-dvh bg-background px-4 py-8 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              ADMIN — SEO
            </p>
            <h1 className="mt-2 font-display text-3xl text-foreground md:text-4xl">
              Live search visibility
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Semrush data for Aloya, Intercity Buses, and Motion Bus Card across Cyprus, the UK and Germany. Rankings refresh hourly on cache; click Refresh to pull live.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {isLoading && <p className="mt-10 text-sm text-muted-foreground">Loading Semrush data…</p>}
        {error && (
          <p className="mt-10 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </p>
        )}

        {data && (
          <>
            <section className="mt-10">
              <h2 className="font-display text-xl text-foreground">Visibility matrix</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Updated {new Date(data.fetchedAt).toLocaleString("en-GB")}
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
                <table className="min-w-full font-mono text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Domain</th>
                      <th className="px-3 py-2">Market</th>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Organic kw</th>
                      <th className="px-3 py-2">Organic traffic</th>
                      <th className="px-3 py-2">Paid kw</th>
                      <th className="px-3 py-2">Paid traffic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matrix.map((m, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{m.domain}</td>
                        <td className="px-3 py-2 uppercase">{m.db}</td>
                        {m.ok ? (
                          <>
                            <td className="px-3 py-2">{num(m.row.Rk)}</td>
                            <td className="px-3 py-2">{num(m.row.Or)}</td>
                            <td className="px-3 py-2">{num(m.row.Ot)}</td>
                            <td className="px-3 py-2">{num(m.row.Ad)}</td>
                            <td className="px-3 py-2">{num(m.row.At)}</td>
                          </>
                        ) : (
                          <td className="px-3 py-2 text-muted-foreground" colSpan={5}>
                            {m.error}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <KeywordTable title="Intercity Buses — top organic keywords (CY)" rows={data.incumbentOrganic} />
            <KeywordTable title="Intercity Buses — paid-search keywords (CY)" rows={data.incumbentPaid} />
            <KeywordTable title="Aloya — current organic keywords (CY)" rows={data.aloyaOrganic} empty="Not yet ranking. Publish and wait for the index — first impressions usually arrive in 4–8 weeks." />

            <section className="mt-10">
              <h2 className="font-display text-xl text-foreground">Backlink profile</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Authority Score and referring-domain counts. Semrush crawl, not the whole web — use for direction.
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
                <table className="min-w-full font-mono text-xs">
                  <thead className="bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Domain</th>
                      <th className="px-3 py-2">Authority</th>
                      <th className="px-3 py-2">Backlinks</th>
                      <th className="px-3 py-2">Ref domains</th>
                      <th className="px-3 py-2">Ref URLs</th>
                      <th className="px-3 py-2">Follow</th>
                      <th className="px-3 py-2">Nofollow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.backlinks.map((b, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{b.domain}</td>
                        {b.ok ? (
                          <>
                            <td className="px-3 py-2">{num(b.row.ascore)}</td>
                            <td className="px-3 py-2">{num(b.row.total)}</td>
                            <td className="px-3 py-2">{num(b.row.domains_num)}</td>
                            <td className="px-3 py-2">{num(b.row.urls_num)}</td>
                            <td className="px-3 py-2">{num(b.row.follows_num)}</td>
                            <td className="px-3 py-2">{num(b.row.nofollows_num)}</td>
                          </>
                        ) : (
                          <td className="px-3 py-2 text-muted-foreground" colSpan={6}>
                            {b.error}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <RefDomainsTable title="Intercity Buses — top referring domains" rows={data.incumbentRefDomains} />
            <RefDomainsTable title="Aloya — top referring domains" rows={data.aloyaRefDomains} empty="No referring domains crawled yet." />
          </>
        )}

        <div className="mt-12">
          <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}

function KeywordTable({ title, rows, empty }: { title: string; rows: Record<string, string>[]; empty?: string }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty ?? "No data."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-full font-mono text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Keyword</th>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Prev</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">CPC</th>
                <th className="px-3 py-2">Traffic %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{r.Ph}</td>
                  <td className="px-3 py-2">{r.Po}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.Pp || "—"}</td>
                  <td className="px-3 py-2">{num(r.Nq)}</td>
                  <td className="px-3 py-2">{r.Cp}</td>
                  <td className="px-3 py-2">{r.Tr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
