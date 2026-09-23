import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme } from "../theme/ThemeContext";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors, cardShadow, pressedOpacity, mode } = useTheme();
  const [isRendered, setIsRendered] = useState(visible);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setIsRendered(true);
      backdropAnim.setValue(0);
      cardScale.setValue(0.92);
      cardOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 280,
          friction: 24,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered && !isClosingRef.current) {
      animateAndClose(onCancel);
    }
  }, [visible]);

  function animateAndClose(callback: () => void) {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.94,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      isClosingRef.current = false;
      callback();
    });
  }

  if (!isRendered) return null;

  const isDark = mode === "dark";

  return (
    <Modal
      visible={isRendered}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === "android"}
      onRequestClose={() => animateAndClose(onCancel)}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropAnim,
                backgroundColor: isDark ? "rgba(0,0,0,0.65)" : "rgba(15,23,42,0.4)",
              },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => animateAndClose(onCancel)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss confirmation"
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderWidth: 0,
                opacity: cardOpacity,
                transform: [{ scale: cardScale }],
              },
              cardShadow,
            ]}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  { borderColor: colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => animateAndClose(onCancel)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: colors.accent, borderColor: colors.accent },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => animateAndClose(onConfirm)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: colors.accentOn }]}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 22,
    elevation: 12,
  },
  title: { fontSize: 17, fontWeight: "800", marginBottom: 8 },
  message: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 22 },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 13 },
});
