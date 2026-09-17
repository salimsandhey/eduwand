import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { decorativeAssets } from "../theme/decorativeAssets";
import { useWelcomeMascot } from "../context/WelcomeMascotContext";
import { useTheme } from "../theme/ThemeContext";

const MASCOT_CENTER_SIZE = 190;

const GREETINGS = [
  "Hi! I'm your AI Assistant,\nhere to help you",
  "You can ask me anything\nabout Eduwand",
];

interface RubOutParticle {
  id: number;
  xPct: number;
  yOffset: number;
  size: number;
  color: string;
  isDot: boolean;
  startFrac: number;
  durationFrac: number;
  driftX: number;
  floatDistance: number;
}

const RUB_OUT_PARTICLES: RubOutParticle[] = [
  // Left wave (0% - 25% of text)
  { id: 1, xPct: 8, yOffset: -16, size: 12, color: "#FFD700", isDot: false, startFrac: 0.00, durationFrac: 0.38, driftX: -6, floatDistance: 26 },
  { id: 2, xPct: 14, yOffset: 16, size: 7, color: "#FDE047", isDot: true, startFrac: 0.04, durationFrac: 0.35, driftX: 4, floatDistance: 22 },
  { id: 3, xPct: 20, yOffset: -20, size: 13, color: "#E879F9", isDot: false, startFrac: 0.08, durationFrac: 0.40, driftX: -4, floatDistance: 30 },
  { id: 4, xPct: 26, yOffset: 12, size: 8, color: "#FFDF00", isDot: true, startFrac: 0.12, durationFrac: 0.36, driftX: 6, floatDistance: 24 },

  // Mid-left wave (25% - 50% of text)
  { id: 5, xPct: 33, yOffset: -18, size: 14, color: "#FFDF00", isDot: false, startFrac: 0.16, durationFrac: 0.40, driftX: -5, floatDistance: 28 },
  { id: 6, xPct: 39, yOffset: 18, size: 7, color: "#C084FC", isDot: true, startFrac: 0.20, durationFrac: 0.35, driftX: 3, floatDistance: 22 },
  { id: 7, xPct: 45, yOffset: -14, size: 12, color: "#38BDF8", isDot: false, startFrac: 0.24, durationFrac: 0.38, driftX: -3, floatDistance: 26 },
  { id: 8, xPct: 50, yOffset: 14, size: 8, color: "#FDE047", isDot: true, startFrac: 0.28, durationFrac: 0.36, driftX: 5, floatDistance: 24 },

  // Mid-right wave (50% - 75% of text)
  { id: 9, xPct: 57, yOffset: -20, size: 13, color: "#FFDF00", isDot: false, startFrac: 0.32, durationFrac: 0.40, driftX: -4, floatDistance: 30 },
  { id: 10, xPct: 63, yOffset: 16, size: 8, color: "#E879F9", isDot: true, startFrac: 0.36, durationFrac: 0.35, driftX: 4, floatDistance: 22 },
  { id: 11, xPct: 69, yOffset: -12, size: 14, color: "#FDE047", isDot: false, startFrac: 0.40, durationFrac: 0.38, driftX: -6, floatDistance: 28 },
  { id: 12, xPct: 75, yOffset: 15, size: 7, color: "#38BDF8", isDot: true, startFrac: 0.44, durationFrac: 0.36, driftX: 5, floatDistance: 24 },

  // Right wave (75% - 95% of text)
  { id: 13, xPct: 81, yOffset: -18, size: 13, color: "#FFDF00", isDot: false, startFrac: 0.48, durationFrac: 0.40, driftX: -3, floatDistance: 28 },
  { id: 14, xPct: 86, yOffset: 18, size: 8, color: "#C084FC", isDot: true, startFrac: 0.52, durationFrac: 0.35, driftX: 3, floatDistance: 22 },
  { id: 15, xPct: 91, yOffset: -10, size: 12, color: "#FDE047", isDot: false, startFrac: 0.55, durationFrac: 0.38, driftX: -3, floatDistance: 26 },
  { id: 16, xPct: 95, yOffset: 10, size: 7, color: "#FFDF00", isDot: true, startFrac: 0.58, durationFrac: 0.36, driftX: 4, floatDistance: 24 },
];

interface AmbientSparkle {
  id: number;
  topPct: number;
  leftPct: number;
  size: number;
  color: string;
  isDot: boolean;
  driftRange: number;
}

