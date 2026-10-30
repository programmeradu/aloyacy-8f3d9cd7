import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RoamPage } from "@/components/roam/RoamPage";
import { FrostButton } from "@/components/roam/FrostButton";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";
import { readPass, writePass, clearJccLink, type MotionPass } from "@/lib/motion-pass";
import { jccLogin, jccRefresh, jccSync } from "@/lib/jcc.functions";
import { verifyMotionCard, getMotionCardOptions } from "@/lib/publictransport.functions";
import { MotionCard } from "@/components/wallet/MotionCard";
import { JccLogo } from "@/components/wallet/JccLogo";
import { TopupHistory, TransactionList } from "@/components/wallet/History";
import { RenewPasses } from "@/components/wallet/Passes";
import type { SheetMode } from "@/components/wallet/PassSheet";
import { timeAgo } from "@/components/wallet/utils";

// Lazy: the editor sheet only mounts when the user taps to edit.
const PassSheet = lazy(() =>
  import("@/components/wallet/PassSheet").then((m) => ({ default: m.PassSheet })),
);
const CardScanSheet = lazy(() =>
  import("@/components/wallet/CardScanSheet").then((m) => ({ default: m.CardScanSheet })),
);

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Motion Pass · Aloya" },
      {
        name: "description",
        content:
          "Your Cyprus Motion bus card in your pocket. Balance, top-ups, and a scan-ready QR.",
      },
      { property: "og:title", content: "Motion Pass · Aloya" },
      {
        property: "og:description",
        content: "Balance, top-ups, and a scan-ready Motion QR, always with you.",
      },
      { property: "og:url", content: "https://app.aloya.cy/wallet" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-wallet.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "A transit card resting on Cypriot limestone with olive-tree shadow.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://app.aloya.cy/og/og-wallet.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://app.aloya.cy/wallet" }],
  }),
  component: WalletRoute,
});

