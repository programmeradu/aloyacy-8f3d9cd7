// Client-side gate for the internal QA console.
//
// Not an authorisation boundary — the server function behind the dashboard
// does its own checks. This only keeps the internal surface out of casual
// sight, and it stays shut when VITE_QA_PASSPHRASE is unset so a fork or a
// misconfigured deploy never exposes it by default.

import { useEffect, useState, type FormEvent } from "react";

export const QA_STORAGE_KEY = "aloya-qa-unlocked";

const PASSPHRASE = import.meta.env["VITE_QA_PASSPHRASE"] as string | undefined;

/** Reads the per-session unlock flag after hydration. */
export function useQaUnlocked(): [boolean, () => void] {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(QA_STORAGE_KEY) === "1");
  }, []);
  return [unlocked, () => setUnlocked(true)];
}

export function QaPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (PASSPHRASE && value === PASSPHRASE) {
      window.sessionStorage.setItem(QA_STORAGE_KEY, "1");
      onUnlock();
    } else {
      setError(true);
    }
  };
  return (
    <main className="min-h-dvh bg-limestone grid place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
          Restricted
        </p>
        <h1 className="mt-3 font-display text-4xl text-ink leading-none">QA console</h1>
        <p className="mt-3 text-[13px] text-ink-soft">
          Phase machine telemetry. Enter the access phrase.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          className="mt-6 w-full rounded-2xl bg-card ring-1 ring-line px-4 py-3 font-mono text-[13px] text-ink focus:outline-none focus:ring-aegean-deep"
          placeholder="passphrase"
        />
        {error && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
            Wrong phrase
          </p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}
