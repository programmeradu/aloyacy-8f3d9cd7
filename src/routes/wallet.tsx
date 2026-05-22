import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IconArrowLeft } from "@/components/Icons";
import {
  readPass,
  writePass,
  formatCardNumber,
  maskedNumber,
  type MotionPass,
} from "@/lib/motion-pass";
import { useQrSvg } from "@/lib/useQr";

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
  const [editing, setEditing] = useState<"none" | "card" | "balance" | "topup">("none");

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
                pass.balanceUpdatedAt
                  ? `Updated ${timeAgo(pass.balanceUpdatedAt)}`
                  : "Tap to set"
              }
              onClick={() => setEditing("balance")}
            />
            <ActionTile
              eyebrow="Top up"
              value="Log"
              foot="Add a recent reload"
              onClick={() => setEditing("topup")}
              tone="aegean"
            />
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

          {/* History */}
          <section
            className="mt-8 px-6 pb-4 animate-rise"
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex items-end justify-between mb-3">
              <h2 className="font-display text-2xl text-ink">Top-up history</h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {pass.topups.length} entries
              </span>
            </div>
            {pass.topups.length === 0 ? (
              <div className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-6 text-center">
                <p className="text-[13px] text-ink-soft">
                  Nothing here yet. Log your first top-up to start building a
                  history.
                </p>
              </div>
            ) : (
              <ol className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line">
                {pass.topups
                  .slice()
                  .sort((a, b) => b.at - a.at)
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between p-4"
                    >
                      <div>
                        <p className="text-[13px] text-ink">
                          Top-up
                        </p>
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
        />
      )}
    </AppShell>
  );
}

/* ============================================================
 * Motion Card — the visual centerpiece.
 * Brand-accurate: aegean teal gradient, ochre stripe at the bottom,
 * lowercase "motion" wordmark, contactless mark, NFC chip illustration,
 * 10-digit number across the middle. Tap-to-edit the whole card.
 * ============================================================ */
function MotionCard({ pass, onTap }: { pass: MotionPass; onTap: () => void }) {
  const hasCard = pass.number.replace(/\D/g, "").length >= 8;
  // Card number value used for the QR (the kiosk reads exactly the printed
  // digits, no prefix). Falls back to a placeholder so the QR slot doesn't
  // collapse on an empty card.
  const qrValue = hasCard ? pass.number.replace(/\D/g, "") : "MOTION-DEMO";
  const qrSvg = useQrSvg(qrValue);

  return (
    <button
      type="button"
      onClick={onTap}
      className="group block w-full text-left"
      aria-label={hasCard ? "Edit your Motion card" : "Add your Motion card"}
    >
      <article
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[28px] ring-1 ring-ink/15 shadow-[0_24px_60px_-28px_rgba(8,28,40,0.55)] transition-transform duration-500 ease-out group-hover:-translate-y-0.5"
        style={{
          containerType: "inline-size",
          background:
            "linear-gradient(135deg, oklch(0.34 0.07 220) 0%, oklch(0.42 0.09 215) 45%, oklch(0.52 0.10 210) 100%)",
        }}
      >

        {/* Subtle topographic guilloche texture */}
        <svg
          className="absolute inset-0 size-full opacity-[0.16]"
          viewBox="0 0 400 252"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <pattern id="motion-grid" width="22" height="22" patternUnits="userSpaceOnUse">
              <path
                d="M0 22 Q11 11 22 22 M0 0 Q11 11 22 0"
                fill="none"
                stroke="#ffffff"
                strokeWidth="0.6"
              />
            </pattern>
          </defs>
          <rect width="400" height="252" fill="url(#motion-grid)" />
        </svg>

        {/* Ochre stripe — the signature horizontal bar near the bottom */}
        <div
          className="absolute left-0 right-0 h-[12%]"
          style={{
            bottom: "16%",
            background:
              "linear-gradient(180deg, oklch(0.78 0.15 70) 0%, oklch(0.71 0.16 60) 100%)",
            boxShadow:
              "0 -1px 0 rgba(255,255,255,0.2) inset, 0 1px 0 rgba(0,0,0,0.15) inset",
          }}
        />

        {/* Top row: wordmark + contactless mark */}
        <div className="absolute inset-x-0 top-0 p-[5%] flex items-start justify-between text-white">
          <div>
            <p
              className="font-display lowercase italic leading-none"
              style={{ fontSize: "clamp(28px, 7.2cqw, 44px)" }}
            >
              motion
            </p>
            <p className="mt-1.5 font-mono uppercase tracking-[0.28em] text-white/80 text-[9px]">
              Cyprus Public Transport
            </p>
          </div>
          <ContactlessMark />
        </div>

        {/* Chip + middle row: number */}
        <div className="absolute inset-x-0 top-[42%] px-[5%] flex items-center gap-4">
          <NfcChip />
          <p
            className="font-mono text-white tabular-nums tracking-[0.18em]"
            style={{ fontSize: "clamp(14px, 4.2cqw, 22px)" }}
          >
            {hasCard ? formatCardNumber(pass.number) : "—— ———— ————"}
          </p>
        </div>

        {/* Bottom row sits BELOW the ochre stripe: holder + QR */}
        <div className="absolute inset-x-0 bottom-0 p-[5%] flex items-end justify-between text-white">
          <div className="min-w-0 pr-3">
            <p className="font-mono uppercase tracking-[0.22em] text-white/70 text-[9px]">
              Cardholder
            </p>
            <p className="mt-1 font-display italic truncate text-balance" style={{ fontSize: "clamp(14px, 3.6cqw, 18px)" }}>
              {pass.holder?.trim() || "Add a name"}
            </p>
          </div>
          <div
            className="shrink-0 rounded-[8px] bg-white p-1.5 ring-1 ring-white/40"
            style={{ width: "clamp(44px, 14cqw, 64px)", height: "clamp(44px, 14cqw, 64px)" }}
            aria-label="Card QR for kiosk lookup"
          >
            {qrSvg ? (
              <div
                className="size-full [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="size-full bg-ink/10 rounded-[4px]" />
            )}
          </div>
        </div>

        {/* Soft top highlight to give it polish */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.18), transparent 55%)",
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

function ContactlessMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 text-white/90" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M7 6c3 2.4 3 9.6 0 12" />
        <path d="M11 4c4.4 3.4 4.4 12.6 0 16" />
        <path d="M15 2c5.6 4.2 5.6 15.8 0 20" />
      </g>
    </svg>
  );
}

