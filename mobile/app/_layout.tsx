import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  useFonts,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from "@expo-google-fonts/geist";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";

import { queryClient } from "@/lib/queryClient";
import { palette } from "@/constants/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Register for native push on first launch. Best-effort — failures are
  // logged but never block the UI; user can re-trigger from Settings.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { registerForPushNotifications } = await import("@/lib/push");
        const result = await registerForPushNotifications();
        if (!cancelled && !result.ok) {
          console.log("[push] not registered:", result.reason, result.message ?? "");
        }
      } catch (e) {
        console.warn("[push] registration threw", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  // Ask for App Tracking Transparency once, after fonts have settled so the
  // system sheet doesn't fight the splash screen. iOS-only; Android + web
  // short-circuit to "unavailable" inside the helper.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { ensureTrackingDecision } = await import("@/lib/tracking");
        if (cancelled) return;
        await ensureTrackingDecision();
      } catch (e) {
        console.warn("[att] prompt threw", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.limestone },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="stop/[stopId]"
            options={{ presentation: "card" }}
          />
          <Stack.Screen
            name="route/[routeId]"
            options={{ presentation: "card" }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
