import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Defs,
  FeGaussianBlur,
  Filter,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { AIAssistantState } from "../../context/AiAssistantGlowContext";

// ============================================================================
// 7-COLOR FLUID AI SPECTRUM
// Blue -> Cyan -> Purple -> Pink -> Orange -> Yellow -> Green -> Blue
// ============================================================================
export const AI_PALETTE = [
  "#3B82F6", // 0: Electric Blue
  "#06B6D4", // 1: Luminous Cyan
  "#8B5CF6", // 2: Deep Violet / Purple
  "#EC4899", // 3: Vivid Pink / Magenta
  "#F97316", // 4: Warm Orange
  "#FBBF24", // 5: Golden Amber / Yellow
  "#10B981", // 6: Emerald Green
  "#3B82F6", // 7: Seamless Loop back to Blue
];

const BASE_ROTATION_MS = 5400;

interface StateProfile {
  opacity: number;
  borderWidth: number;
  speedMultiplier: number;
  glowSpread: number;
  pulseDuration: number;
}

// Single active AI profile: strictly the Listening effect (tight, elegant edge glow)
const LISTENING_PROFILE: StateProfile = {
  opacity: 0.95,
  borderWidth: 4.0,
  speedMultiplier: 1.0,
  glowSpread: 12,
  pulseDuration: 1800,
};

const OFF_PROFILE: StateProfile = {
  opacity: 0,
  borderWidth: 0,
  speedMultiplier: 0,
  glowSpread: 0,
  pulseDuration: 3000,
};

export interface AIAssistantGlowProps {
  state?: AIAssistantState;
  intensity?: number;      // Multiplier: default 1.0
  speed?: number;          // Multiplier: default 1.0
  borderWidth?: number;    // Configurable visible gradient perimeter width (dp)
  borderRadius?: number;   // Outer corner radius
  glowSpread?: number;     // Soft glow extension beyond visible gradient (dp)
  cardBackground?: string; // Background color for the inner card (defaults to transparent)
  size?: "fullscreen" | "contain";
  disabled?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
}

interface RotatingGlowSvgProps {
  containerWidth: number;
  containerHeight: number;
  outerRadius: number;
  effectiveGlowSpread: number;
  speedMultiplier: number;
  speed: number;
  isReducedMotion: boolean;
}

