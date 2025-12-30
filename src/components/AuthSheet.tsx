import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestEmailOtp } from "@/lib/otp.functions";

export function AuthSheet({
  open,
  onClose,
  title = "Sign in to continue",
  subtitle = "We'll email you a 6-digit code. No password.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendOtp = useServerFn(requestEmailOtp);

  if (!open) return null;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Use our project-specific OTP delivery (server generates the code via
      // the Supabase Admin API and emails it via Resend). This bypasses the
      // default Supabase auth email sender entirely so the code is always
      // present in the email regardless of template configuration.
      const r = await sendOtp({ data: { email: email.trim() } });
      if (!r.ok) throw new Error(r.error);
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
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
      setError(err instanceof Error ? err.message : "Invalid or expired code");
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
        <h2 className="font-serif text-2xl text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {stage === "email"
            ? subtitle
            : `Enter the 6-digit code we sent to ${email}.`}
        </p>

        {stage === "email" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-aegean-deep focus:outline-none"
            />
            {error && <p className="text-xs text-ochre-deep">{error}</p>}
            <button
              type="submit"
              disabled={busy || !email}
              className="w-full rounded-2xl bg-ink py-3 text-sm font-medium text-limestone disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send me the code"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-mono uppercase tracking-[0.16em] text-ink-soft"
            >
              Not now
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
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-ink placeholder:text-ink-soft/40 focus:border-aegean-deep focus:outline-none"
            />
            {error && <p className="text-xs text-ochre-deep">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full rounded-2xl bg-ink py-3 text-sm font-medium text-limestone disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify & continue"}
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
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
