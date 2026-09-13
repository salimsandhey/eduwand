import { useEffect, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, StyleProp, Text, View, ViewStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export interface DropdownOption {
  key: string;
  label: string;
  meta?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface DropdownProps {
  title: string;
  options: DropdownOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  triggerLabel: string;
  triggerIcon?: keyof typeof Ionicons.glyphMap;
  variant?: "field" | "plain";
  /** This dropdown's signature colour — every dropdown gets its own so they read as distinct controls, not identical grey boxes. */
  hue: string;
  /** Fills the trigger solid with `hue` to signal a non-default value is applied. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Dropdown({
  title,
  options,
  selectedKey,
  onSelect,
  triggerLabel,
  triggerIcon,
  variant = "field",
  hue,
  active = false,
  style,
}: DropdownProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [open, setOpen] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, chevronAnim]);

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const isField = variant === "field";

  const pressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  const pressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {isField ? (
          <View style={styles.fieldWrap}>
            <View style={[styles.floatingLabel, { backgroundColor: colors.background, borderColor: hue + "55" }]}>
              <Text style={[styles.floatingLabelText, { color: hue }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Pressable
              onPress={() => setOpen(true)}
              onPressIn={pressIn}
              onPressOut={pressOut}
              style={({ pressed }) => [
                styles.trigger,
                styles.triggerField,
                {
                  backgroundColor: active ? hue : colors.surfaceRaised,
                  borderColor: active ? hue : hue + "45",
                },
                cardShadow,
                pressed && { opacity: pressedOpacity },
                style,
              ]}
              accessibilityRole="button"
              accessibilityLabel={title}
            >
              {triggerIcon ? (
                <View
                  style={[
                    styles.triggerIconChip,
                    { backgroundColor: active ? "rgba(255,255,255,0.22)" : hue + "22" },
                  ]}
                >
                  <Ionicons name={triggerIcon} size={14} color={active ? "#FFFFFF" : hue} />
                </View>
              ) : null}
              <Text
                style={[styles.triggerTextField, { color: active ? "#FFFFFF" : colors.textPrimary }]}
                numberOfLines={1}
              >
                {triggerLabel}
              </Text>
              <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                <Ionicons name="chevron-down" size={14} color={active ? "#FFFFFF" : hue} />
              </Animated.View>
            </Pressable>
            <View style={[styles.bottomAccent, { backgroundColor: hue, opacity: active ? 1 : 0.35 }]} />
          </View>
        ) : (
          <Pressable
            onPress={() => setOpen(true)}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={({ pressed }) => [
              styles.trigger,
              styles.triggerPlain,
              {
                backgroundColor: active ? hue + "1F" : colors.surfaceRaised,
                borderColor: active ? hue : colors.border,
              },
              pressed && { opacity: pressedOpacity },
              style,
            ]}
            accessibilityRole="button"
            accessibilityLabel={title}
          >
            <View style={[styles.triggerDot, { backgroundColor: hue }]} />
            <Text style={[styles.triggerTextPlain, { color: active ? hue : colors.textSecondary }]} numberOfLines={1}>
              {triggerLabel}
            </Text>
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Ionicons name="chevron-down" size={13} color={active ? hue : colors.textSecondary} />
            </Animated.View>
          </Pressable>
        )}
      </Animated.View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}
            onPress={() => {}}
          >
            <View style={styles.sheetTitleRow}>
              <View style={[styles.sheetTitleDot, { backgroundColor: hue }]} />
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{title}</Text>
            </View>
            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
            <FlatList
              data={options}
              keyExtractor={(item) => item.key}
              style={styles.optionList}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={[styles.optionDivider, { backgroundColor: colors.border }]} />}
              renderItem={({ item }) => {
                const isSelected = item.key === selectedKey;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect(item.key);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.optionRow, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    {item.icon ? (
                      <Ionicons
                        name={item.icon}
                        size={16}
                        color={isSelected ? hue : colors.textSecondary}
                        style={styles.optionIcon}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? hue : colors.textPrimary, fontWeight: isSelected ? "800" : "600" },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.meta ? (
                      <View style={[styles.optionMetaBadge, { backgroundColor: colors.backgroundMuted }]}>
                        <Text style={[styles.optionMetaText, { color: colors.textMuted }]}>{item.meta}</Text>
                      </View>
                    ) : null}
                    {isSelected ? (
                      <Ionicons name="checkmark" size={18} color={hue} style={styles.optionCheck} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fieldWrap: {
    marginTop: 9,
  },
  floatingLabel: {
    position: "absolute",
    top: -9,
    left: 12,
    zIndex: 2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  floatingLabelText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  triggerField: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 52,
  },
  triggerIconChip: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerPlain: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
  },
  triggerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  bottomAccent: {
    alignSelf: "flex-start",
    marginLeft: 14,
    marginTop: 6,
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  triggerTextField: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  triggerTextPlain: {
    fontSize: 12.5,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "88%",
    maxWidth: 360,
    maxHeight: "70%",
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 8,
    overflow: "hidden",
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  sheetTitleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  sheetDivider: {
    height: 1,
    marginTop: 14,
  },
  optionList: {
    paddingHorizontal: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  optionIcon: {
    marginRight: 6,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
  },
  optionMetaBadge: {
    minWidth: 26,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  optionMetaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  optionCheck: {
    marginLeft: 8,
  },
  optionDivider: {
    height: 1,
    marginHorizontal: 12,
  },
});
