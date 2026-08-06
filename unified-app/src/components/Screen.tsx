import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  children: ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
}

// Wraps every screen that doesn't already get safe-area handling from a native-stack
// header. Tab screens render with headerShown: false, so their content starts at y=0
// unless wrapped here - default edges = top only, since the bottom tab bar already
// insets itself safely. Screens with no tab bar below them (Login, and root-stack
// pushed screens like Enquiry Detail) need the bottom edge added too.
export function Screen({ children, edges = ["top"], style }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      {children}
    </SafeAreaView>
  );
}
