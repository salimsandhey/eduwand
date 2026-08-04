import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";

function roleSummary(role: string): string {
  switch (role) {
    case "front_desk":
    case "counsellor":
      return "Enquiry list and admissions pipeline board";
    case "teacher":
      return "Lesson Studio and Assignment Lab";
    case "admin":
    case "leadership":
      return "Enrolment and AI usage analytics";
    default:
      return "No screens configured for this role yet";
  }
}

export function HomeScreen() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hi, {user.fullName}</Text>
      <Text style={styles.role}>Role: {user.role}</Text>
      <Text style={styles.summary}>{roleSummary(user.role)}</Text>

      <Pressable style={styles.button} onPress={logout}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  greeting: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  role: { fontSize: 16, color: "#555", textAlign: "center", marginTop: 8 },
  summary: { fontSize: 14, color: "#888", textAlign: "center", marginTop: 16, marginBottom: 32 },
  button: {
    backgroundColor: "#1f9d55",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
