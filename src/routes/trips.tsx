import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight, IconBriefcase, IconClock, IconHome, IconPin, IconSearch, IconStar } from "@/components/Icons";
import { autocompletePlaces, getPlace, reverseLookup } from "@/lib/maps.functions";
import { planTrip } from "@/lib/journey.functions";
import type { JourneyOption } from "@/lib/journey.server";
import { NICOSIA_CENTER, routeTone } from "@/lib/gtfs";
import {
  pushRecent,
  setActiveTrip,
  useRecents,
  useSavedPlaces,
} from "@/lib/trip-store";
import planHero from "@/assets/plan-hero.jpg";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Plan a trip — Aloya" },
      {
        name: "description",
        content:
          "Door-to-door bus journeys across Cyprus, blending live vehicle data with walking directions.",
      },
    ],
  }),
  component: Plan,
});

type Point = { lat: number; lng: number; label: string };

function Plan() {
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [active, setActive] = useState<"from" | "to" | null>("to");
  const [results, setResults] = useState<JourneyOption[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const planFn = useServerFn(planTrip);
  const reverseFn = useServerFn(reverseLookup);

  // Try to seed origin from geolocation once.
  useEffect(() => {
    if (origin || typeof window === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const { address } = await reverseFn({
            data: { lat: latitude, lng: longitude },
          });
          setOrigin({ lat: latitude, lng: longitude, label: address });
        } catch {
          setOrigin({
            lat: latitude,
            lng: longitude,
            label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          });
        }
      },
      () => {
        // Fall back to Nicosia centre silently.
        setOrigin({
          lat: NICOSIA_CENTER.lat,
          lng: NICOSIA_CENTER.lng,
          label: "Nicosia centre",
        });
      },
      { timeout: 6000 },
    );
  }, [origin, reverseFn]);

  async function runPlan(o: Point, d: Point) {
    setPlanning(true);
    setPlanError(null);
    setResults(null);
    try {
      const res = await planFn({ data: { from: o, to: d } });
      if (res.error) setPlanError(res.error);
      setResults(res.options);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Plan failed");
    } finally {
      setPlanning(false);
    }
  }

  function onPick(point: Point, role: "from" | "to") {
    if (role === "from") {
      setOrigin(point);
      if (destination) void runPlan(point, destination);
      setActive(destination ? null : "to");
    } else {
      setDestination(point);
      pushRecent({ name: point.label, lat: point.lat, lng: point.lng });
      if (origin) void runPlan(origin, point);
      setActive(origin ? null : "from");
    }
  }

  return (
    <AppShell>
      <header className="relative px-6 pt-2 pb-5 animate-rise">
        <img
          src={planHero}
          alt=""
          aria-hidden
          loading="lazy"
          width={1280}
          height={896}
          className="pointer-events-none absolute right-[-30%] top-[-10%] w-[90%] opacity-[0.18] mix-blend-multiply"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          Door to door
        </p>
        <h1 className="font-display text-[40px] leading-[1.04] mt-1.5 text-ink text-balance">
          Tell us <span className="italic text-aegean-deep">where</span>.
          <br />
          We'll find the way.
        </h1>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="rounded-[28px] bg-card ring-1 ring-line p-2">
          <FieldRow
            role="from"
            label="From"
            point={origin}
            active={active === "from"}
            onActivate={() => setActive("from")}
            onClear={() => {
              setOrigin(null);
              setResults(null);
            }}
          />
          <div className="mx-5 h-px bg-line" />
          <FieldRow
            role="to"
            label="To"
            point={destination}
            active={active === "to"}
            onActivate={() => setActive("to")}
            onClear={() => {
              setDestination(null);
              setResults(null);
            }}
          />
        </div>

        {active && (
          <PlacesPicker
            role={active}
            bias={origin ?? NICOSIA_CENTER}
            onPick={onPick}
          />
        )}
      </section>

      <section
        className="mt-7 px-6 animate-rise"
        style={{ animationDelay: "140ms" }}
      >
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl text-ink">
            {results === null && !planning ? "Suggestions" : "Best routes"}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {planning ? "Computing" : results ? "Live blended" : "Idle"}
          </span>
        </div>

        {!results && !planning && (
          <EmptyState origin={origin} destination={destination} />
        )}

        {planning && <PlanningSkeleton />}

        {planError && (
          <p className="rounded-3xl bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
            {planError}
          </p>
        )}

        {results && results.length === 0 && !planning && (
          <div className="rounded-3xl bg-card p-6 ring-1 ring-line">
            <p className="font-display text-xl text-ink">No live route found</p>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              We couldn't see a bus serving both your start and end stops in the
              next hour. Try a destination closer to a known route, or check
              again in a few minutes.
            </p>
          </div>
        )}

        {results && results.length > 0 && origin && destination && (
          <div className="flex flex-col gap-3">
            {results.map((opt, i) => (
              <JourneyCard
                key={opt.id}
                option={opt}
                highlight={i === 0}
                origin={origin}
                destination={destination}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function EmptyState({
  origin,
  destination,
}: {
  origin: Point | null;
  destination: Point | null;
}) {
  return (
    <div className="rounded-[28px] bg-card p-6 ring-1 ring-line">
      <p className="font-display text-lg text-ink leading-tight text-balance">
        {origin && !destination
          ? "Where would you like to go?"
          : "Pick a starting point and a destination, anywhere on the island."}
      </p>
      <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">
        We'll walk you to the nearest stop, board a real bus from the live feed,
        and walk you to the front door. No more guessing which line passes by.
      </p>
    </div>
  );
}

function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 rounded-3xl bg-card ring-1 ring-line animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

function FieldRow({
  role,
  label,
  point,
  active,
  onActivate,
  onClear,
}: {
  role: "from" | "to";
  label: string;
  point: Point | null;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  return (
    <button
      onClick={onActivate}
      className={`group flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left transition-colors ${
        active ? "bg-limestone-soft" : "hover:bg-limestone-soft/60"
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full ring-1 ${
          role === "from"
            ? "bg-aegean-soft/60 text-aegean-deep ring-aegean-soft"
            : "bg-ochre-soft text-ochre ring-ochre-soft"
        }`}
      >
        {role === "from" ? (
          <span className="block size-2 rounded-full bg-current" />
        ) : (
          <IconPin className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
          {label}
        </p>
        <p
          className={`truncate text-[15px] ${
            point ? "text-ink font-medium" : "text-ink-soft"
          }`}
        >
          {point?.label ?? (role === "from" ? "Detecting your location…" : "Search a place, address or stop")}
        </p>
      </div>
      {point && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
        >
          Clear
        </span>
      )}
    </button>
  );
}

function PlacesPicker({
  role,
  bias,
  onPick,
}: {
  role: "from" | "to";
  bias: { lat: number; lng: number };
  onPick: (p: Point, role: "from" | "to") => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { placeId: string; primary: string; secondary: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await acFn({ data: { query, bias } });
        setSuggestions(res.suggestions);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(debounce.current);
  }, [query, bias, acFn]);

  async function choose(placeId: string) {
    const place = await placeFn({ data: { placeId } });
    onPick(
      {
        lat: place.lat,
        lng: place.lng,
        label: place.name === place.address ? place.name : `${place.name}`,
      },
      role,
    );
  }

  return (
    <div className="mt-3 rounded-[24px] bg-card ring-1 ring-line overflow-hidden">
      <div className="relative flex items-center">
        <span className="absolute left-4 text-ink-soft">
          <IconSearch className="size-4" />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={role === "from" ? "From where?" : "Where to?"}
          className="w-full bg-transparent py-4 pl-11 pr-4 text-[15px] outline-none placeholder:text-ink-soft/60"
        />
        {loading && (
          <span className="absolute right-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Searching
          </span>
        )}
      </div>
      {query.trim().length < 2 ? (
        <QuickPicks role={role} onChoose={(p) => onPick(p, role)} />
      ) : (
        suggestions.length > 0 && (
          <ul className="divide-y divide-line">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.placeId}>
                <button
                  onClick={() => choose(s.placeId)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-limestone-soft"
                >
                  <IconPin className="size-4 text-aegean-deep shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">
                      {s.primary}
                    </p>
                    {s.secondary && (
                      <p className="truncate text-[11px] text-ink-soft">
                        {s.secondary}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

// Contextual glyph for a saved place based on its user-chosen label.
function labelGlyph(label: string) {
  const l = label.trim().toLowerCase();
  if (/(home|house|maison|σπίτι)/.test(l)) return IconHome;
  if (/(work|office|job|γραφεί)/.test(l)) return IconBriefcase;
  if (/(fav|love|star|heart|αγαπ)/.test(l)) return IconStar;
  return IconPin;
}

function QuickPicks({
  role,
  onChoose,
}: {
  role: "from" | "to";
  onChoose: (p: Point) => void;
}) {
  const saved = useSavedPlaces();
  const recents = useRecents();
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <div className="border-t border-line p-4 space-y-4">
      {saved.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-ink-soft">
            <IconPin className="size-3.5" strokeWidth={1.4} />
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-wrap gap-2">
            {saved.map((p) => {
              const Glyph = labelGlyph(p.label);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    onChoose({ lat: p.lat, lng: p.lng, label: p.name })
                  }
                  className="group inline-flex items-center gap-2 rounded-full bg-limestone-soft px-3.5 py-2 text-[12px] text-ink transition-colors hover:bg-aegean-soft/60"
                  aria-label={`${p.label}: ${p.name}`}
                >
                  <Glyph className="size-3.5 text-aegean-deep" strokeWidth={1.4} />
                  <span>
                    {p.name.length > 24 ? `${p.name.slice(0, 24)}…` : p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {recents.length > 0 && role === "to" && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-ink-soft">
            <IconClock className="size-3.5" strokeWidth={1.4} />
            <span className="h-px flex-1 bg-line" />
          </div>
          <ul className="divide-y divide-line">
            {recents.slice(0, 5).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() =>
                    onChoose({ lat: r.lat, lng: r.lng, label: r.name })
                  }
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <IconClock className="size-4 text-ink-soft shrink-0" />
                  <span className="truncate text-[13px] text-ink">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function JourneyCard({
  option,
  highlight,
  origin,
  destination,
}: {
  option: JourneyOption;
  highlight: boolean;
  origin: Point;
  destination: Point;
}) {
  const navigate = useNavigate();
  function start() {
    setActiveTrip({
      startedAt: Date.now(),
      option,
      from: origin,
      to: destination,
    });
    void navigate({ to: "/trip/$id", params: { id: option.id } });
  }
  const bus = option.legs.find((l) => l.kind === "bus");
  if (!bus || bus.kind !== "bus") return null;
  const totalMin = Math.round(option.totalDurationSec / 60);
  const departIn = Math.max(0, Math.round((option.departureUnix - Date.now() / 1000) / 60));
  const departTime = useMemo(
    () =>
      new Date(option.departureUnix * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [option.departureUnix],
  );
  const arriveTime = useMemo(
    () =>
      new Date(option.arrivalUnix * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [option.arrivalUnix],
  );

  const delayLabel =
    bus.delaySec > 60
      ? `${Math.round(bus.delaySec / 60)} min late`
      : bus.delaySec < -60
      ? `${Math.round(-bus.delaySec / 60)} min early`
      : "On time";

  return (
    <article
      className={`rounded-[28px] p-5 transition-all ${
        highlight
          ? "bg-card ring-2 ring-aegean-deep/40 shadow-[0_18px_50px_-30px_rgba(15,60,80,0.35)]"
          : "bg-card ring-1 ring-line"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {highlight ? "Fastest live" : "Alternative"} — leaves in {departIn} min
          </p>
          <h3 className="mt-1 font-display text-[26px] leading-tight text-ink text-pretty">
            Board at <span className="text-aegean-deep">{bus.board.name}</span>
          </h3>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-display text-4xl leading-none ${highlight ? "text-aegean-deep" : "text-ink"}`}>
            {totalMin}
            <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              min
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <RouteChip code={bus.routeShort} tone={routeTone(bus.routeId)} />
        <p className="text-[12px] text-ink-soft truncate">{bus.routeLong}</p>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
            bus.delaySec > 60
              ? "text-ochre"
              : bus.delaySec < -60
              ? "text-olive"
              : "text-aegean-deep"
          }`}
        >
          {delayLabel}
        </span>
      </div>

      <ol className="mt-5 space-y-3">
        {option.legs.map((leg, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${
                leg.kind === "bus"
                  ? "bg-aegean-deep text-white"
                  : "bg-limestone-soft text-ink-soft ring-1 ring-line"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              {leg.kind === "walk" ? (
                <>
                  <p className="text-[13px] text-ink">
                    Walk to {leg.to.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {Math.max(1, Math.round(leg.durationSec / 60))} min — {Math.round(leg.distanceMeters)} m
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-ink">
                    Ride to {leg.alight.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {departTime} → {arriveTime}
                  </p>
                </>
              )}
            </div>
            {leg.kind === "bus" && (
              <IconClock className="size-4 text-ink-soft mt-1.5" />
            )}
          </li>
        ))}
      </ol>

      <button
        onClick={start}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors ${
          highlight
            ? "bg-ink text-limestone hover:bg-ink/90"
            : "bg-limestone-soft text-ink hover:bg-limestone-soft/70"
        }`}
      >
        Start this trip
        <IconArrowUpRight className="size-3.5" />
      </button>
    </article>
  );
}
