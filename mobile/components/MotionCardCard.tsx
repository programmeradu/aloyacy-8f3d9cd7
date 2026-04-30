// Motion-card tile for the More tab. Shows the locally-stored card (if any)
// and offers a single primary action: scan a physical card to capture the
// number / holder / valid-until printed on the plastic.
//
// Why this lives in More (not its own Wallet tab yet): Wave 4 only ships
// the capture surface on mobile; the full wallet (balance, top-ups, JCC
// link, transactions) is a Wave 5 task. We keep the surface honest by
// labelling the captured fields exactly and not faking balance.

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card } from "@/components/Card";
import { palette } from "@/constants/theme";
import { CardScanSheet } from "@/components/CardScanSheet";
import { maskedNumber, readPass, type MotionPass } from "@/lib/motionPass";

export function MotionCardCard() {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState<MotionPass | null>(null);

  useEffect(() => {
    let alive = true;
    readPass().then((p) => {
      if (alive) setPass(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const hasCard = !!pass?.number;

  return (
    <>
      <Card style={{ marginTop: 14, padding: 18 }}>
        <Text
          style={{
            fontFamily: "Geist_700Bold",
            fontSize: 10,
            letterSpacing: 2.4,
            textTransform: "uppercase",
            color: palette.inkSoft,
          }}
        >
          Motion card
        </Text>
        <Text
          style={{
            fontFamily: "BricolageGrotesque_700Bold",
            fontSize: 22,
            color: palette.ink,
            marginTop: 6,
            letterSpacing: -0.4,
          }}
        >
          {hasCard ? "Your card is on file" : "Add your bus card"}
        </Text>
        <Text
          style={{
            fontFamily: "Geist_500Medium",
            fontSize: 13.5,
            lineHeight: 20,
            color: palette.inkSoft,
            marginTop: 6,
          }}
        >
          {hasCard
            ? "Tap below to re-scan if your card details change."
            : "Scan the front and back once — Aloya keeps the number, name, and valid-until date on this device."}
        </Text>

        {hasCard && pass && (
          <View
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 16,
              backgroundColor: palette.limestoneSoft,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 11,
                letterSpacing: 1.6,
                color: palette.ink,
              }}
            >
              {maskedNumber(pass.number)}
            </Text>
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 14,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Geist_600SemiBold",
                  fontSize: 14,
                  color: palette.ink,
                }}
                numberOfLines={1}
              >
                {pass.holder || "Cardholder"}
              </Text>
              {pass.validUntil && (
                <Text
                  style={{
                    fontFamily: "Geist_700Bold",
                    fontSize: 11,
                    color: palette.inkSoft,
                  }}
                >
                  Until {pass.validUntil}
                </Text>
              )}
            </View>
          </View>
        )}

        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => ({
            marginTop: 16,
            paddingVertical: 14,
            alignItems: "center",
            borderRadius: 999,
            backgroundColor: palette.ink,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: "Geist_600SemiBold",
              fontSize: 14,
              color: palette.limestone,
              letterSpacing: 0.2,
            }}
          >
            {hasCard ? "Re-scan card" : "Scan card"}
          </Text>
        </Pressable>
      </Card>

      <CardScanSheet
        visible={open}
        onClose={() => setOpen(false)}
        onCaptured={(p) => setPass(p)}
      />
    </>
  );
}