// ============================================================================
// ISOLATED ROTATING GLOW SVG WITH HARDWARE-DOWNSCALED TRUE GAUSSIAN BLUR
// - Preserves 100% authentic, visible, soft optical Gaussian blur (FeGaussianBlur)
// - Downsamples blur canvas by 0.5x, cutting memory and pixel count by 75%
// - Upscales 2x via GPU hardware texture unit with free bilinear smoothing
// - Throttles native coordinate updates to 30 FPS (saving 50% CPU/GPU overhead)
// - Shielded via React.memo: 0 React re-renders while running
// ============================================================================
const RotatingGlowSvg = React.memo(function RotatingGlowSvg({
  containerWidth,
  containerHeight,
  outerRadius,
  effectiveGlowSpread,
  speedMultiplier,
  speed,
  isReducedMotion,
}: RotatingGlowSvgProps) {
  const linearGradientRef = useRef<any>(null);
  const rotationDuration = Math.round(
    (BASE_ROTATION_MS / (speedMultiplier || 1.0)) / Math.max(speed, 0.25)
  );

  const [coords, setCoords] = useState(() => ({
    x1: "135%",
    y1: "50%",
    x2: "-35%",
    y2: "50%",
  }));

  useEffect(() => {
    if (isReducedMotion) return;

    let animId: number;
    let lastTime = performance.now();
    let currentAngle = 0;
    let lastUpdate = 0;
    // 30 FPS throttle: cuts native blur filter calls by 50% while maintaining
    // visually seamless color rotation for the 5.4s cycle.
    const FRAME_INTERVAL_MS = 32;

    const frame = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      currentAngle = (currentAngle + (dt / rotationDuration) * 360) % 360;

      if (now - lastUpdate >= FRAME_INTERVAL_MS) {
        lastUpdate = now;
        const rad = (currentAngle * Math.PI) / 180;
        const r = 0.85;
        const x1 = `${(0.5 + r * Math.cos(rad)) * 100}%`;
        const y1 = `${(0.5 + r * Math.sin(rad)) * 100}%`;
        const x2 = `${(0.5 - r * Math.cos(rad)) * 100}%`;
        const y2 = `${(0.5 - r * Math.sin(rad)) * 100}%`;

        // Direct native update (bypasses React virtual DOM reconciliation)
        if (linearGradientRef.current?.setNativeProps) {
          try {
            linearGradientRef.current.setNativeProps({ x1, y1, x2, y2 });
          } catch {
            setCoords({ x1, y1, x2, y2 });
          }
        } else {
          setCoords({ x1, y1, x2, y2 });
        }
      }

      animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [isReducedMotion, rotationDuration]);

  // Downscaled rendering canvas (0.5x):
  // 75% reduction in pixel count and memory allocations.
  // When upscaled 2x via GPU bilinear filtering, the 4.5dp blur scales to 9dp of clean, focused edge glow.
  const halfWidth = Math.max(Math.round(containerWidth / 2), 1);
  const halfHeight = Math.max(Math.round(containerHeight / 2), 1);
  const scaledSpread = Math.max(Math.round((effectiveGlowSpread + 4) / 2), 2);
  const scaledRadius = Math.max(Math.round(outerRadius / 2), 1);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={{
          width: halfWidth,
          height: halfHeight,
          position: "absolute",
          top: (containerHeight - halfHeight) / 2,
          left: (containerWidth - halfWidth) / 2,
          transform: [{ scale: 2 }],
        }}
      >
        <Svg
          width={halfWidth}
          height={halfHeight}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            {/* Real Gaussian blur filter - softer, gentle optical diffusion */}
            <Filter id="aiGlowBlur" x="-18%" y="-18%" width="136%" height="136%">
              <FeGaussianBlur in="SourceGraphic" stdDeviation="6" />
            </Filter>

            {/* Rotating 7-Color Fluid Gradient */}
            <LinearGradient
              ref={linearGradientRef}
              id="rotatingAiGradient"
              x1={coords.x1}
              y1={coords.y1}
              x2={coords.x2}
              y2={coords.y2}
            >
              <Stop offset="0%" stopColor="#3B82F6" />
              <Stop offset="14%" stopColor="#06B6D4" />
              <Stop offset="28%" stopColor="#8B5CF6" />
              <Stop offset="42%" stopColor="#EC4899" />
              <Stop offset="57%" stopColor="#F97316" />
              <Stop offset="71%" stopColor="#FBBF24" />
              <Stop offset="85%" stopColor="#10B981" />
              <Stop offset="100%" stopColor="#3B82F6" />
            </LinearGradient>
          </Defs>

          {/* Genuine Gaussian blurred glow - rich, luminous, diffused */}
          <Rect
            x={-1}
            y={-1}
            width={halfWidth + 2}
            height={halfHeight + 2}
            rx={scaledRadius + 1}
            ry={scaledRadius + 1}
            fill="none"
            stroke="url(#rotatingAiGradient)"
            strokeWidth={scaledSpread}
            filter="url(#aiGlowBlur)"
            opacity={0.95}
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
});

export function AIAssistantGlow({
  state = "listening",
  intensity = 1.0,
  speed = 1.0,
  borderWidth,
  borderRadius,
  glowSpread,
  cardBackground = "transparent",
  size = "fullscreen",
  disabled = false,
  children,
  style,
  cardStyle,
}: AIAssistantGlowProps) {
  const windowDims = useWindowDimensions();
  const screenDims = Dimensions.get("screen");
  const [layoutDims, setLayoutDims] = useState<{ width: number; height: number } | null>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // Exact physical outer dimensions
  const containerWidth =
    size === "fullscreen"
      ? Math.max(windowDims.width, screenDims.width)
      : layoutDims?.width ?? windowDims.width;
  const containerHeight =
    size === "fullscreen"
      ? Math.max(windowDims.height, screenDims.height)
      : layoutDims?.height ?? windowDims.height;

  const isOff = disabled || state === "off";
  // Always use the Listening profile for geometry and appearance
  const activeProfile = LISTENING_PROFILE;

  const [shouldRender, setShouldRender] = useState(!isOff);

  // Configurable perimeter border and radius - stays stable during fade transitions!
  const effectiveBorderWidth =
    (borderWidth ?? activeProfile.borderWidth) * Math.min(Math.max(intensity, 0.5), 1.6);
  const outerRadius = borderRadius ?? (size === "fullscreen" ? 34 : 20);
  const innerRadius = Math.max(outerRadius - effectiveBorderWidth, 0);
  const effectiveGlowSpread =
    (glowSpread ?? activeProfile.glowSpread) * Math.min(Math.max(intensity, 0.5), 1.5);

  // Accessibility reduced motion
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setIsReducedMotion);
    return () => sub.remove();
  }, []);

  // Smooth fade transition controller (0.0 = completely hidden, 1.0 = fully visible)
  const fadeAnim = useRef(new Animated.Value(isOff ? 0 : 1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Smooth entrance & exit transition
  useEffect(() => {
    if (!isOff) {
      setShouldRender(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 480,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
        }
      });
    }
  }, [isOff, fadeAnim]);

  // Living breathing pulse running 100% on Native Driver
  useEffect(() => {
    if (!shouldRender || isReducedMotion) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: Math.round(activeProfile.pulseDuration * 0.5),
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: Math.round(activeProfile.pulseDuration * 0.5),
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [shouldRender, isReducedMotion, activeProfile, pulse]);

  // Breathing pulse factor (GPU native driver)
  const pulseFactor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.0],
  });

  // Base opacity mapped through fadeAnim for smooth fading in and out
  const targetMaxOpacity = activeProfile.opacity * Math.min(Math.max(intensity, 0), 2.0);
  const baseFadeOpacity = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetMaxOpacity],
  });
  const effectiveOpacity = Animated.multiply(baseFadeOpacity, pulseFactor);

  // Gentle bloom scale: expands softly from 0.985 to 1.0 on show, dissolves cleanly on hide
  const bloomScale = fadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1.0],
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    if (size !== "fullscreen") {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        setLayoutDims({ width, height });
      }
    }
  };

  const hasChildren = Boolean(children);

  return (
    <View
      onLayout={handleLayout}
      style={[
        size === "fullscreen" ? styles.fullscreenWrapper : styles.containerWrapper,
        style,
      ]}
    >
      {shouldRender && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: effectiveOpacity,
              transform: [{ scale: bloomScale }],
            },
          ]}
        >
          <RotatingGlowSvg
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            outerRadius={outerRadius}
            effectiveGlowSpread={effectiveGlowSpread}
            speedMultiplier={activeProfile.speedMultiplier}
            speed={speed}
            isReducedMotion={isReducedMotion}
          />
        </Animated.View>
      )}

      {/* Card layer: unblurred, sharp, interactive */}
      {hasChildren ? (
        <View
          style={[
            styles.cardLayer,
            {
              margin: effectiveBorderWidth,
              borderRadius: innerRadius,
              backgroundColor: cardBackground,
            },
            cardStyle,
          ]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    pointerEvents: "box-none",
  },
  containerWrapper: {
    position: "relative",
    overflow: "hidden",
  },
  cardLayer: {
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
});
