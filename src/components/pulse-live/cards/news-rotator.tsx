import { useEffect, useState } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { relativeAgo } from "../shared";
import pulseNewsImg from "@/assets/pulse-news-kafenion.jpg";

/* ────────────── News rotator — auto-cycles fresh headlines ─────────── */

export function NewsRotatorCard({
  payload,
  isEl,
}: {
  payload: NonNullable<PulseLiveBundle["news"]>;
  isEl: boolean;
}) {
  const items = payload.items.slice(0, 8);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [items.length]);

  const cur = items[idx] ?? items[0];
  if (!cur) return null;
  const ago = relativeAgo(cur.publishedAt, isEl);

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
      <div className="relative aspect-[16/8] w-full overflow-hidden">
        <img
          src={pulseNewsImg}
          alt=""
          aria-hidden
          loading="lazy"
          width={1600}
          height={896}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 35%, transparent) 55%, var(--color-card) 100%)",
          }}
        />
        <div className="absolute left-5 top-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-sm px-3 py-1 font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink ring-1 ring-line">
            {isEl ? "Από το νησί" : "On the island"}
          </p>
        </div>
      </div>

      <a
        href={cur.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block px-6 pt-3 pb-5 group"
      >
        <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ochre">
          {cur.source}
          <span
            className="mx-2 inline-block h-1.5 w-px translate-y-[1px] bg-line align-middle"
            aria-hidden
          />
          {ago}
        </p>
        <h3 className="mt-1.5 font-display text-[20px] leading-[1.15] text-ink text-balance break-soft group-hover:underline underline-offset-4 decoration-ochre/60">
          {cur.title}
        </h3>

        {items.length > 1 && (
          <div className="mt-4 flex items-center gap-1.5" aria-hidden>
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-[3px] rounded-full transition-all ${
                  i === idx ? "w-6 bg-ink" : "w-3 bg-line"
                }`}
              />
            ))}
          </div>
        )}
      </a>
    </article>
  );
}
