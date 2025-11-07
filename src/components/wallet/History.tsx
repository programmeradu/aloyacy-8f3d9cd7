import type { MotionPass, MotionTxSnapshot } from "@/lib/motion-pass";
import { fullDate } from "./utils";

export function TopupHistory({ pass }: { pass: MotionPass }) {
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
                <span className="font-sans font-medium text-[18px] text-ink tabular-nums tracking-[-0.02em]">
                  +€{t.amountEur.toFixed(2)}
                </span>
              </li>
            ))}
        </ol>
      )}
    </>
  );
}

export function TransactionList({ transactions }: { transactions: MotionTxSnapshot[] }) {
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
