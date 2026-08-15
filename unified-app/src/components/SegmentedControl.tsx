import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export interface SegmentOption {
  key: string;
  label: string;
  locked?: boolean;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  activeKey: string;
  onChange: (key: string) => void;
}

// Two-way (or more) tab switcher used to split a heavy detail screen into
// focused sub-views (e.g. EnquiryDetail's Lead / Admission split) instead of
// one long scroll. A locked option stays tappable - so the user can see why
// it's locked - but is visually muted and shows a lock glyph.
export function SegmentedControl({ options, activeKey, onChange }: SegmentedControlProps) {
  const { colors, pressedOpacity } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.key === activeKey;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: colors.accent },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {opt.locked ? (
              <Ionicons
                name="lock-closed"
                size={12}
                color={active ? colors.accentOn : colors.textMuted}
                style={styles.lockIcon}
              />
            ) : null}
            <Text
              style={[
                styles.label,
                { color: active ? colors.accentOn : opt.locked ? colors.textMuted : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingVertical: 10,
  },
  lockIcon: { marginRight: 6 },
  label: { fontSize: 13, fontWeight: "800" },
});
