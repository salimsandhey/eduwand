import { RefObject, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ImageSourcePropType, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { CurrentUser } from "../../api/client";
import { ProfileItem, getMissingProfileItems } from "../../utils/profileCompletion";

// Skip animation (ms): the card collapses into a glowing orb, the orb arcs
// across to the avatar with a short comet tail, then bursts as it lands - the
// moment the real progress ring draws itself in (onSkip reveals it).
const COLLAPSE_MS = 280;
const ORB_START_DELAY_MS = 120;
const FLIGHT_MS = 600;
const BURST_MS = 340;
// Entrance (ms) - the Skip animation in reverse: an orb launches from the AI
// button (where the welcome cat just docked), arcs to the center growing as it
// goes, and blooms open into the card.
const ENTER_ORB_SIZE = 40;
const ENTER_FLIGHT_MS = 560;
const BLOOM_MS = 340;
// Main orb + two trailing ones: [delay after the main orb, size, peak opacity].
const ORB_TRAIL: [number, number, number][] = [
  [0, 1, 1],
  [55, 0.62, 0.38],
  [110, 0.4, 0.2],
];

const ITEM_COPY: Record<ProfileItem, { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }> = {
  photo: { icon: "camera-outline", title: "Add a photo or avatar", detail: "So students, parents and colleagues recognise you." },
  phone: { icon: "call-outline", title: "Add your phone number", detail: "So your school can reach you when it matters." },
};

interface CompleteProfileModalProps {
  visible: boolean;
  user: CurrentUser;
  imageSource: ImageSourcePropType;
  imageFillsFrame: boolean;
  /**
   * Where the reminder lives after Skip (the home-screen avatar, which carries
   * the profile progress ring). On Skip the card turns into an orb that flies
   * into it, so the user sees exactly where the reminder went. Falls back to a
   * plain fade if it can't be measured.
   */
  skipTargetRef?: RefObject<View | null>;
  /**
   * A view pinned at the top-left of the host screen - the zero point that
   * skipTargetRef and enterFromPoint are measured against (see
   * toModalSpace()). Required for both orb animations; without it the popup
   * falls back to a plain pop-in / fade.
   */
  hostOriginRef?: RefObject<View | null>;
  /**
   * Where the entrance orb launches from, as a measureInWindow point in the
   * host's window (the AI button the welcome cat docks on). Null = plain pop-in.
   */
  enterFromPoint?: { x: number; y: number } | null;
  /** "Complete profile" - opens the Profile screen. */
  onComplete: () => void;
  /**
   * "Skip" - never show this prompt again. With the fly animation this fires
   * the instant the orb reaches the avatar (not after the burst), so the host
   * can start revealing the progress ring right on impact.
   */
  onSkip: () => void;
  /** Android back - hide for now only, it can come back next launch. */
  onLater: () => void;
}

type Rect = { x: number; y: number; width: number; height: number };

type OrbFlight = { startX: number; startY: number; dx: number; dy: number; size: number };

function measure(view: View | null): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

function makeOrbValues() {
  return { progressX: new Animated.Value(0), progressY: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) };
}

