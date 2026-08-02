// All Motion-wallet side effects for the Wallet tab: reading the stored pass,
// the public balance/options sync, the JCC linked sync (with token refresh and
// one retry on expiry), NFC capture, and the Apple/Google Wallet handoff.
//
// The screen stays presentational; everything that talks to storage, the OS, or
// the network lives here.

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  readPass,
  writePass,
  clearJccLink,
  subscribePass,
  type MotionPass,
} from "@/lib/motionPass";
import { scanCardUid, isNfcSupported } from "@/lib/nfc";
import {
  jccLogin,
  jccRefresh,
  jccSync,
  verifyMotionCard,
  getMotionCardOptions,
} from "@/lib/walletApi";
import { API_BASE } from "@/lib/api";

const BALANCE_STALE_MS = 5 * 60_000;
const JCC_STALE_MS = 10 * 60_000;

export type WalletSync = {
  pass: MotionPass | null;
  hasCard: boolean;
  linked: boolean;
  nfcAvailable: boolean;
  syncing: boolean;
  refreshing: boolean;
  update: (next: MotionPass) => Promise<void>;
  runPublicSync: () => Promise<void>;
  runSync: (opts?: { silent?: boolean }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNfcScan: () => Promise<void>;
  onAddToWallet: () => Promise<void>;
  handleLink: (email: string, password: string) => Promise<string | null>;
  handleUnlink: () => Promise<void>;
};

export function useWalletSync(): WalletSync {
  const [pass, setPass] = useState<MotionPass | null>(null);
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    void readPass().then((p) => {
      if (alive) setPass(p);
    });
    const off = subscribePass((p) => setPass(p));
    void isNfcSupported().then(setNfcAvailable);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (next: MotionPass) => {
    setPass(next);
    await writePass(next);
  }, []);

  const hasCard = (pass?.number ?? "").replace(/\D/g, "").length >= 8;
  const linked = !!pass?.jcc;

  // -- Public sync (verify + options) --
  const runPublicSync = useCallback(async () => {
    const current = await readPass();
    const cardUid = current.number.replace(/\D/g, "");
    if (cardUid.length < 6) return;
    const [verify, opts] = await Promise.all([
      verifyMotionCard(cardUid),
      getMotionCardOptions(cardUid),
    ]);
    const next: MotionPass = { ...current };
    let changed = false;
    if (verify.ok) {
      next.balanceEur = verify.balanceEur;
      next.balanceUpdatedAt = verify.syncedAt;
      next.cardType = verify.cardType;
      changed = true;
    }
    if (opts.ok) {
      next.passes = opts.passes;
      next.passesUpdatedAt = opts.syncedAt;
      if (!verify.ok) {
        next.balanceEur = opts.balanceEur;
        next.balanceUpdatedAt = opts.syncedAt;
      }
      changed = true;
    }
    if (changed) await update(next);
  }, [update]);

  // -- JCC linked sync --
  const runSync = useCallback(
    async (opts?: { silent?: boolean }) => {
      const current = await readPass();
      if (!current.jcc || !current.number) return;
      setSyncing(true);
      try {
        let tokens = {
          accessToken: current.jcc.accessToken,
          refreshToken: current.jcc.refreshToken,
          expiresAt: current.jcc.expiresAt,
        };
        if (tokens.expiresAt - Date.now() < 60_000) {
          const r = await jccRefresh(tokens.accessToken, tokens.refreshToken);
          if (!r.ok) {
            await update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
            if (!opts?.silent) {
              Alert.alert("JCC session expired", "Sign in again to keep syncing.");
            }
            return;
          }
          tokens = r.tokens;
          await update({ ...current, jcc: { ...current.jcc, ...tokens } });
        }
        const cardUid = current.number.replace(/\D/g, "");
        let res = await jccSync(tokens.accessToken, cardUid, "Last30");
        if (!res.ok && "code" in res && res.code === "expired") {
          const r = await jccRefresh(tokens.accessToken, tokens.refreshToken);
          if (!r.ok) {
            await update({ ...current, jcc: { ...current.jcc, expiresAt: 0 } });
            if (!opts?.silent) Alert.alert("JCC session expired");
            return;
          }
          tokens = r.tokens;
          res = await jccSync(tokens.accessToken, cardUid, "Last30");
        }
        if (!res.ok) {
          if (!opts?.silent) {
            Alert.alert("Sync failed", "error" in res ? res.error : "Try again in a moment.");
          }
          return;
        }
        await update({
          ...current,
          jcc: { ...current.jcc, ...tokens },
          balanceEur: res.balanceEur,
          balanceUpdatedAt: res.syncedAt,
          lastSyncAt: res.syncedAt,
          passName: res.passName,
          transactions: res.transactions,
        });
        if (!opts?.silent) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } finally {
        setSyncing(false);
      }
    },
    [update],
  );

  // -- Auto sync once per session --
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!pass || autoSyncedRef.current || !hasCard) return;
    autoSyncedRef.current = true;
    if (Date.now() - pass.balanceUpdatedAt > BALANCE_STALE_MS) void runPublicSync();
    if (linked && Date.now() - pass.lastSyncAt > JCC_STALE_MS) void runSync({ silent: true });
  }, [pass, hasCard, linked, runPublicSync, runSync]);

  const onNfcScan = useCallback(async () => {
    const res = await scanCardUid();
    if (res.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await update({ ...(pass ?? (await readPass())), number: res.cardUid });
      await runPublicSync();
    } else if (res.reason === "error") {
      Alert.alert("NFC Error", res.message);
    }
  }, [pass, update, runPublicSync]);

  const onAddToWallet = useCallback(async () => {
    if (!pass || !hasCard) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${API_BASE}/api/public/wallet/pass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: Platform.OS === "ios" ? "ios" : "android",
          cardNumber: pass.number.replace(/\D/g, ""),
          holderName: pass.holder,
          balance: pass.balanceEur,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body?.error || "Failed to generate pass");

      // Google Wallet returns a save link we can hand straight to the OS.
      // Apple returns a signed .pkpass URL, which iOS opens in Wallet.
      const canOpen = await Linking.canOpenURL(body.url).catch(() => false);
      if (!canOpen) throw new Error("Your device can't open the wallet link.");
      await Linking.openURL(body.url);
    } catch (e) {
      Alert.alert(
        "Couldn't add the pass",
        e instanceof Error && e.message
          ? e.message
          : "We couldn't reach the pass server. Try again in a moment.",
      );
    }
  }, [pass, hasCard]);

  const handleLink = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const r = await jccLogin(email, password);
      if (!r.ok) return r.error;
      const current = await readPass();
      const displayName = `${r.profile.firstName} ${r.profile.lastName}`.trim();
      await update({
        ...current,
        holder: current.holder || displayName,
        jcc: {
          email: r.profile.email,
          displayName: displayName || r.profile.email,
          ...r.tokens,
          linkedAt: Date.now(),
        },
      });
      setTimeout(() => void runSync(), 100);
      return null;
    },
    [update, runSync],
  );

  const handleUnlink = useCallback(async () => {
    const current = await readPass();
    await update(clearJccLink(current));
  }, [update]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (hasCard) await runPublicSync();
      if (linked) await runSync({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [hasCard, linked, runPublicSync, runSync]);

  return {
    pass,
    hasCard,
    linked,
    nfcAvailable,
    syncing,
    refreshing,
    update,
    runPublicSync,
    runSync,
    onRefresh,
    onNfcScan,
    onAddToWallet,
    handleLink,
    handleUnlink,
  };
}
