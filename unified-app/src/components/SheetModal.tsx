import { ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { useKeyboardOverlap } from "../hooks/useKeyboardOverlap";

interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  animationType?: "slide" | "fade" | "none";
  /** Extra styling for the sheet itself (padding, background, radius, ...). */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Tallest the sheet may be, as a fraction of the window. Default 0.82. */
  maxHeightRatio?: number;
  closeLabel?: string;
}

/**
 * The standard, premium bottom sheet modal in this app.
 *
 * - Backdrop fades in and out smoothly in place (NO sliding black rectangle).
 * - The bottom sheet slides up with native spring physics and slides down on dismiss.
 * - Adds a sleek top drag handle pill for modern tactile polish.
 * - Handles translucent status + navigation bars and keyboard lift automatically.
 */
export function SheetModal({
  visible,
  onClose,
  children,
  sheetStyle,
  maxHeightRatio = 0.82,
  closeLabel = "Close",
}: SheetModalProps) {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardOverlap();
  const [rootHeight, setRootHeight] = useState(windowHeight);

  // Keep modal mounted in the tree while exit animation is running
  const [isRendered, setIsRendered] = useState(visible);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(windowHeight)).current;
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setIsRendered(true);
      backdropAnim.setValue(0);
      sheetTranslateY.setValue(windowHeight);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          tension: 260,
          friction: 26,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered && !isClosingRef.current) {
      animateAndClose();
    }
  }, [visible, windowHeight]);

  function animateAndClose() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: windowHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      isClosingRef.current = false;
      onClose();
    });
  }

  if (!isRendered) return null;

  const isDark = mode === "dark";
  const lift = keyboard.keyboardVisible ? keyboard.overlap : 0;
  const maxHeight = Math.min(
    windowHeight * maxHeightRatio,
    Math.max(0, rootHeight - lift - insets.top - 8)
  );

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      visible={isRendered}
      onRequestClose={animateAndClose}
    >
      <View
        ref={keyboard.ref}
        collapsable={false}
        style={[styles.root, { paddingBottom: lift }]}
        onLayout={(e) => {
          setRootHeight(e.nativeEvent.layout.height);
          keyboard.onLayout();
        }}
      >
        {/* Soft fading backdrop: ZERO sliding black rectangle! */}
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
              backgroundColor: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(15, 23, 42, 0.35)",
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={animateAndClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
        </Animated.View>

        {/* Smoothly springing bottom sheet with top drag handle pill */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight,
              transform: [{ translateY: sheetTranslateY }],
            },
            sheetStyle,
          ]}
        >
          {/* Top handle bar */}
          <View style={styles.handleBarRow}>
            <View
              style={[
                styles.handleBar,
                { backgroundColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)" },
              ]}
            />
          </View>

          {children}
          {/* Clears the system navigation bar */}
          <View style={{ height: keyboard.keyboardVisible ? 0 : insets.bottom }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 16,
  },
  handleBarRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  handleBar: {
    width: 36,
    height: 4.5,
    borderRadius: 3,
  },
});
