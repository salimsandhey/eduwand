import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { decorativeAssets } from "../theme/decorativeAssets";

// Native pixel size of assets/decorative/decor-teacher-lesson-cat.png - used
// below to work out where resizeMode="contain" actually places the image
// inside its box, so the eyelid patches land exactly on the cat's eyes.
const SOURCE_WIDTH = 1024;
const SOURCE_HEIGHT = 923;

// Eye positions/sizes as a fraction of the rendered artwork (not the outer
// box), plus each eye's own tilt, rest pupil center offset, and highlight
// geometry. Measured directly off the source artwork:
const EYES = [
  {
    name: "left",
    cx: 0.2417,
    cy: 0.6603,
    w: 0.1768 * 1.08,
    h: 0.1528 * 1.12,
    angleDeg: -23.02, // larger, lower-left eye
    localXFrac: 0.12076,
    localYFrac: -0.01185,
    pupilDiameterFrac: 0.519,
    hlOffsetDxFrac: -0.407,
    hlOffsetDyFrac: -0.005,
    hlDiameterFrac: 0.195,
  },
  {
    name: "right",
    cx: 0.4575,
    cy: 0.5618,
    w: 0.165 * 1.08,
    h: 0.1484 * 1.12,
    angleDeg: -22.39, // smaller, upper-right eye
    localXFrac: 0.03072,
    localYFrac: -0.03529,
    pupilDiameterFrac: 0.506,
    hlOffsetDxFrac: -0.370,
    hlOffsetDyFrac: 0.013,
    hlDiameterFrac: 0.235,
  },
];

// Sampled directly from the fur pixels surrounding both eyes, so a closed
// "lid" reads as part of the cat rather than a patch stuck on top of it.
const FUR_COLOR = "#7A014E";
const PUPIL_COLOR = "#000000";
const HIGHLIGHT_COLOR = "#FFFFFF";

interface BlinkingMascotProps {
  style: StyleProp<ViewStyle>;
  /** Optional delay before waking up in ms (defaults to 3800ms to align ~500ms after splash screen ends). */
  wakeUpDelayMs?: number;
}

