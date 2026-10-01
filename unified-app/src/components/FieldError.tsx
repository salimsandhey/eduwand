import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// Inline validation message shown directly under an input (see hooks/useForm.ts).
// Renders nothing when there is no error, so it can sit under every field
// without shifting the layout of a valid form. Pair it with inputErrorStyle()
// so the input's border turns red too.
export function FieldError({ message }: { message?: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={styles.row} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

/** Add to an input's style array: `[styles.input, inputErrorStyle(colors, !!error)]`. */
export function inputErrorStyle(colors: { danger: string }, hasError: boolean) {
  return hasError ? { borderColor: colors.danger } : undefined;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 4, marginBottom: 2 },
  text: { flex: 1, fontSize: 12, lineHeight: 16 },
});
