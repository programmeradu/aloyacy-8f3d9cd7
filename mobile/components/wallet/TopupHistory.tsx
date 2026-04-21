// Manual (offline) top-up history for riders who haven't linked JCC.

import { View, Text, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";
import { fullDate } from "@/lib/walletFormat";
import type { MotionPass } from "@/lib/motionPass";

export function TopupHistory({ pass }: { pass: MotionPass }) {
  const rows = pass.topups.slice().sort((a, b) => b.at - a.at);
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Top-ups</Text>
        <Text style={styles.count}>{rows.length} logged</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No top-ups yet. Tap the Top-up tile to record one.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((tx, i) => (
            <View
              key={tx.id}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.line },
              ]}
            >
              <View>
                <Text style={styles.rowTitle}>Top-up</Text>
                <Text style={styles.rowStamp}>{fullDate(tx.at)}</Text>
              </View>
              <Text style={styles.rowAmount}>+€{tx.amountEur.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 22,
    color: palette.ink,
    letterSpacing: -0.3,
  },
  count: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    color: palette.inkSoft,
  },
  empty: {
    borderRadius: 20,
    backgroundColor: palette.limestoneSoft,
    padding: 22,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
    color: palette.inkSoft,
    textAlign: "center",
  },
  list: {
    backgroundColor: palette.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowTitle: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  rowStamp: {
    marginTop: 4,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 9,
    letterSpacing: 1.4,
    color: palette.inkSoft,
  },
  rowAmount: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 17,
    color: palette.ink,
  },
});
