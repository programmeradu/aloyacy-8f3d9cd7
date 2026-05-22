import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { IconArrowLeft } from "@/components/Icons";
import {
  readPass,
  writePass,
  clearJccLink,
  formatCardNumber,
  maskedNumber,
  type MotionPass,
  type MotionTxSnapshot,
} from "@/lib/motion-pass";
import { jccLogin, jccRefresh, jccSync } from "@/lib/jcc.functions";
import { useQrSvg } from "@/lib/useQr";
import { useNfcScan } from "@/lib/useNfc";
import motionCardBase from "@/assets/motion-card-base.png";

type SheetMode = "card" | "balance" | "topup" | "link";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Motion Pass · Aloya" },
      {
        name: "description",
        content:
          "Your Cyprus Motion bus card in your pocket. Balance, top-ups, and a scan-ready QR.",
      },
    ],
  }),
  component: WalletRoute,
});

function WalletRoute() {
  const [pass, setPass] = useState<MotionPass>(() => readPass());
  const [editing, setEditing] = useState<"none" | SheetMode>("none");
  const [syncing, setSyncing] = useState(false);

  const loginFn = useServerFn(jccLogin);
  const refreshFn = useServerFn(jccRefresh);
  const syncFn = useServerFn(jccSync);

  useEffect(() => {
    const sync = () => setPass(readPass());
    window.addEventListener("aloya:motionpass", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aloya:motionpass", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = (next: MotionPass) => {
    writePass(next);
    setPass(next);
  };

  const hasCard = pass.number.replace(/\D/g, "").length >= 8;
  const linked = !!pass.jcc;

  // ----- JCC sync flow -----
  async function runSync(opts?: { silent?: boolean }) {
    const current = readPass();
    if (!current.jcc || !current.number) return;
    setSyncing(true);
    try {
      let tokens = {
        accessToken: current.jcc.accessToken,
        refreshToken: current.jcc.refreshToken,
        expiresAt: current.jcc.expiresAt,
      };

      // Proactive refresh if token expires within 60s.
      if (tokens.expiresAt - Date.now() < 60_000) {
        const r = await refreshFn({ data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
        if (!r.ok) {
          update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
          if (!opts?.silent) toast.error("Session expired — please link again.");
          return;
        }
        tokens = r.tokens;
        update({ ...current, jcc: { ...current.jcc, ...tokens } });
      }

      const cardUid = current.number.replace(/\D/g, "");
      let res = await syncFn({ data: { accessToken: tokens.accessToken, cardUid, period: "Last30" } });

      // One reactive refresh on 401.
      if (!res.ok && res.code === "expired") {
        const r = await refreshFn({ data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
        if (!r.ok) {
          update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
          if (!opts?.silent) toast.error("Session expired — please link again.");
          return;
        }
        tokens = r.tokens;
        update({ ...current, jcc: { ...current.jcc, ...tokens } });
        res = await syncFn({ data: { accessToken: tokens.accessToken, cardUid, period: "Last30" } });
      }

      if (!res.ok) {
        if (!opts?.silent) toast.error(("error" in res && res.error) || "Sync failed.");
        return;
      }

      update({
        ...current,
        jcc: { ...current.jcc, ...tokens },
        balanceEur: res.balanceEur,
        balanceUpdatedAt: res.syncedAt,
        lastSyncAt: res.syncedAt,
        passName: res.passName,
        transactions: res.transactions,
      });
      if (!opts?.silent) toast.success(`Synced — ${res.transactions.length} transactions`);
    } finally {
      setSyncing(false);
    }
  }

  // Auto-sync once on mount if linked and stale (>10 min).
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (linked && hasCard && Date.now() - pass.lastSyncAt > 10 * 60_000) {
      autoSyncedRef.current = true;
      void runSync({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, hasCard]);

  async function handleLink(email: string, password: string): Promise<string | null> {
    const r = await loginFn({ data: { email, password } });
    if (!r.ok) return r.error;
    const current = readPass();
    update({
      ...current,
      holder: current.holder || `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      jcc: {
        email: r.profile.email,
        displayName: `${r.profile.firstName} ${r.profile.lastName}`.trim() || r.profile.email,
        ...r.tokens,
        linkedAt: Date.now(),
      },
    });
    // fire-and-forget initial sync
    setTimeout(() => void runSync(), 50);
    return null;
  }

  function handleUnlink() {
    update(clearJccLink(readPass()));
    toast("Unlinked from JCC.");
  }

  return (
    <AppShell>
      <header className="px-6 pt-2 pb-5 flex items-center justify-between animate-rise">
        <a
          href="/"
          className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-line text-ink"
          aria-label="Back"
        >
          <IconArrowLeft className="size-4" />
        </a>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Motion Pass
        </p>
        <span className="size-10" />
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <h1 className="font-display text-[40px] leading-[1.04] text-ink text-balance">
          Your card,{" "}
          <span className="italic text-aegean-deep">always with you.</span>
        </h1>
        <p className="mt-3 text-[13px] text-ink-soft max-w-md">
          {hasCard
            ? "Tap your balance to update it after a top-up. Scan the QR at any Motion vending kiosk to pull up your card."
            : "Add your Motion bus card number and we'll keep it ready — balance, history, and a scan-ready QR for the kiosk."}
        </p>
      </section>

      {/* The Pass */}
      <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <MotionCard pass={pass} onTap={() => setEditing("card")} />
      </section>

      {hasCard ? (
        <>
          {/* Quick actions */}
          <section
            className="mt-5 px-6 grid grid-cols-2 gap-3 animate-rise"
            style={{ animationDelay: "180ms" }}
          >
            <ActionTile
              eyebrow="Balance"
              value={`€${pass.balanceEur.toFixed(2)}`}
              foot={
                linked
                  ? pass.lastSyncAt
                    ? `Synced ${timeAgo(pass.lastSyncAt)}`
                    : "Tap Sync below"
                  : pass.balanceUpdatedAt
                    ? `Updated ${timeAgo(pass.balanceUpdatedAt)}`
                    : "Tap to set"
              }
              onClick={() => (linked ? void runSync() : setEditing("balance"))}
            />
            {linked ? (
              <ActionTile
                eyebrow="JCC"
                value={syncing ? "Syncing…" : "Sync"}
                foot={pass.jcc?.displayName || pass.jcc?.email || "Connected"}
                onClick={() => void runSync()}
                tone="aegean"
              />
            ) : (
              <ActionTile
                eyebrow="Top up"
                value="Log"
                foot="Add a recent reload"
                onClick={() => setEditing("topup")}
                tone="aegean"
              />
            )}
          </section>

          {/* JCC link CTA (unlinked) or pass info (linked) */}
          <section className="mt-4 px-6 animate-rise" style={{ animationDelay: "220ms" }}>
            {linked ? (
              <div className="rounded-[20px] bg-card ring-1 ring-line px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                    Linked to JCC Smart
                  </p>
                  <p className="mt-1 text-[13px] text-ink truncate">
                    {pass.passName || "Auto-sync enabled"}
                  </p>
                </div>
                <button
                  onClick={handleUnlink}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft hover:text-ink"
                >
                  Unlink
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing("link")}
                className="w-full rounded-[20px] bg-aegean-deep text-limestone px-4 py-3 flex items-center justify-between hover:bg-aegean-deep/90 transition-colors"
              >
                <span className="text-left">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/70">
                    Auto-sync
                  </span>
                  <span className="block text-[14px] mt-0.5">
                    Link your JCC Smart account
                  </span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
                  Connect
                </span>
              </button>
            )}
          </section>

          {/* Fare reference */}
          <section
            className="mt-6 px-6 animate-rise"
            style={{ animationDelay: "240ms" }}
          >
            <div className="rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-line">
                <Fare label="Urban" value="€1.50" sub="90-min" />
                <Fare label="Night" value="€2.50" sub="21:00 – 04:00" />
                <Fare label="Intercity" value="€7.00" sub="single" />
              </div>
            </div>
          </section>

          {/* History — either JCC transactions or manual topups */}
          <section
            className="mt-8 px-6 pb-4 animate-rise"
            style={{ animationDelay: "320ms" }}
          >
            {linked ? (
              <TransactionList transactions={pass.transactions} />
            ) : (
              <TopupHistory pass={pass} />
            )}
          </section>
        </>
      ) : (
        <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
          <button
            onClick={() => setEditing("card")}
            className="w-full rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors"
          >
            Add my Motion card
          </button>
          <p className="mt-4 text-[12px] text-ink-soft">
            Your card details live only on this device. We don't send them
            anywhere — at least not until you ask us to.
          </p>
        </section>
      )}

      {editing !== "none" && (
        <PassSheet
          mode={editing}
          pass={pass}
          onClose={() => setEditing("none")}
          onSave={update}
          onLink={handleLink}
        />
      )}
    </AppShell>
  );
}

function TopupHistory({ pass }: { pass: MotionPass }) {
  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">Top-up history</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {pass.topups.length} entries
        </span>
      </div>
      {pass.topups.length === 0 ? (
        <div className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-6 text-center">
          <p className="text-[13px] text-ink-soft">
            Nothing here yet. Log your first top-up — or link your JCC account
            above to auto-sync from the source.
          </p>
        </div>
      ) : (
        <ol className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line">
          {pass.topups
            .slice()
            .sort((a, b) => b.at - a.at)
            .map((t) => (
              <li key={t.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[13px] text-ink">Top-up</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {fullDate(t.at)}
                  </p>
                </div>
                <span className="font-display text-2xl text-ink tabular-nums">
                  +€{t.amountEur.toFixed(2)}
                </span>
              </li>
            ))}
        </ol>
      )}
    </>
  );
}

function TransactionList({ transactions }: { transactions: MotionTxSnapshot[] }) {
  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">Recent activity</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          Last 30 days
        </span>
      </div>
      {transactions.length === 0 ? (
        <div className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-6 text-center">
          <p className="text-[13px] text-ink-soft">
            No activity in the last 30 days.
          </p>
        </div>
      ) : (
        <ol className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line">
          {transactions.map((t) => {
            const isTopup = t.type === "Topup";
            const isPositive = isTopup || t.priceEur === 0;
            return (
              <li key={t.id} className="flex items-center justify-between p-4 gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink truncate">
                    {isTopup ? "Top-up" : t.typeName}
                    {t.route && !isTopup ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                        Route {t.route}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-soft truncate">
                    {t.stopName}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {fullDate(+new Date(t.at))}
                  </p>
                </div>
                <span
                  className={`font-display text-xl tabular-nums shrink-0 ${
                    isPositive ? "text-aegean-deep" : "text-ink"
                  }`}
                >
                  {isTopup ? "+" : t.priceEur > 0 ? "−" : ""}€
                  {Math.abs(isTopup ? t.priceEur || 0 : t.priceEur).toFixed(2)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

/* ============================================================
 * Motion Card — pixel-faithful reproduction of the physical
 * Cyprus Motion Bus Card front. White stock, official wordmark
 * (lime cloud tuft + two-tone "motion" + "BUS CARD"), orange
 * route-network illustration with contactless hand, holder name,
 * tier pill, valid-until date, photo slot (we render the kiosk
 * QR there), and the "ΚΑΝΟΝΙΚΗ STANDARD" tier label.
 * Brand colors are hard-coded here on purpose — this is a faithful
 * reproduction of an external brand asset, not app chrome.
 * ============================================================ */
function MotionCard({ pass, onTap }: { pass: MotionPass; onTap: () => void }) {
  const hasCard = pass.number.replace(/\D/g, "").length >= 8;
  const qrValue = hasCard ? pass.number.replace(/\D/g, "") : "MOTION-DEMO";
  const qrSvg = useQrSvg(qrValue, { color: "#1a2a6c" });

  const holderName =
    (pass.holder?.trim() || pass.jcc?.displayName?.trim() || "").toUpperCase() ||
    "ADD YOUR NAME";
  const tierLabel = (pass.tier?.trim() || "18+ Standard");
  const validUntil = pass.validUntil?.trim() || "—/—/——";

  return (
    <button
      type="button"
      onClick={onTap}
      className="group block w-full text-left"
      aria-label={hasCard ? "Edit your Motion card" : "Add your Motion card"}
    >
      <article
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[20px] ring-1 ring-ink/10 shadow-[0_24px_60px_-28px_rgba(8,28,40,0.4)] transition-transform duration-500 ease-out group-hover:-translate-y-0.5"
        style={{ containerType: "inline-size", background: "#ffffff" }}
      >
        {/* ===== Top-left: motion wordmark with green cloud tuft ===== */}
        <div className="absolute" style={{ top: "7%", left: "6%", width: "44%" }}>
          <svg viewBox="0 0 220 70" className="w-full h-auto" aria-hidden>
            {/* Lime cloud tuft above the wordmark */}
            <path
              d="M8 22 C 14 6, 36 4, 46 14 C 58 4, 86 6, 96 18 C 110 8, 138 10, 148 22 L 148 30 L 8 30 Z"
              fill="#a8c83a"
            />
            {/* "moti" in light blue, "on" in dark navy — split by glyph */}
            <text
              x="0"
              y="62"
              fontFamily="Geist, Inter, system-ui, sans-serif"
              fontWeight="800"
              fontSize="48"
              letterSpacing="-2"
            >
              <tspan fill="#2cb6ea">moti</tspan>
              <tspan fill="#1a2a6c">on</tspan>
            </text>
          </svg>
          <div className="mt-[2cqw] flex items-baseline gap-[1.2cqw]">
            <span
              className="font-sans tracking-[0.12em] font-medium"
              style={{ fontSize: "clamp(8px, 2.6cqw, 14px)", color: "#8a8d92" }}
            >
              BUS
            </span>
            <span
              className="font-sans tracking-[0.12em] font-bold"
              style={{ fontSize: "clamp(8px, 2.6cqw, 14px)", color: "#1a2a6c" }}
            >
              CARD
            </span>
          </div>
        </div>

        {/* ===== Photo slot (top right) — we render the kiosk QR here ===== */}
        <div
          className="absolute bg-white rounded-[2px]"
          style={{
            top: "9%",
            right: "6%",
            width: "22%",
            aspectRatio: "1 / 1.1",
            border: "1.5px solid #1a2a6c",
            padding: "4%",
          }}
          aria-label="Card QR for kiosk lookup"
        >
          {qrSvg ? (
            <div
              className="size-full [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="size-full bg-ink/5" />
          )}
        </div>

        {/* ===== Holder name + tier pill + valid until (middle) ===== */}
        <div
          className="absolute"
          style={{ top: "42%", left: "26%", right: "30%" }}
        >
          <p
            className="font-sans font-semibold truncate"
            style={{
              fontSize: "clamp(10px, 3.2cqw, 16px)",
              color: hasCard ? "#9b1c1c" : "#9b1c1c80",
              letterSpacing: "0.02em",
            }}
          >
            {holderName}
          </p>
          <div
            className="inline-block mt-[1.5cqw] px-[2.4cqw] py-[0.6cqw] rounded-[3px]"
            style={{ background: "#a8e6a3" }}
          >
            <span
              className="font-sans font-semibold"
              style={{ fontSize: "clamp(9px, 2.8cqw, 14px)", color: "#1a2a6c" }}
            >
              {tierLabel}
            </span>
          </div>
          <p
            className="mt-[2cqw] font-sans"
            style={{ fontSize: "clamp(7px, 2.1cqw, 11px)", color: "#5a5d62" }}
          >
            Ισχύει Μέχρι/Valid Until:
          </p>
          <p
            className="font-sans"
            style={{ fontSize: "clamp(8px, 2.4cqw, 12px)", color: "#5a5d62" }}
          >
            {validUntil}
          </p>
        </div>

        {/* ===== Orange route network across the bottom-left ===== */}
        <svg
          className="absolute"
          style={{ bottom: "0", left: "0", width: "82%", height: "55%" }}
          viewBox="0 0 320 140"
          preserveAspectRatio="xMinYMax meet"
          aria-hidden
        >
          {/* Connecting lines */}
          <g stroke="#f08a3e" strokeWidth="3.5" fill="none" strokeLinecap="round">
            <path d="M 58 92 L 110 110" />
            <path d="M 110 110 L 168 96" />
            <path d="M 168 96 L 220 118" />
            <path d="M 220 118 L 276 102" />
            <path d="M 110 110 L 138 78" />
            <path d="M 168 96 L 200 70" />
            <path d="M 220 118 L 250 88" />
            <path d="M 138 78 L 200 70" />
            <path d="M 250 88 L 296 76" />
          </g>
          {/* Hollow station nodes */}
          <g fill="#ffffff" stroke="#f08a3e" strokeWidth="3.5">
            <circle cx="110" cy="110" r="9" />
            <circle cx="168" cy="96" r="9" />
            <circle cx="220" cy="118" r="9" />
            <circle cx="276" cy="102" r="9" />
            <circle cx="138" cy="78" r="7" />
            <circle cx="200" cy="70" r="7" />
            <circle cx="250" cy="88" r="7" />
            <circle cx="296" cy="76" r="6" />
          </g>
          {/* Hand holding phone with contactless waves */}
          <g transform="translate(20 38)">
            {/* Contactless arcs */}
            <g fill="none" stroke="#1a2a6c" strokeWidth="2.6" strokeLinecap="round">
              <path d="M 6 20 Q -2 28 6 36" />
              <path d="M 0 14 Q -10 28 0 42" />
            </g>
            {/* Phone */}
            <rect x="14" y="14" width="22" height="36" rx="3" fill="#ffffff" stroke="#1a2a6c" strokeWidth="2.4" />
            <circle cx="25" cy="45" r="1.6" fill="#1a2a6c" />
            {/* Hand */}
            <path
              d="M 14 46 C 10 50, 8 58, 14 64 L 38 64 C 44 58, 42 50, 38 46 L 38 56 L 14 56 Z"
              fill="#1a2a6c"
            />
            <path d="M 22 64 L 22 78 L 34 78 L 34 64" fill="#1a2a6c" />
          </g>
        </svg>

        {/* ===== Bottom-right tier text ===== */}
        <div
          className="absolute text-right"
          style={{ bottom: "6%", right: "6%" }}
        >
          <p
            className="font-sans font-bold leading-tight"
            style={{ fontSize: "clamp(8px, 2.4cqw, 12px)", color: "#1a2a6c", letterSpacing: "0.04em" }}
          >
            ΚΑΝΟΝΙΚΗ
          </p>
          <p
            className="font-sans font-bold leading-tight"
            style={{ fontSize: "clamp(8px, 2.4cqw, 12px)", color: "#1a2a6c", letterSpacing: "0.04em" }}
          >
            STANDARD
          </p>
        </div>

        {/* Soft sheen */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 60% at 50% -10%, rgba(0,0,0,0.04), transparent 55%)",
          }}
        />
      </article>
      {!hasCard && (
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          Tap the card to set it up
        </p>
      )}
    </button>
  );
}

/* ============================================================
 * Tiles + sheet
 * ============================================================ */
function ActionTile({
  eyebrow,
  value,
  foot,
  onClick,
  tone = "default",
}: {
  eyebrow: string;
  value: string;
  foot: string;
  onClick: () => void;
  tone?: "default" | "aegean";
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[24px] bg-card ring-1 ring-line p-4 hover:ring-aegean-deep/30 transition-all"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {eyebrow}
      </p>
      <p
        className={`mt-2 font-display text-[28px] leading-none ${tone === "aegean" ? "text-aegean-deep italic" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-ink-soft">{foot}</p>
    </button>
  );
}

function Fare({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}

function PassSheet({
  mode,
  pass,
  onClose,
  onSave,
  onLink,
}: {
  mode: SheetMode;
  pass: MotionPass;
  onClose: () => void;
  onSave: (p: MotionPass) => void;
  onLink: (email: string, password: string) => Promise<string | null>;
}) {
  const [number, setNumber] = useState(pass.number);
  const [holder, setHolder] = useState(pass.holder ?? "");
  const [tier, setTier] = useState(pass.tier ?? "");
  const [validUntil, setValidUntil] = useState(pass.validUntil ?? "");
  const [balance, setBalance] = useState(
    pass.balanceEur > 0 ? pass.balanceEur.toFixed(2) : "",
  );
  const [topup, setTopup] = useState("");
  const [email, setEmail] = useState(pass.jcc?.email ?? "");
  const [password, setPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const nfc = useNfcScan();


  const title =
    mode === "card"
      ? "Your Motion card"
      : mode === "balance"
        ? "Update balance"
        : mode === "topup"
          ? "Log a top-up"
          : "Link JCC Smart";

  async function save() {
    if (mode === "card") {
      const clean = number.replace(/\D/g, "").slice(0, 16);
      onSave({
        ...pass,
        number: clean,
        holder: holder.trim(),
        tier: tier.trim() || undefined,
        validUntil: validUntil.trim() || undefined,
      });
    } else if (mode === "balance") {
      const v = parseFloat(balance);
      if (!isNaN(v) && v >= 0) {
        onSave({ ...pass, balanceEur: v, balanceUpdatedAt: Date.now() });
      }
    } else if (mode === "topup") {
      const v = parseFloat(topup);
      if (!isNaN(v) && v > 0) {
        const now = Date.now();
        onSave({
          ...pass,
          balanceEur: pass.balanceEur + v,
          balanceUpdatedAt: now,
          topups: [...pass.topups, { id: String(now), amountEur: v, at: now }],
        });
      }
    } else if (mode === "link") {
      if (!email || !password) {
        setLinkError("Email and password are required.");
        return;
      }
      setLinking(true);
      setLinkError(null);
      const err = await onLink(email.trim(), password);
      setLinking(false);
      if (err) {
        setLinkError(err);
        return;
      }
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm animate-rise"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-limestone rounded-t-[28px] sm:rounded-[28px] ring-1 ring-line p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft hover:text-ink"
          >
            Close
          </button>
        </div>

        {mode === "card" && (
          <div className="space-y-4">
            <NfcScanBlock
              nfc={nfc}
              onUid={(digits) => setNumber(digits)}
            />
            <Field label="Card number">
              <input
                inputMode="numeric"
                value={formatCardNumber(number)}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="01 2345 6789"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 font-mono text-lg tracking-[0.18em] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <Field label="Cardholder name (optional)">
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Andreas G."
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tier">
                <input
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  placeholder="18+ Standard"
                  className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[14px] text-ink focus:outline-none focus:ring-aegean-deep/40"
                />
              </Field>
              <Field label="Valid until">
                <input
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  placeholder="07/05/2036"
                  className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 font-mono text-[14px] text-ink focus:outline-none focus:ring-aegean-deep/40"
                />
              </Field>
            </div>
            <p className="text-[11px] text-ink-soft">
              The masked card on display: {maskedNumber(number)}
            </p>
          </div>
        )}

        {mode === "balance" && (
          <div className="space-y-4">
            <Field label="Balance in EUR">
              <div className="flex items-center bg-card rounded-2xl ring-1 ring-line px-4 py-3 focus-within:ring-aegean-deep/40">
                <span className="font-display text-2xl text-ink-soft mr-2">€</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  value={balance}
                  onChange={(e) => setBalance(e.target.value.replace(",", "."))}
                  placeholder="0.00"
                  className="w-full bg-transparent font-display text-2xl text-ink focus:outline-none"
                />
              </div>
            </Field>
            <p className="text-[11px] text-ink-soft">
              Last updated{" "}
              {pass.balanceUpdatedAt ? timeAgo(pass.balanceUpdatedAt) : "never"}.
            </p>
          </div>
        )}

        {mode === "topup" && (
          <div className="space-y-4">
            <Field label="Top-up amount">
              <div className="flex items-center bg-card rounded-2xl ring-1 ring-line px-4 py-3 focus-within:ring-aegean-deep/40">
                <span className="font-display text-2xl text-ink-soft mr-2">€</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  value={topup}
                  onChange={(e) => setTopup(e.target.value.replace(",", "."))}
                  placeholder="10.00"
                  className="w-full bg-transparent font-display text-2xl text-ink focus:outline-none"
                />
              </div>
            </Field>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setTopup(v.toFixed(2))}
                  className="flex-1 rounded-xl bg-card ring-1 ring-line py-2 font-display text-lg text-ink hover:ring-aegean-deep/30"
                >
                  €{v}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-4">
            <p className="text-[12px] text-ink-soft -mt-1">
              We log in to JCC Smart on your behalf and pull your bus card
              balance + recent activity. We keep only the session token on this
              device — never your password.
            </p>
            <Field label="JCC Smart email">
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            {linkError && (
              <p className="text-[12px] text-destructive">{linkError}</p>
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={linking}
          className="mt-6 w-full rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors disabled:opacity-60"
        >
          {mode === "link" ? (linking ? "Linking…" : "Link account") : "Save"}
        </button>
      </div>
    </div>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */
function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

function fullDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ============================================================
 * NFC tap-to-scan block (Android Chrome only). Falls back to a
 * one-line explainer on iOS / unsupported browsers so the user
 * always knows why the button isn't there.
 * ============================================================ */
function NfcScanBlock({
  nfc,
  onUid,
}: {
  nfc: ReturnType<typeof useNfcScan>;
  onUid: (digits: string) => void;
}) {
  if (!nfc.supported) {
    return (
      <div className="rounded-2xl ring-1 ring-line bg-card px-4 py-3">
        <p className="font-mono uppercase tracking-[0.22em] text-[10px] text-ink-soft">
          Tap to scan
        </p>
        <p className="mt-1 text-[12px] text-ink-soft">
          Available on Android with Chrome. Type the 14-digit UID from the back
          of your card below.
        </p>
      </div>
    );
  }

  const scanning = nfc.status === "scanning";

  async function run() {
    const uid = await nfc.scan();
    if (uid?.digits) {
      onUid(uid.digits);
      toast.success("Card scanned", { description: `UID ${uid.digits}` });
    }
  }

  return (
    <div className="rounded-2xl ring-1 ring-aegean-deep/30 bg-aegean-soft/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono uppercase tracking-[0.22em] text-[10px] text-aegean-deep">
            Tap card to scan
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {scanning
              ? "Hold your Motion card against the back of your phone…"
              : "Skip typing. Tap your card to fill in the 14-digit UID."}
          </p>
        </div>
        <button
          type="button"
          onClick={scanning ? nfc.stop : run}
          className="shrink-0 rounded-full bg-ink text-limestone px-4 py-2 text-[12px] font-medium hover:bg-ink/90"
        >
          {scanning ? "Cancel" : "Scan"}
        </button>
      </div>
      {scanning && (
        <div className="mt-3 flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full rounded-full bg-aegean-deep opacity-60 animate-pulse-ring" />
            <span className="relative inline-flex size-3 rounded-full bg-aegean-deep" />
          </span>
          <span className="font-mono text-[11px] text-aegean-deep">Listening for NFC…</span>
        </div>
      )}
      {nfc.status === "error" && nfc.error && (
        <p className="mt-2 text-[12px] text-destructive">{nfc.error}</p>
      )}
      {nfc.status === "success" && nfc.lastUid && (
        <p className="mt-2 font-mono text-[11px] text-olive">
          Read UID {nfc.lastUid.digits}
        </p>
      )}
    </div>
  );
}