const AMBIENT_SPARKLES: AmbientSparkle[] = [
  { id: 1, topPct: 14, leftPct: 14, size: 16, color: "#FBBF24", isDot: false, driftRange: -10 },
  { id: 2, topPct: 16, leftPct: 84, size: 14, color: "#C084FC", isDot: false, driftRange: -8 },
  { id: 3, topPct: 36, leftPct: 8, size: 6, color: "#FDE047", isDot: true, driftRange: -12 },
  { id: 4, topPct: 34, leftPct: 90, size: 15, color: "#38BDF8", isDot: false, driftRange: -9 },
  { id: 5, topPct: 64, leftPct: 7, size: 7, color: "#FBBF24", isDot: true, driftRange: -11 },
  { id: 6, topPct: 62, leftPct: 92, size: 13, color: "#E879F9", isDot: false, driftRange: -8 },
  { id: 7, topPct: 80, leftPct: 14, size: 14, color: "#E879F9", isDot: false, driftRange: -10 },
  { id: 8, topPct: 82, leftPct: 84, size: 7, color: "#FBBF24", isDot: true, driftRange: -8 },
];

const WAND_SPARKLES = [
  { id: 1, top: 12, left: 118, size: 12, color: "#FFD700", isDot: false },
  { id: 2, top: 26, left: 106, size: 6, color: "#FDE047", isDot: true },
  { id: 3, top: 46, left: 124, size: 10, color: "#E879F9", isDot: false },
  { id: 4, top: 66, left: 138, size: 5, color: "#38BDF8", isDot: true },
];

