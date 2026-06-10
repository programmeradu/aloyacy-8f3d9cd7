import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestEmailOtp, linkEmailAndRequestOtp } from "@/lib/otp.functions";
import { useAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/i18n";

export function AuthSheet({
  open,
  onClose,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendOtp = useServerFn(requestEmailOtp);
  const linkOtp = useServerFn(linkEmailAndRequestOtp);
  const { isAnonymous } = useAuth();
  // True when we used the legacy sign-in flow (not identity-linking), so
  // verifyOtp must use type:'email' against a magiclink-issued code that
  // will swap the anon session for the existing account.
  const [didFallback, setDidFallback] = useState(false);

  if (!open) return null;

  const titleText = title ?? t("auth.title");
  const subtitleText = subtitle ?? t("auth.subtitle");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDidFallback(false);
    try {
      const trimmed = email.trim();
      // Anonymous users: try to LINK the email to the existing uid so
      // their cloud data / Pro subscription survives the upgrade.
      if (isAnonymous) {
        const r = await linkOtp({ data: { email: trimmed } });
        if (r.ok) {
          setStage("code");
          return;
        }
        // Email already belongs to another account — fall back to plain
        // sign-in, which will swap the anon session for that account.
        if (r.code === "email_taken") {
          setDidFallback(true);
          const r2 = await sendOtp({ data: { email: trimmed } });
          if (!r2.ok) throw new Error(r2.error);
          setStage("code");
          return;
        }
        throw new Error(r.error);
      }
      // Already permanent (rare here) — plain sign-in.
      setDidFallback(true);
      const r = await sendOtp({ data: { email: trimmed } });
      if (!r.ok) throw new Error(r.error);
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.errSend"));
    } finally {
      setBusy(false);
    }
  }


  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.errVerify"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-t-3xl bg-limestone p-6 pb-10 ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />
        <h2 className="font-display text-2xl text-ink">{titleText}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {stage === "email"
            ? subtitleText
            : t("auth.codeSentTo", { email })}
        </p>

        {stage === "email" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-aegean-deep focus:outline-none"
            />
            {error && <p className="text-xs text-ochre-deep">{error}</p>}
            <button
              type="submit"
              disabled={busy || !email}
              className="w-full rounded-2xl bg-ink py-3 text-sm font-medium text-limestone disabled:opacity-50"
            >
              {busy ? t("auth.sending") : t("auth.send")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-mono uppercase tracking-[0.16em] text-ink-soft"
            >
              {t("auth.notNow")}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("auth.codePlaceholder")}
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink placeholder:text-ink-soft/40 focus:border-aegean-deep focus:outline-none"
            />
            {error && <p className="text-xs text-ochre-deep">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full rounded-2xl bg-ink py-3 text-sm font-medium text-limestone disabled:opacity-50"
            >
              {busy ? t("auth.verifying") : t("auth.verify")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("email");
                setCode("");
                setError(null);
              }}
              className="w-full py-2 text-xs font-mono uppercase tracking-[0.16em] text-ink-soft"
            >
              {t("auth.useDifferentEmail")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
