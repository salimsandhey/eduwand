import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ProfileItem } from "../utils/profileCompletion";

const CHECKLIST: { key: "name" | "email" | ProfileItem; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "photo", label: "Photo or avatar" },
  { key: "phone", label: "Phone number" },
];

interface ProfileCompletionCardProps {
  percent: number;
  missing: ProfileItem[];
  /** When set (e.g. on the Profile tab), the card opens Edit Profile. Omit on Edit Profile itself. */
  onPress?: () => void;
}

/**
 * "Complete your profile" section on the Profile screen: a progress bar plus
 * the four items it counts, ticked as they're saved. Name and email are
 * always ticked (required to create the account).
 */
export function ProfileCompletionCard({ percent, missing, onPress }: ProfileCompletionCardProps) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const fill = useRef(new Animated.Value(percent)).current;
  const isComplete = percent >= 100;

  useEffect(() => {
    Animated.timing(fill, { toValue: percent, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [percent, fill]);

  const body = (
    <>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{isComplete ? "Your profile is complete" : "Complete your profile"}</Text>
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            {isComplete ? "Thanks - people you work with can now recognise and reach you." : "Helps students, parents and colleagues recognise and reach you."}
          </Text>
        </View>
        <Text style={[styles.percent, { color: colors.accent }]}>{percent}%</Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.backgroundMuted }]}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: colors.accent, width: fill.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"], extrapolate: "clamp" }) },
          ]}
        />
      </View>

      <View style={styles.list}>
        {CHECKLIST.map(({ key, label }) => {
          const done = key === "name" || key === "email" || !missing.includes(key);
          return (
            <View key={key} style={styles.item} accessibilityLabel={`${label}, ${done ? "done" : "not added yet"}`}>
              <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={17} color={done ? colors.accent : colors.textMuted} />
              <Text style={[styles.itemText, { color: done ? colors.textSecondary : colors.textPrimary }, !done && styles.itemTextPending]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {onPress && !isComplete ? (
        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.actionText, { color: colors.accent }]}>Complete profile</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.accent} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Profile ${percent}% complete. Opens Edit profile.`}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headingCopy: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800" },
  caption: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  percent: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  track: { height: 7, borderRadius: 4, overflow: "hidden", marginTop: 14 },
  fill: { height: "100%", borderRadius: 4 },
  list: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, rowGap: 10 },
  item: { width: "50%", flexDirection: "row", alignItems: "center", gap: 7, paddingRight: 8 },
  itemText: { flexShrink: 1, fontSize: 12, fontWeight: "600" },
  itemTextPending: { fontWeight: "700" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionText: { fontSize: 13, fontWeight: "800" },
});
