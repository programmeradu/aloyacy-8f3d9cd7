// Wallet — mobile parity with the web `/wallet` route.
//
// Renders the Motion card (with QR + camera scan), balance + JCC sync
// tiles, JCC link CTA / linked state, eligible passes for renewal, Pro
// account card, accessibility prefs, fare grid, and either the JCC
// transactions list or the manual top-up history — same content order
// as the web page.
//
// Auto-syncs once per session:
//  1. Public verify + options (if a card is on file and balance > 5 min old).
//  2. JCC transactions (if linked and last sync > 10 min old).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView, View, Text, Pressable, RefreshControl, StyleSheet, Alert,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { palette } from "@/constants/theme";
import { MotionCardVisual } from "@/components/wallet/MotionCardVisual";
import { PassSheet, type SheetMode } from "@/components/wallet/PassSheet";
import { FareTile } from "@/components/wallet/FareTile";
import { TransactionList } from "@/components/wallet/TransactionList";
import { TopupHistory } from "@/components/wallet/TopupHistory";
import { RenewPasses } from "@/components/wallet/RenewPasses";
import { ProAccountCard } from "@/components/wallet/ProAccountCard";
import { AccessibilityPrefsCard } from "@/components/wallet/AccessibilityPrefsCard";
import { CardScanSheet } from "@/components/CardScanSheet";
import { GoProCard } from "@/components/GoProCard";
import { AuthCard } from "@/components/AuthCard";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";
import { NotificationsCard } from "@/components/NotificationsCard";
import {
  readPass, writePass, mergePass, clearJccLink, subscribePass,
  type MotionPass,
} from "@/lib/motionPass";
import { jccLogin, jccRefresh, jccSync, verifyMotionCard, getMotionCardOptions } from "@/lib/walletApi";
import { timeAgo } from "@/lib/walletFormat";
import { FadeSection } from "@/components/FadeSection";
import { assets } from "@/lib/assets";

