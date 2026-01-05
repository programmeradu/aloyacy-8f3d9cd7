import { useState, type ReactNode } from "react";
import { useProSubscription } from "@/lib/usePro";
import { PaywallSheet } from "./PaywallSheet";

interface ProGateProps {
  /** What the gate is unlocking, used in CTA copy. */
  feature: string;
  /** Content shown only to Pro users. */
  children: ReactNode;
  /** Optional preview shown blurred behind the unlock CTA. */
  preview?: ReactNode;
}

/**
 * Wraps Pro-only content. Non-Pro users see a blurred preview (optional) with
 * a one-tap unlock button that opens the paywall sheet. Pro users see the
 * content as-is, no wrapper chrome.
 */
export function ProGate({ feature, children, preview }: ProGateProps) {
  const { isPro, loading } = useProSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  if (loading) return null;
  if (isPro) return <>{children}</>;

  return (
    <>
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-line bg-card">
        {preview ? (
          <div
            aria-hidden
            className="pointer-events-none select-none blur-[6px] opacity-50"
          >
            {preview}
          </div>
        ) : (
          <div aria-hidden className="h-24 bg-gradient-to-br from-aegean/10 to-ochre-sun/10" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-card/40 backdrop-blur-[2px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            Aloya Pro
          </p>
          <p className="font-display text-[20px] leading-tight text-ink text-balance max-w-[18ch]">
            {feature}
          </p>
          <button
            onClick={() => setPaywallOpen(true)}
            className="mt-1 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium tracking-tight text-limestone hover:bg-ink/90 transition-colors"
          >
            Unlock from €1.99/wk
          </button>
        </div>
      </div>
      <PaywallSheet open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}