export function BlinkingMascot({ style, wakeUpDelayMs = 3800 }: BlinkingMascotProps) {
  const { width, height } = StyleSheet.flatten(style) as { width: number; height: number };

  const sourceAspect = SOURCE_WIDTH / SOURCE_HEIGHT;
  const containerAspect = width / height;
  const renderedWidth = containerAspect > sourceAspect ? height * sourceAspect : width;
  const renderedHeight = containerAspect > sourceAspect ? height : width / sourceAspect;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  // 1 = closed / sleeping by default, 0 = open
  const blink = useRef(new Animated.Value(1)).current;
  const gaze = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current; // -1 to +1 range (X & Y gaze)

  // Wake-up and periodic blinking animation
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const closeThenOpen = (onDone: () => void) => {
      Animated.sequence([
        // A real blink shuts quickly...
        Animated.timing(blink, {
          toValue: 1,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(30),
        // ...and opens back up a little more gently.
        Animated.timing(blink, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!cancelled) onDone();
      });
    };

    const scheduleNextPeriodicBlink = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        // Real blinks are often a quick double-blink - mix that in sometimes.
        closeThenOpen(() => (Math.random() < 0.3 ? closeThenOpen(scheduleNextPeriodicBlink) : scheduleNextPeriodicBlink()));
      }, 2600 + Math.random() * 2200);
    };

    // Wake-up sequence: realistic lazy cat waking up from a nap
    const wakeUp = () => {
      if (cancelled) return;

      Animated.sequence([
        // Step 1: Lazy, drowsy peek — eyelids sluggishly crack half-open (heavy sleepy eyes)
        Animated.timing(blink, {
          toValue: 0.52,
          duration: 480,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Step 2: Drowsy pause — cat is still half-asleep
        Animated.delay(360),

        // Step 3: Too lazy! Eyelids slowly droop almost completely back shut
        Animated.timing(blink, {
          toValue: 0.92,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(220),

        // Step 4: Making the effort to wake up — eyelids open wider
        Animated.timing(blink, {
          toValue: 0.25,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(50),

        // Step 5: Fast wake-up flutter blink 1 (shaking off sleep)
        Animated.timing(blink, {
          toValue: 1,
          duration: 80,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(25),
        Animated.timing(blink, {
          toValue: 0.1,
          duration: 85,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(40),

        // Step 6: Fast wake-up flutter blink 2
        Animated.timing(blink, {
          toValue: 1,
          duration: 70,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(20),

        // Step 7: Open fully, bright, wide and alert!
        Animated.timing(blink, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.back(1.1)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (cancelled) return;
        scheduleNextPeriodicBlink();
      });
    };

    // Start closed by default (sleeping) and wake up ~0.5s after splash screen ends
    timer = setTimeout(wakeUp, wakeUpDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blink, wakeUpDelayMs]);

  // Eye gaze/movement animation loop (starts after waking up)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Initial drowsy gaze during half-open peek -> smoothly transitions to active glancing
    const gazeSequence: { x: number; y: number; pauseMs: number; duration: number }[] = [
      { x: 0, y: 0, pauseMs: 1400, duration: 150 }, // Forward / center
      { x: 1.0, y: -0.85, pauseMs: 1600, duration: 180 }, // Look far up-right at the star wand
      { x: 0.8, y: 0, pauseMs: 1200, duration: 140 }, // Glance far right
      { x: 0, y: 0, pauseMs: 1300, duration: 130 }, // Return to center
      { x: -0.95, y: 0.25, pauseMs: 1500, duration: 170 }, // Glance far left toward inputs
      { x: -0.6, y: 0.75, pauseMs: 1100, duration: 150 }, // Glance down-left (thoughtful)
      { x: 0, y: 0, pauseMs: 1500, duration: 140 }, // Return to center
      { x: 0, y: 0.95, pauseMs: 1200, duration: 160 }, // Glance far down
      { x: 0.85, y: -0.45, pauseMs: 1300, duration: 160 }, // Glance upper-right
      { x: 0, y: 0, pauseMs: 1600, duration: 130 }, // Return to center
    ];

    let step = 0;

    const moveToNextGaze = () => {
      if (cancelled) return;
      const target = gazeSequence[step];
      step = (step + 1) % gazeSequence.length;

      const jitterX = (Math.random() - 0.5) * 0.06;
      const jitterY = (Math.random() - 0.5) * 0.06;
      const targetX = Math.max(-1, Math.min(1, target.x + (target.x === 0 ? 0 : jitterX)));
      const targetY = Math.max(-1, Math.min(1, target.y + (target.y === 0 ? 0 : jitterY)));

      Animated.timing(gaze, {
        toValue: { x: targetX, y: targetY },
        duration: target.duration + Math.random() * 30,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        timer = setTimeout(moveToNextGaze, target.pauseMs + Math.random() * 400);
      });
    };

    // First lazy gaze drift during the initial half-peek
    Animated.sequence([
      Animated.delay(wakeUpDelayMs + 100),
      Animated.timing(gaze, {
        toValue: { x: -0.25, y: 0.4 }, // lazy drowsy drift down-left
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(500),
      Animated.timing(gaze, {
        toValue: { x: 0, y: 0 },
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Start looking around actively once fully awake
    timer = setTimeout(moveToNextGaze, wakeUpDelayMs + 2100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gaze, wakeUpDelayMs]);

  return (
    <View style={[{ width, height }, styles.wrapper]}>
      {/* Layer 1: Base mascot image with pure white scleras */}
      <Image source={decorativeAssets.teacherLessonCatEyesWhite} resizeMode="contain" style={{ width, height }} />

      {/* Layer 2: Moving pupils (underneath the eyelid border frame) */}
      {EYES.map((eye, index) => {
        const eyeWidth = eye.w * renderedWidth;
        const eyeHeight = eye.h * renderedHeight;
        const left = offsetX + eye.cx * renderedWidth - eyeWidth / 2;
        const top = offsetY + eye.cy * renderedHeight - eyeHeight / 2;

        // Exactly 1px bigger pupil size as requested
        const pupilSize = Math.round(eye.pupilDiameterFrac * eyeHeight) + 1;
        const hlSize = pupilSize * eye.hlDiameterFrac;
        const defaultPupilX = (eyeWidth - pupilSize) / 2 + eye.localXFrac * eyeWidth;
        const defaultPupilY = (eyeHeight - pupilSize) / 2 + eye.localYFrac * eyeHeight;

        const hlLeft = pupilSize * 0.5 + eye.hlOffsetDxFrac * pupilSize - hlSize / 2;
        const hlTop = pupilSize * 0.5 + eye.hlOffsetDyFrac * pupilSize - hlSize / 2;

        // Increased movement distance
        const maxShiftX = eyeWidth * 0.22;
        const maxShiftY = eyeHeight * 0.16;

        const translateX = gaze.x.interpolate({
          inputRange: [-1, 1],
          outputRange: [-maxShiftX, maxShiftX],
        });
        const translateY = gaze.y.interpolate({
          inputRange: [-1, 1],
          outputRange: [-maxShiftY, maxShiftY],
        });

        return (
          <View
            key={`pupil-${index}`}
            pointerEvents="none"
            style={[
              styles.eyeContainer,
              {
                left,
                top,
                width: eyeWidth,
                height: eyeHeight,
                borderTopLeftRadius: eyeHeight * 0.2,
                borderTopRightRadius: eyeHeight * 0.2,
                borderBottomLeftRadius: eyeHeight / 2,
                borderBottomRightRadius: eyeHeight / 2,
                transform: [{ rotate: `${eye.angleDeg}deg` }],
              },
            ]}
          >
            {/* Animated Black Pupil & White Highlight */}
            <Animated.View
              style={[
                styles.pupil,
                {
                  left: defaultPupilX,
                  top: defaultPupilY,
                  width: pupilSize,
                  height: pupilSize,
                  borderRadius: pupilSize / 2,
                  transform: [{ translateX }, { translateY }],
                },
              ]}
            >
              <View
                style={[
                  styles.highlight,
                  {
                    left: hlLeft,
                    top: hlTop,
                    width: hlSize,
                    height: hlSize,
                    borderRadius: hlSize / 2,
                  },
                ]}
              />
            </Animated.View>
          </View>
        );
      })}

      {/* Layer 3: Top Frame with intact dark upper eyelid stroke & fur overlay (strictly in front of pupils) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frameOverlay, { width, height }]}>
        <Image source={decorativeAssets.teacherLessonCatFrame} resizeMode="contain" style={{ width, height }} />
      </View>

      {/* Layer 4: Blinking Eyelids (drops down over eye, generous coverage ensuring black pupil is 100% behind the lid) */}
      {EYES.map((eye, index) => {
        const lidWidth = eye.w * renderedWidth * 1.14;
        const lidHeight = eye.h * renderedHeight * 1.18;
        const lidLeft = offsetX + eye.cx * renderedWidth - lidWidth / 2;
        const lidTop = offsetY + eye.cy * renderedHeight - lidHeight / 2;

        return (
          <Animated.View
            key={`lid-${index}`}
            pointerEvents="none"
            style={[
              styles.lid,
              {
                left: lidLeft,
                top: lidTop,
                width: lidWidth,
                height: lidHeight,
                borderTopLeftRadius: lidHeight * 0.2,
                borderTopRightRadius: lidHeight * 0.2,
                borderBottomLeftRadius: lidHeight / 2,
                borderBottomRightRadius: lidHeight / 2,
                transform: [
                  { rotate: `${eye.angleDeg}deg` },
                  {
                    translateY: blink.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-lidHeight / 2, 0],
                    }),
                  },
                  { scaleY: blink },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  eyeContainer: {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    zIndex: 2,
    elevation: 2,
  },
  pupil: {
    position: "absolute",
    backgroundColor: PUPIL_COLOR,
  },
  highlight: {
    position: "absolute",
    backgroundColor: HIGHLIGHT_COLOR,
  },
  frameOverlay: {
    zIndex: 10,
    elevation: 10,
  },
  lid: {
    position: "absolute",
    backgroundColor: FUR_COLOR,
    zIndex: 20,
    elevation: 20,
  },
});
