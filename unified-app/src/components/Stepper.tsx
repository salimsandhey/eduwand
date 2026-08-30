import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export function Stepper({ value, onChange, min = 0, max = 99, disabled }: StepperProps) {
  const { colors, pressedOpacity } = useTheme();

  function step(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  }

  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
      <Pressable
        onPress={() => step(-1)}
        disabled={disabled || value <= min}
        style={({ pressed }) => [styles.button, (pressed || value <= min) && { opacity: pressedOpacity }]}
        accessibilityRole="button"
        hitSlop={6}
      >
        <Ionicons name="remove" size={15} color={value <= min ? colors.textMuted : colors.textPrimary} />
      </Pressable>
      <Text style={[styles.value, { color: colors.textPrimary }]}>{value}</Text>
      <Pressable
        onPress={() => step(1)}
        disabled={disabled || value >= max}
        style={({ pressed }) => [styles.button, (pressed || value >= max) && { opacity: pressedOpacity }]}
        accessibilityRole="button"
        hitSlop={6}
      >
        <Ionicons name="add" size={15} color={value >= max ? colors.textMuted : colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, height: 36 },
  button: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  value: { width: 26, textAlign: "center", fontSize: 14, fontWeight: "800" },
});
