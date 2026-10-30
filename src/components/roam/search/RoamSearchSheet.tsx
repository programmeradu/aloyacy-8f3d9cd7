// One Roam search sheet with a single smart input. Instant local results as
// you type (stops, lines, saved places, airports), places from the geocoder,
// and a "Plan this trip" result parsed from plain phrasing ("to Larnaca
// airport tomorrow 7am", "last bus to Limassol", "next 30"). The AI parser is
// only called when the local parse and geocoder cannot place the destination.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ROUTES, STOPS, nearestStops } from "@/lib/gtfs";
import { AIRPORTS } from "@/lib/airport.functions";
import { autocompletePlaces, getPlace } from "@/lib/maps.functions";
import { parseTripIntent } from "@/lib/ai-planner.functions";
import { useSavedPlaces } from "@/lib/trip-store";
import { createRecognizer, transcriptOf, type SpeechRec } from "@/lib/speech-recognition";
import { matchScore, parseIntent, searchLines, searchStops } from "@/lib/smart-search";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "../Icon";
import { useKeyboardInset } from "./useKeyboardInset";
import { addRecent, clearRecent, readRecent, type Recent } from "./recent";

type Vehicle = { id: string; tripId: string; routeId: string; label: string; lat: number; lng: number };
import type { Item, Pt } from "./types";
import { Group, Row, ItemRow, groupItems } from "./SearchRows";

