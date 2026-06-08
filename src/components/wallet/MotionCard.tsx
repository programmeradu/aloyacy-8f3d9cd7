import { useQrSvg } from "@/lib/useQr";
import type { MotionPass } from "@/lib/motion-pass";
import motionCardBase from "@/assets/motion-card-base.png";
import { useI18n } from "@/lib/i18n";

/* ============================================================
 * Motion Card — photoreal printed artwork (generated image) +
 * dynamic overlays for holder name, tier, expiry, and the kiosk QR.
 * Brand colors are hard-coded here on purpose — faithful reproduction
 * of an external brand asset, not app chrome.
 * ============================================================ */
export function MotionCard({ pass, onTap }: { pass: MotionPass; onTap: () => void }) {
  const { t } = useI18n();
  const hasCard = pass.number.replace(/\D/g, "").length >= 8;
  const qrValue = hasCard ? pass.number.replace(/\D/g, "") : "MOTION-DEMO";
  const qrSvg = useQrSvg(qrValue, { color: "#1a2a6c" });

  const holderName =
    (pass.holder?.trim() || pass.jcc?.displayName?.trim() || "").toUpperCase() ||
    t("wallet.addYourName");
  const tierLabel = (pass.tier?.trim() || t("wallet.tierDefault")).toUpperCase();
  const validUntil = pass.validUntil?.trim() || "—/—/——";

  return (
    <button
      type="button"
      onClick={onTap}
      className="group block w-full text-left"
      aria-label={hasCard ? t("wallet.cardEditAria") : t("wallet.cardAddAria")}
    >
      <article
        className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[20px] ring-1 ring-ink/10 shadow-[0_24px_60px_-28px_rgba(8,28,40,0.4)] transition-transform duration-500 ease-out group-hover:-translate-y-0.5"
        style={{ containerType: "inline-size" }}
      >
        <img
          src={motionCardBase}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover select-none pointer-events-none"
          draggable={false}
        />

        {/* QR sits inside the printed photo square (top-right) */}
        <div
          className="absolute bg-white"
          style={{ top: "17%", left: "58%", width: "36%", height: "56%", padding: "2.2%" }}
          aria-label={t("wallet.qrAria")}
        >
          {qrSvg ? (
            <div
              className="size-full [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="size-full bg-ink/5" />
          )}
        </div>

        {/* Holder name + tier — clean band just under the "BUS CARD" wordmark */}
        <div className="absolute" style={{ top: "37%", left: "5%", right: "45%" }}>
          <p
            className="font-sans font-semibold truncate uppercase"
            style={{
              fontSize: "clamp(9px, 2.9cqw, 15px)",
              color: hasCard ? "#9b1c1c" : "#9b1c1c80",
              letterSpacing: "0.03em",
              lineHeight: 1,
            }}
          >
            {holderName}
          </p>
          <p
            className="mt-[1.4cqw] font-sans font-medium uppercase truncate"
            style={{
              fontSize: "clamp(7px, 2.1cqw, 11px)",
              color: "#1a2a6c",
              letterSpacing: "0.06em",
              lineHeight: 1,
            }}
          >
            {tierLabel}
          </p>
        </div>

        {/* Valid Until — directly under the printed "Ισχύει Μέχρι / Valid Until:" label */}
        <div
          className="absolute text-center"
          style={{ top: "68%", left: "33%", width: "24%" }}
        >
          <p
            className="font-mono font-semibold"
            style={{
              fontSize: "clamp(8px, 2.4cqw, 12px)",
              color: "#1a2a6c",
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            {validUntil}
          </p>
        </div>

        {/* Subtle gloss to sell the plastic */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.12) 100%)",
          }}
        />
      </article>
      {!hasCard && (
        <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("wallet.tapToSetUp")}
        </p>
      )}
    </button>
  );
}
