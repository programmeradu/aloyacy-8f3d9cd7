// Full-height sheet behind the home "Ask Aloya or search a stop" pill. It hosts
// the two existing flows unchanged: SmartSearch (stops, routes, live buses,
// airports, pages) and the Ask Aloya natural-language planner. In "pick" mode
// (from the no-location card) it only offers stops and saves the choice.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { SmartSearch } from "@/components/home/SmartSearch";
import { useHomeSearch } from "@/components/home/useHomeSearch";
import { NLPlannerCard } from "@/components/NLPlannerCard";
import { useI18n } from "@/lib/i18n";
import { Ph } from "./SkyIcons";

type Vehicle = { id: string; tripId: string; routeId: string; label: string; lat: number; lng: number };

export function SkySearchSheet({
  open,
  mode,
  voice,
  onClose,
  vehicles,
  coords,
  onPickedStop,
  onUseNearest,
  hasPickedStop,
}: {
  open: boolean;
  mode: "search" | "pick";
  voice: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  coords: { lat: number; lng: number };
  onPickedStop: (stopId: string) => void;
  onUseNearest: () => void;
  hasPickedStop: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const all = useHomeSearch(query, vehicles, coords);
  const results = useMemo(() => (mode === "pick" ? all.filter((r) => r.kind === "stop") : all), [all, mode]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const go = (fn: () => void) => {
    onClose();
    fn();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-center" role="dialog" aria-modal="true" aria-label={mode === "pick" ? t("sky.sheet.pickTitle") : t("sky.sheet.title")}>
      <button type="button" aria-label={t("sky.sheet.close")} className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative mt-[max(env(safe-area-inset-top),24px)] flex w-full max-w-[430px] flex-col rounded-t-[32px] bg-limestone shadow-2xl animate-rise overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-[22px] text-ink">{mode === "pick" ? t("sky.sheet.pickTitle") : t("sky.sheet.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sky.sheet.close")}
            className="flex size-11 items-center justify-center rounded-full bg-limestone-soft text-ink ring-1 ring-line"
          >
            <Ph name="x" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
          {mode === "pick" ? <p className="mb-3 text-[13px] font-medium text-ink-soft">{t("sky.sheet.pickHint")}</p> : null}
          <div className="relative z-10">
            <SmartSearch
              autoFocus={!voice}
              query={query}
              setQuery={setQuery}
              results={results}
              onPickStop={(stopId) => {
                if (mode === "pick") {
                  onPickedStop(stopId);
                  onClose();
                  return;
                }
                go(() => navigate({ to: "/stop/$stopId", params: { stopId } }));
              }}
              onPickRoute={(routeId) => go(() => navigate({ to: "/route/$routeId", params: { routeId } }))}
              onPickVehicle={(tripId) => {
                if (tripId) go(() => navigate({ to: "/trip-info/$tripId", params: { tripId } }));
              }}
              onPickAirport={(code) => go(() => navigate({ to: "/airport/$code", params: { code } }))}
              onPickPage={(path) => {
                if (path === "/green-line") go(() => navigate({ to: "/green-line" }));
              }}
            />
          </div>
          {mode === "pick" && hasPickedStop ? (
            <button
              type="button"
              className="mt-3 h-11 rounded-full px-4 text-[13px] font-semibold text-aegean-deep ring-1 ring-line"
              onClick={() => {
                onUseNearest();
                onClose();
              }}
            >
              {t("sky.sheet.useNearest")}
            </button>
          ) : null}
          {mode === "search" ? (
            <>
              <p className="mt-6 mb-2 font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">{t("sky.sheet.ask")}</p>
              <NLPlannerCard autoVoice={voice} />
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
