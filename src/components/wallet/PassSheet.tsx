import { useState } from "react";
import { toast } from "sonner";
import { formatCardNumber, maskedNumber, type MotionPass } from "@/lib/motion-pass";
import { useNfcScan } from "@/lib/useNfc";
import { JccLogo } from "./JccLogo";
import { timeAgo } from "./utils";

export type SheetMode = "card" | "balance" | "topup" | "link";

export function PassSheet({
  mode,
  pass,
  onClose,
  onSave,
  onLink,
}: {
  mode: SheetMode;
  pass: MotionPass;
  onClose: () => void;
  onSave: (p: MotionPass) => void;
  onLink: (email: string, password: string) => Promise<string | null>;
}) {
  const [number, setNumber] = useState(pass.number);
  const [holder, setHolder] = useState(pass.holder ?? "");
  const [tier, setTier] = useState(pass.tier ?? "");
  const [validUntil, setValidUntil] = useState(pass.validUntil ?? "");
  const [balance, setBalance] = useState(
    pass.balanceEur > 0 ? pass.balanceEur.toFixed(2) : "",
  );
  const [topup, setTopup] = useState("");
  const [email, setEmail] = useState(pass.jcc?.email ?? "");
  const [password, setPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const nfc = useNfcScan();

  const title =
    mode === "card"
      ? "Your Motion card"
      : mode === "balance"
        ? "Update balance"
        : mode === "topup"
          ? "Log a top-up"
          : "Link JCC Smart";

  async function save() {
    if (mode === "card") {
      const clean = number.replace(/\D/g, "").slice(0, 16);
      onSave({
        ...pass,
        number: clean,
        holder: holder.trim(),
        tier: tier.trim() || undefined,
        validUntil: validUntil.trim() || undefined,
      });
    } else if (mode === "balance") {
      const v = parseFloat(balance);
      if (!isNaN(v) && v >= 0) {
        onSave({ ...pass, balanceEur: v, balanceUpdatedAt: Date.now() });
      }
    } else if (mode === "topup") {
      const v = parseFloat(topup);
      if (!isNaN(v) && v > 0) {
        const now = Date.now();
        onSave({
          ...pass,
          balanceEur: pass.balanceEur + v,
          balanceUpdatedAt: now,
          topups: [...pass.topups, { id: String(now), amountEur: v, at: now }],
        });
      }
    } else if (mode === "link") {
      if (!email || !password) {
        setLinkError("Email and password are required.");
        return;
      }
      setLinking(true);
      setLinkError(null);
      const err = await onLink(email.trim(), password);
      setLinking(false);
      if (err) {
        setLinkError(err);
        return;
      }
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm animate-rise"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-limestone rounded-t-[28px] sm:rounded-[28px] ring-1 ring-line p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft hover:text-ink"
          >
            Close
          </button>
        </div>

        {mode === "card" && (
          <div className="space-y-4">
            <NfcScanBlock nfc={nfc} onUid={(digits) => setNumber(digits)} />
            <Field label="Card number">
              <input
                inputMode="numeric"
                value={formatCardNumber(number)}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="01 2345 6789"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 font-mono text-lg tracking-[0.18em] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <Field label="Cardholder name (optional)">
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="Andreas G."
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tier">
                <input
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  placeholder="18+ Standard"
                  className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[14px] text-ink focus:outline-none focus:ring-aegean-deep/40"
                />
              </Field>
              <Field label="Valid until">
                <input
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  placeholder="07/05/2036"
                  className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 font-mono text-[14px] text-ink focus:outline-none focus:ring-aegean-deep/40"
                />
              </Field>
            </div>
            <p className="text-[11px] text-ink-soft">
              The masked card on display: {maskedNumber(number)}
            </p>
          </div>
        )}

        {mode === "balance" && (
          <div className="space-y-4">
            <Field label="Balance in EUR">
              <div className="flex items-center bg-card rounded-2xl ring-1 ring-line px-4 py-3 focus-within:ring-aegean-deep/40">
                <span className="font-display text-2xl text-ink-soft mr-2">€</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  value={balance}
                  onChange={(e) => setBalance(e.target.value.replace(",", "."))}
                  placeholder="0.00"
                  className="w-full bg-transparent font-display text-2xl text-ink focus:outline-none"
                />
              </div>
            </Field>
            <p className="text-[11px] text-ink-soft">
              Last updated{" "}
              {pass.balanceUpdatedAt ? timeAgo(pass.balanceUpdatedAt) : "never"}.
            </p>
          </div>
        )}

        {mode === "topup" && (
          <div className="space-y-4">
            <Field label="Top-up amount">
              <div className="flex items-center bg-card rounded-2xl ring-1 ring-line px-4 py-3 focus-within:ring-aegean-deep/40">
                <span className="font-display text-2xl text-ink-soft mr-2">€</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  value={topup}
                  onChange={(e) => setTopup(e.target.value.replace(",", "."))}
                  placeholder="10.00"
                  className="w-full bg-transparent font-display text-2xl text-ink focus:outline-none"
                />
              </div>
            </Field>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => setTopup(v.toFixed(2))}
                  className="flex-1 rounded-xl bg-card ring-1 ring-line py-2 font-display text-lg text-ink hover:ring-aegean-deep/30"
                >
                  €{v}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 -mt-1">
              <JccLogo className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-line bg-white" />
              <p className="text-[12px] text-ink-soft">
                We log in to JCC Smart on your behalf and pull your bus card
                balance + recent activity. We keep only the session token on
                this device — never your password.
              </p>
            </div>
            <Field label="JCC Smart email">
              <input
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-card rounded-2xl ring-1 ring-line px-4 py-3 text-[15px] text-ink focus:outline-none focus:ring-aegean-deep/40"
              />
            </Field>
            {linkError && (
              <p className="text-[12px] text-destructive">{linkError}</p>
            )}
          </div>
        )}

        <button
          onClick={save}
          disabled={linking}
          className="mt-6 w-full rounded-2xl bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-limestone hover:bg-ink/90 transition-colors disabled:opacity-60"
        >
          {mode === "link" ? (linking ? "Linking…" : "Link account") : "Save"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

/* ============================================================
 * NFC tap-to-scan block (Android Chrome only). Falls back to a
 * one-line explainer on iOS / unsupported browsers so the user
 * always knows why the button isn't there.
 * ============================================================ */
function NfcScanBlock({
  nfc,
  onUid,
}: {
  nfc: ReturnType<typeof useNfcScan>;
  onUid: (digits: string) => void;
}) {
  if (!nfc.supported) {
    return (
      <div className="rounded-2xl ring-1 ring-line bg-card px-4 py-3">
        <p className="font-mono uppercase tracking-[0.22em] text-[10px] text-ink-soft">
          Tap to scan
        </p>
        <p className="mt-1 text-[12px] text-ink-soft">
          Available on Android with Chrome. Type the 14-digit UID from the back
          of your card below.
        </p>
      </div>
    );
  }

  const scanning = nfc.status === "scanning";

  async function run() {
    const uid = await nfc.scan();
    if (uid?.digits) {
      onUid(uid.digits);
      toast.success("Card scanned", { description: `UID ${uid.digits}` });
    }
  }

  return (
    <div className="rounded-2xl ring-1 ring-aegean-deep/30 bg-aegean-soft/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono uppercase tracking-[0.22em] text-[10px] text-aegean-deep">
            Tap card to scan
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {scanning
              ? "Hold your Motion card against the back of your phone…"
              : "Skip typing. Tap your card to fill in the 14-digit UID."}
          </p>
        </div>
        <button
          type="button"
          onClick={scanning ? nfc.stop : run}
          className="shrink-0 rounded-full bg-ink text-limestone px-4 py-2 text-[12px] font-medium hover:bg-ink/90"
        >
          {scanning ? "Cancel" : "Scan"}
        </button>
      </div>
      {scanning && (
        <div className="mt-3 flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full rounded-full bg-aegean-deep opacity-60 animate-pulse-ring" />
            <span className="relative inline-flex size-3 rounded-full bg-aegean-deep" />
          </span>
          <span className="font-mono text-[11px] text-aegean-deep">Listening for NFC…</span>
        </div>
      )}
      {nfc.status === "error" && nfc.error && (
        <p className="mt-2 text-[12px] text-destructive">{nfc.error}</p>
      )}
      {nfc.status === "success" && nfc.lastUid && (
        <p className="mt-2 font-mono text-[11px] text-olive">
          Read UID {nfc.lastUid.digits}
        </p>
      )}
    </div>
  );
}
