import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";

// Matches backend/prisma/seed.ts. Dev-only - stripped from production builds by __DEV__.
const DEV_ACCOUNTS = [
  { label: "Front desk", email: "frontdesk@dev.eduwand.local", icon: "people-outline" as const },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local", icon: "chatbubbles-outline" as const },
  { label: "Teacher", email: "teacher@dev.eduwand.local", icon: "school-outline" as const },
  { label: "Leadership", email: "leadership@dev.eduwand.local", icon: "trending-up-outline" as const },
  { label: "Admin", email: "admin@dev.eduwand.local", icon: "shield-checkmark-outline" as const },
  { label: "Admin (School 2)", email: "admin2@dev.eduwand.local", icon: "business-outline" as const },
];
const DEV_PASSWORD = "password123";

export function LoginScreen() {
  const { login, isLoading, error } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
        <Ionicons name="school" size={28} color={colors.accentOn} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>EduWand</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Welcome back!</Text>
      <Text style={[styles.tagline, { color: colors.textMuted }]}>Sign in to continue</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Email or phone</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
        placeholder="Enter email or phone"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[
            styles.input,
            styles.passwordInput,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary },
          ]}
          placeholder="Enter your password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
          <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <Pressable
        style={[styles.button, { backgroundColor: colors.accent }, isLoading && styles.buttonDisabled]}
        onPress={() => login(email, password)}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.accentOn} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.accentOn }]}>Log in</Text>
        )}
      </Pressable>

      <Text style={[styles.forgotPassword, { color: colors.accent }]}>Forgot password?</Text>

      {__DEV__ ? (
        <View style={[styles.devSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.devLabel, { color: colors.textMuted }]}>Quick login (dev only)</Text>
          <View style={styles.devButtonRow}>
            {DEV_ACCOUNTS.map((acct) => (
              <Pressable
                key={acct.email}
                style={[styles.devButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => {
                  setEmail(acct.email);
                  setPassword(DEV_PASSWORD);
                }}
              >
                <Ionicons name={acct.icon} size={16} color={colors.accent} />
                <Text style={[styles.devButtonText, { color: colors.textPrimary }]}>{acct.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} />
        <Text style={[styles.footerText, { color: colors.textMuted }]}>Secure login · Your data is protected</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 60, paddingBottom: 40 },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 8 },
  tagline: { fontSize: 13, textAlign: "center", marginTop: 2, marginBottom: 28 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  passwordRow: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: "absolute", right: 12 },
  button: {
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  error: { fontSize: 13, marginTop: 10, textAlign: "center" },
  forgotPassword: { fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: 16 },
  devSection: { marginTop: 32, borderTopWidth: 1, paddingTop: 20 },
  devLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center", marginBottom: 12 },
  devButtonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  devButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  devButtonText: { fontSize: 12, fontWeight: "600" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 28 },
  footerText: { fontSize: 11 },
});
