// Email + OTP sign-in card for the More tab.
//
// Two stages:
//   1. Enter email → tap "Send code" → Lovable Emails delivers the branded
//      6-digit code.
//   2. Enter the code → tap "Verify" → Supabase mints a session that
//      AsyncStorage persists across launches.
//
// When already signed in, the card collapses to an identity row with a
// "Sign out" affordance.

import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { palette } from "@/constants/theme";
import { Card } from "./Card";
import { sendEmailOtp, signOut, useSession, verifyEmailOtp } from "@/lib/auth";

export function AuthCard() {
  const { user, loading } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  if (user?.email) {
    return (
      <Card style={{ marginTop: 18, padding: 20 }}>
        <Text
          style={{
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            color: palette.olive,
            letterSpacing: 2,
          }}
        >
          SIGNED IN
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 18,
            color: palette.ink,
            marginTop: 6,
          }}
        >
          {user.email}
        </Text>
        <Pressable
          onPress={async () => {
            await signOut();
            setStage("email");
            setEmail("");
            setCode("");
          }}
          style={{
            marginTop: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.line,
            paddingVertical: 12,
            alignItems: "center",
            backgroundColor: "#fff",
          }}
        >
          <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 14, color: palette.ink }}>
            Sign out
          </Text>
        </Pressable>
      </Card>
    );
  }

  async function handleSend() {
    setBusy(true);
    const res = await sendEmailOtp(email);
    setBusy(false);
    if (!res.ok) {
      Alert.alert("Could not send code", res.error);
      return;
    }
    setStage("code");
  }

  async function handleVerify() {
    setBusy(true);
    const res = await verifyEmailOtp(email, code);
    setBusy(false);
    if (!res.ok) {
      Alert.alert("Verification failed", res.error);
      return;
    }
    setCode("");
  }

  const inputStyle = {
    marginTop: 12,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Geist_500Medium" as const,
    fontSize: 14,
    color: palette.ink,
    backgroundColor: "#fff",
  };

  return (
    <Card style={{ marginTop: 18, padding: 20 }}>
      <Text
        style={{
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          color: palette.olive,
          letterSpacing: 2,
        }}
      >
        SIGN IN
      </Text>
      <Text
        style={{
          fontFamily: "BricolageGrotesque_800ExtraBold",
          fontSize: 22,
          color: palette.ink,
          letterSpacing: -0.5,
          marginTop: 6,
          lineHeight: 26,
        }}
      >
        {stage === "email" ? "Save trips across devices." : "Enter your 6-digit code."}
      </Text>
      <Text
        style={{
          fontFamily: "Geist_500Medium",
          fontSize: 13,
          color: palette.inkSoft ?? palette.ink,
          marginTop: 6,
          lineHeight: 18,
        }}
      >
        {stage === "email"
          ? "We'll email you a 6-digit code — no passwords."
          : `Sent to ${email}.`}
      </Text>

      {stage === "email" ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#9aa0a6"
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
          <Pressable
            disabled={busy || !email.includes("@")}
            onPress={handleSend}
            style={{
              marginTop: 12,
              borderRadius: 14,
              backgroundColor: palette.ink,
              paddingVertical: 14,
              alignItems: "center",
              opacity: busy || !email.includes("@") ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 14, color: palette.limestone }}>
              {busy ? "Sending…" : "Send code"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor="#9aa0a6"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
            style={[
              inputStyle,
              {
                textAlign: "center",
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 22,
                letterSpacing: 6,
              },
            ]}
          />
          <Pressable
            disabled={busy || code.length < 6}
            onPress={handleVerify}
            style={{
              marginTop: 12,
              borderRadius: 14,
              backgroundColor: palette.ink,
              paddingVertical: 14,
              alignItems: "center",
              opacity: busy || code.length < 6 ? 0.5 : 1,
            }}
          >

            <Text style={{ fontFamily: "Geist_600SemiBold", fontSize: 14, color: palette.limestone }}>
              {busy ? "Verifying…" : "Verify"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setStage("email");
              setCode("");
            }}
            style={{ marginTop: 10, alignItems: "center", paddingVertical: 6 }}
          >
            <Text
              style={{
                fontFamily: "JetBrainsMono_500Medium",
                fontSize: 11,
                color: palette.inkSoft ?? palette.ink,
                letterSpacing: 1.4,
              }}
            >
              USE A DIFFERENT EMAIL
            </Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}
