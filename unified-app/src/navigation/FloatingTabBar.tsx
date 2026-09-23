import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ImageSourcePropType, LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/tokens";
import { AnimatedAiButtonMascot } from "../components/AnimatedAiButtonMascot";
import { useTabBarScale, useTabBarScrollReset } from "./TabBarScrollContext";
import { useWelcomeMascot } from "../context/WelcomeMascotContext";
import { decorativeAssets } from "../theme/decorativeAssets";

interface FloatingTabBarProps extends BottomTabBarProps {
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
  aiAssistIcon?: ImageSourcePropType;
  onAiAssistPress?: () => void;
}

export const TAB_BAR_HEIGHT = 60;
const MASCOT_CENTER_SIZE = 190;
const MASCOT_DOCK_SIZE = 64;
const targetScale = MASCOT_DOCK_SIZE / MASCOT_CENTER_SIZE;

type ItemLayout = { x: number; width: number };

export function FloatingTabBar({ state, descriptors, navigation, icons, aiAssistIcon, onAiAssistPress }: FloatingTabBarProps) {
  const { colors, mode, pressedOpacity } = useTheme();
  const insets = useSafeAreaInsets();
  // Null on a tab navigator that hasn't wrapped itself in a TabBarScrollProvider -
  // the bar then just renders at a fixed, unanimated size, as before.
  const scrollScale = useTabBarScale();
  const resetTabBarScroll = useTabBarScrollReset();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { isFlying, isMascotDocked, welcomeCount, completeWelcome, setDockCoordinates } = useWelcomeMascot();
  const aiButtonRef = useRef<View>(null);

  // Post-welcome spotlight state & animations (excludes navbar & cat)
  const [isSpotlightVisible, setIsSpotlightVisible] = useState(false);
  const spotlightOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.92)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const lastSpotlightWelcomeCount = useRef(0);
  const spotlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const badgeTranslateY = badgeScale.interpolate({
    inputRange: [0.92, 1],
    outputRange: [6, 0],
  });

  const isDismissingSpotlightRef = useRef(false);

  const dismissSpotlight = useCallback(() => {
    if (isDismissingSpotlightRef.current) return;
    isDismissingSpotlightRef.current = true;

    if (spotlightTimerRef.current) {
      clearTimeout(spotlightTimerRef.current);
      spotlightTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(spotlightOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(badgeOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(badgeScale, {
        toValue: 0.92,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsSpotlightVisible(false);
      isDismissingSpotlightRef.current = false;
    });
  }, [spotlightOpacity, badgeOpacity, badgeScale]);

  const wrapBottom = Math.max(insets.bottom, 10);
  const centerScreenX = windowWidth / 2;
  const centerScreenY = windowHeight / 2 + 15;

  // Dock center in screen coordinates:
  // wrap has paddingHorizontal: 12. aiAssistButton center is right: 58 inside wrap.
  const dockCenterX = windowWidth - 70;
  const dockCenterFromBottom = wrapBottom + 86;
  const dockCenterY = windowHeight - dockCenterFromBottom;

  // Starting offsets from dock center to screen center
  const startX = centerScreenX - dockCenterX;
  const startY = centerScreenY - dockCenterY;

  const flyPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flyScale = useRef(new Animated.Value(1)).current;
  const flyOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isFlying) {
      flyPos.setValue({ x: startX, y: startY });
      flyScale.setValue(1);
      flyOpacity.setValue(1);

      Animated.parallel([
        Animated.timing(flyPos.x, {
          toValue: 0,
          duration: 360,
          easing: Easing.bezier(0.2, 0.8, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(flyPos.y, {
          toValue: 42, // Refined drop: smoothly slides behind navbar without dropping below it
          duration: 360,
          easing: Easing.bezier(0.2, 0.8, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(flyScale, {
          toValue: targetScale,
          duration: 360,
          easing: Easing.bezier(0.2, 0.8, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(240),
          Animated.timing(flyOpacity, {
            toValue: 0,
            duration: 120,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        completeWelcome();
      });
    }
  }, [isFlying, startX, startY, completeWelcome]);

  const measureAiButton = useCallback(() => {
    aiButtonRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setDockCoordinates({
          x: x + width / 2,
          y: y + height / 2,
        });
      }
    });
  }, [setDockCoordinates]);

  const dockScale = useRef(new Animated.Value(isMascotDocked ? 1 : 0)).current;

  useEffect(() => {
    if (isMascotDocked) {
      dockScale.setValue(0);
      Animated.spring(dockScale, {
        toValue: 1,
        tension: 150,
        friction: 11,
        useNativeDriver: true,
      }).start();

      // Trigger spotlight backdrop & funny message badge once docked
      if (welcomeCount > 0 && lastSpotlightWelcomeCount.current !== welcomeCount) {
        lastSpotlightWelcomeCount.current = welcomeCount;

        const t = setTimeout(() => {
          isDismissingSpotlightRef.current = false;
          setIsSpotlightVisible(true);
          spotlightOpacity.setValue(0);
          badgeOpacity.setValue(0);
          badgeScale.setValue(0.92);

          Animated.parallel([
            Animated.timing(spotlightOpacity, {
              toValue: 1,
              duration: 300,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(badgeOpacity, {
              toValue: 1,
              duration: 240,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(badgeScale, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]).start();

          // Auto-hide after 5.5 seconds (5-6 seconds)
          spotlightTimerRef.current = setTimeout(() => {
            dismissSpotlight();
          }, 5500);
        }, 320);

        return () => {
          clearTimeout(t);
          if (spotlightTimerRef.current) {
            clearTimeout(spotlightTimerRef.current);
          }
        };
      }
    } else {
      dockScale.setValue(0);
    }
  }, [isMascotDocked, welcomeCount, dockScale, spotlightOpacity, badgeOpacity, badgeScale, dismissSpotlight]);

  useEffect(() => {
    const t1 = setTimeout(measureAiButton, 60);
    const t2 = setTimeout(measureAiButton, 200);
    const t3 = setTimeout(measureAiButton, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [measureAiButton, insets.bottom]);

  const [itemLayouts, setItemLayouts] = useState<Record<number, ItemLayout>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  // Elastic "jelly" travel: the indicator stretches wider/flatter as it sets
  // off, then springs back to its normal shape with a slight overshoot once
  // it arrives - replaces the old plain rigid slide.
  const indicatorStretch = useRef(new Animated.Value(1)).current;
  const activeLayout = itemLayouts[state.index];

  useEffect(() => {
    if (!activeLayout) return;
    Animated.spring(indicatorX, {
      toValue: activeLayout.x,
      useNativeDriver: true,
      tension: 210,
      friction: 28,
    }).start();
    Animated.sequence([
      Animated.timing(indicatorStretch, { toValue: 1.28, duration: 130, useNativeDriver: true }),
      Animated.spring(indicatorStretch, { toValue: 1, useNativeDriver: true, tension: 260, friction: 9 }),
    ]).start();
  }, [activeLayout, indicatorX, indicatorStretch]);

  const indicatorSquash = indicatorStretch.interpolate({ inputRange: [1, 1.28], outputRange: [1, 0.86] });

  // Whichever screen was scrolled last may have left the bar shrunk - every
  // newly focused tab should always start at full size, not inherit that.
  useEffect(() => {
    resetTabBarScroll?.();
  }, [state.index, resetTabBarScroll]);

  function handleItemLayout(index: number, event: LayoutChangeEvent) {
    const { x, width } = event.nativeEvent.layout;
    setItemLayouts((prev) => {
      const existing = prev[index];
      if (existing && existing.x === x && existing.width === width) return prev;
      return { ...prev, [index]: { x, width } };
    });
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Full-screen Dark Spotlight Backdrop (Dims screen, tap anywhere to dismiss) */}
      {isSpotlightVisible && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
          onPress={dismissSpotlight}
          accessibilityRole="button"
          accessibilityLabel="Dismiss spotlight"
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(0, 0, 0, 0.65)",
                opacity: spotlightOpacity,
              },
            ]}
          />
        </Pressable>
      )}

      {/* Floating Bottom Bar Wrap: zIndex: 10 so Navbar and Cat sit ABOVE the dark backdrop */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.wrap,
          {
            bottom: Math.max(insets.bottom, 10),
            overflow: "visible",
            zIndex: 10,
          },
          // transformOrigin "bottom" keeps the bar's bottom edge anchored while
          // it shrinks, so it visibly "sinks" toward the edge on scroll-down
          // instead of shrinking evenly from its center.
          scrollScale ? { transform: [{ scale: scrollScale }], transformOrigin: "bottom" } : null,
        ]}
      >
        {/* Flying Mascot Cat: rendered BEFORE styles.bar so it slides physically BEHIND the actual navbar! */}
        {isFlying && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flyingMascot,
              {
                opacity: flyOpacity,
                transform: [
                  { translateX: flyPos.x },
                  { translateY: flyPos.y },
                  { scale: flyScale },
                ],
              },
            ]}
          >
            <Animated.Image
              source={decorativeAssets.mascotFullBody}
              style={styles.flyingMascotImage}
              resizeMode="contain"
            />
          </Animated.View>
        )}

        <View style={[styles.barShadowWrapper, { shadowOpacity: mode === "dark" ? 0.35 : 0.14 }]}>
          <View
            style={[
              styles.bar,
              {
                borderColor: mode === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.09)",
              },
            ]}
          >
            <BlurView
              intensity={mode === "dark" ? 50 : 70}
              tint={mode === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: mode === "dark" ? "rgba(32, 32, 32, 0.82)" : "rgba(255, 255, 255, 0.86)",
                },
              ]}
            />
            {activeLayout ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.slidingIndicator,
                  {
                    width: activeLayout.width,
                    transform: [{ translateX: indicatorX }, { scaleX: indicatorStretch }, { scaleY: indicatorSquash }],
                  },
                ]}
              >
                <LinearGradient
                  colors={[colors.accent, colors.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.slidingIndicatorGradient}
                />
              </Animated.View>
            ) : null}
            {state.routes.map((route, index) => {
              const descriptor = descriptors[route.key];
              const options = descriptor.options;
              const focused = state.index === index;
              const label =
                options.tabBarLabel !== undefined
                  ? String(options.tabBarLabel)
                  : options.title !== undefined
                    ? options.title
                    : route.name;

              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                });
              };

              return (
                <AnimatedTabItem
                  key={route.key}
                  label={label}
                  focused={focused}
                  icon={icons[route.name] ?? "ellipse-outline"}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  onLayout={(event) => handleItemLayout(index, event)}
                />
              );
            })}
          </View>
        </View>
        {onAiAssistPress ? (
          <View
            ref={aiButtonRef}
            collapsable={false}
            onLayout={measureAiButton}
            style={styles.aiAssistButton}
          >
            <Pressable
              onPress={onAiAssistPress}
              style={({ pressed }) => [
                styles.aiAssistPressable,
                pressed && { opacity: pressedOpacity },
                !isMascotDocked && { opacity: 0 },
              ]}
              disabled={!isMascotDocked}
              accessibilityRole="button"
              accessibilityLabel="Open AI assistant"
            >
              {aiAssistIcon && isMascotDocked ? (
                <Animated.View
                  style={[
                    styles.aiAssistIcon,
                    {
                      transform: [
                        { translateY: 32 },
                        { scale: dockScale },
                        { translateY: -32 },
                      ],
                      transformOrigin: "bottom",
                    },
                  ]}
                >
                  <AnimatedAiButtonMascot style={{ width: 64, height: 64 }} />
                </Animated.View>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      {/* Mascot Speech Bubble Message Box: Rendered at root level so touches are NEVER clipped by wrap! */}
      {isSpotlightVisible && (
        <Animated.View
          style={[
            styles.badgeContainer,
            {
              bottom: wrapBottom + TAB_BAR_HEIGHT + 74,
              opacity: badgeOpacity,
              transform: [
                { scale: badgeScale },
                { translateY: badgeTranslateY },
              ],
            },
          ]}
        >
          <Pressable
            onPress={dismissSpotlight}
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <View
              style={[
                styles.badgeCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.textPrimary }]}>
                I'm always here to help you.{"\n"}Well, unless I'm napping.
              </Text>
            </View>
            {/* Clean Speech Bubble Arrow pointing to the cat */}
            <View style={[styles.badgeArrow, { borderTopColor: colors.surface }]} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function AnimatedTabItem({
  label,
  focused,
  icon,
  accessibilityLabel,
  onPress,
  onLongPress,
  onLayout,
}: {
  label: string;
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  // One-shot pop on top of progress's smooth scale - overshoots past full
  // size then settles, giving the newly-active icon a distinct "bounce in"
  // rather than just easing to its resting scale.
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 150,
      friction: 16,
    }).start();
    if (focused) {
      pop.setValue(0.8);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, tension: 300, friction: 7 }).start();
    }
  }, [focused, progress, pop]);

  const contentLift = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
  const iconScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const inactiveDotOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.item, pressed && { opacity: pressedOpacity }]}
    >
      <Animated.View style={[styles.itemContent, { transform: [{ translateY: contentLift }] }]}>
        <View style={styles.iconWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.inactiveDot,
              {
                backgroundColor: colors.surfaceRaised,
                opacity: inactiveDotOpacity,
                transform: [{ scale: iconScale }],
              },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: iconScale }, { scale: pop }] }}>
            <Ionicons name={icon} size={17} color={focused ? colors.accentOn : colors.textMuted} />
          </Animated.View>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: focused ? colors.accentOn : colors.textMuted },
            focused && styles.activeLabel,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    paddingHorizontal: 12,
    backgroundColor: "transparent",
  },
  barShadowWrapper: {
    borderRadius: 100,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 10,
    zIndex: 5,
  },
  bar: {
    minHeight: TAB_BAR_HEIGHT,
    borderRadius: 100,
    borderWidth: 1.2,
    padding: 6,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    overflow: "hidden",
  },
  item: {
    flex: 1,
    minHeight: 47,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  slidingIndicator: {
    position: "absolute",
    left: 0,
    top: 2,
    bottom: 2,
    borderRadius: 100,
    overflow: "hidden",
  },
  slidingIndicatorGradient: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 100,
  },
  itemContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconWrap: {
    width: 26,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveDot: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0,
  },
  activeLabel: {
    fontFamily: typography.fontFamily,
    fontWeight: "800",
  },
  aiAssistButton: {
    position: "absolute",
    right: 18,
    bottom: TAB_BAR_HEIGHT - 14,
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  aiAssistPressable: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  aiAssistIcon: {
    width: 64,
    height: 64,
  },
  flyingMascot: {
    position: "absolute",
    right: 58 - MASCOT_CENTER_SIZE / 2,
    bottom: 86 - MASCOT_CENTER_SIZE / 2,
    width: MASCOT_CENTER_SIZE,
    height: MASCOT_CENTER_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  flyingMascotImage: {
    width: MASCOT_CENTER_SIZE,
    height: MASCOT_CENTER_SIZE,
  },
  badgeContainer: {
    position: "absolute",
    right: 14,
    zIndex: 30,
    alignItems: "flex-end",
  },
  badgeCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  badgeArrow: {
    position: "absolute",
    bottom: -7,
    right: 44,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 18,
    textAlign: "center",
  },
});
