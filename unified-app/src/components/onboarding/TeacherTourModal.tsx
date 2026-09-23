import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Animated, Easing, LayoutChangeEvent, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";

interface TourStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: "school-outline",
    title: "Welcome to EduWand",
    body: "A quick look around before you get started - this takes less than a minute.",
  },
  {
    icon: "albums-outline",
    title: "Studio",
    body: "Create classes, subjects, and lesson topics here. Everything you teach starts in Studio.",
  },
  {
    icon: "document-text-outline",
    title: "Assignments",
    body: "Build assignments manually or with AI, publish them to a class, and review submissions as they come in.",
  },
  {
    icon: "stats-chart-outline",
    title: "Analytics",
    body: "Track attainment and see how your classes are progressing over time.",
  },
  {
    icon: "menu-outline",
    title: "More",
    body: "Your profile, credits balance, students roster, and getting-started checklist all live under More.",
  },
];

interface TeacherTourModalProps {
  visible: boolean;
  onDone: () => void;
}

// Entrance/exit spring shape, shared so the dismiss reads as the entrance
// played in reverse rather than a different, flatter motion. ~0.41 damping
// ratio - a real, visible overshoot-and-settle "bubble" in both directions.
// Scale only, no translateY - RN pivots `scale` at the element's own centre
// by default, but stacking a translateY slide on top of it skews where the
// growth visually reads as anchored (the maths works out so the bottom edge
// barely moves while the top does all the travelling, i.e. it *looks*
// bottom-anchored even though nothing set transformOrigin to that). Pure
// scale keeps the pop symmetric around dead centre.
const REST_SCALE = 0.86;
const CARD_SPRING = { damping: 11, stiffness: 200, mass: 0.9 };

export function TeacherTourModal({ visible, onDone }: TeacherTourModalProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === STEPS.length - 1;
  const step = STEPS[stepIndex];

  // Natural height of each step's icon+title+body block, captured once by
  // the off-screen clone stack below (RN has no height:"auto" to animate
  // to - you have to measure the real pixel value up front, then tween to
  // it). Ref, not state: written from onLayout on every measure pass, read
  // synchronously inside goToStep, doesn't need to trigger a render itself.
  const stepHeights = useRef<number[]>(new Array(STEPS.length).fill(0));
  const heightAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  // Flips true on the first transition, once heightAnim has been seeded with
  // the current step's real height. Before that the block just sizes itself
  // naturally - nothing to animate from yet on first mount/open.
  const [isHeightControlled, setIsHeightControlled] = useState(false);

  // Custom entrance/exit, driven ourselves instead of Modal's built-in
  // animationType - a backdrop fade plus a spring-driven pop-and-settle on
  // the card, rather than a stock fade/slide. `mounted` lags one tick behind
  // `visible` on the way out so the exit animation gets to play before the
  // native Modal actually unmounts (Modal has no exit-animation concept of
  // its own once animationType is "none").
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(REST_SCALE)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdropOpacity.setValue(0);
      cardOpacity.setValue(0);
      cardScale.setValue(REST_SCALE);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // ~0.41 damping ratio - noticeably livelier than the very first cut
        // (13/180/0.9, ~0.51) and well past the too-tame 27/250/1 (~0.86)
        // pass: a real, visible overshoot-and-settle "bubble" rather than a
        // gentle glide.
        Animated.spring(cardScale, { toValue: 1, ...CARD_SPRING, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      // The exact same spring physics run in reverse, back toward the
      // entrance's starting scale, rather than a plain ease-out - the card
      // visibly "un-bubbles" instead of just shrinking flatly.
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: REST_SCALE, ...CARD_SPRING, useNativeDriver: true }),
      ]).start(() => {
        setMounted(false);
        // Reset step state only once fully hidden, so the card doesn't
        // visibly snap back to step 1 while it's still fading/scaling out.
        setStepIndex(0);
        setIsHeightControlled(false);
        contentFade.setValue(1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleMeasure(index: number) {
    return (e: LayoutChangeEvent) => {
      stepHeights.current[index] = e.nativeEvent.layout.height;
    };
  }

  function goToStep(nextIndex: number) {
    const allMeasured = stepHeights.current.every((h) => h > 0);
    if (!allMeasured) {
      // Shouldn't normally happen - the hidden stack measures on mount -
      // but fall back to an instant switch rather than animating to a
      // wrong/zero height.
      setStepIndex(nextIndex);
      return;
    }

    if (!isHeightControlled) {
      heightAnim.setValue(stepHeights.current[stepIndex]);
      setIsHeightControlled(true);
    }

    Animated.timing(contentFade, {
      toValue: 0,
      duration: 130,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setStepIndex(nextIndex);
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: stepHeights.current[nextIndex],
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height can't run on the native driver
        }),
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  function handleNext() {
    if (isLast) {
      onDone();
    } else {
      goToStep(stepIndex + 1);
    }
  }

  function handleSkip() {
    onDone();
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleSkip}
      // Android leaves the status bar / nav bar alone by default, which is
      // exactly the "black backdrop stops short at the top and bottom" gap -
      // these make the modal draw behind both instead. No-op on iOS
      // (transparent Modals there already use overFullScreen and cover the
      // whole screen, notch and home indicator included).
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === "android"}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderWidth: 0 },
            cardShadow,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          <Pressable onPress={handleSkip} style={styles.skipButton} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip tour">
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </Pressable>

          <Animated.View style={isHeightControlled ? { height: heightAnim, width: "100%", overflow: "hidden" } : undefined}>
            <Animated.View style={{ opacity: contentFade, alignItems: "center" }}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={step.icon} size={32} color={colors.accent} />
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>
            </Animated.View>
          </Animated.View>

          {/* Off-screen clone of every step's content block, used only to
              measure natural height up front (see stepHeights above) -
              never visible or interactive. */}
          <View style={styles.measureStack} pointerEvents="none">
            {STEPS.map((s, i) => (
              <View key={i} onLayout={handleMeasure(i)} style={styles.measureItem}>
                <View style={styles.iconWrap} />
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === stepIndex ? colors.accent : colors.border },
                ]}
              />
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={handleNext}
            accessibilityRole="button"
          >
            <Text style={[styles.nextButtonText, { color: colors.accentOn }]}>{isLast ? "Get started" : "Next"}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // absoluteFill rather than flex: 1 - guarantees this covers the entire
  // native modal window edge to edge (with statusBarTranslucent +
  // navigationBarTranslucent above) regardless of any surrounding layout
  // context, rather than depending on flex resolving to the full screen.
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 24, alignItems: "center" },
  skipButton: { position: "absolute", top: 16, right: 16, padding: 4 },
  skipText: { fontSize: 13, fontWeight: "600" },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 20 },
  dots: { flexDirection: "row", gap: 6, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  nextButton: { width: "100%", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  nextButtonText: { fontWeight: "700", fontSize: 15 },
  // Positioned to match the visible block's width (card has padding: 24, so
  // this replicates it directly rather than relying on how RN resolves
  // padding vs. absolute positioning, which is inconsistent across
  // platforms) so text wraps identically to the real thing.
  measureStack: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
  measureItem: { paddingHorizontal: 24, alignItems: "center" },
});