function WalletRoute() {
  const { t, r } = useRoamI18n();
  const [pass, setPass] = useState<MotionPass>(() => readPass());
  const [editing, setEditing] = useState<"none" | SheetMode>("none");
  const [scanning, setScanning] = useState(false);
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
        const r = await refreshFn({
          data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        });
        if (!r.ok) {
          update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
          if (!opts?.silent) toast.error(t("wallet.toast.expired"));
          return;
        }
        tokens = r.tokens;
        update({ ...current, jcc: { ...current.jcc, ...tokens } });
      }

      const cardUid = current.number.replace(/\D/g, "");
      let res = await syncFn({
        data: { accessToken: tokens.accessToken, cardUid, period: "Last30" },
      });

      // One reactive refresh on 401.
      if (!res.ok && res.code === "expired") {
        const r = await refreshFn({
          data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        });
        if (!r.ok) {
          update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
          if (!opts?.silent) toast.error(t("wallet.toast.expired"));
          return;
        }
        tokens = r.tokens;
        update({ ...current, jcc: { ...current.jcc, ...tokens } });
        res = await syncFn({
          data: { accessToken: tokens.accessToken, cardUid, period: "Last30" },
        });
      }

      if (!res.ok) {
        if (!opts?.silent)
          toast.error(("error" in res && res.error) || t("wallet.toast.syncFailed"));
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
      if (!opts?.silent) toast.success(t("wallet.toast.synced", { n: res.transactions.length }));
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
    toast(t("wallet.unlinkedToast"));
  }

  const checkedLine = pass.balanceUpdatedAt
    ? r("pass.checked", { when: timeAgo(pass.balanceUpdatedAt) })
    : r("pass.tapCheck");

  return (
    <RoamPage
      title={r("pass.title")}
      right={
        <div className="flex items-center gap-2">
          <FrostButton
            variant="white"
            large
            icon="scan"
            label={r("pass.scan")}
            onClick={() => setScanning(true)}
          />
          <FrostButton
            variant="white"
            large
            icon={hasCard ? "pencil-simple" : "plus"}
            label={hasCard ? r("pass.edit") : r("pass.add")}
            onClick={() => setEditing("card")}
          />
        </div>
      }
    >
      <div className="r-pass flex flex-col gap-4 px-1 pb-6">
        <section className="r-rise">
          <MotionCard pass={pass} onTap={() => setEditing("card")} />
        </section>

        {hasCard ? (
          <>
            <section className="r-card r-card--pad r-rise flex items-start justify-between gap-3">
              <button
                type="button"
                className="text-left min-w-0"
                onClick={() => void runPublicSync()}
              >
                <span className="r-lbl block">{r("pass.balance")}</span>
                <span className="r-num-xl block mt-2">€{pass.balanceEur.toFixed(2)}</span>
                <span className="r-lbl block mt-2">{checkedLine}</span>
              </button>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <a
                  className="r-pill r-pill--k r-pill--lg"
                  href={TOPUP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="arrow-up-right" /> {r("pass.topupOnline")}
                </a>
                <button
                  type="button"
                  className="r-pill r-pill--lg"
                  onClick={() => void runPublicSync()}
                >
                  {r("pass.check")}
                </button>
              </div>
            </section>

            <section className="r-card r-rise">
              {linked ? (
                <div className="r-row r-me-row">
                  <JccLogo className="h-9 w-9 shrink-0 rounded-md bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="r-t3 truncate">{r("pass.jccOn")}</p>
                    <p className="r-lbl truncate">
                      {pass.jcc?.displayName || pass.jcc?.email || pass.passName}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="r-pill r-pill--sm"
                    onClick={() => void runSync()}
                  >
                    {syncing ? r("pass.checking") : r("pass.sync")}
                  </button>
                  <button
                    type="button"
                    className="r-pill r-pill--sm r-pill--o"
                    onClick={handleUnlink}
                  >
                    {r("pass.unlink")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="r-row r-me-row w-full text-left"
                  onClick={() => setEditing("link")}
                >
                  <JccLogo className="h-9 w-9 shrink-0 rounded-md bg-white" />
                  <span className="flex-1 min-w-0 text-[16px] font-medium leading-tight">
                    {r("pass.jcc")}
                  </span>
                  <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
                </button>
              )}
            </section>

            {pass.passes && pass.passes.length > 0 && (
              <div className="r-rise">
                <RenewPasses cardNumber={pass.number} passes={pass.passes} />
              </div>
            )}
          </>
        ) : (
          <section className="r-card r-card--pad r-rise">
            <p className="r-t2">{r("pass.emptyTitle")}</p>
            <p className="r-lbl mt-2">{r("pass.emptySub")}</p>
            <button
              type="button"
              className="r-pill r-pill--k r-pill--lg mt-4"
              onClick={() => setEditing("card")}
            >
              <Icon name="plus" /> {r("pass.add")}
            </button>
          </section>
        )}

        <FareTable />

        {hasCard ? (
          <section className="r-rise r-legacy">
            {linked ? (
              <TransactionList transactions={pass.transactions} />
            ) : (
              <TopupHistory pass={pass} />
            )}
          </section>
        ) : null}
      </div>

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

      {scanning && (
        <Suspense fallback={null}>
          <CardScanSheet onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </RoamPage>
  );
}

const TOPUP_URL = "https://www.publictransport.com.cy/topup/page/topup-travel-card";

// Cyprus Public Transport fares (Motion card vs cash) and the Kapnos airport coach.
function FareTable() {
  const { r } = useRoamI18n();
  const rows: [string, string, string | null][] = [
    [r("pass.single"), "€2.00", "€2.70"],
    [r("pass.night"), "€3.50", "€4.70"],
    [r("pass.week"), "€33.40", null],
    [r("pass.kapnos"), "€10.00", null],
  ];
  return (
    <section className="r-card r-card--pad r-rise">
      <div className="r-fare-grid r-lbl">
        <span>{r("pass.fares")}</span>
        <span className="text-right">{r("pass.motion")}</span>
        <span className="text-right">{r("pass.cash")}</span>
      </div>
      {rows.map(([label, motion, cash], i) => (
        <div key={label} className={`r-fare-grid r-fare-row${i ? " r-fare-row--rule" : ""}`}>
          <span className="min-w-0">{label}</span>
          <span className="text-right tabular-nums">{motion}</span>
          <span className="text-right tabular-nums">{cash ?? ""}</span>
        </div>
      ))}
      <p className="r-lbl mt-3">{r("pass.faresNote")}</p>
    </section>
  );
}
