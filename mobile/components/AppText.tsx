import { Text as RNText, type TextProps } from "react-native";
import { palette } from "@/constants/theme";

/**
 * Single source of truth for typography in the app. Defaults to Geist medium
 * 16/22 ink. Pass `className` to override via NativeWind utilities — never
 * hardcode colors in screens.
 */
export function AppText({ style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[
        {
          color: palette.ink,
          fontFamily: "Geist_500Medium",
          fontSize: 16,
          lineHeight: 22,
        },
        style,
      ]}
    />
  );
}
