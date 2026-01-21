import type { MotionPass, MotionTxSnapshot } from "@/lib/motion-pass";
import { fullDate } from "./utils";
import { useI18n } from "@/lib/i18n";

export function TopupHistory({ pass }: { pass: MotionPass }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{t("wallet.history.topupTitle")}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("wallet.history.entries", { n: pass.topups.length })}
        </span>
      </div>
      {pass.topups.length === 0 ? (
        <div className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-6 text-center">
          <p className="text-[13px] text-ink-soft">{t("wallet.history.empty")}</p>
        </div>
      ) : (
        <ol className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line">
          {pass.topups
            .slice()
            .sort((a, b) => b.at - a.at)
            .map((tx) => (
              <li key={tx.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[13px] text-ink">{t("wallet.history.topupRow")}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {fullDate(tx.at)}
                  </p>
                </div>
                <span className="font-sans font-medium text-[18px] text-ink tabular-nums tracking-[-0.02em]">
                  +€{tx.amountEur.toFixed(2)}
                </span>
              </li>
            ))}
        </ol>
      )}
    </>
  );
}

export function TransactionList({ transactions }: { transactions: MotionTxSnapshot[] }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{t("wallet.history.recent")}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("wallet.history.last30")}
        </span>
      </div>
      {transactions.length === 0 ? (
        <div className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-6 text-center">
          <p className="text-[13px] text-ink-soft">{t("wallet.history.noRecent")}</p>
        </div>
      ) : (
        <ol className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line">
          {transactions.map((tx) => {
            const isTopup = tx.type === "Topup";
            const isPositive = isTopup || tx.priceEur === 0;
            return (
              <li key={tx.id} className="flex items-center justify-between p-4 gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink truncate">
                    {isTopup ? t("wallet.history.topupRow") : tx.typeName}
                    {tx.route && !isTopup ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                        {t("wallet.history.route", { code: tx.route })}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-soft truncate">
                    {tx.stopName}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {fullDate(+new Date(tx.at))}
                  </p>
                </div>
                <span
                  className={`font-sans font-medium text-[16px] tabular-nums tracking-[-0.02em] shrink-0 ${
                    isPositive ? "text-aegean-deep" : "text-ink"
                  }`}
                >
                  {isTopup ? "+" : tx.priceEur > 0 ? "−" : ""}€
                  {Math.abs(isTopup ? tx.priceEur || 0 : tx.priceEur).toFixed(2)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
