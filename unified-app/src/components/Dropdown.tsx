import { useEffect, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, StyleProp, Text, View, ViewStyle } from "react-native";
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
  /** Tints the trigger with the accent colour to signal a non-default filter is applied. */
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
  const tint = active ? colors.accent : colors.textMuted;

  return (
    <>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPress={() => setOpen(true)}
          onPressIn={() =>
            Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 4 }).start()
          }
          onPressOut={() =>
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start()
          }
          style={({ pressed }) => [
            styles.trigger,
            isField
              ? [
                  styles.triggerField,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.surfaceRaised,
                    borderColor: active ? colors.accent : colors.border,
                  },
                  cardShadow,
                ]
              : [
                  styles.triggerPlain,
                  { backgroundColor: active ? colors.accentSoft : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                ],
            pressed && { opacity: pressedOpacity },
            style,
          ]}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          {isField && triggerIcon ? (
            <View style={[styles.triggerIconChip, { backgroundColor: active ? colors.accent : colors.accentSoft }]}>
              <Ionicons name={triggerIcon} size={14} color={active ? colors.accentOn : colors.accent} />
            </View>
          ) : null}
          <Text
            style={[
              isField ? styles.triggerTextField : styles.triggerTextPlain,
              { color: active ? colors.accent : isField ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {triggerLabel}
          </Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <Ionicons name="chevron-down" size={14} color={tint} />
          </Animated.View>
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}
            onPress={() => {}}
          >
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{title}</Text>
            <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />
            <FlatList
              data={options}
              keyExtractor={(item) => item.key}
              style={styles.optionList}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={[styles.optionDivider, { backgroundColor: colors.border }]} />}
              renderItem={({ item }) => {
                const active = item.key === selectedKey;
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
                        color={active ? colors.accent : colors.textSecondary}
                        style={styles.optionIcon}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.optionText,
                        { color: active ? colors.accent : colors.textPrimary, fontWeight: active ? "800" : "600" },
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
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={colors.accent} style={styles.optionCheck} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
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
  triggerField: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 52,
  },
  triggerIconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerPlain: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
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
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 20,
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
