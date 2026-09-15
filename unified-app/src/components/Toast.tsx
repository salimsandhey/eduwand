import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// A small "X saved" confirmation that slides/fades in over the current
// screen and dismisses itself - used in place of a static inline "Saved"
// label wherever a save action deserves a more noticeable, momentary
// confirmation (e.g. school branding). Purely RN's built-in Animated API,
// no new dependency.
export function Toast({ visible, message }: { visible: boolean; message: string }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, delay: 1600, useNativeDriver: true }).start();
    });
  }, [visible, message]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { backgroundColor: colors.textPrimary, opacity, transform: [{ translateY }] }]}
    >
      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
      <Text style={[styles.text, { color: colors.background }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { fontSize: 13, fontWeight: "700" },
});
