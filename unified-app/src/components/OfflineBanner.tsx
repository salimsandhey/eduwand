import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { useOfflineStatus } from "../hooks/useOfflineStatus";

// Mounted once at the app root (App.tsx) - not per-screen - so it shows
// wherever the user is, on top of everything, rather than every screen
// needing its own "failed to load" handling for this one case.
export function OfflineBanner() {
  const isOffline = useOfflineStatus();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (!isOffline) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { paddingTop: insets.top + 6, backgroundColor: colors.danger }]}>
      <Ionicons name="cloud-offline-outline" size={14} color="#FFFFFF" />
      <Text style={styles.text}>You're offline - some things may not load</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 8,
  },
  text: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
