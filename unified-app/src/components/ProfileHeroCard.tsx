import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { TypewriterText } from "./TypewriterText";

export interface ProfileHeroInfo {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

interface ProfileHeroCardProps {
  /** Rendered inside the rounded avatar frame - should fill it (100% x 100%). */
  avatar: ReactNode;
  name: string;
  role: string;
  info: ProfileHeroInfo[];
  /** The round button in the top-right corner (edit profile / change photo). */
  onAction: () => void;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
  /** Types the name out on mount, as on the teacher's More tab. */
  animateName?: boolean;
}

/**
 * The profile card at the top of each role's profile/More tab (teacher,
 * counsellor/front desk, student) - one component so every panel's card
 * looks identical: avatar, name, role, then a short list of key details.
 */
export function ProfileHeroCard({ avatar, name, role, info, onAction, actionIcon = "create-outline", actionLabel, animateName = false }: ProfileHeroCardProps) {
  const { colors, pressedOpacity } = useTheme();

  return (
    <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.glowLarge} />
      <View style={styles.glowSmall} />

      <Pressable
        style={({ pressed }) => [styles.action, pressed && { opacity: pressedOpacity }]}
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={6}
      >
        <Ionicons name={actionIcon} size={17} color={colors.accentOn} />
      </Pressable>

      <View style={styles.row}>
        <View style={[styles.avatarFrame, { backgroundColor: colors.accentSoft }]}>{avatar}</View>

        <View style={styles.divider} />

        <View style={styles.rightCol}>
          {animateName ? (
            <TypewriterText text={name} style={[styles.name, { color: colors.accentOn }]} cursorColor={colors.primaryBrand} numberOfLines={1} />
          ) : (
            <Text style={[styles.name, { color: colors.accentOn }]} numberOfLines={1}>
              {name}
            </Text>
          )}
          <Text style={[styles.role, { color: colors.accentSoft }]} numberOfLines={1}>
            {role}
          </Text>

          <View style={styles.infoList}>
            {info.map((item) => (
              <View key={item.label} style={styles.infoItem}>
                <Ionicons name={item.icon} size={12} color={colors.accentSoft} style={styles.infoIcon} />
                <View style={styles.infoText}>
                  <Text style={[styles.infoLabel, { color: colors.accentSoft }]}>{item.label}</Text>
                  <Text style={[styles.infoValue, { color: colors.accentOn }]} numberOfLines={1}>
                    {item.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 190, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 18, overflow: "hidden" },
  glowLarge: { position: "absolute", width: 142, height: 142, right: -53, top: -62, borderRadius: 71, backgroundColor: "#FFFFFF", opacity: 0.1 },
  glowSmall: { position: "absolute", width: 58, height: 58, right: 40, bottom: -32, borderRadius: 29, backgroundColor: "#FFFFFF", opacity: 0.1 },
  action: { position: "absolute", top: 16, right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", zIndex: 2 },
  row: { flexDirection: "row", alignItems: "flex-start", marginTop: 34, gap: 14, zIndex: 1 },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.2)" },
  rightCol: { flex: 1 },
  avatarFrame: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.55)",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  name: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  role: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  infoList: { marginTop: 12, gap: 10 },
  infoItem: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  infoIcon: { marginTop: 2 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 8, letterSpacing: 0.6, fontWeight: "800" },
  infoValue: { marginTop: 2, fontSize: 12, lineHeight: 15, fontWeight: "700" },
});
