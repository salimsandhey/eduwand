import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "./Screen";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  features: string[];
}

// Module 2 (AI Module) has no backend yet - these screens are honest placeholders,
// not stubs pretending to work. See Docs/Dev/EduWand_Engineering_PRD.md section 6.
export function ComingSoonScreen({ icon, title, description, features }: Props) {
  const { colors, cardShadow } = useTheme();

  return (
    <Screen style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceRaised }, cardShadow]}>
        <Ionicons name={icon} size={36} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>

      <View style={styles.featureList}>
        {features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Ionicons name="ellipse" size={6} color={colors.accent} />
            <Text style={[styles.featureText, { color: colors.textSecondary }]}>{f}</Text>
          </View>
        ))}
      </View>

      <Pressable style={[styles.button, { borderColor: colors.border }]} disabled accessibilityRole="button" accessibilityState={{ disabled: true }}>
        <Text style={[styles.buttonText, { color: colors.textMuted }]}>Notify Me</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: 32 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  featureList: { alignSelf: "stretch", gap: 10, marginBottom: 32 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: 14 },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  buttonText: { fontSize: 14, fontWeight: "600" },
});
