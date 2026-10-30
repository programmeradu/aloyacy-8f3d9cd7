import { useState } from "react";
import type { MotionPassOption } from "@/lib/motion-pass";
import { useRoamI18n } from "@/lib/roam-i18n";

const TOPUP_URL = "https://www.publictransport.com.cy/topup/page/topup-travel-card";

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
  const { t, r } = useRoamI18n();

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
    <section className="roam">
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="r-t3">{r("pass.renew")}</h2>
        <span className="r-lbl">{t("wallet.renewEligible", { n: passes.length })}</span>
      </div>
      <div className="r-card">
        {passes.map((p) => {
          const justCopied = copiedCode === p.code;
          return (
            <div key={p.code} className="r-row" style={{ padding: "14px 16px" }}>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-snug">{formatPassName(p.name)}</p>
                <p className="r-lbl mt-1">
                  {justCopied
                    ? t("wallet.renewCopied")
                    : p.validityDays
                      ? t("wallet.renewValidity", { n: p.validityDays })
                      : t("wallet.renewPass", { code: p.code })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRenew(p.code)}
                className="r-pill r-pill--k r-pill--lg r-tnum"
              >
                €{p.priceEur.toFixed(2)}
              </button>
            </div>
          );
        })}
      </div>
      <p className="r-lbl mt-2 px-1">{t("wallet.renewFoot")}</p>
    </section>
  );
}

/**
 * Operator pass names arrive in capitals with zone codes
 * ("30 DAYS Z01-03 (UDF) PERSONALISED"); show them in sentence case with the
 * zone range spelled out, acronyms in brackets kept.
 */
export function formatPassName(raw: string): string {
  const s = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bZ(\d{1,2})\s*-\s*(\d{1,2})\b/gi, "zones $1 to $2")
    .replace(/\bZ(\d{1,2})\b/g, "zone $1")
    .split(" ")
    .map((w) =>
      /^\(.*\)$/.test(w) ? w : /^[A-Z\u0391-\u03A9]{2,}$/.test(w) ? w.toLowerCase() : w,
    )
    .join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