const fareUrban = assets.fare_urban;
const fareNight = assets.fare_night;
const fareIntercity = assets.fare_intercity;

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [pass, setPass] = useState<MotionPass | null>(null);
  const [editing, setEditing] = useState<"none" | SheetMode>("none");
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    void readPass().then((p) => {
      if (alive) setPass(p);
    });
    const off = subscribePass((p) => setPass(p));
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
            if (!opts?.silent) Alert.alert("JCC session expired", "Sign in again to keep syncing.");
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

  // -- Auto sync on mount --
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!pass || autoSyncedRef.current || !hasCard) return;
    autoSyncedRef.current = true;
    if (Date.now() - pass.balanceUpdatedAt > 5 * 60_000) void runPublicSync();
    if (linked && Date.now() - pass.lastSyncAt > 10 * 60_000) void runSync({ silent: true });
  }, [pass, hasCard, linked, runPublicSync, runSync]);

  async function handleLink(email: string, password: string): Promise<string | null> {
    const r = await jccLogin(email, password);
    if (!r.ok) return r.error;
    const current = await readPass();
    await update({
      ...current,
      holder: current.holder || `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      jcc: {
        email: r.profile.email,
        displayName: `${r.profile.firstName} ${r.profile.lastName}`.trim() || r.profile.email,
        ...r.tokens,
        linkedAt: Date.now(),
      },
    });
    setTimeout(() => void runSync(), 100);
    return null;
  }

  async function handleUnlink() {
    const current = await readPass();
    await update(clearJccLink(current));
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      if (hasCard) await runPublicSync();
      if (linked) await runSync({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }

  if (!pass) {
    return <View style={{ flex: 1, backgroundColor: palette.limestone }} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: 44,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ width: 40 }} />
        <Text style={styles.kicker}>WALLET MOTION</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: 22, marginTop: 4 }}>
        <Text style={styles.hero}>
          Your Motion card{" "}
          <Text style={styles.heroItalic}>in your pocket</Text>
        </Text>
        <Text style={styles.body}>
          {hasCard
            ? "Live balance, top-up history, and a scan-ready QR on the printed pass — always with you."
            : "Add your Motion card once. Scan it, tap it in, or type the 10 digits from the back."}
        </Text>
      </View>

      {/* The Pass */}
      <View style={{ paddingHorizontal: 22, marginTop: 22 }}>
        <MotionCardVisual
          pass={pass}
          onTap={() => setEditing("card")}
          onScan={() => setScanning(true)}
        />
      </View>

      {hasCard ? (
        <>
          {/* Quick actions */}
          <View style={styles.tilesRow}>
            <ActionTile
              eyebrow="Balance"
              value={`€${pass.balanceEur.toFixed(2)}`}
              foot={
                pass.balanceUpdatedAt
                  ? `Live ${timeAgo(pass.balanceUpdatedAt)}`
                  : "Tap to check"
              }
              onPress={() => void runPublicSync()}
            />
            {linked ? (
              <ActionTile
                eyebrow="JCC Smart"
                value={syncing ? "Syncing…" : "Sync now"}
                foot={pass.jcc?.displayName || pass.jcc?.email || "Connected"}
                tone="aegean"
                onPress={() => void runSync()}
              />
            ) : (
              <ActionTile
                eyebrow="Log a top-up"
                value="+ Add"
                foot="Keep balance in sync offline"
                tone="aegean"
                onPress={() => setEditing("topup")}
              />
            )}
          </View>

          {/* JCC link CTA / linked strip */}
          <View style={{ paddingHorizontal: 22, marginTop: 14 }}>
            {linked ? (
              <View style={styles.linkedStrip}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.linkedKicker}>JCC LINKED</Text>
                  <Text style={styles.linkedTitle} numberOfLines={1}>
                    {pass.passName || "Auto-sync active"}
                  </Text>
                </View>
                <Pressable onPress={handleUnlink}>
                  <Text style={styles.unlink}>UNLINK</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing("link")}
                style={styles.linkCta}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.linkKicker}>AUTO-SYNC</Text>
                  <Text style={styles.linkLabel}>Link your JCC Smart account</Text>
                </View>
                <Text style={styles.linkAction}>CONNECT</Text>
              </Pressable>
            )}
          </View>

          {/* Renewable passes */}
          {pass.passes && pass.passes.length > 0 && (
            <View style={{ paddingHorizontal: 22, marginTop: 26 }}>
              <RenewPasses cardNumber={pass.number} passes={pass.passes} />
            </View>
          )}

          {/* Pro + accessibility */}
          <View style={{ paddingHorizontal: 22 }}>
            <ProAccountCard />
            <GoProCard />
            <AccessibilityPrefsCard />
          </View>

          {/* Fare grid */}
          <FadeSection index={0} style={{ paddingHorizontal: 22, marginTop: 24 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <FareTile label="Urban" value="€1.50" sub="90 min" image={fareUrban} />
              <FareTile label="Night" value="€2.50" sub="21:00–05:00" image={fareNight} tone="dark" />
              <FareTile label="Intercity" value="€7.00" sub="single ride" image={fareIntercity} />
            </View>
          </FadeSection>

          {/* History */}
          <FadeSection index={1} style={{ paddingHorizontal: 22, marginTop: 28 }}>
            {linked ? (
              <TransactionList transactions={pass.transactions} />
            ) : (
              <TopupHistory pass={pass} />
            )}
          </FadeSection>
        </>
      ) : (
        <View style={{ paddingHorizontal: 22, marginTop: 22 }}>
          <Pressable onPress={() => setEditing("card")} style={styles.addBtn}>
            <Text style={styles.addLabel}>ADD YOUR CARD</Text>
          </Pressable>
          <Text style={styles.addFoot}>
            Aloya keeps your card details on this device. Link JCC only if you
            want auto-synced balance and transactions.
          </Text>
        </View>
      )}

      {/* Account + settings — moved here from the retired More tab. */}
      <FadeSection index={2} style={{ paddingHorizontal: 22, marginTop: 34 }}>
        <Text style={styles.sectionEyebrow}>ACCOUNT SETTINGS</Text>
        <AuthCard />
        <NotificationsCard />
        <OfflineSchedulesCard />
      </FadeSection>

      <View style={{ paddingHorizontal: 22, marginTop: 20 }}>
        <SettingsRow
          label="App settings"
          value="Language, notifications, legal"
          onPress={() => router.push("/settings")}
        />
        <SettingsRow
          label="About Aloya"
          value="v0.1"
          onPress={() => void Linking.openURL("https://app.aloya.cy/about")}
        />
      </View>

      {editing !== "none" && (
        <PassSheet
          mode={editing}
          pass={pass}
          onClose={() => setEditing("none")}
          onSave={update}
          onLink={handleLink}
        />
      )}
      {scanning && <CardScanSheet visible={scanning} onClose={() => setScanning(false)} />}
    </ScrollView>
  );
}

function ActionTile({
  eyebrow, value, foot, onPress, tone = "default",
}: {
  eyebrow: string;
  value: string;
  foot: string;
  onPress: () => void;
  tone?: "default" | "aegean";
}) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={styles.tile}
    >
      <Text style={styles.tileEyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={[styles.tileValue, tone === "aegean" && { color: palette.aegeanDeep }]}>
        {value}
      </Text>
      <Text style={styles.tileFoot} numberOfLines={2}>{foot}</Text>
    </Pressable>
  );
}

function SettingsRow({
  label, value, onPress,
}: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 6,
  },
  kicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: palette.inkSoft,
  },
  hero: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 38,
    letterSpacing: -0.8,
    color: palette.ink,
    lineHeight: 42,
  },
  heroItalic: {
    fontStyle: "italic",
    color: palette.aegeanDeep,
  },
  body: {
    marginTop: 10,
    fontFamily: "Geist_500Medium",
    fontSize: 13.5,
    lineHeight: 20,
    color: palette.inkSoft,
    maxWidth: 380,
  },
  tilesRow: {
    marginTop: 16,
    paddingHorizontal: 22,
    flexDirection: "row",
    gap: 10,
  },
  tile: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    minHeight: 108,
  },
  tileEyebrow: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  tileValue: {
    marginTop: 10,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 26,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  tileFoot: {
    marginTop: 8,
    fontFamily: "Geist_500Medium",
    fontSize: 11,
    color: palette.inkSoft,
  },
  linkedStrip: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 12,
  },
  linkedKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  linkedTitle: {
    marginTop: 4,
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  unlink: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  linkCta: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.aegeanDeep,
    gap: 12,
  },
  linkKicker: {
    fontFamily: "Geist_700Bold",
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(246,241,231,0.7)",
  },
  linkLabel: {
    marginTop: 4,
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.limestone,
  },
  linkAction: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: palette.limestone,
  },
  addBtn: {
    backgroundColor: palette.ink,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  addLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 2.4,
    color: palette.limestone,
  },
  addFoot: {
    marginTop: 12,
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: palette.inkSoft,
  },
  sectionEyebrow: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: palette.inkSoft,
    marginBottom: 8,
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    marginTop: 8,
  },
  settingsLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  settingsValue: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    color: palette.inkSoft,
  },
});
