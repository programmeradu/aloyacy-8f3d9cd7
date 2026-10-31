// Saved (Roam): pinned places as rich cards with the next bus near each and a
// one-tap trip, recent destinations with a compact Pin action, the live and
// scheduled trips and arrival promises, and shortcuts to alerts and offline
// timetables (which open in the Me sheet). Home and Work are always-present
// slots at the top of Pinned: empty they offer Set home / Set work.
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ActiveLiveTripCard } from "@/components/saved/ActiveLiveTripCard";
import { ScheduledDeparturesSection } from "@/components/saved/ScheduledDeparturesSection";
import { ArrivalPromisesSection } from "@/components/saved/ArrivalPromisesSection";
import { useNextBus } from "@/components/home/useNextBus";
import { nearestStops } from "@/lib/gtfs";
import {
  clearAnchor,
  removeSavedPlace,
  upsertSavedPlace,
  useRecents,
  useSavedPlaces,
  type AnchorKind,
  type RecentDestination,
  type SavedPlace,
} from "@/lib/trip-store";
import { useRoamI18n } from "@/lib/roam-i18n";
import { RoamPage } from "../RoamPage";
import { Icon } from "../Icon";
import { ConfTag, LinePill } from "../bits";
import { openMeSheet } from "../me-store";
import { PlacePickSheet } from "./PlacePickSheet";

const TONE_CYCLE: SavedPlace["tone"][] = ["aegean", "ochre", "olive"];
const NL_PLAN_KEY = "aloya:nl-plan";

type Place = { label: string; lat: number; lng: number };

function usePlanTo() {
  const navigate = useNavigate();
  return (to: Place) => {
    try {
      sessionStorage.setItem(
        NL_PLAN_KEY,
        JSON.stringify({ from: null, to, leaveByISO: null, arriveByISO: null, rawText: "" }),
      );
    } catch {
      /* private mode: the planner still opens */
    }
    void navigate({ to: "/trips" });
  };
}

function placeIcon(label: string) {
  const l = label.toLowerCase();
  if (/home|house|σπίτι/.test(l)) return "house";
  if (/work|office|δουλει|γραφεί/.test(l)) return "briefcase";
  if (/uni|school|college|σχολ|πανεπ/.test(l)) return "graduation-cap";
  return "map-pin";
}

export function RoamSaved() {
  const { r } = useRoamI18n();
  const all = useSavedPlaces();
  const saved = all.filter((p) => !p.kind);
  const home = all.find((p) => p.kind === "home");
  const work = all.find((p) => p.kind === "work");
  const recents = useRecents();
  const planTo = usePlanTo();
  const [picking, setPicking] = useState<AnchorKind | null>(null);
  const pinnedIds = new Set(all.map((p) => p.id));

  function pinRecent(rec: RecentDestination, label: string) {
    upsertSavedPlace({
      id: rec.id,
      label,
      name: rec.name,
      lat: rec.lat,
      lng: rec.lng,
      tone: TONE_CYCLE[all.length % 3],
      pinned: true,
      createdAt: Date.now(),
    });
  }

  return (
    <RoamPage title={r("sv.title")}>
      <div className="px-1">
        <div className="space-y-4 empty:hidden">
          <ActiveLiveTripCard />
          <ScheduledDeparturesSection />
          <ArrivalPromisesSection />
        </div>

        <h2 className="r-sec-lbl" style={{ marginTop: 8 }}>
          <span>{r("sv.pinned")}</span>
          {all.length > 0 ? <span className="r-tnum">{all.length}</span> : null}
        </h2>
        <div className="space-y-3">
          <AnchorSlot kind="home" place={home} onPlan={planTo} onSet={setPicking} />
          <AnchorSlot kind="work" place={work} onPlan={planTo} onSet={setPicking} />
        </div>
        {saved.length === 0 ? null : (
          <div className="mt-3 space-y-3">
            {saved.map((p) => (
              <PinnedCard key={p.id} place={p} onPlan={planTo} />
            ))}
          </div>
        )}

        <h2 className="r-sec-lbl">{r("sv.recent")}</h2>
        {recents.length === 0 ? (
          <div className="r-card r-card--pad">
            <p className="r-lbl">{r("sv.recentEmpty")}</p>
          </div>
        ) : (
          <div className="r-card" style={{ padding: "2px 0" }}>
            {recents.map((rec) => (
              <RecentRow
                key={rec.id}
                rec={rec}
                pinned={pinnedIds.has(rec.id)}
                onPin={pinRecent}
                onPlan={planTo}
              />
            ))}
          </div>
        )}

        <h2 className="r-sec-lbl">{r("sv.more")}</h2>
        <div className="r-card" style={{ padding: "2px 0" }}>
          <button
            type="button"
            className="r-row w-full text-left"
            onClick={() => openMeSheet("alerts")}
          >
            <span className="r-icobox">
              <Icon name="bell-simple" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium">{r("me.alerts")}</span>
              <span className="r-lbl block">{r("me.alertsSub")}</span>
            </span>
            <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
          </button>
          <button
            type="button"
            className="r-row w-full text-left"
            onClick={() => openMeSheet("offline")}
          >
            <span className="r-icobox">
              <Icon name="cloud-arrow-down" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium">{r("me.offline")}</span>
              <span className="r-lbl block">{r("me.offlineSub")}</span>
            </span>
            <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
          </button>
        </div>
      </div>
      <PlacePickSheet kind={picking} onClose={() => setPicking(null)} />
    </RoamPage>
  );
}

