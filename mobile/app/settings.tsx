// Settings — Language, Accessibility, Notifications, Privacy/Terms/About.
//
// Wave D · Step 17 destination. Reachable from the Wallet tab's
// "App settings" row. Everything on this screen is local-first: language
// preference is stored under `aloya.locale.v1`, accessibility under the
// existing `aloya.a11y.v1` key, and the legal rows deep-link out to the
// hosted web pages so we always ship the latest copy.

import { ScrollView, View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { FadeSection } from "@/components/FadeSection";
import { AccessibilityPrefsCard } from "@/components/wallet/AccessibilityPrefsCard";
import { NotificationsCard } from "@/components/NotificationsCard";
import { OfflineSchedulesCard } from "@/components/OfflineSchedulesCard";
import { AuthCard } from "@/components/AuthCard";
import { useLocale, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale, setLocale } = useLocale();

  const version = (Constants.expoConfig?.version ?? "1.0.0");
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode?.toString() ??
    "dev";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.limestone }}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FadeSection index={0} style={{ paddingHorizontal: 22, paddingTop: 10 }}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                router.back();
              }}
              hitSlop={12}
              style={styles.backBtn}
            >
              <Text style={styles.backLabel}>‹ {t("action.done")}</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>{t("settings.title")}</Text>
          <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
        </FadeSection>

        {/* Language */}
        <FadeSection index={1} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.eyebrow}>{t("settings.language").toUpperCase()}</Text>
          <Card style={{ padding: 8, marginTop: 10 }}>
            {LOCALES.map((code, i) => (
              <LanguageRow
                key={code}
                code={code}
                selected={code === locale}
                isLast={i === LOCALES.length - 1}
                onSelect={() => {
                  void Haptics.selectionAsync();
                  void setLocale(code);
                }}
              />
            ))}
          </Card>
          <Text style={styles.foot}>{t("settings.language.foot")}</Text>
        </FadeSection>

        {/* Accessibility */}
        <FadeSection index={2} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.eyebrow}>{t("settings.accessibility").toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <AccessibilityPrefsCard />
          </View>
          <Text style={styles.foot}>{t("settings.accessibility.foot")}</Text>
        </FadeSection>

        {/* Notifications */}
        <FadeSection index={3} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.eyebrow}>{t("settings.notifications").toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <NotificationsCard />
          </View>
        </FadeSection>

        {/* Offline schedules */}
        <FadeSection index={4} style={{ paddingHorizontal: 22, marginTop: 20 }}>
          <OfflineSchedulesCard />
        </FadeSection>

        {/* Account */}
        <FadeSection index={5} style={{ paddingHorizontal: 22, marginTop: 20 }}>
          <AuthCard />
        </FadeSection>

        {/* Legal */}
        <FadeSection index={6} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.eyebrow}>·</Text>
          <Card style={{ marginTop: 10, paddingVertical: 4 }}>
            <LegalRow
              label={t("settings.about")}
              onPress={() => void Linking.openURL("https://app.aloya.cy/about")}
            />
            <LegalRow
              label={t("settings.privacy")}
              onPress={() => void Linking.openURL("https://app.aloya.cy/privacy")}
            />
            <LegalRow
              label={t("settings.terms")}
              onPress={() => void Linking.openURL("https://app.aloya.cy/terms")}
              isLast
            />
          </Card>
        </FadeSection>

        {/* Version footer */}
        <FadeSection index={7} style={{ paddingHorizontal: 22, marginTop: 32, alignItems: "center" }}>
          <Text style={styles.versionLine}>
            {t("settings.version")} {version} · {t("settings.build")} {build}
          </Text>
          <Text style={styles.wordmark}>ALOYA</Text>
        </FadeSection>
      </ScrollView>
    </>
  );
}

function LanguageRow({
  code, selected, isLast, onSelect,
}: {
  code: Locale;
  selected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  const meta = LOCALE_LABELS[code];
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.langRow,
        !isLast && styles.langRowDivider,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.langNative}>{meta.native}</Text>
        <Text style={styles.langEnglish}>{meta.english}</Text>
      </View>
      <View
        style={[
          styles.dot,
          selected ? { borderColor: palette.aegeanDeep, backgroundColor: palette.aegeanDeep }
                   : { borderColor: palette.line, backgroundColor: "transparent" },
        ]}
      >
        {selected && <View style={styles.dotInner} />}
      </View>
    </Pressable>
  );
}

function LegalRow({ label, onPress, isLast }: { label: string; onPress: () => void; isLast?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.legalRow,
        !isLast && styles.legalRowDivider,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.legalLabel}>{label}</Text>
      <Text style={styles.legalChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", height: 32 },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    color: palette.aegeanDeep,
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 34,
    lineHeight: 38,
    color: palette.ink,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    lineHeight: 20,
    color: palette.inkSoft,
    marginTop: 8,
    maxWidth: 340,
  },
  eyebrow: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.oliveSoft,
  },
  foot: {
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    lineHeight: 18,
    color: palette.inkSoft,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  langRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  langNative: {
    fontFamily: "Geist_700Bold",
    fontSize: 16,
    color: palette.ink,
  },
  langEnglish: {
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: palette.inkSoft,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.white,
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  legalRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  legalLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    color: palette.ink,
  },
  legalChevron: {
    fontFamily: "Geist_500Medium",
    fontSize: 22,
    color: palette.inkSoft,
    lineHeight: 22,
  },
  versionLine: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    color: palette.inkSoft,
    letterSpacing: 0.6,
  },
  wordmark: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    letterSpacing: 4,
    color: palette.oliveSoft,
    marginTop: 10,
  },
});
