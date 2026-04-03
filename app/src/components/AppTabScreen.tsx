import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const H_PADDING = 16;
const TOP_EXTRA = 16;
/** Space above the floating bottom menu bar in AppShell */
const BOTTOM_CLEARANCE = 84;

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function AppTabScreen({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: "#FFFFFF",
          paddingTop: TOP_EXTRA + insets.top,
          paddingHorizontal: H_PADDING,
          paddingBottom: BOTTOM_CLEARANCE,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
