import type { MotionPassOption } from "@/lib/motion-pass";

// Deep-link to the official top-up page with the card number pre-filled.
// We can't proxy the JCC payment gateway (3-D Secure + reCAPTCHA), but we
// can carry the user 90% of the way to checkout.
function topupUrl(cardNumber: string) {
  const clean = cardNumber.replace(/\D/g, "");
  return `https://www.publictransport.com.cy/topup/page/topup-travel-card?cardNumber=${encodeURIComponent(clean)}`;
}

export function RenewPasses({
  cardNumber,
  passes,
}: {
  cardNumber: string;
  passes: MotionPassOption[];
}) {
  if (passes.length === 0) return null;

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
        {passes.map((p) => (
          <li
            key={p.code}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <p className="text-[13px] text-ink leading-tight truncate">
                {p.name}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {p.validityDays
                  ? `${p.validityDays} day validity`
                  : `Pass ${p.code}`}
              </p>
            </div>
            <a
              href={topupUrl(cardNumber)}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 rounded-full bg-ink text-limestone px-3.5 py-2 hover:bg-ink/90 transition-colors"
            >
              <span className="font-display text-[18px] tabular-nums leading-none">
                €{p.priceEur.toFixed(2)}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-ink-soft">
        Tapping a price opens the official Cyprus Public Transport top-up page
        with your card number filled in — payment is handled by JCC.
      </p>
    </section>
  );
}
