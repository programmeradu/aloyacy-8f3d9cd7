// Go tab, before a destination is set (Roam): travel-by preference tiles
// (step free, shaded stops, short walks; real accessibility prefs that feed
// the planner), saved place chips with the airport, and recent destinations.
import { Icon } from "@/components/roam/Icon";
import { NotchCard } from "@/components/roam/NotchCard";
import { FrostButton } from "@/components/roam/FrostButton";
import { FieldRow } from "./PlanPieces";
import { useHereAddress } from "./useHereAddress";
import { useRoamI18n } from "@/lib/roam-i18n";
import { useRecents, useSavedPlaces } from "@/lib/trip-store";
import type { AccessibilityPrefs } from "@/lib/accessibility-prefs";
import type { Point } from "@/lib/plan-types";

/** Larnaca International Airport (LCA), public coordinates. */
const LCA: Point = { lat: 34.8751, lng: 33.6249, label: "Larnaca Airport" };

export function GoHome({
  onPickDestination,
  prefs: a11yPrefs,
  onUpdatePrefs: updateA11y,
}: {
  onPickDestination: (p: Point) => void;
  /** The planner's own prefs state, so a toggle replans immediately. */
  prefs: AccessibilityPrefs;
  onUpdatePrefs: (patch: Partial<AccessibilityPrefs>) => void;
}) {
  const { r } = useRoamI18n();
  const pickDest = onPickDestination;
  const recents = useRecents().slice(0, 4);
  const saved = useSavedPlaces()
    .filter((p) => p.pinned)
    .slice(0, 3);
  const placeChips = [
    ...saved.map((p) => ({
      key: p.id,
      icon: /home|σπίτι/i.test(p.label)
        ? "house"
        : /uni|πανεπ/i.test(p.label)
          ? "graduation-cap"
          : /work|office|δουλ/i.test(p.label)
            ? "briefcase"
            : "map-pin",
      label: p.label,
      point: { lat: p.lat, lng: p.lng, label: p.name || p.label } as Point,
    })),
    { key: "lca", icon: "airplane-tilt", label: r("now.airport"), point: LCA },
  ];
  const tiles: {
    key: "stepFree" | "preferShade" | "shortWalk";
    icon: string;
    label: string;
    on: boolean;
    toggle: () => void;
  }[] = [
    {
      key: "stepFree",
      icon: "wheelchair",
      label: r("go.stepFree"),
      on: a11yPrefs.stepFree,
      toggle: () => updateA11y({ stepFree: !a11yPrefs.stepFree, lowFloor: !a11yPrefs.stepFree }),
    },
    {
      key: "preferShade",
      icon: "umbrella-simple",
      label: r("go.shade"),
      on: a11yPrefs.preferShade,
      toggle: () => updateA11y({ preferShade: !a11yPrefs.preferShade }),
    },
    {
      key: "shortWalk",
      icon: "person-simple-walk",
      label: r("go.shortWalk"),
      on: a11yPrefs.maxWalkMeters != null,
      toggle: () => updateA11y({ maxWalkMeters: a11yPrefs.maxWalkMeters != null ? null : 500 }),
    },
  ];

  return (
    <>
      <p className="r-sec-lbl">{r("go.travelBy")}</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={r("go.travelBy")}>
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={tile.toggle}
            aria-pressed={tile.on}
            className="r-card relative flex h-[92px] flex-col items-center justify-center gap-2 px-2 text-center"
            style={{
              borderRadius: 22,
              boxShadow: tile.on ? "inset 0 0 0 1.5px var(--r-ink)" : undefined,
            }}
          >
            <span
              className="absolute right-2.5 top-2.5 flex size-[18px] items-center justify-center rounded-full"
              style={
                tile.on ? { background: "var(--r-y)" } : { boxShadow: "inset 0 0 0 1.5px #c9c9c4" }
              }
              aria-hidden="true"
            >
              {tile.on ? <Icon name="check" size={11} /> : null}
            </span>
            <Icon name={tile.icon} size={26} />
            <span className="text-[14px] leading-tight">{tile.label}</span>
          </button>
        ))}
      </div>

      <div className="r-hscroll mt-4">
        {placeChips.map((c) => (
          <button
            key={c.key}
            type="button"
            className="r-pill r-pill--w r-pill--lg"
            onClick={() => pickDest(c.point)}
          >
            <Icon name={c.icon} />
            {c.label}
          </button>
        ))}
      </div>

      {recents.length > 0 && (
        <>
          <p className="r-sec-lbl">{r("go.recent")}</p>
          <div className="r-card overflow-hidden">
            {recents.map((rc) => (
              <button
                key={rc.id}
                type="button"
                className="r-row w-full text-left"
                onClick={() => pickDest({ lat: rc.lat, lng: rc.lng, label: rc.name })}
              >
                <span className="r-icobox">
                  <Icon name="clock-counter-clockwise" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[16px]">{rc.name}</span>
                <Icon name="arrow-up-right" size={17} style={{ color: "var(--r-mute)" }} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** From / To notched card with the docked swap button. */
export function GoFromTo({
  origin,
  destination,
  active,
  setActive,
  setOrigin,
  setDestination,
  onLocate,
  locating,
  geoDenied,
}: {
  origin: Point | null;
  destination: Point | null;
  active: "from" | "to" | null;
  setActive: (a: "from" | "to" | null) => void;
  setOrigin: (p: Point | null) => void;
  setDestination: (p: Point | null) => void;
  onLocate?: () => void;
  locating?: boolean;
  geoDenied?: boolean;
}) {
  const { r } = useRoamI18n();
  const here = origin && origin.label === r("go.yourLocation") ? origin : null;
  const hereStreet = useHereAddress(here);
  return (
    <section className="r-rise">
      <NotchCard
        radius={28}
        shadow="drop-shadow(0 10px 24px rgba(0,0,0,.06))"
        notches={[
          {
            edge: "bottom",
            cx: -64,
            width: 92,
            depth: 22,
            dock: (
              <FrostButton
                icon="arrows-down-up"
                label={r("go.swap")}
                variant="white"
                onClick={() => {
                  setOrigin(destination);
                  setDestination(origin);
                }}
              />
            ),
          },
        ]}
      >
        <div className="px-2 pt-2 pb-5">
          <FieldRow
            role="from"
            label={r("go.from")}
            point={origin}
            active={active === "from"}
            onActivate={() => setActive("from")}
            onClear={() => setOrigin(null)}
            sub={here ? hereStreet : null}
            emptyText={geoDenied ? r("go.choose") : undefined}
            onLocate={onLocate}
            locating={locating}
            locateLabel={r("go.pkLocate")}
          />
          <div className="r-hair mx-3 ml-10" />
          <FieldRow
            role="to"
            label={r("go.to")}
            point={destination}
            active={active === "to"}
            onActivate={() => setActive("to")}
            onClear={() => setDestination(null)}
          />
        </div>
      </NotchCard>
    </section>
  );
}
