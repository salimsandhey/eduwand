import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";

// Matches backend/prisma/seed.ts. Dev-only - stripped from production builds by __DEV__.
// admin/leadership/platform_admin are deliberately not listed here - they belong on
// the web Admin Dashboard, not this app (see AppNavigator's NoAccessScreen routing).
const DEV_ACCOUNTS = [
  { label: "Front desk", email: "frontdesk@dev.eduwand.local", icon: "people-outline" as const },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local", icon: "chatbubbles-outline" as const },
  { label: "Teacher", email: "teacher@dev.eduwand.local", icon: "school-outline" as const },
];
const DEV_PASSWORD = "password123";

export function LoginScreen() {
  const { login, isLoading, error } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Focus states
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Button Scale Animation
  const buttonScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  // Logic to determine if fields are invalid (for red highlight borders)
  const hasError = !!error;

  return (
    <Screen edges={["top", "bottom"]}>
      {/* Background Decorative Glows */}
      <View style={[styles.glowLeft, { backgroundColor: colors.accent, opacity: 0.1 }]} />
      <View style={[styles.glowRight, { backgroundColor: colors.accent, opacity: 0.08 }]} />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header Section */}
        <View style={styles.header}>
          <View style={[styles.logoOuterRing, { borderColor: colors.border }]}>
            <View style={[styles.logoInnerRing, { borderColor: colors.accent + "30" }]}>
              <View style={[styles.logoCircle, { backgroundColor: colors.accent }, cardShadow]}>
                <Ionicons name="school" size={26} color={colors.accentOn} />
              </View>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>EduWand</Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>Sign in to continue your journey</Text>
        </View>

        {/* Card Form */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Welcome back!</Text>
          
          {/* Email / Phone Input */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Email or phone</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: hasError ? colors.danger : (emailFocused ? colors.accent : colors.border),
              },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={hasError ? colors.danger : (emailFocused ? colors.accent : colors.textMuted)} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Enter email or phone"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
            {email.length > 0 && (
              <Pressable onPress={() => setEmail("")} hitSlop={8} style={styles.clearButton}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Password Input */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: hasError ? colors.danger : (passwordFocused ? colors.accent : colors.border),
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={20} color={hasError ? colors.danger : (passwordFocused ? colors.accent : colors.textMuted)} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Enter your password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <Pressable
              style={({ pressed }) => [styles.eyeButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              accessibilityRole="button"
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {/* Options Row: Remember Me & Forgot Password */}
          <View style={styles.optionsRow}>
            <Pressable
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: rememberMe ? colors.accent : colors.border,
                    backgroundColor: rememberMe ? colors.accent : "transparent",
                  },
                ]}
              >
                {rememberMe && <Ionicons name="checkmark" size={10} color={colors.accentOn} />}
              </View>
              <Text style={[styles.rememberMeText, { color: colors.textSecondary }]}>Remember me</Text>
            </Pressable>
            
            <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>Forgot password?</Text>
            </Pressable>
          </View>

          {/* Animated Button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => login(email, password)}
              disabled={isLoading}
              accessibilityRole="button"
              style={[
                styles.button,
                { backgroundColor: colors.accent },
                (isLoading) && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.accentOn }]}>Log in</Text>
              )}
            </Pressable>
          </Animated.View>

        </View>

        {/* Quick login section (DEV ONLY) */}
        {__DEV__ ? (
          <View style={[styles.devSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.devLabel, { color: colors.textMuted }]}>Quick login (dev only)</Text>
            <View style={styles.devButtonGrid}>
              {DEV_ACCOUNTS.map((acct) => (
                <Pressable
                  key={acct.email}
                  style={({ pressed }) => [
                    styles.devChip,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => {
                    setEmail(acct.email);
                    setPassword(DEV_PASSWORD);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill credentials for ${acct.label}`}
                >
                  <View style={[styles.devChipIconContainer, { backgroundColor: colors.surfaceRaised }]}>
                    <Ionicons name={acct.icon} size={14} color={colors.accent} />
                  </View>
                  <Text style={[styles.devChipText, { color: colors.textPrimary }]} numberOfLines={1}>
                    {acct.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.footerText, { color: colors.textMuted }]}>Secure login · Your data is protected</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 20, paddingBottom: 40 },
  glowLeft: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    top: -80,
    left: -80,
  },
  glowRight: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -50,
    right: -70,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  logoOuterRing: {
    padding: 6,
    borderRadius: 42,
    borderWidth: 1,
    marginBottom: 12,
  },
  logoInnerRing: {
    padding: 4,
    borderRadius: 36,
    borderWidth: 1.5,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: -0.5 },
  tagline: { fontSize: 13, textAlign: "center", marginTop: 4 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 15,
    height: "100%",
    paddingVertical: 0,
  },
  clearButton: { padding: 4 },
  eyeButton: { padding: 4 },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 4,
  },
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberMeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    borderRadius: 10,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: "700" },
  error: { fontSize: 13, marginTop: 10, textAlign: "center" },

  devSection: { marginTop: 24, borderTopWidth: 1, paddingTop: 20 },
  devLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center", marginBottom: 12 },
  devButtonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  devChip: {
    flexDirection: "row",
    alignItems: "center",
    width: "48%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 38,
    gap: 8,
  },
  devChipIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  devChipText: { fontSize: 11, fontWeight: "600", flex: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 28 },
  footerText: { fontSize: 11 },
});
