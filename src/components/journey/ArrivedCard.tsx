import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import type { ActiveTrip } from "@/lib/trip-store";
import { clearActiveTrip } from "@/lib/trip-store";

export function ArrivedCard({ trip }: { trip: ActiveTrip }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <section className="px-6 animate-rise">
      <div className="rounded-[28px] bg-olive-soft ring-1 ring-olive/30 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-olive">
          {t("hud.arrived.label")}
        </p>
        <p className="mt-2 font-display text-[26px] leading-tight text-ink">
          {t("hud.arrived.title", { name: trip.to.label })}
        </p>
        <button
          onClick={() => {
            clearActiveTrip();
            navigate({ to: "/" });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          {t("hud.arrived.done")}
        </button>
      </div>
    </section>
  );
}
