// "Watch together" — creates a live group where everyone converging on the
// same destination sees each other on one map with real transit ETAs. This
// is the live counterpart to SharePlanButton (which is a read-only snapshot).
// Anonymous-safe: no account required to host or join.

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createTripGroup } from "@/lib/trip-groups.functions";

type Point = { lat: number; lng: number; label: string };

export function WatchTogetherButton({
  origin,
  destination,
}: {
  origin: Point;
  destination: Point;
}) {
  const createGroup = useServerFn(createTripGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shared, setShared] = useState<{ url: string; code: string } | null>(null);

  async function readPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
      );
    });
  }

  async function onCreate() {
    setErr(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErr("Add your name so the group knows who's hosting.");
      return;
    }
    setBusy(true);
    try {
      // Prefer the user's live position, fall back to the planner's origin.
      const live = await readPosition();
      const originPoint = live ?? { lat: origin.lat, lng: origin.lng };
      const res = await createGroup({
        data: {
          destinationLabel: destination.label,
          destination: { lat: destination.lat, lng: destination.lng },
          hostName: trimmed.slice(0, 40),
          originLabel: origin.label,
          origin: originPoint,
          expiresInHours: 6,
        },
      });
      const url = `${window.location.origin}/group/${res.code}`;
      // Persist host membership so the host page auto-recognizes them.
      try {
        localStorage.setItem(`aloya.group.${res.code}.token`, res.memberToken);
      } catch {
        // ignore
      }
      setShared({ url, code: res.code });

      const shareData = {
        title: `Aloya group trip to ${destination.label}`,
        text: `Join me on Aloya — we'll see each other converge on ${destination.label}.`,
        url,
      };
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share(shareData);
        } catch {
          // user cancelled — fall through to clipboard
        }
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // ignore
        }
      }
    } catch {
      setErr("Couldn't start the group. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (shared) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <a
          href={`/group/${shared.code}`}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-aegean-deep px-4 py-2 font-sans text-[13px] font-semibold text-limestone ring-1 ring-aegean-deep transition-opacity hover:opacity-90"
        >
          <PulseDot />
          Open live group · {shared.code}
        </a>
        <p className="px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft break-all">
          Link copied · {shared.url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left ring-1 ring-line transition-colors hover:bg-limestone-soft/60"
      >
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-aegean-deep to-aegean text-limestone shadow-[0_6px_16px_-8px_rgba(31,108,130,0.55)]">
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl bg-aegean/40 animate-ping" />
          <FriendsGlyph className="relative h-6 w-7" />
          <span aria-hidden className="absolute right-1 top-1 grid size-2.5 place-items-center">
            <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-ochre/80" />
            <span className="relative inline-flex size-1.5 rounded-full bg-ochre ring-2 ring-aegean-deep" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[14.5px] font-semibold leading-tight text-ink">
            Watch together — live
          </span>
          <span className="mt-0.5 block font-sans text-[11.5px] font-medium text-ink-soft">
            Invite friends · one map, real ETAs, no account
          </span>
        </span>
        <span className="font-display text-lg text-ink-soft transition-transform group-hover:translate-x-0.5">
          ›
        </span>
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
        Start a live group trip
      </p>
      <p className="mt-1 font-sans text-[12px] font-medium text-ink-soft">
        We'll create a short code and copy the link. Anyone you send it to sees your live ETA and you see theirs — one map, one destination.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-xl bg-limestone-soft px-3 py-2 font-sans text-[13px] font-medium text-ink ring-1 ring-line placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-aegean-deep/40"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="rounded-xl bg-ink px-4 py-2 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-limestone transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Create"}
        </button>
      </div>
      {err && (
        <p className="mt-2 font-sans text-[12px] font-semibold text-red-700">{err}</p>
      )}
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
    </span>
  );
}
