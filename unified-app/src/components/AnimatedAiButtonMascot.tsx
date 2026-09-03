import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { decorativeAssets } from "../theme/decorativeAssets";

// Native dimensions of assets/decorative/AI-button-icon-new.png (1254 x 1254)
const SOURCE_WIDTH = 1254;
const SOURCE_HEIGHT = 1254;

const EYES = [
  {
    name: "left",
    cx: 401.4 / SOURCE_WIDTH,   // 0.3201
    cy: 843.7 / SOURCE_HEIGHT,  // 0.6728
    w: 219.0 / SOURCE_WIDTH,    // 0.1746
    h: 264.0 / SOURCE_HEIGHT,   // 0.2105 (starts at y=692)
    angleDeg: -12.5,
    pupilRFrac: 74 / 264,
    pupilRestingDxFrac: 23.6 / 264,
    pupilRestingDyFrac: -8.0 / 264,
    hl1RFrac: 20.5 / 264,
    hl1OffsetDxFrac: -23.5 / 264,
    hl1OffsetDyFrac: -23.5 / 264,
    hl2RFrac: 9.8 / 264,
    hl2OffsetDxFrac: 26.0 / 264,
    hl2OffsetDyFrac: 20.5 / 264,
  },
  {
    name: "right",
    cx: 719.5 / SOURCE_WIDTH,   // 0.5738
    cy: 703.3 / SOURCE_HEIGHT,  // 0.5608
    w: 235.0 / SOURCE_WIDTH,    // 0.1874
    h: 236.0 / SOURCE_HEIGHT,   // 0.1882 (starts at y=570)
    angleDeg: -14.0,
    pupilRFrac: 78 / 236,
    pupilRestingDxFrac: -0.5 / 236,
    pupilRestingDyFrac: 2.6 / 236,
    hl1RFrac: 20.5 / 236,
    hl1OffsetDxFrac: -23.5 / 236,
    hl1OffsetDyFrac: -23.5 / 236,
    hl2RFrac: 9.8 / 236,
    hl2OffsetDxFrac: 26.0 / 236,
    hl2OffsetDyFrac: 20.5 / 236,
  },
];

const FUR_COLOR = "#A9006F";
const PUPIL_COLOR = "#0A0A0A";
const HIGHLIGHT_COLOR = "#FFFFFF";

interface AnimatedAiButtonMascotProps {
  style?: StyleProp<ViewStyle>;
}

