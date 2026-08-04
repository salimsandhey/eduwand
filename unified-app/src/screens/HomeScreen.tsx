import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

export function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  if (!user) return null;

  const canUseEnrolment = ENROLMENT_ROLES.includes(user.role);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hi, {user.fullName}</Text>
      <Text style={styles.role}>Role: {user.role}</Text>

      {canUseEnrolment ? (
        <View style={styles.tiles}>
          <Pressable style={styles.tile} onPress={() => navigation.navigate("EnquiryList")}>
            <Text style={styles.tileTitle}>Enquiries</Text>
            <Text style={styles.tileSubtitle}>View, search, and manage enquiries</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigation.navigate("PipelineBoard")}>
            <Text style={styles.tileTitle}>Pipeline board</Text>
            <Text style={styles.tileSubtitle}>Enquiries grouped by stage</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigation.navigate("FollowUpTaskList")}>
            <Text style={styles.tileTitle}>Follow up tasks</Text>
            <Text style={styles.tileSubtitle}>Overdue, due today, and upcoming</Text>
          </Pressable>
          <Pressable style={styles.tile} onPress={() => navigation.navigate("CsvExport")}>
            <Text style={styles.tileTitle}>CSV export</Text>
            <Text style={styles.tileSubtitle}>Admitted student export and history</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.summary}>
          {user.role === "teacher"
            ? "Lesson Studio and Assignment Lab are part of the AI Module, which hasn't been built yet."
            : "No screens are configured for this role yet."}
        </Text>
      )}

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 24, paddingTop: 60 },
  greeting: { fontSize: 24, fontWeight: "700", textAlign: "center", color: theme.text },
  role: { fontSize: 14, color: theme.textMuted, textAlign: "center", marginTop: 4, marginBottom: 24, textTransform: "capitalize" },
  summary: { fontSize: 14, color: theme.textMuted, textAlign: "center", marginBottom: 32 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  tile: {
    width: "48%",
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tileTitle: { fontWeight: "700", color: theme.text, marginBottom: 6 },
  tileSubtitle: { color: theme.textMuted, fontSize: 12 },
  logoutButton: {
    backgroundColor: theme.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 32,
  },
  logoutButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
