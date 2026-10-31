import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { IconArrowUpRight } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { planTrip } from "@/lib/journey.functions";
import type { ActiveTrip } from "@/lib/trip-store";
import { setActiveTrip, clearActiveTrip } from "@/lib/trip-store";

export function MissedBusCard({ trip }: { trip: ActiveTrip }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fetchPlan = useServerFn(planTrip);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rescue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { options, error } = await fetchPlan({
        data: {
          from: { lat: trip.from.lat, lng: trip.from.lng },
          to: { lat: trip.to.lat, lng: trip.to.lng },
        },
      });
      if (error || !options || options.length === 0) {
        setErr(error ?? t("hud.missed.err"));
        return;
      }
      const next = options[0];
      setActiveTrip({
        startedAt: Date.now(),
        option: next,
        from: trip.from,
        to: trip.to,
        live: { startedAt: Date.now() },
      });
      navigate({ to: "/trip/$id", params: { id: next.id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("hud.missed.err"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
        <p className="text-[12px] text-ochre">
          {t("hud.missed.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.missed.title")}
        </p>
        <p className="mt-1 text-[13px] text-ink-soft">
          {t("hud.missed.body", { name: trip.to.label })}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            disabled={loading}
            onClick={rescue}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone disabled:opacity-60"
          >
            {loading ? t("hud.missed.finding") : t("hud.missed.find")}
            <IconArrowUpRight className="size-3.5" />
          </button>
          <button
            onClick={() => {
              clearActiveTrip();
              navigate({ to: "/trips" });
            }}
            className="inline-flex items-center gap-2 rounded-full bg-card ring-1 ring-line px-5 py-3 text-[13px] text-ink"
          >
            {t("trip.endTrip")}
          </button>
        </div>
        {err && <p className="mt-3 font-mono text-[11px] text-ochre">{err}</p>}
      </div>
    </section>
  );
}
