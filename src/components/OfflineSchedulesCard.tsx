import { useEffect, useState } from "react";
import {
  clearOfflineSchedules,
  downloadOfflineSchedules,
  formatBytes,
  getOfflineStatus,
  isOfflineCacheSupported,
  type DownloadProgress,
  type OfflineStatus,
} from "@/lib/offline-schedules";
import { useI18n } from "@/lib/i18n";

const DAYS_AHEAD = 7;

export function OfflineSchedulesCard() {
  const { t } = useI18n();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [supported, setSupported] = useState(true);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);


  useEffect(() => {
    setSupported(isOfflineCacheSupported());
    setStatus(getOfflineStatus());
  }, []);

  async function download() {
    setPending(true);
    setMessage(null);
    setProgress({ total: 0, done: 0, currentLabel: t("offline.progress.prep") });
    try {
      const s = await downloadOfflineSchedules({
        daysAhead: DAYS_AHEAD,
        onProgress: (p) => setProgress(p),
      });
      setStatus(s);
      setMessage(
        s.dates.length
          ? t("offline.msg.cached", { n: s.dates.length, size: formatBytes(s.bytes) })
          : t("offline.msg.empty"),
      );
    } catch (e) {
      console.error(e);
      setMessage(e instanceof Error ? e.message : t("offline.msg.fail"));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  async function clear() {
    setPending(true);
    try {
      await clearOfflineSchedules();
      setStatus(null);
      setMessage(t("offline.msg.cleared"));
    } finally {
      setPending(false);
    }
  }


  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const lastWhen = status
    ? new Date(status.lastUpdatedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-paper ring-1 ring-line">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-olive/40 to-transparent" />
      <div className="relative px-6 py-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("offline.kicker")}
            </p>
            <h3 className="font-display text-2xl mt-1 text-ink">
              {t("offline.title1")} <span className="italic text-olive">{t("offline.title2")}</span>
            </h3>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {status ? t("offline.status.cached") : t("offline.status.off")}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {t("offline.body", { days: DAYS_AHEAD })}
        </p>

        {!supported && (
          <p className="mt-3 font-mono text-[11px] tracking-wide text-ochre">
            {t("offline.unsupported")}
          </p>
        )}

        {status && (
          <dl className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-limestone/60 px-4 py-3 ring-1 ring-line/60">
              <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {t("offline.stat.days")}
              </dt>
              <dd className="mt-1 font-display text-2xl text-ink">{status.dates.length}</dd>
            </div>
            <div className="rounded-2xl bg-limestone/60 px-4 py-3 ring-1 ring-line/60">
              <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {t("offline.stat.size")}
              </dt>
              <dd className="mt-1 font-display text-2xl text-ink">
                {formatBytes(status.bytes)}
              </dd>
            </div>
            <div className="rounded-2xl bg-limestone/60 px-4 py-3 ring-1 ring-line/60">
              <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {t("offline.stat.updated")}
              </dt>
              <dd className="mt-1 font-display text-sm text-ink leading-tight">
                {lastWhen}
              </dd>
            </div>
          </dl>
        )}

        {progress && (
          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-limestone-soft">
              <div
                className="h-full bg-gradient-to-r from-aegean to-aegean-deep transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {pct}% — {progress.currentLabel}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="button"
            onClick={download}
            disabled={pending || !supported}
            className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-limestone transition hover:bg-ink/90 disabled:opacity-50"
          >
            {pending ? t("offline.cta.working") : status ? t("offline.cta.refresh") : t("offline.cta.download")}
          </button>
          {status && (
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft underline-offset-4 transition hover:text-ink hover:underline disabled:opacity-50"
            >
              {t("offline.cta.clear")}
            </button>
          )}
        </div>

        {message && (
          <p className="mt-4 font-mono text-[11px] tracking-wide text-ink-soft">
            {message}
          </p>
        )}

      </div>
    </article>
  );
}
