import { View, Text, Image, StyleSheet } from "react-native";

import { palette } from "@/constants/theme";
import { assets } from "@/lib/assets";
import { planStyles } from "./styles";

/** Editorial header for the plan tab, with a live/stale feed badge. */
export function PlanHero({ feedFresh }: { feedFresh: boolean }) {
  return (
    <View style={planStyles.hero}>
      <Image source={assets.plan_hero} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={planStyles.heroWash} />
      <View style={planStyles.heroContent}>
        <Text style={planStyles.heroKicker}>PLAN A TRIP</Text>
        <Text style={planStyles.heroTitle}>Honest routes,{"\n"}live buses.</Text>
        <Text style={planStyles.heroSub}>Real walking times, real transfers, no filler.</Text>
        <View style={planStyles.heroBadge}>
          <View
            style={[
              planStyles.dot,
              { backgroundColor: feedFresh ? palette.aegeanDeep : palette.ochre },
            ]}
          />
          <Text style={planStyles.heroBadgeText} numberOfLines={1}>
            {feedFresh ? "LIVE · REPLANS EVERY 30S" : "FEED STALE"}
          </Text>
        </View>
      </View>
    </View>
  );
}
