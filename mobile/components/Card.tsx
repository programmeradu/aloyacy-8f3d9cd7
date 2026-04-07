import { View, type ViewProps } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Editorial card surface — bone-white over limestone with a hairline rule
 * and a soft drop. Matches the web `Card` rhythm but tuned for native:
 * larger radius, denser shadow, no border on dark backgrounds.
 */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: palette.white,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: palette.line,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
