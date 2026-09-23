import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/tokens";

interface Props {
  headline?: string;
  location?: string;
}

export function MadeWithLoveFooter({
  headline = "Learning\nVibes\nOnly",
  location = "Bengaluru",
}: Props) {
  const { colors, mode } = useTheme();

  const isDark = mode === "dark";
  // Soft muted charcoal tone like in the reference image
  const textColor = isDark ? "#A39E9B" : "#6B6560";
  // User explicitly requested: "use the heart as purpel(our prumary color)"
  const heartColor = isDark ? "#C084FC" : "#7C005A";

  return (
    <View style={styles.container}>
      <Text style={[styles.headline, { color: textColor }]}>
        {headline}
      </Text>
      <View style={styles.subRow}>
        <Text style={[styles.subText, { color: textColor }]}>Made with </Text>
        <Ionicons name="heart" size={15} color={heartColor} style={styles.heartIcon} />
        <Text style={[styles.subText, { color: textColor }]}> in {location}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-start",
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 4,
  },
  headline: {
    fontFamily: typography.bold,
    fontSize: 56,
    lineHeight: 64,
    fontWeight: "900",
    textAlign: "left",
    letterSpacing: -1.8,
    paddingTop: 8,
    paddingBottom: 2,
    overflow: "visible",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 16,
  },
  subText: {
    fontFamily: typography.medium,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  heartIcon: {
    marginHorizontal: 2,
    transform: [{ translateY: 1 }],
  },
});

