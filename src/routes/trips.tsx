import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import type { Itinerary, RideLeg } from "@/lib/itinerary-types";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { nearestCity } from "@/lib/cities";
import { pushRecent, setActiveTrip } from "@/lib/trip-store";
import { getTripSuggestions } from "@/lib/suggestions.functions";
import { getDeviceId } from "@/lib/pwa";
import planHero from "@/assets/plan-hero.jpg";
import type { Point } from "@/lib/plan-types";
import { formatYYYYMMDD, itineraryToJourneyOption } from "@/lib/plan-bridge";
import { ItineraryResults } from "@/components/plan/ItineraryResults";
import { PlacesPickerSheet } from "@/components/plan/PlacesPicker";
import {
  EmptyState,
  FieldRow,
  PersonalSuggestions,
  PlanningSkeleton,
  TimeIntentChip,
} from "@/components/plan/PlanPieces";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/useAuth";
import {
  ArrivalPromiseCommit,
  ArrivalPromiseWatchList,
} from "@/components/plan/ArrivalPromiseCard";
import { useI18n } from "@/lib/i18n";
import { useAccessibilityPrefs } from "@/lib/useAccessibilityPrefs";
import { isActive as isA11yActive } from "@/lib/accessibility-prefs";
import { ParkAndRideCard } from "@/components/ParkAndRideCard";
import { LastMileChainCard } from "@/components/LastMileChainCard";
import { BikeShareCard } from "@/components/BikeShareCard";
import { BoltScooterCard } from "@/components/BoltScooterCard";
import { DustAdvisoryBanner } from "@/components/DustAdvisoryBanner";
import { TrafficAlertsCard } from "@/components/TrafficAlertsCard";
import { KapnosBlock } from "@/components/plan/KapnosBlock";
import { useTripSeed } from "@/components/plan/useTripSeed";
import { useTripSideQueries } from "@/components/plan/useTripSideQueries";
import {
  a11yCacheKey,
  isoToUnix,
  toPlanA11y,
  useTripPlanQuery,
} from "@/components/plan/tripPlanQuery";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Plan a trip — Aloya" },
      {
        name: "description",
        content:
          "Door-to-door bus journeys across Cyprus, blending live vehicle data with walking directions.",
      },
      { property: "og:title", content: "Plan a trip — Aloya" },
      {
        property: "og:description",
        content: "Door-to-door across Cyprus. Live buses, walking, transfers — one calm view.",
      },
      { property: "og:url", content: "https://app.aloya.cy/trips" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-trips.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Cypriot aegean-blue shutters slightly ajar on a sun-warmed limestone wall.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://app.aloya.cy/og/og-trips.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "en", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "el", href: "https://app.aloya.cy/trips" },
      { rel: "alternate", hrefLang: "x-default", href: "https://app.aloya.cy/trips" },
    ],
  }),
  component: Plan,
});

