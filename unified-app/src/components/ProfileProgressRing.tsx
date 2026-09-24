import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export const PROFILE_RING_STROKE = 2.5;

interface ProfileProgressRingProps {
  /** 0-100. */
  percent: number;
  size: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  /**
   * False = the ring isn't drawn yet (the avatar still sits at its in-ring
   * size, so nothing shifts when it appears). Flipping to true draws the ring
   * in: the track fades up with a small bounce and the arc sweeps clockwise
   * from 12 o'clock to `percent`. Defaults to true (draws in on mount).
   */
  revealed?: boolean;
  /**
   * Bump this number to play a "caught something" squash-and-bounce on the
   * ring and avatar together (the Complete-profile popup's orb landing).
   * 0 / unchanged = no bounce.
   */
  catchSignal?: number;
  children: ReactNode;
}

/**
 * A circular progress arc drawn around its children (an avatar), filling
 * clockwise from 12 o'clock. The children are centered inside; size them to
 * leave room for the stroke.
 */
export function ProfileProgressRing({ percent, size, strokeWidth = PROFILE_RING_STROKE, color, trackColor, revealed = true, catchSignal = 0, children }: ProfileProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.82)).current;
  const wasRevealed = useRef(false);
  const catchX = useRef(new Animated.Value(1)).current;
  const catchY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!catchSignal) return;
    // Squash on impact (wide and short, like something landed on it), then
    // spring back with a little wobble.
    Animated.sequence([
      Animated.parallel([
        Animated.timing(catchX, { toValue: 1.2, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(catchY, { toValue: 0.82, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(catchX, { toValue: 1, tension: 240, friction: 5, useNativeDriver: true }),
        Animated.spring(catchY, { toValue: 1, tension: 240, friction: 5, useNativeDriver: true }),
      ]),
    ]).start();
  }, [catchSignal, catchX, catchY]);

  useEffect(() => {
    if (!revealed) {
      wasRevealed.current = false;
      progress.setValue(0);
      ringOpacity.setValue(0);
      ringScale.setValue(0.82);
      return;
    }
    if (!wasRevealed.current) {
      // First appearance: pop the ring in, then sweep the arc.
      wasRevealed.current = true;
      Animated.parallel([
        Animated.timing(ringOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(ringScale, { toValue: 1, tension: 180, friction: 9, useNativeDriver: true }),
        Animated.timing(progress, { toValue: percent, delay: 120, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
      return;
    }
    // Already showing - just move the arc to the new percent.
    Animated.timing(progress, { toValue: percent, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [revealed, percent, progress, ringOpacity, ringScale]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.root, { width: size, height: size, transform: [{ scaleX: catchX }, { scaleY: catchY }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} pointerEvents="none">
        {/* Rotated so the arc starts at the top instead of 3 o'clock. */}
        <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            fill="none"
          />
        </Svg>
      </Animated.View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
});
