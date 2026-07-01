// Bottom sheet for editing the Motion pass. Four modes match the web:
//   card    — edit number / holder / tier / valid-until
//   balance — set balance manually
//   topup   — record a top-up (offline riders)
//   link    — JCC email + password
//
// Fully controlled from the parent screen; save + link callbacks are
// passed in. Native input rows, safe-area padded, keyboard-avoiding.

import { useState } from "react";
import {
  Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { palette } from "@/constants/theme";
import { formatCardNumber, type MotionPass } from "@/lib/motionPass";
import * as Haptics from "expo-haptics";

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
  const [balance, setBalance] = useState(pass.balanceEur > 0 ? pass.balanceEur.toFixed(2) : "");
  const [topup, setTopup] = useState("");
  const [email, setEmail] = useState(pass.jcc?.email ?? "");
  const [password, setPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const title =
    mode === "card"
      ? "Card details"
      : mode === "balance"
        ? "Set balance"
        : mode === "topup"
          ? "Log a top-up"
          : "Link JCC Smart";

  async function save() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === "card") {
      const clean = number.replace(/\D/g, "").slice(0, 16);
      onSave({
        ...pass,
        number: clean,
        holder: holder.trim(),
        tier: tier.trim() || undefined,
        validUntil: validUntil.trim() || undefined,
      });
      onClose();
    } else if (mode === "balance") {
      const v = parseFloat(balance);
      if (!isNaN(v) && v >= 0) {
        onSave({ ...pass, balanceEur: v, balanceUpdatedAt: Date.now() });
      }
      onClose();
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
      onClose();
    } else if (mode === "link") {
      if (!email || !password) {
        setLinkError("Enter your JCC Smart email and password.");
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
      onClose();
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheet}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <Pressable onPress={onClose}>
                  <Text style={styles.close}>CLOSE</Text>
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
                {mode === "card" && (
                  <>
                    <Field label="Card number">
                      <TextInput
                        keyboardType="number-pad"
                        value={formatCardNumber(number)}
                        onChangeText={setNumber}
                        placeholder="10 digits printed on the back"
                        placeholderTextColor={palette.inkSoft}
                        style={styles.inputMono}
                      />
                    </Field>
                    <Field label="Holder name">
                      <TextInput
                        value={holder}
                        onChangeText={setHolder}
                        placeholder="As printed on the card"
                        placeholderTextColor={palette.inkSoft}
                        style={styles.input}
                        autoCapitalize="characters"
                      />
                    </Field>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Field label="Tier">
                          <TextInput
                            value={tier}
                            onChangeText={setTier}
                            placeholder="18+ Standard"
                            placeholderTextColor={palette.inkSoft}
                            style={styles.input}
                          />
                        </Field>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Field label="Valid until">
                          <TextInput
                            value={validUntil}
                            onChangeText={setValidUntil}
                            placeholder="DD/MM/YYYY"
                            placeholderTextColor={palette.inkSoft}
                            style={styles.input}
                          />
                        </Field>
                      </View>
                    </View>
                  </>
                )}

                {mode === "balance" && (
                  <Field label="Balance (EUR)">
                    <TextInput
                      keyboardType="decimal-pad"
                      value={balance}
                      onChangeText={setBalance}
                      placeholder="0.00"
                      placeholderTextColor={palette.inkSoft}
                      style={styles.inputMono}
                    />
                  </Field>
                )}

                {mode === "topup" && (
                  <>
                    <Field label="Top-up amount (EUR)">
                      <TextInput
                        keyboardType="decimal-pad"
                        value={topup}
                        onChangeText={setTopup}
                        placeholder="5.00"
                        placeholderTextColor={palette.inkSoft}
                        style={styles.inputMono}
                      />
                    </Field>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {[3, 5, 10, 20].map((v) => (
                        <Pressable
                          key={v}
                          onPress={() => setTopup(v.toFixed(2))}
                          style={styles.chip}
                        >
                          <Text style={styles.chipLabel}>€{v.toFixed(2)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                {mode === "link" && (
                  <>
                    <Text style={styles.intro}>
                      Sign in with your JCC Smart account to auto-sync balance
                      and last-30-day transactions. Credentials never leave
                      Aloya's server proxy — we don't store them.
                    </Text>
                    <Field label="Email">
                      <TextInput
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={palette.inkSoft}
                        style={styles.input}
                      />
                    </Field>
                    <Field label="Password">
                      <TextInput
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Your JCC Smart password"
                        placeholderTextColor={palette.inkSoft}
                        style={styles.input}
                      />
                    </Field>
                    {linkError && (
                      <Text style={styles.error}>{linkError}</Text>
                    )}
                  </>
                )}
              </ScrollView>
              <Pressable
                onPress={save}
                disabled={linking}
                style={[styles.primary, linking && { opacity: 0.6 }]}
              >
                {linking ? (
                  <ActivityIndicator color={palette.limestone} />
                ) : (
                  <Text style={styles.primaryLabel}>
                    {mode === "link" ? "LINK ACCOUNT" : "SAVE"}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,26,32,0.42)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: palette.limestone,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: 34,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.4,
  },
  close: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: palette.inkSoft,
  },
  fieldLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 2.2,
    color: palette.inkSoft,
  },
  input: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Geist_500Medium",
    fontSize: 15,
    color: palette.ink,
  },
  inputMono: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Geist_700Bold",
    fontSize: 16,
    letterSpacing: 2,
    color: palette.ink,
  },
  intro: {
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    lineHeight: 18,
    color: palette.inkSoft,
    marginTop: 4,
  },
  error: {
    marginTop: 10,
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: "#B33C3C",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
  chipLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 12,
    color: palette.ink,
  },
  primary: {
    marginTop: 20,
    backgroundColor: palette.ink,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryLabel: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 2.4,
    color: palette.limestone,
  },
});
