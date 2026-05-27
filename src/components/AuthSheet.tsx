import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function AuthSheet({
  open,
  onClose,
  title = "Sign in to continue",
  subtitle = "We'll email you a one-tap link. No password.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
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
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>

        {sent ? (
          <div className="mt-6 rounded-2xl bg-aegean-soft/40 p-5 text-sm text-ink">
            Link sent to <span className="font-medium">{email}</span>. Open it on
            this device to continue.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
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
              {busy ? "Sending…" : "Email me the link"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-mono uppercase tracking-[0.16em] text-ink-soft"
            >
              Not now
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
