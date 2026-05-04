// Native PaywallSheet — bottom sheet that wraps GoProCard for a full,
// working checkout experience. Any component can trigger it via
// `paywallStore.open()`. Mounted globally in `mobile/app/_layout.tsx`.

import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { palette } from "@/constants/theme";
import { paywallStore, usePaywallOpen } from "@/lib/paywall-store";
import { GoProCard } from "@/components/GoProCard";

export function PaywallSheet() {
  const open = usePaywallOpen();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={() => paywallStore.close()}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(31,30,24,0.5)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => paywallStore.close()}
        />
        <View
          style={{
            backgroundColor: palette.limestone,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            borderWidth: 1,
            borderColor: palette.line,
            maxHeight: "92%",
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingTop: 10,
              paddingBottom: 4,
            }}
          >
            <View
              style={{
                width: 42,
                height: 4,
                borderRadius: 2,
                backgroundColor: palette.line,
              }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Geist_700Bold",
                fontSize: 10,
                letterSpacing: 2.4,
                color: palette.aegeanDeep,
                textTransform: "uppercase",
              }}
            >
              Aloya Pro
            </Text>
            <Pressable
              onPress={() => paywallStore.close()}
              hitSlop={16}
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                paddingVertical: 6,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: "Geist_700Bold",
                  fontSize: 10,
                  letterSpacing: 2,
                  color: palette.inkSoft,
                }}
              >
                MAYBE LATER
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <GoProCard />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
