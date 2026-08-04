import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useAuth } from "../context/AuthContext";

// Matches backend/prisma/seed.ts. Dev-only - stripped from production builds by __DEV__.
const DEV_ACCOUNTS = [
  { label: "Admin (Dev School)", email: "admin@dev.eduwand.local" },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local" },
  { label: "Front desk", email: "frontdesk@dev.eduwand.local" },
  { label: "Teacher", email: "teacher@dev.eduwand.local" },
  { label: "Leadership (trust-scoped)", email: "leadership@dev.eduwand.local" },
  { label: "Admin (Dev School 2)", email: "admin2@dev.eduwand.local" },
];
const DEV_PASSWORD = "password123";

export function LoginScreen() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>EduWand</Text>

      <TextInput
        style={styles.input}
        placeholder="Email or phone"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={() => login(email, password)}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
      </Pressable>

      <Text style={styles.forgotPassword}>Forgot password?</Text>

      {__DEV__ ? (
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>Dev quick-fill (fills the fields above, then press Log in)</Text>
          <View style={styles.devButtonRow}>
            {DEV_ACCOUNTS.map((acct) => (
              <Pressable
                key={acct.email}
                style={styles.devButton}
                onPress={() => {
                  setEmail(acct.email);
                  setPassword(DEV_PASSWORD);
                }}
              >
                <Text style={styles.devButtonText}>{acct.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 32, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#1f9d55",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#c0392b", marginBottom: 8, textAlign: "center" },
  forgotPassword: { color: "#1f9d55", textAlign: "center", marginTop: 20 },
  devSection: { marginTop: 40, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 20 },
  devLabel: { fontSize: 12, color: "#888", textAlign: "center", marginBottom: 12 },
  devButtonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  devButton: {
    borderWidth: 1,
    borderColor: "#1f9d55",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  devButtonText: { color: "#1f9d55", fontSize: 12, fontWeight: "600" },
});
