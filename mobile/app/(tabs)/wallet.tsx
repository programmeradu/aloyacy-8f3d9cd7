// Wallet — mobile parity with the web `/wallet` route.
//
// Renders the Motion card (with QR + camera scan), balance + JCC sync
// tiles, JCC link CTA / linked state, eligible passes for renewal, Pro
// account card, accessibility prefs, fare grid, and either the JCC
// transactions list or the manual top-up history — same content order
// as the web page.
//
// Every side effect (storage, balance sync, JCC tokens, NFC, wallet handoff)
// lives in useWalletSync; this file is the layout.

import { useState } from "react";
import {
  ScrollView, View, Text, Pressable, RefreshControl, Linking, Platform, Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { MotionCardVisual } from "@/components/wallet/MotionCardVisual";
import { PassSheet, type SheetMode } from "@/components/wallet/PassSheet";
import { FareTile } from "@/components/wallet/FareTile";
import { TransactionList } from "@/components/wallet/TransactionList";
import { TopupHistory } from "@/components/wallet/TopupHistory";
import { RenewPasses } from "@/components/wallet/RenewPasses";
import { AccessibilityPrefsCard } from "@/components/wallet/AccessibilityPrefsCard";
import { ActionTile, SettingsRow } from "@/components/wallet/WalletTiles";
import { walletStyles as styles } from "@/components/wallet/walletScreenStyles";
import { CardScanSheet } from "@/components/CardScanSheet";
import { AuthCard } from "@/components/AuthCard";
import { useWalletSync } from "@/hooks/useWalletSync";
import { timeAgo } from "@/lib/walletFormat";
import { FadeSection } from "@/components/FadeSection";
import { assets } from "@/lib/assets";

const fareUrban = assets.fare_urban;
const fareNight = assets.fare_night;
const fareIntercity = assets.fare_intercity;

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<"none" | SheetMode>("none");
  const [scanning, setScanning] = useState(false);
  const {
    pass, hasCard, linked, nfcAvailable, syncing, refreshing,
    update, runPublicSync, runSync, onRefresh, onNfcScan, onAddToWallet,
    handleLink, handleUnlink,
  } = useWalletSync();

  if (!pass) {
    return <View style={{ flex: 1, backgroundColor: palette.limestone }} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.limestone }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 44 }}
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
          Your Motion card <Text style={styles.heroItalic}>in your pocket</Text>
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
          onNfc={nfcAvailable ? onNfcScan : undefined}
        />

        {hasCard && (
          <FadeSection index={1} style={{ marginTop: 16 }}>
            <Pressable
              onPress={onAddToWallet}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.walletBtn,
                pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Image
                source={Platform.OS === "ios" ? assets.apple_wallet : assets.google_wallet}
                style={styles.walletIcon}
                resizeMode="contain"
              />
              <Text style={styles.walletText}>
                Add to {Platform.OS === "ios" ? "Apple" : "Google"} Wallet
              </Text>
            </Pressable>
          </FadeSection>
        )}
      </View>

      {hasCard ? (
        <>
          {/* Quick actions */}
          <View style={styles.tilesRow}>
            <ActionTile
              eyebrow="Balance"
              value={`€${pass.balanceEur.toFixed(2)}`}
              foot={pass.balanceUpdatedAt ? `Live ${timeAgo(pass.balanceUpdatedAt)}` : "Tap to check"}
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
                <Pressable onPress={handleUnlink} accessibilityRole="button">
                  <Text style={styles.unlink}>UNLINK</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing("link")}
                accessibilityRole="button"
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

          <View style={{ paddingHorizontal: 22 }}>
            <AccessibilityPrefsCard />
          </View>

          {/* Fare grid */}
          <FadeSection index={0} style={{ paddingHorizontal: 22, marginTop: 24 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <FareTile label="Urban" value="€2.00" sub="90 min" image={fareUrban} />
              <FareTile label="Night" value="€3.50" sub="21:00–04:00" image={fareNight} tone="dark" />
              <FareTile label="Intercity" value="€5–€8" sub="single (cash)" image={fareIntercity} />
            </View>
          </FadeSection>

          {/* History */}
          <FadeSection index={1} style={{ paddingHorizontal: 22, marginTop: 28 }}>
            {linked ? <TransactionList transactions={pass.transactions} /> : <TopupHistory pass={pass} />}
          </FadeSection>
        </>
      ) : (
        <View style={{ paddingHorizontal: 22, marginTop: 22 }}>
          <Pressable
            onPress={() => setEditing("card")}
            accessibilityRole="button"
            style={styles.addBtn}
          >
            <Text style={styles.addLabel}>ADD YOUR CARD</Text>
          </Pressable>
          <Text style={styles.addFoot}>
            Aloya keeps your card details on this device. Link JCC only if you want auto-synced
            balance and transactions.
          </Text>
        </View>
      )}

      {/* Account + settings — moved here from the retired More tab. */}
      <FadeSection index={2} style={{ paddingHorizontal: 22, marginTop: 34 }}>
        <Text style={styles.sectionEyebrow}>ACCOUNT SETTINGS</Text>
        <AuthCard />
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
