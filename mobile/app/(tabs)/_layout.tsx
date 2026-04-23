import { Tabs } from "expo-router";
import { View, Text, Platform } from "react-native";
import { palette } from "@/constants/theme";
import { HomeIcon, SearchIcon, SavedIcon, PlanIcon, PulseIcon, WalletIcon } from "@/components/TabIcon";
import { useLocale, type I18nKey } from "@/lib/i18n";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontFamily: focused ? "Geist_700Bold" : "Geist_500Medium",
        fontSize: 11,
        letterSpacing: 0.2,
        color: focused ? palette.ink : palette.inkSoft,
        marginTop: 2,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: palette.white,
          borderTopWidth: 1,
          borderTopColor: palette.line,
          height: Platform.OS === "ios" ? 84 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
          elevation: 0,
        },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <View>
              <HomeIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
            </View>
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Today" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pulse"
        options={{
          tabBarIcon: ({ focused }) => (
            <PulseIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Pulse" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarIcon: ({ focused }) => (
            <PlanIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Plan" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => (
            <SearchIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Search" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          tabBarIcon: ({ focused }) => (
            <SavedIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Saved" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => (
            <WalletIcon color={focused ? palette.ink : palette.inkSoft} focused={focused} />
          ),
          tabBarLabel: ({ focused }) => <TabLabel label="Wallet" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ href: null }}
      />
    </Tabs>
  );
}
