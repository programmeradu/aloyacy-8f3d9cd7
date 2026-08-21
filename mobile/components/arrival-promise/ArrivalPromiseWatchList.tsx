// Standing promises, shown on Saved. Renders nothing when there are none.

import { Text, View } from "react-native";
import { palette } from "@/constants/theme";
import { useSession } from "@/lib/auth";
import { useArrivalPromises } from "@/lib/arrival-promise";
import { ArrivalPromiseRow } from "./ArrivalPromiseRow";

export function ArrivalPromiseWatchList() {
  const { signedIn } = useSession();
  const { promises, loading, reload } = useArrivalPromises(signedIn);

  if (!signedIn || (loading && promises.length === 0) || promises.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{
          fontFamily: "JetBrainsMono_600SemiBold",
          fontSize: 10,
          letterSpacing: 1.6,
          color: palette.inkSoft,
        }}
      >
        {promises.length === 1 ? "ARRIVAL WE ARE HOLDING" : "ARRIVALS WE ARE HOLDING"}
      </Text>
      {promises.map((p) => (
        <ArrivalPromiseRow key={p.id} promise={p} onChanged={reload} />
      ))}
    </View>
  );
}