function Plan() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const {
    origin,
    destination,
    active,
    timeIntent,
    setOrigin,
    setDestination,
    setActive,
    setTimeIntent,
  } = useTripSeed();

  const { session } = useAuth();
  const fetchSuggestions = useServerFn(getTripSuggestions);
  const { data: suggData } = useQuery({
    queryKey: ["trip-suggestions", session?.user?.id ?? null],
    queryFn: async () => {
      const { getDeviceToken, getAccessToken } = await import("@/lib/pwa");
      const [token, accessToken] = await Promise.all([getDeviceToken(), getAccessToken()]);
      if (!token) return { suggestions: [] };
      return fetchSuggestions({
        data: { deviceId: getDeviceId(), deviceToken: token, accessToken },
      });
    },
    staleTime: 5 * 60 * 1000,
    enabled: typeof window !== "undefined",
  });
  const personalSuggestions = suggData?.suggestions ?? [];

  // Fresher vehicle positions mean the planner has fresher signals to chew on.
  const { data: rt } = useRealtime();
  const rtTick = rt?.fetchedAt ?? 0;

  const { prefs: a11yPrefs } = useAccessibilityPrefs();
  const a11yOn = isA11yActive(a11yPrefs);
  const a11yKey = a11yCacheKey(a11yPrefs, a11yOn);
  const a11y = toPlanA11y(a11yPrefs, a11yOn);

  const {
    query: planQuery,
    results,
    top,
  } = useTripPlanQuery({
    origin,
    destination,
    timeIntent,
    a11y,
    a11yKey,
    rtTick,
  });
  const planning = planQuery.isFetching && !planQuery.data;
  const isOnline = useOnlineStatus();
  const planError = !isOnline
    ? "Offline: Multi-leg trip planning requires an internet connection. Active trip guidance and saved routes remain available."
    : planQuery.error
      ? planQuery.error instanceof Error && planQuery.error.message !== "planner_unavailable"
        ? planQuery.error.message
        : t("trips.planFailed")
      : null;


  const extras = useTripSideQueries({
    origin,
    destination,
    topItinerary: top,
    timeIntent,
    a11y,
    a11yKey,
  });

  const arriveByUnix = isoToUnix(timeIntent?.arriveByISO) ?? null;

  function onPick(point: Point, role: "from" | "to") {
    if (role === "from") {
      setOrigin(point);
      setActive(destination ? null : "to");
    } else {
      setDestination(point);
      pushRecent({ name: point.label, lat: point.lat, lng: point.lng });
      setActive(origin ? null : "from");
    }
  }

  function startPlannedItinerary(itinerary: Itinerary, from: Point, to: Point) {
    const option = itineraryToJourneyOption(itinerary);
    if (!option) return;
    const rides = itinerary.legs.filter((l): l is RideLeg => l.kind === "ride");
    const isSingleRide = rides.length === 1;
    setActiveTrip({
      startedAt: Date.now(),
      option,
      from,
      to,
      itinerary: isSingleRide ? undefined : itinerary,
      legState: isSingleRide
        ? undefined
        : { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } },
    });
    void navigate({ to: "/trip/$id", params: { id: option.id } });
  }

  const kapnosBlock = (
    <KapnosBlock
      extras={extras}
      origin={origin}
      destination={destination}
      onSetOrigin={(p) => {
        setOrigin(p);
        setActive(null);
      }}
      onSetDestination={(p) => {
        setDestination(p);
        setActive(null);
      }}
      onStartItinerary={startPlannedItinerary}
    />
  );

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
          {t("trips.kicker")}
        </p>
        <h1 className="font-display text-[40px] leading-[1.04] mt-1.5 text-ink text-balance">
          {t("trips.titlePrefix")}{" "}
          <span className="italic text-aegean-deep">{t("trips.titleEmph")}</span>.
          <br />
          {t("trips.titleSuffix")}
        </h1>
      </header>

      <section className="px-6 animate-rise" style={{ animationDelay: "60ms" }}>
        <div className="rounded-[28px] bg-card ring-1 ring-line p-2">
          <FieldRow
            role="from"
            label={t("trips.from")}
            point={origin}
            active={active === "from"}
            onActivate={() => setActive("from")}
            onClear={() => setOrigin(null)}
          />
          <div className="mx-5 h-px bg-line" />
          <FieldRow
            role="to"
            label={t("trips.to")}
            point={destination}
            active={active === "to"}
            onActivate={() => setActive("to")}
            onClear={() => setDestination(null)}
          />
        </div>

        <TimeIntentChip
          intent={timeIntent}
          onChange={setTimeIntent}
          onClear={() => setTimeIntent(null)}
        />

        <PlacesPickerSheet
          open={active !== null}
          role={active ?? "to"}
          // Wave 2.5 — bias autocomplete to the rider's actual city.
          bias={origin ? nearestCity(origin.lat, origin.lng).center : NICOSIA_CENTER}
          onClose={() => setActive(null)}
          onPick={onPick}
        />
      </section>

      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "120ms" }}>
        <ArrivalPromiseWatchList />
      </section>

      <section className="mt-7 px-6 animate-rise" style={{ animationDelay: "140ms" }}>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl text-ink">
            {results === null && !planning
              ? personalSuggestions.length > 0
                ? t("trips.yourUsuals")
                : t("trips.suggestions")
              : t("trips.bestRoutes")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
            {planning
              ? t("trips.statusComputing")
              : results
                ? t("trips.statusLive")
                : personalSuggestions.length > 0
                  ? t("trips.statusLearned")
                  : t("trips.statusIdle")}
          </span>
        </div>

        {!results && !planning && personalSuggestions.length === 0 && (
          <EmptyState origin={origin} destination={destination} />
        )}

        {!results && !planning && personalSuggestions.length > 0 && (
          <PersonalSuggestions
            items={personalSuggestions}
            onPick={(s) => {
              setDestination({ lat: s.toLat, lng: s.toLng, label: s.toLabel });
              pushRecent({ name: s.toLabel, lat: s.toLat, lng: s.toLng });
              setActive(null);
              if (!origin) setOrigin({ lat: s.fromLat, lng: s.fromLng, label: s.fromLabel });
            }}
          />
        )}

        {planning && <PlanningSkeleton />}

        {planError && (
          <p className="rounded-3xl bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
            {planError}
          </p>
        )}

        {results && results.length === 0 && !planning && (
          <div className="flex flex-col gap-3">
            {kapnosBlock}
            <div className="rounded-3xl bg-card p-6 ring-1 ring-line">
              {planQuery.data?.noScheduleAvailable ? (
                <>
                  <p className="font-display text-xl text-ink">{t("trips.noScheduleTitle")}</p>
                  <p className="mt-1.5 text-[13px] text-ink-soft">
                    {t("trips.noScheduleBody", {
                      date: planQuery.data.requestedDate
                        ? formatYYYYMMDD(planQuery.data.requestedDate)
                        : t("trips.noScheduleDay"),
                    })}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl text-ink">{t("trips.noRouteTitle")}</p>
                  <p className="mt-1.5 text-[13px] text-ink-soft">{t("trips.noRouteBody")}</p>
                </>
              )}
            </div>
          </div>
        )}

        {results && results.length > 0 && origin && destination && (
          <div className="flex flex-col gap-3">
            {extras.dustAdvisory && <DustAdvisoryBanner advisory={extras.dustAdvisory} />}
            {arriveByUnix != null && (
              <ArrivalPromiseCommit
                origin={origin}
                destination={destination}
                targetArrivalUnix={arriveByUnix}
              />
            )}
            {kapnosBlock}
            {extras.parkAndRide && (
              <ParkAndRideCard
                suggestion={extras.parkAndRide}
                origin={{ lat: origin.lat, lng: origin.lng }}
              />
            )}
            {extras.bikeShare && <BikeShareCard suggestion={extras.bikeShare} />}
            {extras.boltScooter && <BoltScooterCard suggestion={extras.boltScooter} />}
            {extras.trafficReport && <TrafficAlertsCard report={extras.trafficReport} />}
            <ItineraryResults results={results} origin={origin} destination={destination} />
            {extras.lastMileChain && <LastMileChainCard suggestion={extras.lastMileChain} />}
          </div>
        )}
      </section>
    </AppShell>
  );
}
