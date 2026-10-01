import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { passwordChecks } from "../utils/validation";

// Live "8-64 characters / a letter / a number" checklist under a new-password
// field (sign-up, reset, change password). Ticks turn green as the user types.
// `colors` overrides the theme - AuthScreen always renders in the light palette.
export function PasswordChecklist({ password, danger = false, colors: colorsOverride }: { password: string; danger?: boolean; colors?: ThemeColors }) {
  const theme = useTheme();
  const colors = colorsOverride ?? theme.colors;
  return (
    <View style={styles.row} accessibilityLabel="Password requirements">
      {passwordChecks(password).map((check) => (
        <View key={check.label} style={styles.item}>
          <Ionicons
            name={check.ok ? "checkmark-circle" : "ellipse-outline"}
            size={14}
            color={check.ok ? colors.accent : danger && password ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.text, { color: check.ok ? colors.textPrimary : colors.textMuted }]}>{check.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2, marginTop: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 4 },
  text: { fontSize: 12 },
});
