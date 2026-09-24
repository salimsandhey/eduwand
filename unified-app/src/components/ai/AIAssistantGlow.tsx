import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  LayoutChangeEvent,
  PixelRatio,
  Platform,
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
import { brandPalette } from "../../theme/tokens";

// ============================================================================
// BRAND GLOW SPECTRUM (theme/tokens.ts brandPalette)
// Plum -> Magenta -> Coral -> Amber -> Coral -> Magenta -> Plum
// ============================================================================
export const AI_PALETTE = [
  brandPalette.deepPlum,
  "#B8328F", // plum -> coral blend
  brandPalette.coral,
  brandPalette.amber,
  brandPalette.coral,
  "#B8328F",
  brandPalette.deepPlum,
];

const BASE_ROTATION_MS = 5400;

// ============================================================================
// BLUR BACKEND
// react-native-svg's FeGaussianBlur on Android creates a RenderScript context
// and blurs the whole bitmap on the UI thread on EVERY redraw - and the
// rotating gradient redraws 30x/s, which starved the UI thread (laggy stars,
// dropped frames). On Android 12+ the blur is instead done by RN's `filter`
// style (hwui RenderEffect, on the GPU) with the SAME sigma; the SVG then only
// redraws a plain stroked rect. iOS and older Android keep the SVG filter.
// ============================================================================
const USE_NATIVE_BLUR = Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= 31;

const SVG_BLUR_STD_DEVIATION = 6;
// What that stdDeviation becomes in react-native-svg's Android blur: radius =
// stdDeviation * 2 (FeGaussianBlurView), and ScriptIntrinsicBlur's Gaussian
// sigma = 0.4 * radius + 0.6 - in raw canvas pixels, not dp.
const SVG_BLUR_SIGMA_PX = 0.4 * (SVG_BLUR_STD_DEVIATION * 2) + 0.6;
// RN's `filter: blur` takes a sigma in dp.
const NATIVE_BLUR_SIGMA_DP = SVG_BLUR_SIGMA_PX / PixelRatio.get();
// Canvas padding (half-scale units) on the native path. RN's blur treats
// pixels outside the view as transparent (DECAL) where RenderScript repeated
// the edge pixel, so the stroke is extended past the screen edge by > 3 sigma.
const NATIVE_BLUR_MARGIN = Math.ceil((3 * SVG_BLUR_SIGMA_PX) / PixelRatio.get()) + 2;

