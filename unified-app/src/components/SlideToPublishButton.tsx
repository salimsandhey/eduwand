import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder, LayoutChangeEvent, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

const THUMB_SIZE = 54;
const TRACK_HEIGHT = 62;
const TRACK_INSET = (TRACK_HEIGHT - THUMB_SIZE) / 2;
const SLIDE_THRESHOLD_RATIO = 0.72;
const SUCCESS_HOLD_MS = 1500;
type Phase = "idle" | "dragging" | "publishing";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Props {
  label?: string;
  disabled?: boolean;
  accentColor?: string;
  onPublish: () => Promise<boolean>;
  onSuccess?: () => void;
  onDone?: () => void;
}

export function SlideToPublishButton({ label = "Slide to publish", disabled, accentColor, onPublish, onSuccess, onDone }: Props) {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const actionColor = accentColor ?? colors.accent;
  const translateX = useRef(new Animated.Value(0)).current;
  const phaseRef = useRef(phase);
  const disabledRef = useRef(disabled);
  const maxTranslateRef = useRef(0);
  const dragStartXRef = useRef(0);
  const maxTranslate = Math.max(0, trackWidth - THUMB_SIZE - TRACK_INSET * 2);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { maxTranslateRef.current = maxTranslate; }, [maxTranslate]);

  function reset() {
    Animated.spring(translateX, { toValue: 0, friction: 7, tension: 90, useNativeDriver: false }).start(() => setPhase("idle"));
  }

  function commit() {
    setPhase("publishing");
    Animated.timing(translateX, { toValue: maxTranslateRef.current, duration: 120, useNativeDriver: false }).start(async () => {
      const ok = await onPublish();
      if (!ok) return reset();
      onSuccess?.();
      setTimeout(() => onDone?.(), SUCCESS_HOLD_MS);
    });
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => phaseRef.current === "idle" && !disabledRef.current,
    onMoveShouldSetPanResponder: (_event, gesture) => phaseRef.current === "idle" && !disabledRef.current && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => phaseRef.current === "idle" && !disabledRef.current && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
    onPanResponderGrant: () => {
      translateX.stopAnimation((value) => { dragStartXRef.current = value; });
      setPhase("dragging");
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_event, gesture) => translateX.setValue(clamp(dragStartXRef.current + gesture.dx, 0, maxTranslateRef.current)),
    onPanResponderRelease: (_event, gesture) => {
      const next = clamp(dragStartXRef.current + gesture.dx, 0, maxTranslateRef.current);
      if (maxTranslateRef.current > 0 && next / maxTranslateRef.current >= SLIDE_THRESHOLD_RATIO) commit();
      else reset();
    },
    onPanResponderTerminate: () => { if (phaseRef.current === "dragging") reset(); },
  })).current;

  const labelOpacity = translateX.interpolate({ inputRange: [0, Math.max(1, maxTranslate * 0.7)], outputRange: [1, 0], extrapolate: "clamp" });
  const fillWidth = translateX.interpolate({ inputRange: [0, Math.max(1, maxTranslate)], outputRange: [0, Math.max(1, maxTranslate + THUMB_SIZE / 2)] });
  const fillOpacity = translateX.interpolate({ inputRange: [0, 10, Math.max(11, maxTranslate)], outputRange: [0, 0.28, 1], extrapolate: "clamp" });

  return (
    <View style={styles.outer} onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.track, { backgroundColor: colors.backgroundMuted, borderColor: colors.border }, disabled && styles.disabled]}>
        {trackWidth > 0 ? <Animated.View pointerEvents="none" style={[styles.fill, { width: fillWidth, opacity: fillOpacity, backgroundColor: actionColor }]} /> : null}
        <Animated.View pointerEvents="none" style={styles.dragContent}>
          {phase === "dragging" ? (
            <Text style={[styles.dragLabel, { color: colors.textPrimary }]}>Keep sliding to confirm</Text>
          ) : (
            <>
              <Animated.Text style={[styles.label, { color: colors.textPrimary, opacity: labelOpacity, transform: [{ translateX }] }]} numberOfLines={1}>{label}</Animated.Text>
              <Text style={[styles.arrowHint, { color: colors.textMuted }]}>Slide</Text>
            </>
          )}
        </Animated.View>
        <Animated.View {...(phase === "idle" || phase === "dragging" ? panResponder.panHandlers : {})} style={[styles.thumb, { backgroundColor: actionColor, transform: [{ translateX }] }]}>
          {phase === "publishing" ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="arrow-forward" size={23} color="#FFFFFF" />}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { minHeight: TRACK_HEIGHT },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, borderWidth: 1, overflow: "hidden", justifyContent: "center" },
  disabled: { opacity: 0.6 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: TRACK_HEIGHT / 2 },
  dragContent: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "center" },
  label: { position: "absolute", left: THUMB_SIZE + 14, fontSize: 14, fontWeight: "800" },
  dragLabel: { textAlign: "center", fontSize: 14, fontWeight: "800" },
  arrowHint: { position: "absolute", right: 18, fontSize: 11, fontWeight: "700" },
  thumb: { position: "absolute", left: TRACK_INSET, top: TRACK_INSET, width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, alignItems: "center", justifyContent: "center" },
});
