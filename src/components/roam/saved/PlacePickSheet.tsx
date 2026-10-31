// Set home or work (Roam): a sheet with one place search (the app's geocoder,
// biased to where you are) and a "Use my current location" row. Picking a
// result stores it as the home or work anchor in the saved-places store.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { autocompletePlaces, getPlace, reverseLookup } from "@/lib/maps.functions";
import { setAnchor, type AnchorKind } from "@/lib/trip-store";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Sheet } from "../Sheet";
import { Icon } from "../Icon";
import { Group, Row } from "../search/SearchRows";

type Suggestion = { placeId: string; primary: string; secondary: string };
type LatLng = { lat: number; lng: number };

/** Search bias without asking for location: the last fix the app cached, else Nicosia. */
function cachedBias(): LatLng {
  try {
    const g = JSON.parse(localStorage.getItem("aloya:geo") ?? "null") as LatLng | null;
    if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) return { lat: g.lat, lng: g.lng };
  } catch {
    /* no cache */
  }
  return { lat: 35.1725, lng: 33.365 };
}

export function PlacePickSheet({
  kind,
  onClose,
  coords,
}: {
  kind: AnchorKind | null;
  onClose: () => void;
  /** Where to bias the search; defaults to the last cached fix. */
  coords?: LatLng;
}) {
  const { r } = useRoamI18n();
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const revFn = useServerFn(reverseLookup);
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Keep the last kind while the sheet slides closed.
  const [lastKind, setLastKind] = useState<AnchorKind>("home");
  const k = kind ?? lastKind;
  const bLat = coords?.lat;
  const bLng = coords?.lng;

  useEffect(() => {
    if (kind) setLastKind(kind);
    else {
      setQ("");
      setPlaces([]);
      setErr(null);
      setBusy(null);
    }
  }, [kind]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setPlaces([]);
      setSearching(false);
      return;
    }
    let alive = true;
    const bias = bLat != null && bLng != null ? { lat: bLat, lng: bLng } : cachedBias();
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await acFn({ data: { query: term, bias } });
        if (alive) setPlaces((res.suggestions ?? []).slice(0, 6));
      } catch {
        if (alive) setPlaces([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, acFn, bLat, bLng]);

  function save(name: string, lat: number, lng: number) {
    setAnchor(k, { name, lat, lng });
    onClose();
  }

  async function pickPlace(s: Suggestion) {
    setErr(null);
    setBusy(r("sv.saving"));
    try {
      const p = await placeFn({ data: { placeId: s.placeId } });
      save(s.secondary ? `${s.primary}, ${s.secondary}` : s.primary, p.lat, p.lng);
    } catch {
      setErr(r("search.planFail"));
      setBusy(null);
    }
  }

  function pickHere() {
    setErr(null);
    setBusy(r("sv.locating"));
    const done = async (lat: number, lng: number) => {
      let name = r("sv.currentSpot");
      try {
        const res = await revFn({ data: { lat, lng } });
        if (res.address) name = res.address;
      } catch {
        /* keep the plain name */
      }
      save(name, lat, lng);
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr(r("sv.locFail"));
      setBusy(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void done(pos.coords.latitude, pos.coords.longitude),
      () => {
        setErr(r("sv.locFail"));
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const term = q.trim();
  return (
    <Sheet
      open={!!kind}
      onClose={onClose}
      label={r(k === "home" ? "sv.pickHome" : "sv.pickWork")}
      closeLabel={r("sv.cancel")}
      full
    >
      <div className="px-5 pb-10">
        <h2 className="r-t3 text-[22px]">{r(k === "home" ? "sv.pickHome" : "sv.pickWork")}</h2>
        <label
          className="mt-4 flex h-12 items-center gap-2 rounded-[16px] px-3"
          style={{ background: "var(--r-pill)" }}
        >
          <Icon name="magnifying-glass" style={{ color: "var(--r-mute)" }} />
          <input
            data-autofocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={r("sv.pickPh")}
            aria-label={r("sv.pickPh")}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            inputMode="search"
          />
          {q ? (
            <button type="button" aria-label={r("search.clearInput")} onClick={() => setQ("")}>
              <Icon name="x-circle" style={{ color: "var(--r-mute)" }} />
            </button>
          ) : null}
        </label>

        {err ? (
          <p className="r-lbl mt-3" style={{ color: "#b3261e" }}>
            {err}
          </p>
        ) : null}
        {busy ? (
          <p className="r-lbl mt-3" aria-live="polite">
            {busy}
          </p>
        ) : null}

        <div className="mt-4">
          <Group title="">
            <Row
              icon="crosshair"
              title={r("sv.useHere")}
              sub={r("sv.useHereSub")}
              onClick={() => !busy && pickHere()}
            />
          </Group>
        </div>

        {term.length >= 3 ? (
          <div className="mt-4">
            <Group title="">
              {places.length > 0 ? (
                places.map((s) => (
                  <Row
                    key={s.placeId}
                    icon="map-pin"
                    title={s.primary}
                    sub={s.secondary}
                    onClick={() => !busy && void pickPlace(s)}
                  />
                ))
              ) : (
                <p className="r-lbl px-4 py-3">
                  {searching ? r("sv.searching") : r("sv.noResults")}
                </p>
              )}
            </Group>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
