import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseCombinedCreds, type AwsCredsInput } from "@aloya/core/bedrock-metering";

/**
 * Panel settings persisted in sessionStorage for this tab only. Credentials are
 * never written to localStorage and never leave the browser except to AWS.
 */
export function useSessionCreds<T extends Record<string, unknown>>(
  storageKey: string,
  defaults: T,
): {
  combined: string;
  setCombined: (v: string) => void;
  settings: T;
  patch: (next: Partial<T>) => void;
  parsed: AwsCredsInput | null;
  hydrated: boolean;
} {
  const [combined, setCombinedState] = useState("");
  const [settings, setSettings] = useState<T>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { combined?: string } & Partial<T>;
        const { combined: savedCombined, ...rest } = parsed;
        if (typeof savedCombined === "string") setCombinedState(savedCombined);
        setSettings({ ...defaultsRef.current, ...(rest as Partial<T>) });
      }
    } catch {
      /* corrupt entry — fall back to defaults */
    }
    setHydrated(true);
  }, [storageKey]);

  const write = useCallback(
    (nextCombined: string, nextSettings: T) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ combined: nextCombined, ...nextSettings }),
        );
      } catch {
        /* private mode / quota — in-memory state still works */
      }
    },
    [storageKey],
  );

  const setCombined = useCallback(
    (v: string) => {
      setCombinedState(v);
      write(v, settings);
    },
    [settings, write],
  );

  const patch = useCallback(
    (next: Partial<T>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...next };
        write(combined, merged);
        return merged;
      });
    },
    [combined, write],
  );

  const parsed = useMemo(() => parseCombinedCreds(combined), [combined]);

  return { combined, setCombined, settings, patch, parsed, hydrated };
}
