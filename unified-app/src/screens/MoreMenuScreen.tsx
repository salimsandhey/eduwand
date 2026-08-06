import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";

// admin/leadership no longer reach this screen - see AppNavigator's NoAccessScreen routing.
const ENROLMENT_ROLES = ["front_desk", "counsellor"];

export function MoreMenuScreen() {
  const { user, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  const showCsvExport = user ? ENROLMENT_ROLES.includes(user.role) : false;

  if (!user) return null;

  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <Screen>
      <View style={styles.container}>
        {/* Profile Card Block */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "15", borderColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
          </View>
          <View style={styles.profileDetails}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user.fullName}</Text>
            <Text style={[styles.profileEmail, { color: colors.textMuted }]}>{user.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{user.role}</Text>
            </View>
          </View>
        </View>

        {/* Data section */}
        {showCsvExport ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Data & Reports</Text>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface, borderColor: colors.border },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => navigation.navigate("CsvExport")}
              accessibilityRole="button"
            >
              <View style={[styles.rowIcon, { backgroundColor: colors.accent + "12" }]}>
                <Ionicons name="download-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>CSV Export</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* Account section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>Account</Text>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={logout}
            accessibilityRole="button"
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.danger + "12" }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            </View>
            <Text style={[styles.rowText, { color: colors.danger }]}>Log out</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 20 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800" },
  profileDetails: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
  profileEmail: { fontSize: 13, marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  roleBadgeText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  section: { gap: 8 },
  sectionHeader: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, paddingLeft: 4, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 56,
  },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontSize: 14, fontWeight: "700" },
});
