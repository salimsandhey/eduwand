import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

export function MoreMenuScreen() {
  const { user, logout } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  // Loosely typed: this screen is shared between the enrolment More stack (which has
  // a CsvExport route) and the teacher More tab (which doesn't).
  const navigation = useNavigation<any>();

  const showCsvExport = user ? ENROLMENT_ROLES.includes(user.role) : false;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {showCsvExport ? (
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
          <View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="download-outline" size={18} color={colors.accent} />
          </View>
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>CSV Export</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

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
        <View style={[styles.rowIcon, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        </View>
        <Text style={[styles.rowText, { color: colors.danger }]}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
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
  rowText: { flex: 1, fontSize: 15, fontWeight: "600" },
});
