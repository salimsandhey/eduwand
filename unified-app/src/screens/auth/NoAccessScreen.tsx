import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";

// admin, leadership, platform_admin, student, and parent have no mobile experience by
// design - per the PRD, admin/leadership's real home is the Admin Dashboard (web),
// and student/parent are structural shells only in this build phase. Rather than hand
// them a tab bar full of screens that aren't really theirs, this says so plainly.
export function NoAccessScreen() {
  const { user, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  return (
    <Screen edges={["top", "bottom"]} style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceRaised }, cardShadow]}>
        <Ionicons name="desktop-outline" size={36} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Use the Admin Dashboard</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {user?.role === "student" || user?.role === "parent"
          ? "There's nothing here for this role yet."
          : "This role manages EduWand from the web Admin Dashboard, not this app."}
      </Text>
      {user ? (
        <View style={[styles.roleBadge, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{user.role}</Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.logoutButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
        onPress={logout}
        accessibilityRole="button"
      >
        <Text style={[styles.logoutButtonText, { color: colors.accentOn }]}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: 32 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 12 },
  roleBadge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 28 },
  roleBadgeText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  logoutButton: { borderRadius: 10, paddingHorizontal: 28, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  logoutButtonText: { fontSize: 15, fontWeight: "700" },
});
