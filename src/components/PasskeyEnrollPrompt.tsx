import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, Check, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import {
  isPasskeySupported,
  hasDismissedPasskeyPrompt,
  dismissPasskeyPrompt,
  registerPasskey,
} from "@/lib/passkeys.client";
import {
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
} from "@/lib/passkeys.functions";

export function PasskeyEnrollPrompt() {
  const { user, isAnonymous } = useAuth();
  const [supported, setSupported] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successDevice, setSuccessDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getOptionsFn = useServerFn(getPasskeyRegistrationOptions);
  const verifyFn = useServerFn(verifyPasskeyRegistration);

  useEffect(() => {
    if (!user?.id || isAnonymous) {
      setVisible(false);
      return;
    }

    if (hasDismissedPasskeyPrompt(user.id)) {
      setVisible(false);
      return;
    }

    let isMounted = true;
    isPasskeySupported().then((isAvail) => {
      if (isMounted && isAvail) {
        setSupported(true);
        setVisible(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, isAnonymous]);

  if (!visible || !supported || !user?.id || isAnonymous) {
    return null;
  }

  async function handleEnroll() {
    if (!user?.id || !user?.email) return;
    setBusy(true);
    setError(null);

    const result = await registerPasskey(
      user.id,
      user.email,
      getOptionsFn,
      verifyFn,
    );

    setBusy(false);

    if (result.ok) {
      setSuccessDevice(result.deviceName);
      dismissPasskeyPrompt(user.id);
      setTimeout(() => {
        setVisible(false);
      }, 3500);
    } else {
      setError(result.error);
    }
  }

  function handleDismiss() {
    if (user?.id) dismissPasskeyPrompt(user.id);
    setVisible(false);
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md animate-rise">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-limestone p-5 shadow-xl ring-1 ring-ink/5">
        <button
          onClick={handleDismiss}
          className="absolute right-3.5 top-3.5 rounded-full p-1 text-ink-soft hover:bg-ink/5 hover:text-ink"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {successDevice ? (
          <div className="flex items-center gap-3.5 py-1">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ink">Passkey Enabled!</p>
              <p className="text-xs text-ink-soft">
                {successDevice} registered. You can now sign in with 1 tap.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-aegean-deep/10 text-aegean-deep">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div className="pr-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display text-base font-semibold text-ink">
                    1-Tap Biometric Sign-In
                  </h3>
                  <ShieldCheck className="h-4 w-4 text-aegean-deep" />
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Enable Face ID, Touch ID, or your device lock to sign in instantly without waiting for email codes.
                </p>
              </div>
            </div>

            {error && <p className="text-xs text-ochre-deep">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleEnroll}
                className="flex-1 rounded-2xl bg-ink py-2.5 text-xs font-semibold text-limestone shadow-sm transition hover:bg-ink/90 disabled:opacity-50"
              >
                {busy ? "Setting up..." : "Enable Passkey"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-2xl border border-line bg-white px-4 py-2.5 text-xs font-medium text-ink-soft hover:bg-line/20 hover:text-ink"
              >
                Not Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