export function CompleteProfileModal({ visible, user, imageSource, imageFillsFrame, skipTargetRef, hostOriginRef, enterFromPoint, onComplete, onSkip, onLater }: CompleteProfileModalProps) {
  const { colors, cardShadow, pressedOpacity, mode } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [isRendered, setIsRendered] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const [flight, setFlight] = useState<OrbFlight | null>(null);
  const orbs = useRef(ORB_TRAIL.map(makeOrbValues)).current;
  const cardRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const isClosingRef = useRef(false);
  // Set on open; the card's first onLayout (only then can it be measured in
  // the modal's window) consumes it and starts the entrance.
  const pendingEnterRef = useRef(false);
  // Buttons stay inert until the card has fully opened - no mis-tap Skip mid-flight.
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Hidden from outside (not via a button) - just animate out.
      if (isRendered) animateAndClose(() => {});
      return;
    }
    isClosingRef.current = false;
    pendingEnterRef.current = true;
    setInteractive(false);
    setIsRendered(true);
    setFlight(null);
    backdrop.setValue(0);
    cardScale.setValue(0.3);
    cardOpacity.setValue(0);
    contentOpacity.setValue(0);
  }, [visible]);

  // Host-window rect -> this modal's layout space. The modal and the host
  // screen are different native windows whose measureInWindow values don't
  // share a zero point on Android (one may start below the status bar, the
  // other at the screen top), so each is taken relative to a view pinned at
  // the top-left of its OWN window - the modal root and the host's origin
  // marker - both of which sit at the screen's top-left.
  async function toModalSpace() {
    const [root, hostOrigin] = await Promise.all([measure(rootRef.current), measure(hostOriginRef?.current ?? null)]);
    if (!root || !hostOrigin) return null;
    return {
      fromModal: (r: Rect): Rect => ({ ...r, x: r.x - root.x, y: r.y - root.y }),
      fromHost: (r: Rect): Rect => ({ ...r, x: r.x - hostOrigin.x, y: r.y - hostOrigin.y }),
    };
  }

  function plainEnter() {
    cardScale.setValue(0.92);
    contentOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, tension: 280, friction: 24, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start(() => setInteractive(true));
  }

  async function enter() {
    const [space, rawCard] = await Promise.all([toModalSpace(), measure(cardRef.current)]);
    if (!space || !rawCard || !enterFromPoint) {
      plainEnter();
      return;
    }
    const card = space.fromModal(rawCard);
    const from = space.fromHost({ x: enterFromPoint.x, y: enterFromPoint.y, width: 0, height: 0 });
    const endX = card.x + card.width / 2;
    const endY = card.y + card.height / 2;
    setFlight({ startX: from.x, startY: from.y, dx: endX - from.x, dy: endY - from.y, size: ENTER_ORB_SIZE });
    orbs.forEach((orb) => {
      orb.progressX.setValue(0);
      orb.progressY.setValue(0);
      orb.scale.setValue(0.3);
      orb.opacity.setValue(0);
    });

    // 1. Launch + flight: the orb pops out of the AI button and arcs up to
    //    the center, growing as it goes; Y leads and X lags here - the mirror
    //    of Skip's curve - with the comet tail a beat behind.
    const flights = ORB_TRAIL.map(([lag, , peakOpacity], i) => {
      const orb = orbs[i];
      return Animated.parallel([
        Animated.timing(orb.opacity, { toValue: peakOpacity, delay: lag, duration: 140, useNativeDriver: true }),
        Animated.timing(orb.progressX, { toValue: 1, delay: lag, duration: ENTER_FLIGHT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(orb.progressY, { toValue: 1, delay: lag, duration: ENTER_FLIGHT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(orb.scale, { toValue: 1.8, delay: lag, duration: ENTER_FLIGHT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]);
    });
    Animated.timing(backdrop, { toValue: 1, duration: ENTER_FLIGHT_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    flights.slice(1).forEach((anim, i) =>
      anim.start(() => Animated.timing(orbs[i + 1].opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start())
    );

    flights[0].start(() => {
      // 2. Bloom: the orb swells and dissolves as the card springs open out
      //    of it, contents fading in a beat later.
      Animated.parallel([
        Animated.timing(orbs[0].scale, { toValue: 5, duration: BLOOM_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(orbs[0].opacity, { toValue: 0, duration: BLOOM_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, tension: 200, friction: 14, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, delay: 120, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setFlight(null);
        setInteractive(true);
      });
    });
  }

  function onCardLayout() {
    if (!pendingEnterRef.current) return;
    pendingEnterRef.current = false;
    enter();
  }

  function animateAndClose(callback: () => void) {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.94, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setIsRendered(false);
      callback();
    });
  }

  async function skip() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const [space, rawCard, rawTarget] = await Promise.all([toModalSpace(), measure(cardRef.current), measure(skipTargetRef?.current ?? null)]);
    if (!space || !rawCard || !rawTarget) {
      isClosingRef.current = false;
      animateAndClose(onSkip);
      return;
    }
    const card = space.fromModal(rawCard);
    const target = space.fromHost(rawTarget);
    if (target.y < 0 || target.y + target.height > windowHeight) {
      isClosingRef.current = false;
      animateAndClose(onSkip);
      return;
    }

    const size = Math.min(target.width, target.height);
    const startX = card.x + card.width / 2;
    const startY = card.y + card.height / 2;
    setFlight({ startX, startY, dx: target.x + target.width / 2 - startX, dy: target.y + target.height / 2 - startY, size });
    orbs.forEach((orb) => {
      orb.progressX.setValue(0);
      orb.progressY.setValue(0);
      orb.scale.setValue(2.4);
      orb.opacity.setValue(0);
    });

    // 1. Collapse: the card's content fades and the card sinks into itself
    //    while the orb swells up out of its center.
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.3, duration: COLLAPSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, delay: 100, duration: COLLAPSE_MS - 100, useNativeDriver: true }),
      Animated.timing(backdrop, { toValue: 0, duration: ORB_START_DELAY_MS + FLIGHT_MS * 0.7, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 2. Flight: X leads and Y lags (different easings), so the orb travels a
    //    curved arc rather than a straight line, shrinking to the avatar's size.
    //    The two trailing orbs follow a beat behind as a short comet tail.
    const flights = ORB_TRAIL.map(([lag, , peakOpacity], i) => {
      const orb = orbs[i];
      const delay = ORB_START_DELAY_MS + lag;
      return Animated.parallel([
        Animated.timing(orb.opacity, { toValue: peakOpacity, delay, duration: 160, useNativeDriver: true }),
        Animated.timing(orb.progressX, { toValue: 1, delay, duration: FLIGHT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(orb.progressY, { toValue: 1, delay, duration: FLIGHT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(orb.scale, { toValue: 1, delay, duration: FLIGHT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]);
    });

    // Trailing orbs simply dissolve into the avatar as they arrive.
    flights.slice(1).forEach((anim, i) =>
      anim.start(() => Animated.timing(orbs[i + 1].opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start())
    );

    flights[0].start(() => {
      // 3. Impact: a haptic tap as the orb lands (the avatar "catches" it and
      // the real progress ring starts drawing in via onSkip)...
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      onSkip();
      // ...while the orb bursts outward and dissolves over it.
      Animated.parallel([
        Animated.timing(orbs[0].scale, { toValue: 1.9, duration: BURST_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(orbs[0].opacity, { toValue: 0, duration: BURST_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setFlight(null);
        setIsRendered(false);
      });
    });
  }

  if (!isRendered) return null;

  const missing = getMissingProfileItems(user);
  const firstName = user.fullName.trim().split(/\s+/)[0] ?? "";

  return (
    <Modal
      visible={isRendered}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === "android"}
      onRequestClose={() => animateAndClose(onLater)}
    >
      <View ref={rootRef} collapsable={false} style={styles.container}>
        {/* No tap-to-dismiss on the backdrop - Skip is permanent, so it has to be a deliberate choice. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: backdrop, backgroundColor: mode === "dark" ? "rgba(0,0,0,0.65)" : "rgba(15,23,42,0.4)" }]}
        />

        <Animated.View
          ref={cardRef}
          collapsable={false}
          onLayout={onCardLayout}
          pointerEvents={interactive ? "auto" : "none"}
          style={[styles.card, { backgroundColor: colors.surface, opacity: cardOpacity, transform: [{ scale: cardScale }] }, cardShadow]}
          accessibilityViewIsModal
        >
          <Animated.View style={[styles.cardContent, { opacity: contentOpacity }]}>
            <View style={[styles.avatarFrame, { backgroundColor: colors.surfaceRaised }]}>
              <Image source={imageSource} style={imageFillsFrame ? styles.avatarFill : styles.avatarIcon} resizeMode={imageFillsFrame ? "cover" : "contain"} />
            </View>

            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {firstName ? `Complete your profile, ${firstName}` : "Complete your profile"}
            </Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              A complete profile helps the people you work with know who they're talking to. It only takes a minute.
            </Text>

            <View style={[styles.items, { borderColor: colors.border }]}>
              {missing.map((key, index) => (
                <View key={key} style={[styles.itemRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Ionicons name={ITEM_COPY[key].icon} size={18} color={colors.textMuted} />
                  <View style={styles.itemCopy}>
                    <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{ITEM_COPY[key].title}</Text>
                    <Text style={[styles.itemDetail, { color: colors.textMuted }]}>{ITEM_COPY[key].detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={() => animateAndClose(onComplete)}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Complete profile</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.skipButton, pressed && { opacity: pressedOpacity }]}
              onPress={skip}
              accessibilityRole="button"
              accessibilityHint="Your profile progress stays on your profile picture instead"
            >
              <Text style={[styles.skipButtonText, { color: colors.textMuted }]}>Skip</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {flight
          ? // Drawn back-to-front (tail first) so the main orb sits on top.
            ORB_TRAIL.map((_, i) => ORB_TRAIL.length - 1 - i).map((i) => (
              <Orb key={i} flight={flight} values={orbs[i]} sizeFactor={ORB_TRAIL[i][1]} glow={i === 0} color={colors.accent} />
            ))
          : null}
      </View>
    </Modal>
  );
}

// One orb of the Skip flight, laid out centered on the card's center and moved
// along the arc by its X/Y progress values. At scale 1 the main orb is exactly
// the avatar's size, centered on it.
function Orb({ flight, values, sizeFactor, glow, color }: { flight: OrbFlight; values: ReturnType<typeof makeOrbValues>; sizeFactor: number; glow: boolean; color: string }) {
  const size = flight.size * sizeFactor;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: flight.startX - size / 2,
        top: flight.startY - size / 2,
        width: size,
        height: size,
        opacity: values.opacity,
        transform: [
          { translateX: values.progressX.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dx] }) },
          { translateY: values.progressY.interpolate({ inputRange: [0, 1], outputRange: [0, flight.dy] }) },
          { scale: values.scale },
        ],
      }}
    >
      {glow ? (
        <View
          style={{
            position: "absolute",
            left: -size * 0.35,
            top: -size * 0.35,
            width: size * 1.7,
            height: size * 1.7,
            borderRadius: size * 0.85,
            backgroundColor: color,
            opacity: 0.22,
          }}
        />
      ) : null}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 22, elevation: 12 },
  cardContent: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 12, alignItems: "center" },
  avatarFrame: { width: 72, height: 72, borderRadius: 36, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarFill: { width: "100%", height: "100%" },
  avatarIcon: { width: 44, height: 44 },
  title: { marginTop: 16, fontSize: 18, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
  message: { marginTop: 6, fontSize: 13, lineHeight: 19, textAlign: "center" },
  items: { alignSelf: "stretch", marginTop: 18, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  itemCopy: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: "700" },
  itemDetail: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  primaryButton: { alignSelf: "stretch", height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 20 },
  primaryButtonText: { fontSize: 14, fontWeight: "800" },
  skipButton: { alignSelf: "stretch", height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  skipButtonText: { fontSize: 13, fontWeight: "700" },
});