// Gradient axis endpoints for a rotation angle, as 0..1 fractions of the
// glow rect's box (0.85 reach puts the ends just outside it).
function gradientFractions(rad: number) {
  const r = 0.85;
  return {
    fx1: 0.5 + r * Math.cos(rad),
    fy1: 0.5 + r * Math.sin(rad),
    fx2: 0.5 - r * Math.cos(rad),
    fy2: 0.5 - r * Math.sin(rad),
  };
}

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
// - Real Gaussian blur: GPU RenderEffect on Android 12+, FeGaussianBlur elsewhere (see BLUR BACKEND)
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

  // Downscaled rendering canvas (0.5x):
  // 75% reduction in pixel count and memory allocations.
  // When upscaled 2x via GPU bilinear filtering, the 4.5dp blur scales to 9dp of clean, focused edge glow.
  const halfWidth = Math.max(Math.round(containerWidth / 2), 1);
  const halfHeight = Math.max(Math.round(containerHeight / 2), 1);
  const scaledSpread = Math.max(Math.round((effectiveGlowSpread + 4) / 2), 2);
  const scaledRadius = Math.max(Math.round(outerRadius / 2), 1);

  // Native-blur path pads the canvas; the glow itself stays where it was.
  const margin = USE_NATIVE_BLUR ? NATIVE_BLUR_MARGIN : 0;
  const canvasWidth = halfWidth + margin * 2;
  const canvasHeight = halfHeight + margin * 2;

  // Gradient endpoints for a rotation angle. The SVG-filter path keeps the
  // original objectBoundingBox percentages. The native path's rect is larger
  // (see below), so there the same points are given in user space, mapped
  // onto the ORIGINAL rect's box - the colour bands land exactly where they did.
  const toGradientProps = (rad: number) => {
    const { fx1, fy1, fx2, fy2 } = gradientFractions(rad);
    if (!USE_NATIVE_BLUR) {
      return { x1: `${fx1 * 100}%`, y1: `${fy1 * 100}%`, x2: `${fx2 * 100}%`, y2: `${fy2 * 100}%` };
    }
    // Original rect box: x in [-1, halfWidth + 1], shifted by the margin.
    const boxX = margin - 1;
    const boxY = margin - 1;
    const boxW = halfWidth + 2;
    const boxH = halfHeight + 2;
    return { x1: boxX + fx1 * boxW, y1: boxY + fy1 * boxH, x2: boxX + fx2 * boxW, y2: boxY + fy2 * boxH };
  };
  const toGradientPropsRef = useRef(toGradientProps);
  toGradientPropsRef.current = toGradientProps;

  const [coords, setCoords] = useState<{ x1: string | number; y1: string | number; x2: string | number; y2: string | number }>(
    () => toGradientProps(0)
  );

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
        const { x1, y1, x2, y2 } = toGradientPropsRef.current(rad);

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

  // Stroke geometry. SVG-filter path: the original rect, stroke centred on its
  // edge at -1, so the band spans [-1 - w/2, -1 + w/2]. Native path: same
  // INNER edge and inner corner radius, but the band is widened outward until
  // it runs past the canvas edge - DECAL then sees colour beyond the screen
  // edge exactly like RenderScript's edge-clamp did, so edge brightness matches.
  const innerEdge = margin - 1 + scaledSpread / 2;
  const innerCornerRadius = scaledRadius + 1 - scaledSpread / 2;
  const strokeWidth = USE_NATIVE_BLUR ? innerEdge + 1 : scaledSpread;
  const rectInset = USE_NATIVE_BLUR ? innerEdge - strokeWidth / 2 : -1;
  const rectCornerRadius = USE_NATIVE_BLUR ? Math.max(innerCornerRadius, 0) + strokeWidth / 2 : scaledRadius + 1;

  return (
    <View style={StyleSheet.absoluteFill}>
      <View
        style={{
          width: canvasWidth,
          height: canvasHeight,
          position: "absolute",
          top: (containerHeight - canvasHeight) / 2,
          left: (containerWidth - canvasWidth) / 2,
          transform: [{ scale: 2 }],
          // GPU blur (Android 12+ RenderEffect). Applied in this view's local,
          // pre-scale space - the same space the SVG filter blurred in.
          ...(USE_NATIVE_BLUR ? { filter: [{ blur: NATIVE_BLUR_SIGMA_DP }] } : null),
        }}
      >
        <Svg
          width={canvasWidth}
          height={canvasHeight}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            {/* Real Gaussian blur filter - softer, gentle optical diffusion.
                Only on the fallback path (iOS / Android < 12). */}
            {!USE_NATIVE_BLUR ? (
              <Filter id="aiGlowBlur" x="-18%" y="-18%" width="136%" height="136%">
                <FeGaussianBlur in="SourceGraphic" stdDeviation={SVG_BLUR_STD_DEVIATION} />
              </Filter>
            ) : null}

            {/* Rotating 7-Color Fluid Gradient */}
            <LinearGradient
              ref={linearGradientRef}
              id="rotatingAiGradient"
              gradientUnits={USE_NATIVE_BLUR ? "userSpaceOnUse" : "objectBoundingBox"}
              x1={coords.x1}
              y1={coords.y1}
              x2={coords.x2}
              y2={coords.y2}
            >
              {AI_PALETTE.map((color, i) => (
                <Stop key={i} offset={`${(i / (AI_PALETTE.length - 1)) * 100}%`} stopColor={color} />
              ))}
            </LinearGradient>
          </Defs>

          {/* Genuine Gaussian blurred glow - rich, luminous, diffused */}
          <Rect
            x={rectInset}
            y={rectInset}
            width={canvasWidth - rectInset * 2}
            height={canvasHeight - rectInset * 2}
            rx={rectCornerRadius}
            ry={rectCornerRadius}
            fill="none"
            stroke="url(#rotatingAiGradient)"
            strokeWidth={strokeWidth}
            filter={USE_NATIVE_BLUR ? undefined : "url(#aiGlowBlur)"}
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
