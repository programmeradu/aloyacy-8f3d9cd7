import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { IconArrowLeft } from "@/components/Icons";
import {
  readPass,
  writePass,
  clearJccLink,
  type MotionPass,
} from "@/lib/motion-pass";
import { jccLogin, jccRefresh, jccSync } from "@/lib/jcc.functions";
import {
  verifyMotionCard,
  getMotionCardOptions,
} from "@/lib/publictransport.functions";
import { MotionCard } from "@/components/wallet/MotionCard";
import { JccLogo } from "@/components/wallet/JccLogo";
import { ActionTile, Fare } from "@/components/wallet/Tiles";
import { TopupHistory, TransactionList } from "@/components/wallet/History";
import { RenewPasses } from "@/components/wallet/Passes";
import type { SheetMode } from "@/components/wallet/PassSheet";
import { timeAgo } from "@/components/wallet/utils";
import fareUrban from "@/assets/fare-urban.jpg";
import fareNight from "@/assets/fare-night.jpg";
import fareIntercity from "@/assets/fare-intercity.jpg";
import { ProUpsellCard } from "@/components/ProUpsell";
import { ProAccountCard } from "@/components/ProAccountCard";

// Lazy: the editor sheet only mounts when the user taps to edit.
const PassSheet = lazy(() =>
  import("@/components/wallet/PassSheet").then((m) => ({ default: m.PassSheet })),
);

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Motion Pass — Aloya" },
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
  const verifyFn = useServerFn(verifyMotionCard);
  const optionsFn = useServerFn(getMotionCardOptions);

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

  // Public sync — uses the unauthenticated publictransport.com.cy endpoints.
  // Runs whenever there's a card number, even without a JCC link. Refreshes
  // the live balance and the list of eligible passes for renewal.
  async function runPublicSync() {
    const current = readPass();
    const cardUid = current.number.replace(/\D/g, "");
    if (cardUid.length < 6) return;
    const [verify, opts] = await Promise.all([
      verifyFn({ data: { cardNumber: cardUid } }),
      optionsFn({ data: { cardNumber: cardUid } }),
    ]);
    const next: MotionPass = { ...readPass() };
    let changed = false;
    if (verify.ok) {
      next.balanceEur = verify.balanceEur;
      next.balanceUpdatedAt = verify.syncedAt;
      next.cardType = verify.cardType;
      changed = true;
    }
    if (opts.ok) {
      next.passes = opts.passes;
      next.passesUpdatedAt = opts.syncedAt;
      // GetCardTopup also returns balance — trust the larger of the two.
      if (!verify.ok) {
        next.balanceEur = opts.balanceEur;
        next.balanceUpdatedAt = opts.syncedAt;
      }
      changed = true;
    }
    if (changed) update(next);
  }

  // Auto-sync once on mount.
  // 1) Public (no auth) — always runs if there's a card and it's stale (>5 min).
  // 2) JCC (linked) — pulls transactions if stale (>10 min).
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (!hasCard) return;
    autoSyncedRef.current = true;
    if (Date.now() - pass.balanceUpdatedAt > 5 * 60_000) {
      void runPublicSync();
    }
    if (linked && Date.now() - pass.lastSyncAt > 10 * 60_000) {
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
                pass.balanceUpdatedAt
                  ? `Live ${timeAgo(pass.balanceUpdatedAt)}`
                  : "Tap to refresh"
              }
              onClick={() => void runPublicSync()}
            />
            {linked ? (
              <ActionTile
                eyebrow="JCC"
                value={syncing ? "Syncing…" : "Sync"}
                foot={pass.jcc?.displayName || pass.jcc?.email || "Connected"}
                onClick={() => void runSync()}
                tone="aegean"
                adornment={
                  <JccLogo className="h-7 w-7 rounded-md ring-1 ring-line bg-white" />
                }
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
                <div className="flex items-center gap-3 min-w-0">
                  <JccLogo className="h-9 w-9 shrink-0 rounded-md ring-1 ring-line bg-white" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                      Linked to JCC Smart
                    </p>
                    <p className="mt-1 text-[13px] text-ink truncate">
                      {pass.passName || "Auto-sync enabled"}
                    </p>
                  </div>
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
                className="w-full rounded-[20px] bg-aegean-deep text-limestone px-4 py-3 flex items-center justify-between gap-3 hover:bg-aegean-deep/90 transition-colors"
              >
                <span className="flex items-center gap-3 text-left min-w-0">
                  <JccLogo className="h-9 w-9 shrink-0 rounded-md ring-1 ring-limestone/20 bg-white" />
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-limestone/70">
                      Auto-sync
                    </span>
                    <span className="block text-[14px] mt-0.5 truncate">
                      Link your JCC Smart account
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em]">
                  Connect
                </span>
              </button>
            )}
          </section>

          {/* Eligible passes for renewal (from public top-up portal) */}
          {pass.passes && pass.passes.length > 0 && (
            <div className="mt-6">
              <RenewPasses cardNumber={pass.number} passes={pass.passes} />
            </div>
          )}

          {/* Aloya Pro upsell */}
          <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "220ms" }}>
            <ProAccountCard />
            <ProUpsellCard />
          </section>

          {/* Fare reference */}
          <section
            className="mt-6 px-6 animate-rise"
            style={{ animationDelay: "240ms" }}
          >
            <div className="grid grid-cols-3 gap-2.5">
              <Fare label="Urban" value="€1.50" sub="90-min" image={fareUrban} imageAlt="A Mediterranean village street in soft daylight" />
              <Fare label="Night" value="€2.50" sub="21:00 – 04:00" image={fareNight} imageAlt="A village arch lit by a single lamp under a crescent moon" tone="dark" />
              <Fare label="Intercity" value="€7.00" sub="single" image={fareIntercity} imageAlt="A coastal road winding along Cypriot cliffs" />
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
        <Suspense fallback={null}>
          <PassSheet
            mode={editing}
            pass={pass}
            onClose={() => setEditing("none")}
            onSave={update}
            onLink={handleLink}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
