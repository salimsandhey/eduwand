import { useEffect, useRef, useState } from "react";
import { Animated, Image, ImageSourcePropType, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { typography } from "../theme/tokens";

interface FloatingTabBarProps extends BottomTabBarProps {
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
  aiAssistIcon?: ImageSourcePropType;
  onAiAssistPress?: () => void;
}

export const TAB_BAR_HEIGHT = 68;

type ItemLayout = { x: number; width: number };

export function FloatingTabBar({ state, descriptors, navigation, icons, aiAssistIcon, onAiAssistPress }: FloatingTabBarProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const insets = useSafeAreaInsets();

  const [itemLayouts, setItemLayouts] = useState<Record<number, ItemLayout>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeLayout = itemLayouts[state.index];

  useEffect(() => {
    if (!activeLayout) return;
    Animated.spring(indicatorX, {
      toValue: activeLayout.x,
      useNativeDriver: true,
      tension: 210,
      friction: 28,
    }).start();
  }, [activeLayout, indicatorX]);

  function handleItemLayout(index: number, event: LayoutChangeEvent) {
    const { x, width } = event.nativeEvent.layout;
    setItemLayouts((prev) => {
      const existing = prev[index];
      if (existing && existing.x === x && existing.width === width) return prev;
      return { ...prev, [index]: { x, width } };
    });
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
        {activeLayout ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingIndicator,
              {
                backgroundColor: colors.accent,
                width: activeLayout.width,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
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
      {onAiAssistPress ? (
        <Pressable
          onPress={onAiAssistPress}
          style={({ pressed }) => [styles.aiAssistButton, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Open AI assistant"
        >
          {aiAssistIcon ? <Image source={aiAssistIcon} style={styles.aiAssistIcon} resizeMode="contain" /> : null}
        </Pressable>
      ) : null}
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

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 150,
      friction: 16,
    }).start();
  }, [focused, progress]);

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
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <Ionicons name={icon} size={19} color={focused ? colors.accentOn : colors.textMuted} />
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
  bar: {
    minHeight: TAB_BAR_HEIGHT,
    borderRadius: 28,
    borderWidth: 1,
    padding: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    overflow: "hidden",
  },
  item: {
    flex: 1,
    minHeight: 54,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  slidingIndicator: {
    position: "absolute",
    left: 0,
    top: 3,
    bottom: 3,
    borderRadius: 19,
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  itemContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconWrap: {
    width: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  inactiveDot: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
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
  },
  aiAssistIcon: {
    width: 64,
    height: 64,
  },
});
