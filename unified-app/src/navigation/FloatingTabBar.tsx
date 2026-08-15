import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

interface FloatingTabBarProps extends BottomTabBarProps {
  icons: Record<string, keyof typeof Ionicons.glyphMap>;
}

export function FloatingTabBar({ state, descriptors, navigation, icons }: FloatingTabBarProps) {
  const { colors, cardShadow } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
            />
          );
        })}
      </View>
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
}: {
  label: string;
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
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

  const activeOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const activeScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.74, 1] });
  const contentLift = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
  const iconScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const inactiveDotOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.item, pressed && { opacity: pressedOpacity }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activePill,
          {
            backgroundColor: colors.accent,
            opacity: activeOpacity,
            transform: [{ scale: activeScale }],
          },
        ]}
      />
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
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "transparent",
  },
  bar: {
    minHeight: 68,
    borderRadius: 28,
    borderWidth: 1,
    padding: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  item: {
    flex: 1,
    minHeight: 54,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 21,
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
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
  },
  activeLabel: {
    fontWeight: "800",
  },
});
