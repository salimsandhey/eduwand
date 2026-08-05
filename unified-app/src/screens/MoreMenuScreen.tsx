import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

export function MoreMenuScreen() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  // Loosely typed: this screen is shared between the enrolment More stack (which has
  // a CsvExport route) and the teacher More stack (which doesn't).
  const navigation = useNavigation<any>();

  const showCsvExport = user ? ENROLMENT_ROLES.includes(user.role) : false;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {showCsvExport ? (
        <Pressable
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate("CsvExport")}
        >
          <Ionicons name="download-outline" size={20} color={colors.accent} />
          <Text style={[styles.rowText, { color: colors.textPrimary }]}>CSV Export</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <Pressable style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={logout}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
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
    borderRadius: 12,
    padding: 16,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: "600" },
});
