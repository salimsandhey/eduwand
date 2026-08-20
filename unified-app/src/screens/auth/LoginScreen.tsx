import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { lightColors, PRESSED_OPACITY, typography } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";
import { brandAssets } from "../../theme/brandAssets";

// Matches backend/prisma/seed.ts. Deliberately shown in every build,
// including production - this app's primary audience is front_desk/counsellor
// staff, so a one-tap login for those two roles is kept visible rather than
// gated behind __DEV__. Teacher is intentionally left off this list; that
// role isn't this app's focus.
const QUICK_LOGIN_ACCOUNTS = [
  { label: "Front desk", email: "frontdesk@dev.eduwand.local", initials: "FD" },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local", initials: "CO" },
];
const QUICK_LOGIN_PASSWORD = "password123";

interface Props {
  onStudentLogin: () => void;
}

export function LoginScreen({ onStudentLogin }: Props) {
  const { login, isLoading, error } = useAuth();
  // Fixed light palette, not useTheme() - this screen's background/curves/
  // illustration were already hardcoded light regardless of device theme, but
  // the text colors were still pulled from the theme. On a device in dark
  // mode (ThemeContext defaults to dark unless the OS explicitly reports
  // "light"), that put near-white text on a near-white background - the
  // "elements not visible" bug. Keeping the whole screen theme-independent
  // instead of only the background fixes it for good.
  const colors = lightColors;
  const pressedOpacity = PRESSED_OPACITY;
  // Pre-filled with the seeded dev teacher account (backend/prisma/seed.ts)
  // so testing the Lesson Studio flow doesn't require typing credentials
  // every time. Fine to leave in place - these are local dev-seed creds, not
  // a real account.
  const [email, setEmail] = useState("teacher@dev.eduwand.local");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
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
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introTranslate = useRef(new Animated.Value(22)).current;

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

  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(introOpacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.spring(introTranslate, {
        toValue: 0,
        tension: 90,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [introOpacity, introTranslate]);

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
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: colors.background }}>
      <View style={[styles.topGlow, { backgroundColor: colors.accent }]} />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: introOpacity, transform: [{ translateY: introTranslate }] }}>
          <View style={styles.simpleHeader}>
            <View style={styles.simpleHeaderTop}>
              {mode !== "login" ? (
                  <Pressable
                    onPress={backToLogin}
                    hitSlop={10}
                    style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Back to login"
                  >
                    <Ionicons name="arrow-back" size={19} color={colors.textPrimary} />
                  </Pressable>
                ) : (
                  <Image source={brandAssets.logo} style={styles.headerLogo} resizeMode="contain" />
                )}
              <Text style={[styles.simplePill, { color: colors.accent }]}>
                {mode === "login" ? "Staff access" : "Secure reset"}
              </Text>
            </View>
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>
              {mode === "login" ? "Welcome back" : "Reset password"}
            </Text>
            <Text style={[styles.subTitle, { color: colors.textMuted }]}>
              {mode === "login" && "Pick up leads, follow-ups, and admissions from one clean command center."}
              {mode === "forgot-request" && "Enter your account email and we'll send you a reset code."}
              {mode === "forgot-reset" && `Enter the code sent to ${resetEmail} and choose a new password.`}
            </Text>
          </View>

          {resetMessage && mode === "login" ? (
            <View style={[styles.successRow, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={[styles.successText, { color: colors.accent }]}>{resetMessage}</Text>
            </View>
          ) : null}

        {mode === "login" ? (
        <View style={[styles.formContainer, styles.authCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.formHeadingRow}>
            <View>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Staff login</Text>
              <Text style={[styles.formSubtitle, { color: colors.textMuted }]}>Use your school account credentials</Text>
            </View>
          </View>
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

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

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
        <View style={[styles.formContainer, styles.authCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
          <View style={[styles.formContainer, styles.authCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

        {/* Quick login section - shown in every build, see QUICK_LOGIN_ACCOUNTS comment */}
        {mode === "login" ? (
          <View style={[styles.devSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.devDividerRow}>
              <View style={[styles.devDividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.devDividerText, { color: colors.textMuted }]}>QUICK LOGIN</Text>
              <View style={[styles.devDividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.devList}>
              {QUICK_LOGIN_ACCOUNTS.map((acct) => (
                <Pressable
                  key={acct.email}
                  style={({ pressed }) => [
                    styles.devRow,
                    { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => {
                    setEmail(acct.email);
                    setPassword(QUICK_LOGIN_PASSWORD);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill credentials for ${acct.label}`}
                >
                  <View style={[styles.devAvatar, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
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
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  poppinsText: {
    fontFamily: typography.fontFamily,
  },
  container: { flexGrow: 1, padding: 20, paddingBottom: 34, position: "relative" },
  topGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -110,
    right: -72,
    opacity: 0.1,
  },
  simpleHeader: {
    marginBottom: 18,
    paddingTop: 8,
  },
  simpleHeaderTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerLogo: {
    width: 148,
    height: 42,
  },
  simplePill: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  mainTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  subTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
    fontWeight: "600",
    maxWidth: 320,
  },
  authCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 5,
  },
  formContainer: {
    marginBottom: 20,
  },
  formHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  formTitle: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 },
  formSubtitle: { fontFamily: typography.fontFamily, marginTop: 3, fontSize: 12, fontWeight: "600" },
  inputLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: typography.fontFamily,
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
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: "600",
  },
  saveButton: {
    borderRadius: 17,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: "900",
  },
  forgotPasswordText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 18,
  },
  devSection: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
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
    fontFamily: typography.fontFamily,
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
    borderRadius: 16,
    padding: 11,
    minHeight: 58,
  },
  devAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  devAvatarText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: "800",
  },
  devRowDetails: {
    flex: 1,
  },
  devRoleTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: "900",
  },
  devRoleEmail: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 1,
  },
});
