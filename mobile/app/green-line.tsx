// Native Green Line screen. Same facts as app.aloya.cy/green-line and
// aloya.cy/green-line. Hours are not here: tourist blogs disagree, and we
// have no official feed. Search hits this path via searchResultHref.

import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import * as Haptics from "expo-haptics";

import { palette } from "@/constants/theme";
import { Card } from "@/components/Card";
import { FadeSection } from "@/components/FadeSection";
import { ExpandableMap } from "@/components/ExpandableMap";
import { type MapMarker } from "@/components/MapView";
import { useLocale } from "@/lib/i18n";
import { LEDRA_PEDESTRIAN } from "@aloya/core/green-line";

export default function GreenLineScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();

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
          <Text style={styles.eyebrow}>{t("gl.eyebrow").toUpperCase()}</Text>
          <Text style={styles.title}>{t("gl.title")}</Text>
          <Text style={styles.lede}>{t("gl.lede")}</Text>
        </FadeSection>

        <FadeSection index={1} style={{ paddingHorizontal: 22, marginTop: 22 }}>
          <ExpandableMap
            height={180}
            center={{ lat: LEDRA_PEDESTRIAN.lat, lng: LEDRA_PEDESTRIAN.lng }}
            spanKm={0.8}
            liveVehicles={false}
            fitToContent={false}
            markers={
              [
                {
                  lat: LEDRA_PEDESTRIAN.lat,
                  lng: LEDRA_PEDESTRIAN.lng,
                  kind: "origin",
                  tone: "olive",
                  label: LEDRA_PEDESTRIAN.name,
                },
              ] as MapMarker[]
            }
          />
          <Text style={styles.caption}>
            {LEDRA_PEDESTRIAN.name} · {LEDRA_PEDESTRIAN.nameEl}
          </Text>
        </FadeSection>

        <FadeSection index={2} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.section}>{t("gl.know.label").toUpperCase()}</Text>
          <Card style={{ marginTop: 10, paddingHorizontal: 18 }}>
            <Fact
              title={t("gl.know.network.title")}
              body={t("gl.know.network.body")}
            />
            <Fact
              title={t("gl.know.ledra.title")}
              body={t("gl.know.ledra.body")}
            />
            <Fact
              title={t("gl.know.famagusta.title")}
              body={t("gl.know.famagusta.body")}
              last
            />
          </Card>
        </FadeSection>

        <FadeSection index={3} style={{ paddingHorizontal: 22, marginTop: 28 }}>
          <Text style={styles.section}>{t("gl.dont.label").toUpperCase()}</Text>
          <Card style={{ marginTop: 10, paddingHorizontal: 18 }}>
            <Fact title={t("gl.dont.hours.title")} body={t("gl.dont.hours.body")} />
            <Fact title={t("gl.dont.gtfs.title")} body={t("gl.dont.gtfs.body")} last />
          </Card>
        </FadeSection>
      </ScrollView>
    </>
  );
}

function Fact({ title, body, last }: { title: string; body: string; last?: boolean }) {
  return (
    <View style={[styles.fact, !last && styles.factDivider]}>
      <Text style={styles.factTitle}>{title}</Text>
      <Text style={styles.factBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { paddingVertical: 4, paddingRight: 8, height: 32, justifyContent: "center" },
  backLabel: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 15,
    color: palette.aegeanDeep,
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.oliveSoft,
    marginTop: 10,
  },
  title: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 34,
    lineHeight: 38,
    color: palette.ink,
    marginTop: 8,
  },
  lede: {
    fontFamily: "Geist_500Medium",
    fontSize: 15,
    lineHeight: 22,
    color: palette.inkSoft,
    marginTop: 10,
    maxWidth: 360,
  },
  caption: {
    fontFamily: "Geist_700Bold",
    fontSize: 10,
    letterSpacing: 1.6,
    color: palette.inkSoft,
    textTransform: "uppercase",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  section: {
    fontFamily: "Geist_700Bold",
    fontSize: 11,
    letterSpacing: 1.4,
    color: palette.oliveSoft,
  },
  fact: { paddingVertical: 16 },
  factDivider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  factTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 18,
    lineHeight: 22,
    color: palette.ink,
  },
  factBody: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    lineHeight: 20,
    color: palette.inkSoft,
    marginTop: 6,
  },
});
