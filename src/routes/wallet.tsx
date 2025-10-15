import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { IconWaves, IconTicket } from "@/components/Icons";
import texture from "@/assets/wallet-texture.jpg";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Smart Pass · Aloya" },
      { name: "description", content: "Tap, ride, top up. Cyprus transit wallet." },
    ],
  }),
  component: Wallet,
});

const history = [
  { time: "Today · 09:42", line: "Route 102", price: "€1.50", note: "Eleftheria → Engomi" },
  { time: "Today · 08:11", line: "Route 11", price: "€1.50", note: "Aglantzia → Center" },
  { time: "Mon · 18:20", line: "Intercity IC-1", price: "€7.00", note: "Nicosia → Larnaca" },
  { time: "Sun · 11:05", line: "Route 425", price: "€1.50", note: "Marina → Finikoudes" },
];

function Wallet() {
  return (
    <AppShell>
      <header className="px-6 pt-2 pb-5 animate-rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Smart Pass
        </p>
        <h1 className="font-display text-4xl mt-2 text-ink">
          One tap. <span className="italic text-aegean-deep">All of Cyprus.</span>
        </h1>
      </header>

      {/* Pass card */}
      <section className="px-6 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="relative overflow-hidden rounded-[32px] ring-1 ring-line shadow-[0_18px_50px_-25px_rgba(28,30,26,0.4)]">
          <img
            src={texture}
            alt=""
            aria-hidden
            loading="lazy"
            width={1024}
            height={640}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-limestone/40 via-limestone/10 to-ochre/30" />
          <div className="relative p-6 text-ink">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  Aloya · Resident
                </p>
                <p className="mt-3 font-display text-[44px] leading-none">
                  €24<span className="text-2xl">.50</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-soft">Available balance</p>
              </div>
              <div className="flex size-16 items-center justify-center rounded-2xl bg-ink text-limestone">
                <QrIcon />
              </div>
            </div>

            <div className="mt-8 flex items-end justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  Card · ending
                </p>
                <p className="font-mono text-base tracking-[0.18em] text-ink mt-1">
                  •••• 4 0 2 1
                </p>
              </div>
              <p className="font-display text-xl italic text-olive">Andreas G.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Top up actions */}
      <section
        className="mt-5 px-6 grid grid-cols-3 gap-2 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        {["€5", "€10", "€20"].map((v) => (
          <button
            key={v}
            className="rounded-2xl bg-card py-4 ring-1 ring-line font-display text-2xl text-ink hover:ring-aegean-deep/30 transition-all"
          >
            {v}
          </button>
        ))}
      </section>

      <button className="mx-6 mt-3 w-[calc(100%-3rem)] rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors animate-rise" style={{ animationDelay: "180ms" }}>
        Top up smart pass
      </button>

      {/* Fare info */}
      <section
        className="mt-8 px-6 grid grid-cols-2 gap-3 animate-rise"
        style={{ animationDelay: "240ms" }}
      >
        <FareCard
          icon={<IconTicket className="size-4 text-aegean-deep" />}
          label="Urban"
          value="€1.50"
          sub="90-min transfer"
        />
        <FareCard
          icon={<IconWaves className="size-4 text-ochre" />}
          label="Intercity"
          value="€7.00"
          sub="Larnaca · Paphos · Limassol"
        />
      </section>

      {/* History */}
      <section
        className="mt-8 px-6 pb-4 animate-rise"
        style={{ animationDelay: "320ms" }}
      >
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-2xl text-ink">Recent rides</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            this week
          </span>
        </div>
        <div className="rounded-3xl bg-card ring-1 ring-line divide-y divide-line">
          {history.map((h) => (
            <div
              key={h.time}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">
                  {h.note}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {h.time} · {h.line}
                </p>
              </div>
              <span className="font-display text-xl text-ink tabular-nums">
                {h.price}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function FareCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-3xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-3xl text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden>
      <path d="M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9 0h2v2h-2v-2zm4 0h3v2h-3v-2zm-4 4h2v2h-2v-2zm4-2h3v3h-3v-3zm-2 4h2v2h-2v-2z" />
    </svg>
  );
}