export function RoamSearchSheet({
  open,
  mode,
  voice,
  onClose,
  coords,
  onPickedStop,
  onUseNearest,
  hasPickedStop,
}: {
  open: boolean;
  mode: "search" | "pick";
  voice: boolean;
  onClose: () => void;
  vehicles?: Vehicle[];
  coords: { lat: number; lng: number };
  onPickedStop: (stopId: string) => void;
  onUseNearest: () => void;
  hasPickedStop: boolean;
}) {
  const { r, t, locale } = useRoamI18n();
  const navigate = useNavigate();
  const acFn = useServerFn(autocompletePlaces);
  const placeFn = useServerFn(getPlace);
  const aiFn = useServerFn(parseTripIntent);
  const saved = useSavedPlaces();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<{ placeId: string; primary: string; secondary: string }[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [listening, setListening] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const kb = useKeyboardInset(open);
  const pick = mode === "pick";

  useEffect(() => {
    if (!open) {
      setQ("");
      setPlaces([]);
      setErr(null);
      setPlanning(false);
      return;
    }
    setRecent(readRecent());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      if (voice) startVoice();
      else inputRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      recRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Places from the geocoder: debounced, only for real words.
  useEffect(() => {
    const term = q.trim();
    if (pick || term.length < 3 || /^\d+$/.test(term)) {
      setPlaces([]);
      return;
    }
    const intent = parseIntent(term);
    const query = intent?.to ?? term;
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const res = await acFn({ data: { query, bias: { lat: coords.lat, lng: coords.lng } } });
        if (alive) setPlaces((res.suggestions ?? []).slice(0, 4));
      } catch {
        if (alive) setPlaces([]);
      }
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, pick, acFn, coords.lat, coords.lng]);

  const near = useMemo(
    () => (open ? nearestStops(coords, 5) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, coords.lat, coords.lng],
  );

  const items = useMemo<Item[]>(() => {
    const term = q.trim();
    if (!term) return [];
    const out: Item[] = [];
    const stopHits = searchStops(term, STOPS, coords, pick ? 10 : 5);
    if (pick) {
      return stopHits.map((s) => ({ kind: "stop", key: `s${s.id}`, id: s.id, name: s.name, km: s.km }));
    }
    const intent = parseIntent(term);
    const savedHits = saved
      .map((p) => ({ p, sc: Math.max(matchScore(term, p.label), matchScore(term, p.name) * 0.8) }))
      .filter((x) => x.sc > 0.5)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 3);
    const airports = Object.values(AIRPORTS).filter(
      (a) =>
        matchScore(intent?.to ?? term, `${a.name} ${a.city} airport ${a.iata}`) > 0.5 ||
        matchScore(intent?.to ?? term, `${a.nameEl} ${a.cityEl} αεροδρόμιο`) > 0.5,
    );

    // Where the plan result would go, when we already know the spot locally.
    let dest: Pt | null = null;
    if (intent?.to) {
      const s = saved.find((p) => matchScore(intent.to!, p.label) > 0.8);
      const a = Object.values(AIRPORTS).find(
        (x) => matchScore(intent.to!, `${x.name} ${x.city} airport ${x.iata}`) > 0.8,
      );
      const st = searchStops(intent.to, STOPS, coords, 1)[0];
      if (s) dest = { lat: s.lat, lng: s.lng, label: s.label };
      else if (a) dest = { lat: a.lat, lng: a.lng, label: a.name };
      else if (st && st.score > 1) {
        const full = STOPS.find((x) => x.id === st.id);
        if (full) dest = { lat: full.lat, lng: full.lng, label: full.name };
      }
    }
    if (intent && (intent.to || intent.edge)) out.push({ kind: "plan", key: "plan", intent, dest });
    if (intent?.line) {
      for (const l of searchLines(intent.line, ROUTES, 2))
        out.push({ kind: "line", key: `l${l.id}`, id: l.id, code: l.code, name: l.name });
    }
    for (const { p } of savedHits)
      out.push({
        kind: "saved",
        key: `p${p.id}`,
        label: p.label,
        sub: p.name,
        pt: { lat: p.lat, lng: p.lng, label: p.name || p.label },
      });
    for (const a of airports)
      out.push({
        kind: "airport",
        key: `a${a.code}`,
        code: a.code,
        name: locale === "el" ? a.nameEl : a.name,
        city: locale === "el" ? a.cityEl : a.city,
        pt: { lat: a.lat, lng: a.lng, label: a.name },
      });
    const lineHits = intent?.line ? [] : searchLines(term, ROUTES, 4);
    const lineFirst = /^\s*\d/.test(term);
    const lineItems: Item[] = lineHits.map((l) => ({
      kind: "line",
      key: `l${l.id}`,
      id: l.id,
      code: l.code,
      name: l.name,
    }));
    const stopItems: Item[] = (intent?.to ? [] : stopHits).map((s) => ({
      kind: "stop",
      key: `s${s.id}`,
      id: s.id,
      name: s.name,
      km: s.km,
    }));
    if (lineFirst) out.push(...lineItems, ...stopItems);
    else out.push(...stopItems, ...lineItems);
    for (const p of places)
      out.push({ kind: "place", key: `g${p.placeId}`, placeId: p.placeId, name: p.primary, sub: p.secondary });
    return out;
  }, [q, pick, saved, coords, places, locale]);

  const remember = useCallback((rec: Recent) => {
    addRecent(rec);
    setRecent(readRecent());
  }, []);

  const goTrip = useCallback(
    (to: Pt, leaveAtISO: string | null = null, raw = "") => {
      try {
        sessionStorage.setItem(
          "aloya:nl-plan",
          JSON.stringify({ from: null, to, leaveByISO: leaveAtISO, arriveByISO: null, rawText: raw }),
        );
      } catch {}
      onClose();
      navigate({ to: "/trips" });
    },
    [navigate, onClose],
  );

  const resolvePlace = useCallback(
    async (query: string): Promise<Pt | null> => {
      const ac = await acFn({ data: { query, bias: { lat: coords.lat, lng: coords.lng } } });
      const first = ac.suggestions?.[0];
      if (!first) return null;
      const p = await placeFn({ data: { placeId: first.placeId } });
      return { lat: p.lat, lng: p.lng, label: p.name || first.primary };
    },
    [acFn, placeFn, coords.lat, coords.lng],
  );

  const choose = useCallback(
    async (it: Item) => {
      setErr(null);
      if (it.kind === "stop") {
        remember({ kind: "stop", id: it.id, label: it.name });
        if (pick) {
          onPickedStop(it.id);
          onClose();
          return;
        }
        onClose();
        navigate({ to: "/stop/$stopId", params: { stopId: it.id } });
        return;
      }
      if (it.kind === "line") {
        remember({ kind: "line", id: it.id, label: `${it.code} · ${it.name}` });
        onClose();
        navigate({ to: "/route/$routeId", params: { routeId: it.id } });
        return;
      }
      if (it.kind === "saved" || it.kind === "airport") {
        remember({ kind: "place", label: it.pt.label, lat: it.pt.lat, lng: it.pt.lng });
        goTrip(it.pt, null, q);
        return;
      }
      if (it.kind === "place") {
        setPlanning(true);
        try {
          const p = await placeFn({ data: { placeId: it.placeId } });
          const pt = { lat: p.lat, lng: p.lng, label: p.name || it.name };
          remember({ kind: "place", label: pt.label, lat: pt.lat, lng: pt.lng });
          goTrip(pt, null, q);
        } catch {
          setErr(r("search.planFail"));
        } finally {
          setPlanning(false);
        }
        return;
      }
      // Plan this trip: local destination first, geocoder next, AI last.
      setPlanning(true);
      try {
        let dest = it.dest;
        if (!dest && it.intent.to) dest = await resolvePlace(it.intent.to).catch(() => null);
        let when = it.intent.leaveAtISO;
        if (!dest) {
          const ai = await aiFn({
            data: {
              text: q,
              nowISO: new Date().toISOString(),
              tzOffsetMin: -new Date().getTimezoneOffset(),
            },
          }).catch(() => null);
          if (ai?.to) dest = await resolvePlace(ai.to).catch(() => null);
          when = when ?? ai?.leaveByISO ?? null;
        }
        if (!dest) {
          setErr(r("search.planFail"));
          return;
        }
        remember({ kind: "place", label: dest.label, lat: dest.lat, lng: dest.lng });
        goTrip(dest, when, q);
      } finally {
        setPlanning(false);
      }
    },
    [pick, q, r, remember, goTrip, navigate, onClose, onPickedStop, placeFn, resolvePlace, aiFn],
  );

  function startVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = createRecognizer(locale === "el" ? "el-GR" : "en-GB");
    if (!rec) {
      inputRef.current?.focus();
      return;
    }
    recRef.current = rec;
    rec.onresult = (e) => {
      const tx = transcriptOf(e);
      if (tx) setQ(tx);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  if (!open || typeof document === "undefined") return null;
  const canVoice =
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
  const homeLike = saved.filter((p) => p.pinned).slice(0, 4);
  const term = q.trim();
  const groups = groupItems(items);

  return createPortal(
    <div className="roam r-search" role="dialog" aria-modal="true" aria-label={pick ? r("search.pickTitle") : r("search.title")}>
      <button type="button" className="r-search-scrim" aria-label={r("search.cancel")} onClick={onClose} />
      <div className="r-search-panel" style={{ bottom: kb }}>
        <div className="r-search-bar">
          <label className="r-search-field">
            <Icon name="magnifying-glass" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && items[0]) {
                  e.preventDefault();
                  void choose(items[0]);
                }
              }}
              placeholder={pick ? r("search.pickPlaceholder") : r("search.placeholder")}
              aria-label={pick ? r("search.pickTitle") : r("search.title")}
              enterKeyHint="go"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
            />
            {q ? (
              <button type="button" className="r-search-ic" aria-label={r("search.clearInput")} onClick={() => setQ("")}>
                <Icon name="x-circle" />
              </button>
            ) : canVoice && !pick ? (
              <button
                type="button"
                className={`r-search-ic${listening ? " is-live" : ""}`}
                aria-label={listening ? r("search.listening") : r("search.voice")}
                aria-pressed={listening}
                onClick={startVoice}
              >
                <Icon name="microphone" />
              </button>
            ) : null}
          </label>
          <button type="button" className="r-search-cancel" onClick={onClose}>
            {r("search.cancel")}
          </button>
        </div>

        <div className="r-search-body">
          {err ? <p className="r-search-err">{err}</p> : null}
          {!term ? (
            <>
              {!pick ? (
                <div className="r-search-chips">
                  {homeLike.length > 0 ? (
                    homeLike.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="r-pill r-pill--w r-pill--lg"
                        onClick={() => goTrip({ lat: p.lat, lng: p.lng, label: p.name || p.label })}
                      >
                        <Icon name={/home|σπίτι/i.test(p.label) ? "house" : /work|office|δουλ/i.test(p.label) ? "briefcase" : "map-pin"} />
                        {p.label}
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      className="r-pill r-pill--w r-pill--lg"
                      onClick={() => {
                        onClose();
                        navigate({ to: "/saved" });
                      }}
                    >
                      <Icon name="house" />
                      {r("search.addHome")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="r-pill r-pill--w r-pill--lg"
                    onClick={() => goTrip({ lat: AIRPORTS.lca.lat, lng: AIRPORTS.lca.lng, label: AIRPORTS.lca.name })}
                  >
                    <Icon name="airplane-tilt" />
                    {locale === "el" ? AIRPORTS.lca.cityEl : AIRPORTS.lca.city}
                  </button>
                </div>
              ) : null}
              {pick && hasPickedStop ? (
                <button
                  type="button"
                  className="r-pill r-pill--w r-pill--lg mb-4"
                  onClick={() => {
                    onUseNearest();
                    onClose();
                  }}
                >
                  <Icon name="navigation-arrow" />
                  {t("sky.sheet.useNearest")}
                </button>
              ) : null}
              {recent.length > 0 && !pick ? (
                <Group
                  title={r("search.recent")}
                  action={
                    <button
                      type="button"
                      className="r-search-clear"
                      onClick={() => {
                        clearRecent();
                        setRecent([]);
                      }}
                    >
                      {r("search.clearRecent")}
                    </button>
                  }
                >
                  {recent.map((x, i) => (
                    <Row
                      key={i}
                      icon="clock-counter-clockwise"
                      title={x.label}
                      onClick={() => {
                        if (x.kind === "stop") {
                          onClose();
                          navigate({ to: "/stop/$stopId", params: { stopId: x.id } });
                        } else if (x.kind === "line") {
                          onClose();
                          navigate({ to: "/route/$routeId", params: { routeId: x.id } });
                        } else goTrip({ lat: x.lat, lng: x.lng, label: x.label });
                      }}
                    />
                  ))}
                </Group>
              ) : null}
              <Group title={r("search.nearby")}>
                {near.map((s) => (
                  <Row
                    key={s.id}
                    icon="bus"
                    title={s.name}
                    meta={`${Math.round(s.distanceKm * 1000)} m`}
                    onClick={() => void choose({ kind: "stop", key: s.id, id: s.id, name: s.name, km: s.distanceKm })}
                  />
                ))}
              </Group>
            </>
          ) : items.length === 0 ? (
            <p className="r-lbl px-1 py-6 text-center">{r("search.none")}</p>
          ) : (
            groups.map((g) => (
              <Group key={g.title} title={g.title ? r(g.title) : ""}>
                {g.items.map((it) => (
                  <ItemRow key={it.key} it={it} planning={planning} onChoose={choose} />
                ))}
              </Group>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

