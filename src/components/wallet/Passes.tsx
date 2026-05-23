import { useState } from "react";
import type { MotionPassOption } from "@/lib/motion-pass";

const TOPUP_URL =
  "https://www.publictransport.com.cy/topup/page/topup-travel-card";

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

export function RenewPasses({
  cardNumber,
  passes,
}: {
  cardNumber: string;
  passes: MotionPassOption[];
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (passes.length === 0) return null;

  const clean = cardNumber.replace(/\D/g, "");

  async function handleRenew(code: string) {
    const ok = await copyToClipboard(clean);
    if (ok) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2200);
    }
    window.open(TOPUP_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="px-6 animate-rise" style={{ animationDelay: "260ms" }}>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">
          Renew your <span className="italic text-aegean-deep">pass</span>
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {passes.length} eligible
        </span>
      </div>

      <ul className="rounded-[24px] bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
        {passes.map((p) => {
          const justCopied = copiedCode === p.code;
          return (
            <li
              key={p.code}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-ink leading-tight truncate">
                  {p.name}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {justCopied
                    ? "Card number copied — paste on the next screen"
                    : p.validityDays
                      ? `${p.validityDays} day validity`
                      : `Pass ${p.code}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRenew(p.code)}
                className="shrink-0 rounded-full bg-ink text-limestone px-3.5 py-2 hover:bg-ink/90 transition-colors"
              >
                <span className="font-sans font-medium text-[15px] tabular-nums tracking-[-0.01em] leading-none">
                  €{p.priceEur.toFixed(2)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-ink-soft">
        Tapping a price copies your card number, then opens the official Cyprus
        Public Transport top-up page — paste it into the card field and JCC
        handles the rest.
      </p>
    </section>
  );
}
