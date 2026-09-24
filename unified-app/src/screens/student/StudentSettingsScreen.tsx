import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { StudentAvatar } from "../../components/StudentAvatar";
import { api } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "StudentSettings">;

// Students have no /auth/me access (they sign in with phone + OTP, not an
// AppUser row - see backend/src/routes/auth-me.ts), so this is a trimmed,
// student-safe version of ProfileScreen: no password change, no photo
// upload, no self-delete. Just who they're signed in as, the pages every
// account needs, and a way to sign out.
export function StudentSettingsScreen({ navigation }: Props) {
  const { user, accessToken, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need your phone number and a new code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, styles.profileCard, { backgroundColor: colors.surface }, cardShadow]}>
          {user ? <StudentAvatar studentId={user.id} picture={user} size={44} photoUrl={accessToken ? api.myPhotoUrl(accessToken) : null} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {user?.fullName ? capitalizeFirst(user.fullName) : "Student"}
            </Text>
            {user?.phone ? <Text style={[styles.phone, { color: colors.textMuted }]}>{user.phone}</Text> : null}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Legal</Text>
          <SettingsRow label="Privacy Policy" onPress={() => navigation.navigate("LegalDocument", { contentKey: "privacy_policy", title: "Privacy Policy" })} colors={colors} pressedOpacity={pressedOpacity} />
          <SettingsRow label="Terms of Service" onPress={() => navigation.navigate("LegalDocument", { contentKey: "terms_of_service", title: "Terms of Service" })} colors={colors} pressedOpacity={pressedOpacity} />
          <SettingsRow label="About EduWand" onPress={() => navigation.navigate("LegalDocument", { contentKey: "about", title: "About EduWand" })} colors={colors} pressedOpacity={pressedOpacity} last />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Support</Text>
          <SettingsRow label="Contact Us" onPress={() => navigation.navigate("Contact")} colors={colors} pressedOpacity={pressedOpacity} />
          <SettingsRow label="Help & Support" onPress={() => navigation.navigate("HelpSupport")} colors={colors} pressedOpacity={pressedOpacity} last />
        </View>

        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [styles.logoutButton, { borderColor: colors.danger }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={17} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>Log out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function SettingsRow({
  label,
  onPress,
  colors,
  pressedOpacity,
  last,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  pressedOpacity: number;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { opacity: pressedOpacity },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60, gap: 16 },
  card: { borderRadius: 20, padding: 16 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontSize: 16, fontWeight: "800" },
  phone: { marginTop: 2, fontSize: 12, fontWeight: "500" },
  sectionTitle: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  rowLabel: { fontSize: 14, fontWeight: "600" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
  },
  logoutText: { fontSize: 14, fontWeight: "800" },
});
