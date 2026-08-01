// The three captured-field rows below the viewport. Values are right-aligned
// and middle-ellipsised so a long holder name never pushes its label off-row.

import { Text, View } from "react-native";
import { formatCardNumber } from "@/lib/motionPass";
import type { ScanState } from "@aloya/core/card-scan-state";
import { scanStyles as s } from "./styles";

export function ScanReadout({ state }: { state: ScanState }) {
  const { acc, frontDone, backDone } = state;
  return (
    <View style={s.readout}>
      <FieldRow
        label="Number (back)"
        value={acc.number ? formatCardNumber(acc.number) : ""}
        locked={backDone && !!acc.number}
      />
      <FieldRow
        label="Name (front)"
        value={acc.holder ?? ""}
        locked={frontDone && !!acc.holder}
      />
      <FieldRow
        label="Valid until (front)"
        value={acc.validUntil ?? ""}
        locked={frontDone && !!acc.validUntil}
      />
    </View>
  );
}

function FieldRow({
  label,
  value,
  locked,
}: {
  label: string;
  value: string;
  locked: boolean;
}) {
  const has = value.length > 0;
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text
        style={[s.fieldValue, has && s.fieldValueOn, locked && s.fieldValueLocked]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {has ? value : "—"}
      </Text>
    </View>
  );
}
