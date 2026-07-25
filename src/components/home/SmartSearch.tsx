import { useState } from "react";
import type { SearchResult } from "@aloya/core/home-search";
import type { AirportCode } from "@/lib/airport.functions";
import { routeTone } from "@/lib/gtfs";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight, IconBus, IconPin, IconPlane, IconSearch } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

export type { SearchResult };

const ROW =
  "group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-limestone-soft transition-colors";
const SUB = "font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-0.5";

export function SmartSearch({
  query,
  setQuery,
  results,
  onPickStop,
  onPickRoute,
  onPickVehicle,
  onPickAirport,
}: {
  query: string;
  setQuery: (s: string) => void;
  results: SearchResult[];
  onPickStop: (stopId: string) => void;
  onPickRoute: (routeId: string) => void;
  onPickVehicle: (tripId: string) => void;
  onPickAirport: (code: AirportCode) => void;
}) {
  const [focused, setFocused] = useState(false);
  const open = focused && query.trim().length > 0;
  const { t: tt } = useI18n();

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <span className="absolute left-4 text-ink-soft">
          <IconSearch className="size-4" />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tt("home.searchPlaceholder")}
          aria-label={tt("home.searchPlaceholder")}
          className="w-full rounded-2xl bg-card py-4 pl-11 pr-4 text-[15px] ring-1 ring-line placeholder:text-ink-soft/60 outline-none focus:ring-aegean-deep/30 transition-all"
        />
        {query.length > 0 && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 rounded-full bg-limestone-soft px-3 py-1.5 font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
          >
            {tt("home.clear")}
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-card ring-1 ring-line shadow-[0_24px_60px_-24px_oklch(0.22_0.012_110/0.25)] overflow-hidden">
          {results.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {tt("home.noMatches")}
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">
                {tt("home.searchHint", { example: "120" })}
              </p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-line">
              {results.map((r) => {
                if (r.kind === "route") {
                  return (
                    <li key={`r-${r.id}`}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickRoute(r.id)}
                        className={ROW}
                      >
                        <RouteChip code={r.code} tone={routeTone(r.id)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-ink truncate">{r.name}</p>
                          <p className={SUB}>
                            {r.city} · {r.liveCount > 0 ? `${r.liveCount} live` : "no live buses"}
                          </p>
                        </div>
                        <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                      </button>
                    </li>
                  );
                }
                if (r.kind === "vehicle") {
                  return (
                    <li key={`v-${r.id}`}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickVehicle(r.tripId)}
                        className={ROW}
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-aegean-soft/60 text-aegean-deep">
                          <IconBus className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-ink truncate">
                            Bus {r.label} <span className="text-ink-soft">line {r.routeCode}</span>
                          </p>
                          <p className={SUB}>{r.sub}</p>
                        </div>
                        <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                      </button>
                    </li>
                  );
                }
                if (r.kind === "airport") {
                  return (
                    <li key={`a-${r.id}`}>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickAirport(r.id as AirportCode)}
                        className={ROW}
                      >
                        <span className="flex size-9 items-center justify-center rounded-xl bg-aegean-soft/60 text-aegean-deep">
                          <IconPlane className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-ink truncate">
                            {r.name} <span className="text-ink-soft">{r.iata}</span>
                          </p>
                          <p className={SUB}>{r.city} · Airport hub</p>
                        </div>
                        <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={`s-${r.id}`}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onPickStop(r.id)}
                      className={ROW}
                    >
                      <span className="flex size-9 items-center justify-center rounded-xl bg-ochre-soft/70 text-ochre">
                        <IconPin className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink truncate">{r.name}</p>
                        <p className={SUB}>{r.sub}</p>
                      </div>
                      <IconArrowUpRight className="size-3.5 text-ink-soft group-hover:text-aegean-deep" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
