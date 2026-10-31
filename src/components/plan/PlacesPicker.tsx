import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import {
  IconBriefcase,
  IconClock,
  IconClose,
  IconHome,
  IconPin,
  IconSearch,
  IconStar,
} from "@/components/Icons";
import { autocompletePlaces, getPlace } from "@/lib/maps.functions";
import { useRecents, useSavedPlaces } from "@/lib/trip-store";
import { useI18n } from "@/lib/i18n";
import { useRoamI18n } from "@/lib/roam-i18n";
import { geoPermission, locateHere, readCachedHere } from "@/lib/here";
import { useHereAddress } from "./useHereAddress";
import type { Point } from "@/lib/plan-types";

export function PlacesPickerSheet({
  open,
  role,
  bias,
  onClose,
  onPick,
}: {
  open: boolean;
  role: "from" | "to";
  bias: { lat: number; lng: number };
  onClose: () => void;
  onPick: (p: Point, role: "from" | "to") => void;
}) {
  // Lock body scroll while the sheet is open so the underlying results
  // page doesn't bleed through when the user is searching.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return <SheetBody role={role} bias={bias} onClose={onClose} onPick={onPick} />;
}

function SheetBody({
  role,
  bias,
  onClose,
  onPick,
}: {
  role: "from" | "to";
  bias: { lat: number; lng: number };
  onClose: () => void;
  onPick: (p: Point, role: "from" | "to") => void;
}) {
  const { r } = useRoamI18n();

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
      />
      {/* Sheet */}
      <div className="relative mt-auto w-full rounded-t-[28px] bg-limestone ring-1 ring-line shadow-[0_-12px_40px_-12px_rgba(20,30,40,0.25)] min-h-[72vh] max-h-[92vh] flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">
              {role === "from" ? r("go.pkSetPickup") : r("go.pkSetDest")}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full bg-limestone-soft text-ink ring-1 ring-line"
          >
            <IconClose className="size-4" />
          </button>
        </div>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        <div className="flex-1 overflow-y-auto px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
          <PlacesPickerContent role={role} bias={bias} onPick={onPick} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PlacesPickerContent({
  role,
  bias,
  onPick,
}: {
  role: "from" | "to";
  bias: { lat: number; lng: number };
  onPick: (p: Point, role: "from" | "to") => void;
}) {
  const { t } = useI18n();
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
    // Slight delay so the sheet finishes its slide-up before focusing,
    // avoiding the mobile keyboard fighting the transition.
    const id = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
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

  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState(false);

  async function choose(placeId: string) {
    if (picking) return;
    setPicking(placeId);
    setPickError(false);
    try {
      const place = await placeFn({ data: { placeId } });
      onPick({ lat: place.lat, lng: place.lng, label: place.name }, role);
    } catch {
      // Never swallow a failed pick: the row would just look dead.
      setPickError(true);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="rounded-[20px] bg-card ring-1 ring-line overflow-hidden">
      <div className="relative flex items-center">
        <span className="absolute left-4 text-ink-soft">
          <IconSearch className="size-4" />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={role === "from" ? t("trips.fromWhere") : t("trips.whereTo")}
          className="w-full bg-transparent py-4 pl-11 pr-4 text-[15px] outline-none placeholder:text-ink-soft/60"
        />
        {loading && (
          <span className="absolute right-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("trips.searching")}
          </span>
        )}
      </div>
      {query.trim().length < 2 ? (
        <>
          <HereRow onChoose={(p) => onPick(p, role)} />
          <QuickPicks role={role} onChoose={(p) => onPick(p, role)} />
        </>
      ) : (
        suggestions.length > 0 && (
          <ul className="divide-y divide-line">
            {pickError && (
              <li role="alert" className="px-4 py-2 text-[12px] text-ink-soft">
                {t("trips.placeFailed")}
              </li>
            )}
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => choose(s.placeId)}
                  aria-busy={picking === s.placeId}
                  disabled={picking !== null}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-limestone-soft disabled:opacity-60"
                >
                  <IconPin className="size-4 text-aegean-deep shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">{s.primary}</p>
                    {s.secondary && (
                      <p className="truncate text-[11px] text-ink-soft">{s.secondary}</p>
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

// "Use my current location": resolves the street ahead of the tap when
// permission is already granted, spins while locating, and says plainly when
// location is off.
function HereRow({ onChoose }: { onChoose: (p: Point) => void }) {
  const { r } = useRoamI18n();
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(() => readCachedHere());
  const [fresh, setFresh] = useState(false);
  const [state, setState] = useState<"idle" | "locating" | "denied" | "failed">("idle");
  const street = useHereAddress(fix);

  useEffect(() => {
    let off = false;
    void geoPermission().then((p) => {
      if (off) return;
      if (p === "denied") {
        setState("denied");
        return;
      }
      if (p !== "granted") return;
      void locateHere().then((res) => {
        if (off || !res.ok) return;
        setFix({ lat: res.lat, lng: res.lng });
        setFresh(true);
      });
    });
    return () => {
      off = true;
    };
  }, []);

  async function use() {
    if (state === "locating") return;
    if (fix && fresh) {
      onChoose({ lat: fix.lat, lng: fix.lng, label: r("go.yourLocation") });
      return;
    }
    setState("locating");
    const res = await locateHere();
    if (res.ok) {
      setState("idle");
      onChoose({ lat: res.lat, lng: res.lng, label: r("go.yourLocation") });
    } else {
      setState(res.denied ? "denied" : "failed");
    }
  }

  const sub =
    state === "locating"
      ? r("go.pkLocating")
      : state === "denied"
        ? r("go.pkDenied")
        : state === "failed"
          ? r("go.pkFail")
          : (street ?? r("go.pkHereSub"));

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={use}
        aria-busy={state === "locating"}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-limestone-soft"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-aegean-soft/60 text-aegean-deep">
          <i
            className={`ph ${state === "locating" ? "ph-circle-notch animate-spin" : "ph-crosshair"}`}
            style={{ fontSize: 18 }}
            aria-hidden="true"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{r("go.pkUseHere")}</span>
          <span
            className={`block text-[12px] ${state === "denied" || state === "failed" ? "text-ink" : "truncate text-ink-soft"}`}
            role={state === "denied" || state === "failed" ? "alert" : undefined}
          >
            {sub}
          </span>
        </span>
      </button>
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

function QuickPicks({ role, onChoose }: { role: "from" | "to"; onChoose: (p: Point) => void }) {
  const { t } = useI18n();
  const { r } = useRoamI18n();
  const saved = useSavedPlaces();
  const recents = useRecents();
  if (saved.length === 0 && recents.length === 0) return null;
  return (
    <div className="border-t border-line p-4 space-y-4">
      {saved.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-medium text-ink-soft">{r("go.pkSaved")}</div>
          <div className="flex flex-wrap gap-2">
            {saved.map((p) => {
              const Glyph = labelGlyph(p.label);
              return (
                <button
                  key={p.id}
                  onClick={() => onChoose({ lat: p.lat, lng: p.lng, label: p.name })}
                  className="group inline-flex items-center gap-2 rounded-full bg-limestone-soft px-3.5 py-2 text-[12px] text-ink transition-colors hover:bg-aegean-soft/60"
                  aria-label={`${p.label}: ${p.name}`}
                >
                  <Glyph className="size-3.5 text-aegean-deep" strokeWidth={1.4} />
                  <span>{p.name.length > 24 ? `${p.name.slice(0, 24)}…` : p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {recents.length > 0 && role === "to" && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("trips.recent")}
          </div>
          <ul className="divide-y divide-line">
            {recents.slice(0, 5).map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onChoose({ lat: r.lat, lng: r.lng, label: r.name })}
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
