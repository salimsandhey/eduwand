import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AIAssistantState, useAiAssistantGlow } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";

const STATE_CONFIG: Record<
  AIAssistantState,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    bgColor: string;
    textColor: string;
    borderColor: string;
  }
> = {
  off: {
    label: "AI: OFF",
    icon: "sparkles-outline",
    bgColor: "#FFFFFF",
    textColor: "#4B5563",
    borderColor: "#D1D5DB",
  },
  idle: {
    label: "AI: IDLE",
    icon: "moon",
    bgColor: "#3B82F6",
    textColor: "#FFFFFF",
    borderColor: "#2563EB",
  },
  listening: {
    label: "AI: LISTENING",
    icon: "ear",
    bgColor: "#06B6D4",
    textColor: "#FFFFFF",
    borderColor: "#0891B2",
  },
  thinking: {
    label: "AI: THINKING",
    icon: "hardware-chip",
    bgColor: "#8B5CF6",
    textColor: "#FFFFFF",
    borderColor: "#7C3AED",
  },
  speaking: {
    label: "AI: SPEAKING",
    icon: "volume-high",
    bgColor: "#EC4899",
    textColor: "#FFFFFF",
    borderColor: "#DB2777",
  },
};

export function AiGlowTestButton() {
  const { aiState, cycleAiState, isGlowActive } = useAiAssistantGlow();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(1)).current;
  const activePulse = useRef(new Animated.Value(0)).current;

  const currentConfig = STATE_CONFIG[aiState];

  // Pulse animation when active
  useEffect(() => {
    if (isGlowActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(activePulse, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(activePulse, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      activePulse.setValue(0);
    }
  }, [isGlowActive, activePulse]);

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      tension: 200,
      friction: 12,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 12,
    }).start();
  };

  const pulseRingScale = activePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });

  const pulseRingOpacity = activePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 0],
  });

  // Calculate bottom offset so it sits cleanly at bottom-left without overlapping tabs or home indicators
  const bottomOffset = Math.max(insets.bottom + 8, 18);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomOffset,
          transform: [{ scale }],
        },
      ]}
    >
      {/* Halo ring pulse when active */}
      {isGlowActive ? (
        <Animated.View
          style={[
            styles.haloRing,
            {
              borderColor: currentConfig.bgColor,
              opacity: pulseRingOpacity,
              transform: [{ scale: pulseRingScale }],
            },
          ]}
        />
      ) : null}

      <Pressable
        onPress={cycleAiState}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: currentConfig.bgColor,
            borderColor: currentConfig.borderColor,
          },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`AI assistant glow state: ${aiState}. Tap to cycle.`}
      >
        <Ionicons
          name={currentConfig.icon}
          size={16}
          color={currentConfig.textColor}
        />
        <Text
          style={[
            styles.buttonText,
            {
              color: currentConfig.textColor,
            },
          ]}
        >
          {currentConfig.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 14,
    zIndex: 99999,
  },
  haloRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 2,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
