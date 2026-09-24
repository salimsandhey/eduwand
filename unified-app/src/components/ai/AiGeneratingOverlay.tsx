import { RefObject, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";
import { useAiAssistantGlow } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { darkColors, typography } from "../../theme/tokens";
import { StatusBar } from "expo-status-bar";
import { AI_ASSISTANT_NAME } from "../../constants/brand";

// Centered "generating" animation: a small white circle with brand-colored
// stars drifting through it diagonally (top-left -> bottom-right), staying
// inside the circle - each one fades in small, is biggest at the center, and
// fades out small again (Samsung Galaxy AI style). The screen
// behind is blurred (inside the edge glow) and every touch is captured, so
// the page underneath can't be scrolled or tapped while something generates.

// Near-black veil over the dark blur (theme/tokens charcoal #1F1F1F at ~65%).
const BACKDROP_VEIL = "rgba(31, 31, 31, 0.65)";

const CIRCLE_SIZE = 67;
const STAR_SIZE = 20;
const STAR_COUNT = 3;
const CYCLE_MS = 2400;
// Per-axis offset of the path endpoints from the center. Kept well inside the
// rim: at the ends a star is small (scale 0.35) and still fully in the circle.
const TRAVEL = CIRCLE_SIZE * 0.24;
const STAR_LEFT = (CIRCLE_SIZE - STAR_SIZE) / 2;

// Four-point sparkle with concave sides, 24x24 viewBox.
const SPARKLE_PATH = "M12 0C12.6 6.4 17.6 11.4 24 12C17.6 12.6 12.6 17.6 12 24C11.4 17.6 6.4 12.6 0 12C6.4 11.4 11.4 6.4 12 0Z";

// Back layer: smaller, fainter stars on a parallel path running below the
// front one (nudged toward the bottom-left), timed to fall between the front
// stars (front sit at 0, 1/3, 2/3 of the loop).
const BACK_STAR_PHASES = [1 / 12, 7 / 12];
const BACK_STAR_SCALE = 0.72;
const BACK_STAR_OPACITY = 0.5;
const BACK_PATH_SHIFT = -CIRCLE_SIZE * 0.14;
// Front path nudged the other way so there's a clear gap between the two
// layers (~19% of the circle apart), while every star still stays inside the circle.
const FRONT_PATH_SHIFT = CIRCLE_SIZE * 0.05;

interface TravellingStarProps {
  clock: Animated.Value;
  phase: number;
  color: string;
  /** Multiplies the star's size along the whole path. */
  sizeScale?: number;
  /** Opacity at the center of the path (where it's fully visible). */
  peakOpacity?: number;
  /** Moves the whole path perpendicular to the diagonal: positive = toward the top-right, negative = bottom-left. */
  pathShift?: number;
}

function TravellingStar({ clock, phase, color, sizeScale = 1, peakOpacity = 1, pathShift = 0 }: TravellingStarProps) {
  // Shift the shared 0..1 clock by `phase` and wrap it, so the stars share one
  // loop but sit evenly spaced along the path. The wrap happens at the path's
  // ends, where the star is fully transparent, so the jump is never visible.
  const wrapAt = 1 - phase;
  const progress =
    phase === 0
      ? clock
      : clock.interpolate({
          inputRange: [0, wrapAt, wrapAt + 0.0001, 1],
          outputRange: [phase, 1, 0, phase],
        });

  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [-TRAVEL, TRAVEL] });

  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: STAR_LEFT + pathShift,
          top: STAR_LEFT - pathShift,
          // Fades in at the top-left, fully visible at the center, fades out at the bottom-right.
          opacity: progress.interpolate({
            inputRange: [0, 0.25, 0.5, 0.75, 1],
            outputRange: [0, 0.6 * peakOpacity, peakOpacity, 0.6 * peakOpacity, 0],
          }),
          transform: [
            { translateX: offset },
            { translateY: offset },
            {
              scale: progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.35 * sizeScale, 1.15 * sizeScale, 0.35 * sizeScale],
              }),
            },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["-20deg", "20deg"] }) },
          ],
        },
      ]}
    >
      <Svg width={STAR_SIZE} height={STAR_SIZE} viewBox="0 0 24 24">
        <Path d={SPARKLE_PATH} fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface Props {
  /** The app content to blur behind the overlay (Android blurs only a BlurTargetView). */
  blurTarget: RefObject<View | null>;
}

export function AiGeneratingOverlay({ blurTarget }: Props) {
  const { isGlowActive } = useAiAssistantGlow();
  const { colors } = useTheme();
  const [rendered, setRendered] = useState(isGlowActive);
  const [reducedMotion, setReducedMotion] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isGlowActive) {
      setRendered(true);
      Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(fade, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setRendered(false);
        }
      );
    }
  }, [isGlowActive, fade]);

  useEffect(() => {
    if (!rendered) return;
    if (reducedMotion) {
      // Hold the lead star at the center, full size.
      clock.setValue(0.5);
      return;
    }
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [rendered, reducedMotion, clock]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[styles.root, { opacity: fade }]}
      pointerEvents={isGlowActive ? "auto" : "none"}
      // Swallow every touch so the page underneath can't scroll or be tapped.
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Generating with ${AI_ASSISTANT_NAME}`}
    >
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={40}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* Dark veil on top of the blur - also the whole backdrop on Android < 12, where blur falls back to none. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BACKDROP_VEIL }]} />
      {/* Light status-bar icons over the dark backdrop; unmounting restores the app's own StatusBar. */}
      {isGlowActive ? <StatusBar style="light" /> : null}

      <Animated.View
        style={{
          alignItems: "center",
          transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        }}
      >
        {/* Transparent for now (no white fill/shadow) - to bring the white circle back,
            add `{ backgroundColor: colors.surface }, cardShadow` to this outer view. */}
        <View style={styles.circle}>
          <View style={[styles.circle, styles.clip]}>
            {/* Back layer first so the front stars draw over it. */}
            {BACK_STAR_PHASES.map((phase) => (
              <TravellingStar
                key={`back-${phase}`}
                clock={clock}
                phase={phase}
                color={colors.accent}
                sizeScale={BACK_STAR_SCALE}
                peakOpacity={BACK_STAR_OPACITY}
                pathShift={BACK_PATH_SHIFT}
              />
            ))}
            {Array.from({ length: STAR_COUNT }, (_, i) => (
              <TravellingStar key={i} clock={clock} phase={i / STAR_COUNT} color={colors.accent} pathShift={FRONT_PATH_SHIFT} />
            ))}
          </View>
        </View>

        {/* Dark-theme text colors - the backdrop is dark regardless of the app theme. The name is
            plain white here on purpose, not the two-tone AIWandName wordmark. */}
        <Text style={[styles.title, { color: darkColors.textPrimary }]}>Generating with {AI_ASSISTANT_NAME}</Text>
        <Text style={[styles.subtitle, { color: darkColors.textMuted }]}>This can take up to a minute</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9998,
    elevation: 9998,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
  },
  clip: {
    overflow: "hidden",
  },
  star: {
    position: "absolute",
  },
  title: {
    marginTop: 20,
    fontFamily: typography.semiBold,
    fontSize: 16,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
});
