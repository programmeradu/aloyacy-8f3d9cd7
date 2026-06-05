import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { palette } from "@/constants/theme";
import { Card } from "./Card";
import { startProCheckout, type PlanKey } from "@/lib/wallet";
import { useSession } from "@/lib/auth";
import { useTrialEligibility } from "@/lib/useTrialEligibility";

const PLANS: { id: PlanKey; label: string; price: string; cadence: string; note?: string }[] = [
  { id: "pro_weekly", label: "Weekly", price: "€1.99", cadence: "/week" },
  { id: "pro_monthly", label: "Monthly", price: "€6.99", cadence: "/month", note: "Save 18%" },
];

export function GoProCard() {
  const { user, signedIn } = useSession();
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanKey>("pro_monthly");
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);
  const trialEligible = useTrialEligibility();

  const effectiveEmail = signedIn ? (user?.email ?? "") : email;

  async function handlePay() {
    if (!signedIn && !email.includes("@")) {
      Alert.alert("Email required", "Enter the email tied to your Aloya account.");
      return;
    }
    setBusy(true);
    const res = await startProCheckout({
      email: signedIn ? undefined : email.trim(),
      planKey: plan,
      promotionCode: promo.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) {
      Alert.alert(
        "Welcome to Pro",
        res.linkedUserId
          ? "Your subscription is linked to your account."
          : "Your subscription is being activated. Sign in to link it to your account.",
      );
    } else if (!res.canceled) {
      Alert.alert("Checkout failed", res.message);
    }
  }


  return (
    <Card style={{ marginTop: 18, padding: 20 }}>
      <Text
        style={{
          fontFamily: "Geist_700Bold",
          fontSize: 10,
          color: palette.olive,
          letterSpacing: 2,
        }}
      >
        ALOYA PRO
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 24,
          color: palette.ink,
          letterSpacing: -0.6,
          marginTop: 6,
          lineHeight: 28,
        }}
      >
        Faster planning,{"\n"}quieter notifications.
      </Text>

      {trialEligible && (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: palette.aegeanDeep + "40",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: "#fff",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "BricolageGrotesque_700Bold",
                fontSize: 14,
                color: palette.ink,
                letterSpacing: -0.2,
                flexShrink: 1,
              }}
            >
              7 days free, then auto-renews
            </Text>
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 9,
                color: palette.inkSoft ?? palette.olive,
                letterSpacing: 1.4,
              }}
            >
              ONE PER DEVICE
            </Text>
          </View>
          <Text
            style={{
              marginTop: 4,
              fontFamily: "Geist_500Medium",
              fontSize: 11.5,
              lineHeight: 16,
              color: palette.inkSoft ?? palette.olive,
            }}
          >
            {signedIn
              ? "Card required so we can renew when the trial ends. Cancel before day 7 and you won\u2019t be charged."
              : "Sign in on the next step to start your 7-day free trial. Cancel before day 7 and you won\u2019t be charged."}
          </Text>
        </View>
      )}


      <View style={{ marginTop: 16, gap: 8 }}>
        {PLANS.map((p) => {
          const active = plan === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPlan(p.id)}
              style={{
                borderWidth: 1,
                borderColor: active ? palette.ink : palette.line,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#fff",
              }}
            >
              <View>
                <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 14, color: palette.ink }}>
                  {p.label}
                </Text>
                {p.note && (
                  <Text
                    style={{
                      fontFamily: "Geist_700Bold",
                      fontSize: 9,
                      color: palette.olive,
                      letterSpacing: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {p.note.toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontFamily: "BricolageGrotesque_700Bold",
                    fontSize: 20,
                    color: palette.ink,
                  }}
                >
                  {p.price}
                </Text>
                <Text
                  style={{
                    fontFamily: "Geist_700Bold",
                    fontSize: 9,
                    color: palette.inkSoft ?? palette.ink,
                    letterSpacing: 1.2,
                  }}
                >
                  {p.cadence.toUpperCase()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {signedIn ? (
        <View
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: palette.line,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: "#fff",
          }}
        >
          <Text
            style={{
              fontFamily: "Geist_700Bold",
              fontSize: 9,
              color: palette.olive,
              letterSpacing: 1.4,
            }}
          >
            BILLING TO
          </Text>
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.ink,
              marginTop: 4,
            }}
          >
            {effectiveEmail}
          </Text>
          <Text
            style={{
              fontFamily: "Geist_500Medium",
              fontSize: 11,
              color: palette.inkSoft ?? palette.olive,
              marginTop: 4,
            }}
          >
            Linked to your Aloya account on every device.
          </Text>
        </View>
      ) : (
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#9aa0a6"
          value={email}
          onChangeText={setEmail}
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: palette.line,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontFamily: "Geist_500Medium",
            fontSize: 14,
            color: palette.ink,
            backgroundColor: "#fff",
          }}
        />
      )}

      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Promo code (optional)"
        placeholderTextColor="#9aa0a6"
        value={promo}
        onChangeText={setPromo}
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontFamily: "Geist_500Medium",
          fontSize: 14,
          color: palette.ink,
          backgroundColor: "#fff",
        }}
      />

      {signedIn && (
        <Text
          style={{
            marginTop: 10,
            fontFamily: "Geist_500Medium",
            fontSize: 11,
            color: palette.inkSoft ?? palette.olive,
            textAlign: "center",
          }}
        >
          New here? Your first 7 days are free — cancel anytime before day 7 and you won't be charged.
        </Text>
      )}

      <Pressable
        disabled={busy}
        onPress={handlePay}
        style={{
          marginTop: 12,
          borderRadius: 14,
          backgroundColor: palette.ink,
          paddingVertical: 14,
          alignItems: "center",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 14, color: palette.limestone }}>
          {busy ? "Opening payment sheet…" : "Continue to payment"}
        </Text>
      </Pressable>

    </Card>
  );
}
