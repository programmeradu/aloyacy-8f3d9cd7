// Internal QA dashboard. Password-gated client-side (shared secret).
// Aggregates training_events into phase-transition errors, missed-bus
// false positives, and boarding prompt coverage by hour-of-day and route.

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { getQaStats, type QaStats } from "@/lib/qa.functions";

export const Route = createFileRoute("/qa")({
  component: QaPage,
  head: () => ({
    meta: [
      { title: "Aloya QA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const STORAGE_KEY = "aloya-qa-unlocked";
const PASSWORD = "opensesame";

function QaPage() {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  return <Dashboard />;
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value === PASSWORD) {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      onUnlock();
    } else {
      setError(true);
    }
  };
  return (
    <main className="min-h-dvh bg-limestone grid place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
          Restricted
        </p>
        <h1 className="mt-3 font-display text-4xl text-ink leading-none">
          QA console
        </h1>
        <p className="mt-3 text-[13px] text-ink-soft">
          Phase machine telemetry. Enter the access phrase.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          className="mt-6 w-full rounded-2xl bg-card ring-1 ring-line px-4 py-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-aegean-deep"
          placeholder="passphrase"
        />
        {error && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-terracotta">
            Wrong phrase
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}

function Dashboard() {
  const [days, setDays] = useState(7);
  const fn = useServerFn(getQaStats);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["qa-stats", days],
    queryFn: () => fn({ data: { days } }),
    refetchOnWindowFocus: false,
  });

  return (
    <main className="min-h-dvh bg-limestone pb-24">
      <header className="px-6 pt-[max(28px,env(safe-area-inset-top))] pb-8 border-b border-line">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
              Internal · Aloya
            </p>
            <h1 className="mt-2 font-display text-5xl text-ink leading-none">
              QA console
            </h1>
            <p className="mt-2 text-[13px] text-ink-soft">
              Phase transitions, prompt coverage, and missed-bus false positives.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ring-1 transition ${
                  d === days
                    ? "bg-ink text-limestone ring-ink"
                    : "bg-transparent text-ink-soft ring-line hover:text-ink"
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              onClick={() => refetch()}
              className="rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ring-1 ring-line text-ink-soft hover:text-ink"
            >
              {isFetching ? "…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {isLoading && (
        <p className="px-6 pt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          Loading…
        </p>
      )}
      {error && (
        <p className="px-6 pt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-terracotta">
          {(error as Error).message}
        </p>
      )}
      {data && <DashboardBody data={data} />}
    </main>
  );
}

function DashboardBody({ data }: { data: QaStats }) {
  return (
    <>
      <section className="px-6 pt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Boarding coverage"
          value={`${data.totals.coveragePct}%`}
          sub={`${data.totals.promptsConfirmed} / ${data.totals.promptsShown} prompts`}
          tone={data.totals.coveragePct >= 80 ? "olive" : "ochre"}
        />
        <Stat
          label="Phase errors"
          value={String(data.totals.phaseErrors)}
          sub={`of ${data.totals.phaseTransitions} transitions`}
          tone={data.totals.phaseErrors === 0 ? "olive" : "terracotta"}
        />
        <Stat
          label="False missed-bus"
          value={`${data.totals.falsePositivePct}%`}
          sub={`${data.totals.missedBusFalsePositives} / ${data.totals.missedBusEvents} miss events`}
          tone={data.totals.falsePositivePct <= 10 ? "olive" : "terracotta"}
        />
        <Stat
          label="Window"
          value={`${data.windowDays}d`}
          sub="rolling"
          tone="aegean"
        />
      </section>

      <section className="px-6 pt-12">
        <Heading kicker="Hour of day" title="Coverage and errors by hour" />
        <HourGrid rows={data.byHour} />
      </section>

      <section className="px-6 pt-12">
        <Heading kicker="Routes" title="Per-route performance" />
        <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-line bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.22em] font-mono text-ink-soft">
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3 text-right">Prompts</th>
                <th className="px-4 py-3 text-right">Confirmed</th>
                <th className="px-4 py-3 text-right">Coverage</th>
                <th className="px-4 py-3 text-right">Phase err.</th>
                <th className="px-4 py-3 text-right">False miss</th>
              </tr>
            </thead>
            <tbody>
              {data.byRoute.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-soft text-[13px]">
                    No data in window.
                  </td>
                </tr>
              )}
              {data.byRoute.map((r) => (
                <tr key={r.routeShort} className="border-t border-line/60">
                  <td className="px-4 py-3 font-display text-xl text-ink">{r.routeShort}</td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-ink">
                    {r.promptsShown}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-ink">
                    {r.promptsConfirmed}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px]">
                    <span
                      className={
                        r.coveragePct >= 80
                          ? "text-olive-deep"
                          : r.coveragePct >= 50
                          ? "text-ochre"
                          : "text-terracotta"
                      }
                    >
                      {r.promptsShown ? `${r.coveragePct}%` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-ink">
                    {r.phaseErrors || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-ink">
                    {r.falsePositives || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="px-6 pt-12 grid md:grid-cols-2 gap-6">
        <div>
          <Heading kicker="Errors" title="Phase transition breakdown" />
          <div className="mt-5 rounded-2xl ring-1 ring-line bg-card divide-y divide-line/60">
            {data.phaseErrorBreakdown.length === 0 && (
              <p className="p-5 text-[13px] text-ink-soft">Nothing flagged.</p>
            )}
            {data.phaseErrorBreakdown.map((p) => (
              <div key={`${p.from}-${p.to}`} className="flex items-center justify-between px-4 py-3">
                <span className="font-mono text-[12px] text-ink">
                  {p.from} → <span className="text-terracotta">{p.to}</span>
                </span>
                <span className="font-mono text-[12px] text-ink-soft">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Heading kicker="Stream" title="Recent events" />
          <div className="mt-5 rounded-2xl ring-1 ring-line bg-card max-h-[420px] overflow-y-auto divide-y divide-line/60">
            {data.recent.length === 0 && (
              <p className="p-5 text-[13px] text-ink-soft">Empty.</p>
            )}
            {data.recent.map((r, i) => (
              <div key={i} className="px-4 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {new Date(r.recordedAt).toLocaleString()} · {r.kind}
                </p>
                <p className="mt-1 text-[13px] text-ink">{r.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "olive" | "ochre" | "terracotta" | "aegean";
}) {
  const toneText = {
    olive: "text-olive-deep",
    ochre: "text-ochre",
    terracotta: "text-terracotta",
    aegean: "text-aegean-deep",
  }[tone];
  return (
    <div className="rounded-2xl bg-card ring-1 ring-line p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </p>
      <p className={`mt-3 font-display text-5xl leading-none ${toneText}`}>
        {value}
      </p>
      <p className="mt-2 text-[12px] text-ink-soft">{sub}</p>
    </div>
  );
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
        {kicker}
      </p>
      <h2 className="mt-2 font-display text-3xl text-ink leading-tight">{title}</h2>
    </div>
  );
}

function HourGrid({ rows }: { rows: QaStats["byHour"] }) {
  const maxShown = Math.max(1, ...rows.map((r) => r.promptsShown));
  return (
    <div className="mt-5 grid grid-cols-12 gap-2">
      {rows.map((r) => {
        const h = (r.promptsShown / maxShown) * 100;
        return (
          <div key={r.hour} className="flex flex-col items-center gap-1.5">
            <div className="relative h-24 w-full rounded-md bg-limestone-deep ring-1 ring-line overflow-hidden">
              <div
                className="absolute inset-x-0 bottom-0 bg-aegean-deep/80"
                style={{ height: `${h}%` }}
                title={`${r.promptsShown} prompts`}
              />
              {r.phaseErrors > 0 && (
                <div className="absolute top-1 right-1 size-1.5 rounded-full bg-terracotta" />
              )}
              {r.falsePositives > 0 && (
                <div className="absolute top-1 left-1 size-1.5 rounded-full bg-ochre" />
              )}
            </div>
            <p className="font-mono text-[9px] text-ink-soft">
              {String(r.hour).padStart(2, "0")}
            </p>
            <p className="font-mono text-[9px] text-ink">
              {r.promptsShown ? `${r.coveragePct}%` : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
