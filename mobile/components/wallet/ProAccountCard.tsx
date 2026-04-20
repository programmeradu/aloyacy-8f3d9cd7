// Aloya Pro account card for signed-in Pro riders — parity with the
// web `ProAccountCard`. Shows plan, renewal date, and lets the user
// open the Stripe billing portal via `expo-web-browser`.

import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { palette } from "@/constants/theme";
import { useProSubscription } from "@/lib/usePro";
import { useSession, signOut } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export function ProAccountCard() {
  const { isPro, sub, loading } = useProSubscription();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !isPro) return null;

  const renewsAt = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const planLabel =
    sub?.plan_key === "pro_weekly"
      ? "Weekly"
      : sub?.plan_key === "pro_monthly"
        ? "Monthly"
        : "Pro";
  const renewLabel = renewsAt
    ? renewsAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  async function manage() {
    setBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sign in to manage your subscription.");
      const res = await fetch(`${API_BASE}/api/public/billing-portal`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ returnUrl: "aloya://wallet" }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? "Could not open portal.");
      await WebBrowser.openBrowserAsync(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.brand}>
          ALOYA<Text style={{ color: palette.ochre }}> PRO</Text>
        </Text>
        <View style={styles.pill}>
          <View style={styles.dot} />
          <Text style={styles.pillLabel}>Active</Text>
        </View>
      </View>
      <Text style={styles.headline}>Thanks for keeping Aloya independent.</Text>
      <View style={styles.list}>
        <Row label="Plan" value={planLabel} />
        {renewLabel && (
          <Row
            label={sub?.cancel_at_period_end ? "Ends" : "Renews"}
            value={renewLabel}
          />
        )}
        {user?.email && <Row label="Account" value={user.email} truncate />}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable onPress={manage} disabled={busy} style={styles.primary}>
          {busy ? (
            <ActivityIndicator color={palette.ink} />
          ) : (
            <Text style={styles.primaryLabel}>Manage</Text>
          )}
        </Pressable>
        <Pressable onPress={() => void signOut()} style={styles.secondary}>
          <Text style={styles.secondaryLabel}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={truncate ? 1 : undefined}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.ink,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 12,
    letterSpacing: 2.4,
    color: "rgba(246,241,231,0.72)",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(246,241,231,0.08)",
    borderWidth: 1,
    borderColor: "rgba(246,241,231,0.15)",
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.aegean },
  pillLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 10,
    color: "rgba(246,241,231,0.85)",
  },
  headline: {
    marginTop: 14,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 18,
    color: palette.limestone,
    letterSpacing: -0.3,
  },
  list: {
    marginTop: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(246,241,231,0.12)",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(246,241,231,0.08)",
  },
  rowLabel: {
    fontFamily: "Geist_500Medium",
    fontSize: 12.5,
    color: "rgba(246,241,231,0.55)",
    flexShrink: 0,
  },
  rowValue: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 12.5,
    color: palette.limestone,
    flexShrink: 1,
    textAlign: "right",
  },
  error: {
    marginTop: 10,
    fontFamily: "Geist_500Medium",
    fontSize: 11,
    color: palette.ochre,
  },
  actions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  primary: {
    flex: 1,
    backgroundColor: palette.limestone,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: palette.ink,
  },
  secondary: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(246,241,231,0.08)",
    borderWidth: 1,
    borderColor: "rgba(246,241,231,0.15)",
  },
  secondaryLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 13,
    color: "rgba(246,241,231,0.85)",
  },
});
