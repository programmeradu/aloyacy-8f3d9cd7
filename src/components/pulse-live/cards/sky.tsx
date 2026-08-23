import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import pulseSkyImg from "@/assets/pulse-sky-card.jpg";

/* ────────────── Sky — combined airport movements ───────────────────── */

export function SkyCard({
  payloads,
  isEl,
}: {
  payloads: PulseLiveBundle["flights"];
  isEl: boolean;
}) {
  const arr = payloads.reduce((s, p) => s + p.arrivalsNext60, 0);
  const dep = payloads.reduce((s, p) => s + p.departuresNext60, 0);
  const cities = payloads.map((p) => p.city).join(" + ");

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <img
          src={pulseSkyImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 60%, var(--color-card) 100%)",
          }}
        />
      </div>
      <div className="relative px-5 pt-3 pb-5">
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
          {isEl ? "Ουρανός · " : "Sky · "}
          {cities}
        </p>
        <div className="mt-1 flex items-end gap-5">
          <div>
            <div className="font-display text-[30px] leading-none text-ink tabular-nums tracking-[-0.02em]">
              {arr}
            </div>
            <p className="mt-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
              {isEl ? "Αφίξεις / ώρα" : "Arrivals / 1h"}
            </p>
          </div>
          <div>
            <div className="font-display text-[30px] leading-none text-ochre tabular-nums tracking-[-0.02em]">
              {dep}
            </div>
            <p className="mt-1 font-eyebrow text-[9.5px] uppercase tracking-[0.2em] text-ink-soft">
              {isEl ? "Αναχωρήσεις / ώρα" : "Departures / 1h"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-snug text-ink-soft text-pretty">
          {arr + dep === 0
            ? isEl
              ? "Ήρεμη επόμενη ώρα στους ουρανούς."
              : "Quiet skies in the next hour."
            : isEl
              ? "Επόμενη ώρα — επιπλέον αιτήματα ταξί και Bus 425 / Express."
              : "Expect extra demand on airport shuttles and taxi ranks."}
        </p>
      </div>
    </article>
  );
}