export function MascotWelcomeOverlay() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isWelcomeActive, startFlight, welcomeCount } = useWelcomeMascot();
  const { mode } = useTheme();

  // Full-screen canvas fade opacity
  const screenBgOpacity = useRef(new Animated.Value(1)).current;

  // Mascot scale & opacity
  const mascotScale = useRef(new Animated.Value(0.3)).current;
  const mascotOpacity = useRef(new Animated.Value(0)).current;

  // Dialogue island entrance scale & opacity
  const islandScale = useRef(new Animated.Value(0.88)).current;
  const islandOpacity = useRef(new Animated.Value(0)).current;

  // Celestial 3D orbital rune rotation
  const orbitRotation = useRef(new Animated.Value(0)).current;

  // Ambient sparkles slow breathing & drifting
  const ambientPulse = useRef(new Animated.Value(0)).current;
  const ambientFloat = useRef(new Animated.Value(0)).current;

  // Sparkle Rub-Out animation value (sweeping wave from 0 to 1)
  const rubOutProgress = useRef(new Animated.Value(0)).current;

  // Typewriter state
  const [displayedText, setDisplayedText] = useState("");
  const [isRubbingOut, setIsRubbingOut] = useState(false);
  const [isCaretVisible, setIsCaretVisible] = useState(true);

  // Center starting position of mascot on the full screen (shifted down)
  const centerScreenX = windowWidth / 2;
  const centerScreenY = windowHeight / 2 + 15;

  const isSkippedRef = useRef(false);

  // Transition to flight behind the actual navbar
  const handleFinishToFlight = useCallback(() => {
    if (isSkippedRef.current) return;
    isSkippedRef.current = true;

    Animated.parallel([
      Animated.timing(screenBgOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(islandOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      startFlight();
    });
  }, [screenBgOpacity, islandOpacity, startFlight]);

  // Orbit rotation continuous 12s loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(orbitRotation, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [orbitRotation]);

  // Ambient sparkles breathing & floating loops
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientPulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ambientPulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ambientFloat, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ambientFloat, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    floatLoop.start();

    return () => {
      pulseLoop.stop();
      floatLoop.stop();
    };
  }, [ambientPulse, ambientFloat]);

  // Blinking caret toggle (500ms cycle)
  useEffect(() => {
    const interval = setInterval(() => {
      setIsCaretVisible((prev) => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Mascot entrance spring & typewriter cycle
  useEffect(() => {
    if (!isWelcomeActive) return;

    mascotScale.setValue(0.3);
    mascotOpacity.setValue(0);
    islandScale.setValue(0.88);
    islandOpacity.setValue(0);
    screenBgOpacity.setValue(1);
    rubOutProgress.setValue(0);
    setDisplayedText("");
    setIsRubbingOut(false);
    isSkippedRef.current = false;

    // Mascot & Dialogue Island spring into view
    Animated.parallel([
      Animated.timing(mascotOpacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(mascotScale, {
        toValue: 1,
        damping: 10,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(islandOpacity, {
        toValue: 1,
        duration: 380,
        delay: 140,
        useNativeDriver: true,
      }),
      Animated.spring(islandScale, {
        toValue: 1,
        damping: 12,
        stiffness: 160,
        delay: 140,
        useNativeDriver: true,
      }),
    ]).start();

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const typeGreeting = (greetingIndex: number) => {
      if (isCancelled || isSkippedRef.current) return;
      if (greetingIndex >= GREETINGS.length) {
        timer = setTimeout(() => {
          if (!isCancelled) handleFinishToFlight();
        }, 150);
        return;
      }

      const fullText = GREETINGS[greetingIndex];
      let charIdx = 0;
      setDisplayedText("");
      setIsRubbingOut(false);
      rubOutProgress.setValue(0);

      const typeNextChar = () => {
        if (isCancelled || isSkippedRef.current) return;
        charIdx++;
        setDisplayedText(fullText.slice(0, charIdx));

        if (charIdx < fullText.length) {
          timer = setTimeout(typeNextChar, 38);
        } else {
          // Finished typing: pause comfortably for reading
          timer = setTimeout(() => {
            triggerSparkleRubOut();
          }, greetingIndex === 0 ? 1100 : 1300);
        }
      };

      const triggerSparkleRubOut = () => {
        if (isCancelled || isSkippedRef.current) return;
        setIsRubbingOut(true);
        rubOutProgress.setValue(0);

        // Silky 720ms stardust wave sweep
        Animated.timing(rubOutProgress, {
          toValue: 1,
          duration: 720,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished || isCancelled || isSkippedRef.current) return;
          setDisplayedText("");
          setIsRubbingOut(false);

          // Peaceful breath before next greeting
          timer = setTimeout(() => {
            typeGreeting(greetingIndex + 1);
          }, 240);
        });
      };

      typeNextChar();
    };

    // Begin typing 380ms after entrance
    timer = setTimeout(() => {
      typeGreeting(0);
    }, 380);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isWelcomeActive, welcomeCount, handleFinishToFlight]);

  if (!isWelcomeActive) {
    return null;
  }

  const isDarkMode = mode === "dark";
  const screenBgColor = isDarkMode ? "#090514" : "#FAFAFE";
  const primaryTextColor = isDarkMode ? "#FFFFFF" : "#0F0728";

  const islandBgColor = isDarkMode ? "rgba(23, 14, 40, 0.85)" : "#FFFFFF";
  const islandBorderColor = isDarkMode
    ? "rgba(255, 255, 255, 0.14)"
    : "rgba(194, 0, 125, 0.14)";
  const accentColor = isDarkMode ? "#F472B6" : "#C2007D";

  // Ethereal text dissolve during rub-out
  const textOpacity = rubOutProgress.interpolate({
    inputRange: [0, 0.15, 0.65, 1],
    outputRange: [1, 0.85, 0.08, 0],
    extrapolate: "clamp",
  });
  const textScale = rubOutProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 1.02, 0.96],
    extrapolate: "clamp",
  });
  const textY = rubOutProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
    extrapolate: "clamp",
  });

  const orbitSpin = orbitRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });



  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Pristine Full-Screen Canvas */}
      <Animated.View
        style={[
          styles.screenBackground,
          {
            backgroundColor: screenBgColor,
            opacity: screenBgOpacity,
          },
        ]}
      />

      {/* Theatrical Soft Studio Fill Light */}
      <Animated.View
        style={[
          styles.stageBackdropGlow,
          {
            left: centerScreenX - 180,
            top: centerScreenY - 140,
            backgroundColor: isDarkMode
              ? "rgba(168, 85, 247, 0.08)"
              : "rgba(194, 0, 125, 0.035)",
            opacity: screenBgOpacity,
          },
        ]}
        pointerEvents="none"
      />



      {/* Ambient Stardust Constellation with Vertical Float & Pulse */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: screenBgOpacity,
          },
        ]}
        pointerEvents="none"
      >
        {AMBIENT_SPARKLES.map((sp) => {
          const spOpacity = ambientPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.24, 0.68],
          });
          const spScale = ambientPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.86, 1.14],
          });
          const spTranslateY = ambientFloat.interpolate({
            inputRange: [0, 1],
            outputRange: [0, sp.driftRange],
          });

          return (
            <Animated.View
              key={sp.id}
              style={[
                styles.ambientSparkle,
                {
                  top: `${sp.topPct}%` as any,
                  left: `${sp.leftPct}%` as any,
                  opacity: spOpacity,
                  transform: [
                    { translateY: spTranslateY },
                    { scale: spScale },
                  ],
                },
              ]}
            >
              {sp.isDot ? (
                <View
                  style={[
                    styles.ambientDot,
                    {
                      width: sp.size,
                      height: sp.size,
                      borderRadius: sp.size / 2,
                      backgroundColor: sp.color,
                      shadowColor: sp.color,
                    },
                  ]}
                />
              ) : (
                <Ionicons name="sparkles" size={sp.size} color={sp.color} />
              )}
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* Grounding Shadow Pedestal */}
      <Animated.View
        style={[
          styles.groundShadow,
          {
            left: centerScreenX - 65,
            top: centerScreenY + MASCOT_CENTER_SIZE / 2 - 12,
            backgroundColor: isDarkMode
              ? "rgba(255, 255, 255, 0.07)"
              : "rgba(15, 7, 40, 0.06)",
            opacity: Animated.multiply(mascotOpacity, screenBgOpacity),
            transform: [{ scale: mascotScale }],
          },
        ]}
        pointerEvents="none"
      />

      {/* Celestial 3D Orbital Rune Ring Revolving Under Paws */}
      <Animated.View
        style={[
          styles.orbitWrapper,
          {
            left: centerScreenX - 85,
            top: centerScreenY + MASCOT_CENTER_SIZE / 2 - 99,
            opacity: Animated.multiply(mascotOpacity, screenBgOpacity),
            transform: [
              { scale: mascotScale },
              { rotate: orbitSpin },
              { scaleY: 0.28 },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.orbitRing,
            {
              borderColor: isDarkMode
                ? "rgba(192, 132, 252, 0.35)"
                : "rgba(194, 0, 125, 0.22)",
            },
          ]}
        />
        <View style={[styles.orbitNode, { top: -4, left: 81, backgroundColor: "#FFD700" }]} />
        <View style={[styles.orbitNode, { bottom: -4, left: 81, backgroundColor: "#C2007D" }]} />
        <View style={[styles.orbitNode, { top: 81, left: -4, backgroundColor: "#38BDF8", width: 6, height: 6 }]} />
        <View style={[styles.orbitNode, { top: 81, right: -4, backgroundColor: "#E879F9", width: 6, height: 6 }]} />
      </Animated.View>

      {/* Center Mascot with Wand Sparkles & Wand Tip Magic Burst */}
      <Animated.View
        style={[
          styles.mascotContainer,
          {
            left: centerScreenX - MASCOT_CENTER_SIZE / 2,
            top: centerScreenY - MASCOT_CENTER_SIZE / 2,
            opacity: mascotOpacity,
            zIndex: 50,
            transform: [
              { scale: mascotScale },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Animated.Image
          source={decorativeAssets.mascotFullBody}
          style={styles.mascotImage}
          resizeMode="contain"
        />



        {/* Delicate Wand Sparkle Cascade */}
        {WAND_SPARKLES.map((ws) => {
          const wsOpacity = ambientPulse.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.35, 1, 0.45],
          });
          const wsScale = ambientPulse.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0.82, 1.22, 0.88],
          });

          return (
            <Animated.View
              key={ws.id}
              style={[
                styles.wandSparkle,
                {
                  top: ws.top,
                  left: ws.left,
                  opacity: wsOpacity,
                  transform: [{ scale: wsScale }],
                },
              ]}
            >
              {ws.isDot ? (
                <View
                  style={[
                    styles.wandDot,
                    {
                      width: ws.size,
                      height: ws.size,
                      borderRadius: ws.size / 2,
                      backgroundColor: ws.color,
                    },
                  ]}
                />
              ) : (
                <Ionicons name="sparkles" size={ws.size} color={ws.color} />
              )}
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* Glassmorphic AI Speech Bubble Island above the Mascot Cat */}
      <Animated.View
        style={[
          styles.dialogueIsland,
          {
            top: centerScreenY - MASCOT_CENTER_SIZE / 2 - 108,
            width: Math.min(windowWidth - 44, 342),
            backgroundColor: islandBgColor,
            borderColor: islandBorderColor,
            opacity: islandOpacity,
            transform: [{ scale: islandScale }],
          },
        ]}
        pointerEvents="none"
      >
        {/* Downward-pointing Speech Bubble Pointer to Cat */}
        <View
          style={[
            styles.speechTail,
            {
              backgroundColor: islandBgColor,
              borderRightColor: islandBorderColor,
              borderBottomColor: islandBorderColor,
            },
          ]}
        />

        {/* Typewriter Text with Blinking Cursor */}
        <View style={styles.islandTextContainer}>
          <Animated.View
            style={{
              opacity: textOpacity,
              transform: [{ scale: textScale }, { translateY: textY }],
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <Text style={[styles.typingText, { color: primaryTextColor }]}>
              {displayedText}
              {displayedText.length > 0 && (
                <Text
                  style={{
                    color: accentColor,
                    opacity: !isRubbingOut && isCaretVisible ? 1 : 0,
                    fontWeight: "900",
                  }}
                >
                  |
                </Text>
              )}
            </Text>
          </Animated.View>

          {/* Silky Sweeping Stardust Wave during rub-out */}
          {isRubbingOut && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {RUB_OUT_PARTICLES.map((p) => {
                const s0 = Math.max(0.001, p.startFrac);
                const s1 = s0 + p.durationFrac * 0.35;
                const s2 = Math.min(0.999, s0 + p.durationFrac);

                const pOpacity = rubOutProgress.interpolate({
                  inputRange: [0, s0, s1, s2, 1],
                  outputRange: [0, 0, 1, 0, 0],
                  extrapolate: "clamp",
                });

                const pScale = rubOutProgress.interpolate({
                  inputRange: [0, s0, s1, s2, 1],
                  outputRange: [0, 0, 1.25, 0, 0],
                  extrapolate: "clamp",
                });

                const pTranslateY = rubOutProgress.interpolate({
                  inputRange: [0, s0, s2, 1],
                  outputRange: [0, 0, -p.floatDistance, -p.floatDistance],
                  extrapolate: "clamp",
                });

                const pTranslateX = rubOutProgress.interpolate({
                  inputRange: [0, s0, s2, 1],
                  outputRange: [0, 0, p.driftX, p.driftX],
                  extrapolate: "clamp",
                });

                return (
                  <Animated.View
                    key={p.id}
                    style={[
                      styles.sparkleParticle,
                      {
                        left: `${p.xPct}%` as any,
                        top: "50%",
                        marginTop: p.yOffset,
                        opacity: pOpacity,
                        transform: [
                          { translateX: pTranslateX },
                          { translateY: pTranslateY },
                          { scale: pScale },
                        ],
                      },
                    ]}
                  >
                    {p.isDot ? (
                      <View
                        style={[
                          styles.glowingDot,
                          {
                            width: p.size,
                            height: p.size,
                            borderRadius: p.size / 2,
                            backgroundColor: p.color,
                            shadowColor: p.color,
                          },
                        ]}
                      />
                    ) : (
                      <Ionicons name="sparkles" size={p.size} color={p.color} />
                    )}
                  </Animated.View>
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBackground: {
    ...StyleSheet.absoluteFill,
  },
  stageBackdropGlow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    zIndex: 10,
  },

  mascotContainer: {
    position: "absolute",
    width: MASCOT_CENTER_SIZE,
    height: MASCOT_CENTER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  mascotImage: {
    width: MASCOT_CENTER_SIZE,
    height: MASCOT_CENTER_SIZE,
  },

  wandSparkle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 55,
  },
  wandDot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 2,
  },
  groundShadow: {
    position: "absolute",
    width: 130,
    height: 14,
    borderRadius: 7,
    zIndex: 35,
  },
  orbitWrapper: {
    position: "absolute",
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 38,
  },
  orbitRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  orbitNode: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  ambientSparkle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ambientDot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  dialogueIsland: {
    position: "absolute",
    alignSelf: "center",
    borderRadius: 26,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 18,
    minHeight: 88,
    zIndex: 60,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
    elevation: 7,
  },
  speechTail: {
    position: "absolute",
    bottom: -7,
    left: "50%",
    marginLeft: -7,
    width: 14,
    height: 14,
    transform: [{ rotate: "45deg" }],
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    zIndex: 65,
  },
  islandTextContainer: {
    width: "100%",
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  typingText: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 28,
    textAlign: "center",
  },
  sparkleParticle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  glowingDot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 3,
  },
});