function NfcChip() {
  return (
    <svg
      viewBox="0 0 36 28"
      aria-hidden
      style={{ width: "clamp(32px, 10cqw, 48px)", height: "auto" }}
    >
      <defs>
        <linearGradient id="chip-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d28a" />
          <stop offset="55%" stopColor="#c79a4a" />
          <stop offset="100%" stopColor="#8a6a2c" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="26" rx="4" fill="url(#chip-g)" stroke="#6b5320" strokeWidth="0.5" />
      <g stroke="#6b5320" strokeWidth="0.6" fill="none">
        <path d="M12 1 V8 H1" />
        <path d="M24 1 V8 H35" />
        <path d="M12 27 V20 H1" />
        <path d="M24 27 V20 H35" />
        <path d="M12 14 H24" />
        <path d="M18 8 V20" />
      </g>
    </svg>
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
}: {
  mode: "card" | "balance" | "topup";
  pass: MotionPass;
  onClose: () => void;
  onSave: (p: MotionPass) => void;
}) {
  const [number, setNumber] = useState(pass.number);
  const [holder, setHolder] = useState(pass.holder ?? "");
  const [balance, setBalance] = useState(
    pass.balanceEur > 0 ? pass.balanceEur.toFixed(2) : "",
  );
  const [topup, setTopup] = useState("");

  const title =
    mode === "card" ? "Your Motion card" : mode === "balance" ? "Update balance" : "Log a top-up";

  function save() {
    if (mode === "card") {
      const clean = number.replace(/\D/g, "").slice(0, 10);
      onSave({ ...pass, number: clean, holder: holder.trim() });
    } else if (mode === "balance") {
      const v = parseFloat(balance);
      if (!isNaN(v) && v >= 0) {
        onSave({ ...pass, balanceEur: v, balanceUpdatedAt: Date.now() });
      }
    } else {
      const v = parseFloat(topup);
      if (!isNaN(v) && v > 0) {
        const now = Date.now();
        onSave({
          ...pass,
          balanceEur: pass.balanceEur + v,
          balanceUpdatedAt: now,
          topups: [
            ...pass.topups,
            { id: String(now), amountEur: v, at: now },
          ],
        });
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
            <Field label="Card number (10 digits)">
              <input
                inputMode="numeric"
                autoFocus
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

        <button
          onClick={save}
          className="mt-6 w-full rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors"
        >
          Save
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
