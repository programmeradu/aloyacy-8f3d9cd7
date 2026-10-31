import { useEffect, useState } from "react";
import type { PulseLiveBundle } from "@/lib/pulse-live.functions";
import { relativeAgo, tidy } from "../shared";
import pulseNewsImg from "@/assets/pulse-news.webp";

/* News rotator: cycles fresh island headlines, Roam card with an inset painting */

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
    <article className="r-news" data-card="news">
      <div className="r-news-art">
        <img src={pulseNewsImg} alt="" aria-hidden="true" decoding="async" />
      </div>
      <a href={cur.url} target="_blank" rel="noopener noreferrer" className="r-news-body">
        <span className="r-news-meta">
          <b>{cur.source}</b>
          <span>{ago}</span>
        </span>
        <span className="r-news-title">{tidy(cur.title)}</span>
      </a>
      {items.length > 1 && (
        <div className="r-news-dots" aria-hidden="true">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              data-on={i === idx ? "true" : "false"}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      )}
    </article>
  );
}
