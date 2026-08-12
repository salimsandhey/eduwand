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

// Matches backend/prisma/seed.ts. Only roles that can actually sign into this
// mobile app (see AppNavigator's role routing) belong here - admin/leadership
// hit NoAccessScreen. Dev-only - stripped from production builds by __DEV__.
const DEV_ACCOUNTS = [
  { label: "Front desk", email: "frontdesk@dev.eduwand.local", initials: "FD" },
  { label: "Counsellor", email: "counsellor@dev.eduwand.local", initials: "CO" },
  { label: "Teacher", email: "teacher@dev.eduwand.local", initials: "TE" },
];
const DEV_PASSWORD = "password123";

export function LoginScreen() {
  const { login, isLoading, error } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: "#F9FAF9" }}>
      {/* Decorative Blobs */}
      <View style={[styles.topCurve, { backgroundColor: colors.accent }]} />
      <View style={[styles.bottomCurve, { backgroundColor: colors.accent }]} />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header Block */}
        <View style={styles.headerBlock}>
          <View style={styles.headerLeft}>
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>Login</Text>
            <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
              Welcome back! Please login to continue your learning journey.
            </Text>
          </View>
          <View style={[styles.lockIllustrationContainer, { backgroundColor: colors.accent + "12" }]}>
            <View style={[styles.lockOuterRing, { borderColor: colors.accent + "20" }]}>
              <Ionicons name="lock-closed" size={32} color={colors.accent} />
            </View>
          </View>
        </View>

        {/* Inputs section */}
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

          <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>Forgot Password?</Text>
          </Pressable>
        </View>

        {/* Quick login section (DEV ONLY) */}
        {__DEV__ ? (
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