function AnchorSlot({
  kind,
  place,
  onPlan,
  onSet,
}: {
  kind: AnchorKind;
  place: SavedPlace | undefined;
  onPlan: (to: Place) => void;
  onSet: (kind: AnchorKind) => void;
}) {
  const { r } = useRoamI18n();
  if (place)
    return (
      <PinnedCard
        place={place}
        onPlan={onPlan}
        anchor={kind}
        onChange={() => onSet(kind)}
        onRemove={() => clearAnchor(kind)}
      />
    );
  return (
    <button
      type="button"
      className="r-card r-card--pad block w-full text-left"
      onClick={() => onSet(kind)}
    >
      <span className="flex items-center gap-3">
        <span className="r-icobox">
          <Icon name={kind === "home" ? "house" : "briefcase"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="r-t3 block text-[17px]">
            {r(kind === "home" ? "sv.home" : "sv.work")}
          </span>
          <span className="r-lbl mt-0.5 block">{r("sv.anchorEmpty")}</span>
        </span>
        <span className="r-pill r-pill--y r-pill--sm flex-none">
          <Icon name="plus" />
          {r(kind === "home" ? "sv.setHome" : "sv.setWork")}
        </span>
      </span>
    </button>
  );
}

function PinnedCard({
  place,
  onPlan,
  anchor,
  onChange,
  onRemove,
}: {
  place: SavedPlace;
  onPlan: (to: Place) => void;
  anchor?: AnchorKind;
  onChange?: () => void;
  onRemove?: () => void;
}) {
  const { r } = useRoamI18n();
  const title = anchor ? r(anchor === "home" ? "sv.home" : "sv.work") : place.label;
  const coords = { lat: place.lat, lng: place.lng };
  const { bus, nearestStop } = useNextBus({ coords, located: true, pickedStopId: null });
  const near = nearestStops(coords, 1)[0];
  const nearM = near ? Math.round(near.distanceKm * 1000) : null;
  const walkable = nearM != null && nearM <= 1200;
  const stopId = bus?.stopId ?? (walkable ? near?.id : undefined);

  return (
    <article className="r-card r-card--pad">
      <div className="flex items-start gap-3">
        <span className="r-icobox">
          <Icon
            name={anchor ? (anchor === "home" ? "house" : "briefcase") : placeIcon(place.label)}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="r-t3 r-clamp2 break-words text-[17px]">{title}</h3>
          <p className="r-lbl r-clamp2 break-words mt-0.5">{place.name}</p>
        </div>
        {anchor ? (
          <button type="button" className="r-pill r-pill--sm flex-none" onClick={onChange}>
            <Icon name="pencil-simple" />
            {r("sv.change")}
          </button>
        ) : (
          <button
            type="button"
            className="r-pill r-pill--sm"
            aria-label={r("sv.unpin", { place: place.label })}
            onClick={() => removeSavedPlace(place.id)}
          >
            <Icon name="push-pin-slash" />
            {r("sv.unpinShort")}
          </button>
        )}
      </div>

      <div className="r-hair my-4" />

      {bus ? (
        <div>
          <p className="r-lbl">{r("sv.nextNear")}</p>
          <div className="mt-2 flex items-center gap-3">
            <LinePill line={bus.line} tone="y" />
            <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{bus.dest}</span>
            <span className="r-tnum text-[20px] font-medium">
              {bus.etaMin}
              <span className="text-[14px] font-normal"> {r("now.min")}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="r-lbl min-w-0 truncate">
              {r("sv.fromStop", { stop: bus.stopName, min: bus.walkMin ?? 1 })}
            </span>
            <ConfTag
              kind={bus.backing === "live" ? "live" : bus.backing === "estimated" ? "est" : "tt"}
            />
          </div>
        </div>
      ) : (
        <p className="r-lbl">
          {walkable && nearestStop
            ? `${r("sv.noBus")} · ${r("sv.nearestStop", { stop: nearestStop.name, m: nearM ?? 0 })}`
            : r("sv.noStop")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="r-pill r-pill--k r-pill--lg"
          onClick={() => onPlan({ label: title, lat: place.lat, lng: place.lng })}
        >
          <Icon name="path" />
          {r("sv.takeMe")}
        </button>
        {stopId ? (
          <Link to="/stop/$stopId" params={{ stopId }} className="r-pill r-pill--lg">
            <Icon name="bus" />
            {r("sv.stop")}
          </Link>
        ) : null}
        {anchor ? (
          <button
            type="button"
            className="r-pill r-pill--lg"
            aria-label={r("sv.removeAria", { place: title })}
            title={r("sv.remove")}
            onClick={onRemove}
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RecentRow({
  rec,
  pinned,
  onPin,
  onPlan,
}: {
  rec: RecentDestination;
  pinned: boolean;
  onPin: (rec: RecentDestination, label: string) => void;
  onPlan: (to: Place) => void;
}) {
  const { r, locale } = useRoamI18n();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const when = new Date(rec.lastUsed).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="r-row" style={{ ["--r-row-inset" as string]: "64px" }}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={r("sv.planTo", { place: rec.name })}
        onClick={() => onPlan({ label: rec.name, lat: rec.lat, lng: rec.lng })}
      >
        <span className="r-icobox">
          <Icon name="clock-counter-clockwise" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block r-clamp2 break-words text-[16px] font-medium leading-snug">
            {rec.name}
          </span>
          <span className="r-lbl block">{when}</span>
        </span>
      </button>
      {editing ? null : pinned ? (
        <span className="r-conf flex-none">
          <Icon name="push-pin" />
          {r("sv.pinnedTag")}
        </span>
      ) : (
        <button type="button" className="r-pill r-pill--sm" onClick={() => setEditing(true)}>
          <Icon name="push-pin" />
          {r("sv.pin")}
        </button>
      )}
      {editing ? (
        <form
          className="absolute inset-x-3 inset-y-1.5 z-[1] flex items-center gap-2 rounded-[18px] bg-white px-2"
          onSubmit={(e) => {
            e.preventDefault();
            onPin(rec, label.trim() || r("sv.favourite"));
            setEditing(false);
          }}
        >
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label={r("sv.labelAria")}
            placeholder={r("sv.labelPh")}
            className="h-10 min-w-0 flex-1 rounded-[14px] px-3 text-[16px] outline-none"
            style={{ background: "var(--r-pill)" }}
          />
          <button type="submit" className="r-pill r-pill--y">
            {r("sv.save")}
          </button>
          <button type="button" className="r-pill" onClick={() => setEditing(false)}>
            {r("sv.cancel")}
          </button>
        </form>
      ) : null}
    </div>
  );
}
