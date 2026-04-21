// JCC-synced transactions list.

import { View, Text, StyleSheet } from "react-native";
import { palette } from "@/constants/theme";
import { fullDate } from "@/lib/walletFormat";
import type { MotionTxSnapshot } from "@/lib/motionPass";

export function TransactionList({ transactions }: { transactions: MotionTxSnapshot[] }) {
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
        <Text style={styles.count}>{transactions.length} · last 30d</Text>
      </View>
      {transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No transactions on this card in the last 30 days.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {transactions.map((tx, i) => {
            const isTopup = /topup/i.test(tx.type);
            return (
              <View
                key={tx.id}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {tx.typeName || tx.type}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {[tx.stopName, tx.route].filter(Boolean).join(" · ") || fullDate(tx.at)}
                  </Text>
                  <Text style={styles.rowStamp}>{fullDate(tx.at)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.rowAmount, { color: isTopup ? palette.olive : palette.ink }]}>
                    {isTopup ? "+" : "−"}€{Math.abs(tx.priceEur).toFixed(2)}
                  </Text>
                  <Text style={styles.rowBalance}>bal €{tx.balanceEur.toFixed(2)}</Text>
                </View>
              </View>
            );
          })}
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
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowTitle: {
    fontFamily: "Geist_600SemiBold",
    fontSize: 14,
    color: palette.ink,
  },
  rowMeta: {
    marginTop: 2,
    fontFamily: "Geist_500Medium",
    fontSize: 12,
    color: palette.inkSoft,
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
    letterSpacing: -0.2,
  },
  rowBalance: {
    marginTop: 3,
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 1.2,
    color: palette.inkSoft,
  },
});