export function AnimatedAiButtonMascot({ style }: AnimatedAiButtonMascotProps) {
  const flattened = StyleSheet.flatten(style) || {};
  const width = (flattened.width as number) || 64;
  const height = (flattened.height as number) || 64;

  const sourceAspect = SOURCE_WIDTH / SOURCE_HEIGHT;
  const containerAspect = width / height;
  const renderedWidth = containerAspect > sourceAspect ? height * sourceAspect : width;
  const renderedHeight = containerAspect > sourceAspect ? height : width / sourceAspect;
  const offsetX = (width - renderedWidth) / 2;
  const offsetY = (height - renderedHeight) / 2;

  const blink = useRef(new Animated.Value(0)).current; // 0 = open, 1 = closed
  const gaze = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current; // -1 to +1 range

  // Blinking loop (drops eyelid smoothly down over eye)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const closeThenOpen = (onDone: () => void) => {
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 1,
          duration: 110,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(30),
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

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        closeThenOpen(() => (Math.random() < 0.3 ? closeThenOpen(scheduleNext) : scheduleNext()));
      }, 2500 + Math.random() * 2200);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blink]);

  // Eye gaze/movement animation loop
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const gazeSequence: { x: number; y: number; pauseMs: number; duration: number }[] = [
      { x: 0, y: 0, pauseMs: 1500, duration: 150 }, // Resting Center
      { x: 0.85, y: -0.85, pauseMs: 1700, duration: 180 }, // Look up-right at glowing star wand!
      { x: 0.5, y: 0, pauseMs: 1200, duration: 140 }, // Glance right
      { x: 0, y: 0, pauseMs: 1400, duration: 130 }, // Center
      { x: -0.75, y: 0.2, pauseMs: 1500, duration: 170 }, // Glance left
      { x: -0.4, y: 0.6, pauseMs: 1100, duration: 150 }, // Glance down-left
      { x: 0, y: 0, pauseMs: 1500, duration: 140 }, // Center
      { x: 0, y: 0.7, pauseMs: 1200, duration: 160 }, // Glance down
      { x: 0.65, y: -0.4, pauseMs: 1300, duration: 160 }, // Glance upper-right
      { x: 0, y: 0, pauseMs: 1600, duration: 130 }, // Center
    ];

    let step = 0;

    const moveToNextGaze = () => {
      if (cancelled) return;
      const target = gazeSequence[step];
      step = (step + 1) % gazeSequence.length;

      const jitterX = (Math.random() - 0.5) * 0.05;
      const jitterY = (Math.random() - 0.5) * 0.05;
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

    timer = setTimeout(moveToNextGaze, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gaze]);

  return (
    <View style={[{ width, height }, styles.wrapper]}>
      {/* Layer 1: Base image with pure white scleras */}
      <Image
        source={decorativeAssets.aiButtonIconEyesWhite}
        resizeMode="contain"
        style={{ width, height }}
      />

      {/* Layer 2: Moving pupils & Blinking Eyelid inside rotated Eye Container */}
      {EYES.map((eye, index) => {
        const eyeWidth = eye.w * renderedWidth;
        const eyeHeight = eye.h * renderedHeight;
        const left = offsetX + eye.cx * renderedWidth - eyeWidth / 2;
        const top = offsetY + eye.cy * renderedHeight - eyeHeight / 2;

        const pupilDiameter = eye.pupilRFrac * 2 * eyeHeight;
        const restingX = eyeWidth / 2 + eye.pupilRestingDxFrac * eyeHeight - pupilDiameter / 2;
        const restingY = eyeHeight / 2 + eye.pupilRestingDyFrac * eyeHeight - pupilDiameter / 2;

        const hl1Size = eye.hl1RFrac * 2 * eyeHeight;
        const hl1Left = pupilDiameter / 2 + eye.hl1OffsetDxFrac * eyeHeight - hl1Size / 2;
        const hl1Top = pupilDiameter / 2 + eye.hl1OffsetDyFrac * eyeHeight - hl1Size / 2;

        const hl2Size = eye.hl2RFrac * 2 * eyeHeight;
        const hl2Left = pupilDiameter / 2 + eye.hl2OffsetDxFrac * eyeHeight - hl2Size / 2;
        const hl2Top = pupilDiameter / 2 + eye.hl2OffsetDyFrac * eyeHeight - hl2Size / 2;

        const maxShiftX = eyeWidth * 0.16;
        const maxShiftY = eyeHeight * 0.14;

        const translateX = gaze.x.interpolate({
          inputRange: [-1, 1],
          outputRange: [-maxShiftX, maxShiftX],
        });
        const translateY = gaze.y.interpolate({
          inputRange: [-1, 1],
          outputRange: [-maxShiftY, maxShiftY],
        });

        const lidTranslateY = blink.interpolate({
          inputRange: [0, 1],
          outputRange: [-eyeHeight, 0],
        });

        return (
          <View
            key={`eye-${index}`}
            pointerEvents="none"
            style={[
              styles.eyeContainer,
              {
                left,
                top,
                width: eyeWidth,
                height: eyeHeight,
                borderRadius: Math.min(eyeWidth, eyeHeight) * 0.5,
                transform: [{ rotate: `${eye.angleDeg}deg` }],
              },
            ]}
          >
            {/* Animated Black Pupil & Dual Highlights */}
            <Animated.View
              style={[
                styles.pupil,
                {
                  left: restingX,
                  top: restingY,
                  width: pupilDiameter,
                  height: pupilDiameter,
                  borderRadius: pupilDiameter / 2,
                  transform: [{ translateX }, { translateY }],
                },
              ]}
            >
              {/* Primary large highlight */}
              <View
                style={[
                  styles.highlight,
                  {
                    left: hl1Left,
                    top: hl1Top,
                    width: hl1Size,
                    height: hl1Size,
                    borderRadius: hl1Size / 2,
                  },
                ]}
              />
              {/* Secondary small highlight */}
              <View
                style={[
                  styles.highlight,
                  {
                    left: hl2Left,
                    top: hl2Top,
                    width: hl2Size,
                    height: hl2Size,
                    borderRadius: hl2Size / 2,
                  },
                ]}
              />
            </Animated.View>

            {/* Blinking Eyelid Cover (drops down inside the eye contour) */}
            <Animated.View
              style={[
                styles.lid,
                {
                  width: eyeWidth,
                  height: eyeHeight,
                  borderRadius: Math.min(eyeWidth, eyeHeight) * 0.5,
                  transform: [{ translateY: lidTranslateY }],
                },
              ]}
            />
          </View>
        );
      })}

      {/* Layer 3: Top Frame with intact dark upper eyelid stroke & fur */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frameOverlay, { width, height }]}>
        <Image
          source={decorativeAssets.aiButtonIconFrame}
          resizeMode="contain"
          style={{ width, height }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
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
    zIndex: 1,
  },
  highlight: {
    position: "absolute",
    backgroundColor: HIGHLIGHT_COLOR,
  },
  lid: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: FUR_COLOR,
    zIndex: 5,
  },
  frameOverlay: {
    zIndex: 10,
    elevation: 10,
  },
});
