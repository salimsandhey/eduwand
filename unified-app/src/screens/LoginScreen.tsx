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
import { api } from "../api/client";

// Matches backend/prisma/seed.ts. Only roles that can actually sign into this
// mobile app (see AppNavigator's role routing) belong here - admin/leadership
// hit NoAccessScreen. Dev-only - stripped from production builds by __DEV__.
const DEV_ACCOUNTS = [
  { label: "Front desk", email: "frontdesk@dev.eduwand.local", initials: "FD" },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local", initials: "CO" },
  { label: "Teacher", email: "teacher@dev.eduwand.local", initials: "TE" },
];
const DEV_PASSWORD = "password123";

interface Props {
  onStudentLogin: () => void;
}

export function LoginScreen({ onStudentLogin }: Props) {
  const { login, isLoading, error } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Focus states
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Forgot password flow: request -> enter code + new password -> back to login
  const [mode, setMode] = useState<"login" | "forgot-request" | "forgot-reset">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [devResetOtp, setDevResetOtp] = useState<string | null>(null);

  async function handleRequestReset() {
    setIsResetLoading(true);
    setResetError(null);
    try {
      const result = await api.requestPasswordReset(resetEmail);
      setDevResetOtp(result.devOtp ?? null);
      setMode("forgot-reset");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setIsResetLoading(false);
    }
  }

  async function handleResetPassword() {
    setIsResetLoading(true);
    setResetError(null);
    try {
      await api.resetPassword(resetEmail, resetCode, newPassword);
      setResetMessage("Password updated. You can log in now.");
      setMode("login");
      setPassword("");
      setEmail(resetEmail);
      setResetCode("");
      setNewPassword("");
      setDevResetOtp(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setIsResetLoading(false);
    }
  }

  function backToLogin() {
    setMode("login");
    setResetError(null);
  }

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

  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: "#F9FAF9" }}>
      {/* Decorative Blobs */}
      <View style={[styles.topCurve, { backgroundColor: colors.accent }]} />
      <View style={[styles.bottomCurve, { backgroundColor: colors.accent }]} />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header Block */}
        <View style={styles.headerBlock}>
          <View style={styles.headerLeft}>
            {mode !== "login" ? (
              <Pressable onPress={backToLogin} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to login">
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </Pressable>
            ) : null}
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>
              {mode === "login" ? "Login" : "Reset Password"}
            </Text>
            <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
              {mode === "login" && "Welcome back! Please login to continue your learning journey."}
              {mode === "forgot-request" && "Enter your account email and we'll send you a reset code."}
              {mode === "forgot-reset" && `Enter the code sent to ${resetEmail} and choose a new password.`}
            </Text>
          </View>
          <View style={[styles.lockIllustrationContainer, { backgroundColor: colors.accent + "12" }]}>
            <View style={[styles.lockOuterRing, { borderColor: colors.accent + "20" }]}>
              <Ionicons name={mode === "login" ? "lock-closed" : "key"} size={32} color={colors.accent} />
            </View>
          </View>
        </View>

        {resetMessage && mode === "login" ? (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={[styles.successText, { color: colors.accent }]}>{resetMessage}</Text>
          </View>
        ) : null}

        {/* Inputs section */}
        {mode === "login" ? (
        <View style={styles.formContainer}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Email</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.surface,
                borderColor: emailFocused ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color={colors.accent} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Enter your email"
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

          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Password</Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: colors.surface,
                borderColor: passwordFocused ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={20} color={colors.accent} style={styles.inputIcon} />
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

          {/* Validation Error Message Row */}
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {/* Animated Log in button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => login(email, password)}
              disabled={isLoading}
              accessibilityRole="button"
              style={[
                styles.saveButton,
                { backgroundColor: colors.accent },
                (isLoading) && styles.buttonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Log in</Text>
              )}
            </Pressable>
          </Animated.View>

          <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setMode("forgot-request")}>
            <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>Forgot Password?</Text>
          </Pressable>

          <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={onStudentLogin}>
            <Text style={[styles.forgotPasswordText, { color: colors.textMuted, marginTop: 8 }]}>
              Are you a student? Login here
            </Text>
          </Pressable>
        </View>
        ) : null}

        {mode === "forgot-request" ? (
          <View style={styles.formContainer}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Email</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="mail-outline" size={20} color={colors.accent} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Enter your account email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={resetEmail}
                onChangeText={setResetEmail}
              />
            </View>

            {resetError ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{resetError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRequestReset}
              disabled={isResetLoading || !resetEmail}
              accessibilityRole="button"
              style={[styles.saveButton, { backgroundColor: colors.accent }, isResetLoading && styles.buttonDisabled]}
            >
              {isResetLoading ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Send reset code</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {mode === "forgot-reset" ? (
          <View style={styles.formContainer}>
            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Reset code</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="key-outline" size={20} color={colors.accent} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="6-digit code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={resetCode}
                onChangeText={setResetCode}
              />
            </View>

            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>New password</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.accent} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            {resetError ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{resetError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleResetPassword}
              disabled={isResetLoading || resetCode.length < 6 || newPassword.length < 8}
              accessibilityRole="button"
              style={[styles.saveButton, { backgroundColor: colors.accent }, isResetLoading && styles.buttonDisabled]}
            >
              {isResetLoading ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Update password</Text>
              )}
            </Pressable>

            {__DEV__ && devResetOtp ? (
              <Text style={[styles.devDividerText, { color: colors.textMuted, marginTop: 12 }]}>
                DEV ONLY - code is {devResetOtp}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Quick login section (DEV ONLY) */}
        {__DEV__ && mode === "login" ? (
          <View style={styles.devSection}>
            <View style={styles.devDividerRow}>
              <View style={[styles.devDividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.devDividerText, { color: colors.textMuted }]}>DEV ONLY - QUICK FILL</Text>
              <View style={[styles.devDividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.devList}>
              {DEV_ACCOUNTS.map((acct) => (
                <Pressable
                  key={acct.email}
                  style={({ pressed }) => [
                    styles.devRow,
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
                  <View style={[styles.devAvatar, { backgroundColor: colors.accent + "15" }]}>
                    <Text style={[styles.devAvatarText, { color: colors.accent }]}>{acct.initials}</Text>
                  </View>
                  <View style={styles.devRowDetails}>
                    <Text style={[styles.devRoleTitle, { color: colors.textPrimary }]}>{acct.label}</Text>
                    <Text style={[styles.devRoleEmail, { color: colors.textMuted }]}>{acct.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingBottom: 40, position: "relative" },
  topCurve: {
    position: "absolute",
    width: 200,
    height: 100,
    borderBottomLeftRadius: 100,
    top: 0,
    right: 0,
  },
  bottomCurve: {
    position: "absolute",
    width: 120,
    height: 90,
    borderTopRightRadius: 90,
    bottom: 0,
    left: 0,
  },
  headerBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
    marginBottom: 6,
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  successText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  lockIllustrationContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  lockOuterRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  formContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: "100%",
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
  eyeButton: {
    padding: 4,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  saveButton: {
    borderRadius: 24,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 18,
    textDecorationLine: "underline",
  },
  devSection: {
    marginTop: 20,
  },
  devDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  devDividerLine: {
    flex: 1,
    height: 1,
  },
  devDividerText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  devList: {
    gap: 8,
  },
  devRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    minHeight: 52,
  },
  devAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  devAvatarText: {
    fontSize: 11,
    fontWeight: "800",
  },
  devRowDetails: {
    flex: 1,
  },
  devRoleTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  devRoleEmail: {
    fontSize: 11,
    marginTop: 1,
  },
});
