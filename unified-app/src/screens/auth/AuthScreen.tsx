import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StudentOtpMatch, api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { getCardShadow, lightColors, PRESSED_OPACITY, typography } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { brandAssets } from "../../theme/brandAssets";
import { BlinkingMascot } from "../../components/BlinkingMascot";

type AuthTab = "staff" | "student";
type StaffMode = "login" | "forgot-request" | "forgot-reset";
type StudentStep = "phone" | "code" | "select";

const STUDENT_STEP_ORDER: StudentStep[] = ["phone", "code", "select"];
const CODE_LENGTH = 6;
const STUDENT_STEP_COPY: Record<StudentStep, { title: string; description: string }> = {
  phone: {
    title: "Student login",
    description: "Use your guardian's registered phone number to continue.",
  },
  code: {
    title: "Enter your code",
    description: "We sent a 6-digit verification code to your phone.",
  },
  select: {
    title: "Who's learning?",
    description: "Choose the student account you want to open.",
  },
};

const DEV_QUICK_LOGIN_ACCOUNTS = [
  { label: "Teacher", email: "teacher1@eduwand.com", password: "ZqpM5IMiUXvY", icon: "school-outline" as const },
  { label: "Front Desk", email: "front@eduwand.com", password: "O2d_Z3sb7uvk", icon: "call-outline" as const },
];

export function AuthScreen() {
  const { login, isLoading, error, requestStudentOtp, verifyStudentOtp, selectStudent } = useAuth();
  const colors = lightColors;
  const pressedOpacity = PRESSED_OPACITY;
  const cardShadow = getCardShadow("light");

  const [authTab, setAuthTab] = useState<AuthTab>("staff");
  const [toggleWidth, setToggleWidth] = useState(0);
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introTranslate = useRef(new Animated.Value(22)).current;
  const formOpacity = useRef(new Animated.Value(1)).current;
  const formTranslate = useRef(new Animated.Value(0)).current;

  // Staff login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [staffMode, setStaffMode] = useState<StaffMode>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [devResetOtp, setDevResetOtp] = useState<string | null>(null);

  // Student login state
  const [studentStep, setStudentStep] = useState<StudentStep>("phone");
  const [phone, setPhone] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<StudentOtpMatch[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputs = useRef<Array<TextInput | null>>([]);

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

  function switchAuthTab(target: AuthTab) {
    if (target === authTab) return;
    const exitOffset = target === "student" ? -24 : 24;
    const enterOffset = target === "student" ? 24 : -24;

    Animated.timing(toggleAnim, { toValue: target === "student" ? 1 : 0, duration: 260, useNativeDriver: true }).start();

    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(formTranslate, { toValue: exitOffset, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setAuthTab(target);
      formTranslate.setValue(enterOffset);
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(formTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }

  function goToStudentLogin() {
    switchAuthTab("student");
  }

  function goToStaffLogin() {
    switchAuthTab("staff");
  }

  const handlePressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, tension: 100, friction: 6 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }).start();
  };

  function renderAuthToggle() {
    const indicatorWidth = (toggleWidth - 10) / 2;
    return (
      <View
        style={[styles.authToggle, { backgroundColor: colors.surfaceAccent }]}
        onLayout={(e) => setToggleWidth(e.nativeEvent.layout.width)}
      >
        {toggleWidth > 0 ? (
          <Animated.View
            style={[
              styles.authToggleIndicator,
              {
                backgroundColor: colors.surface,
                width: indicatorWidth,
                transform: [
                  {
                    translateX: toggleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, indicatorWidth],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        <Pressable
          style={styles.authToggleOption}
          onPress={authTab === "student" ? goToStaffLogin : undefined}
          disabled={authTab === "staff"}
          accessibilityRole="button"
        >
          <Text style={authTab === "staff" ? [styles.authToggleActiveText, { color: colors.accent }] : [styles.authToggleText, { color: colors.textMuted }]}>
            Login
          </Text>
        </Pressable>
        <Pressable
          style={styles.authToggleOption}
          onPress={authTab === "staff" ? goToStudentLogin : undefined}
          disabled={authTab === "student"}
          accessibilityRole="button"
        >
          <Text style={authTab === "student" ? [styles.authToggleActiveText, { color: colors.accent }] : [styles.authToggleText, { color: colors.textMuted }]}>
            Student login
          </Text>
        </Pressable>
      </View>
    );
  }

  // --- Staff login handlers ---

  async function handleRequestReset() {
    setIsResetLoading(true);
    setResetError(null);
    try {
      const result = await api.requestPasswordReset(resetEmail);
      setDevResetOtp(result.devOtp ?? null);
      setStaffMode("forgot-reset");
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
      setStaffMode("login");
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
    setStaffMode("login");
    setResetError(null);
  }

  function handleQuickLogin(accountEmail: string, accountPassword: string) {
    setEmail(accountEmail);
    setPassword(accountPassword);
    login(accountEmail, accountPassword);
  }

  // --- Student login handlers ---

  function startResendCooldown() {
    setResendCooldown(30);
    const timer = setInterval(() => {
      setResendCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  async function handleRequestOtp() {
    const code = await requestStudentOtp(phone);
    setDevOtp(code ?? null);
    setDigits(Array(CODE_LENGTH).fill(""));
    setStudentStep("code");
    startResendCooldown();
    setTimeout(() => codeInputs.current[0]?.focus(), 250);
  }

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, "");
    const next = [...digits];
    next[index] = clean ? clean[clean.length - 1] : "";
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) codeInputs.current[index + 1]?.focus();
  }

  function handleDigitKeyPress(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) codeInputs.current[index - 1]?.focus();
  }

  async function handleVerifyOtp() {
    const { students, selectionToken } = await verifyStudentOtp(phone, digits.join(""));
    if (students.length === 1) {
      await selectStudent(students[0].id, selectionToken);
      return;
    }
    setCandidates(students);
    setStudentStep("select");
  }

  const codeComplete = digits.every(Boolean);
  const studentStepIndex = STUDENT_STEP_ORDER.indexOf(studentStep);
  const studentCopy = STUDENT_STEP_COPY[studentStep];

  const footerButton =
    authTab === "staff" && staffMode === "login"
      ? { label: "Continue", onPress: () => login(email, password), disabled: false }
      : authTab === "student" && studentStep === "phone"
      ? { label: "Send code", onPress: handleRequestOtp, disabled: !phone }
      : authTab === "student" && studentStep === "code"
      ? { label: "Verify and continue", onPress: handleVerifyOtp, disabled: !codeComplete }
      : null;

  const isLandingState = (authTab === "staff" && staffMode === "login") || (authTab === "student" && studentStep === "phone");
  const showToggle = !(authTab === "staff" && staffMode !== "login");

  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.container}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: introOpacity, transform: [{ translateY: introTranslate }] }}>
            <View style={styles.simpleHeader}>
              {isLandingState ? (
                <View style={styles.loginHero}>
                  <Image source={brandAssets.logo} style={styles.loginLogo} resizeMode="contain" />
                  <BlinkingMascot style={styles.loginArtworkSmall} />
                </View>
              ) : authTab === "staff" ? (
                <View style={styles.simpleHeaderTop}>
                  <Pressable
                    onPress={backToLogin}
                    hitSlop={10}
                    style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Back to login"
                  >
                    <Ionicons name="arrow-back" size={19} color={colors.textPrimary} />
                  </Pressable>
                  <Text style={[styles.simplePill, { color: colors.accent }]}>Secure reset</Text>
                </View>
              ) : (
                <View style={styles.hero}>
                  <Image source={brandAssets.logo} style={styles.logo} resizeMode="contain" />
                </View>
              )}
              <Text style={[styles.mainTitle, isLandingState && styles.loginTitleSmall, { color: colors.textPrimary }]}>
                {isLandingState ? "Welcome back" : authTab === "staff" ? "Reset password" : studentCopy.title}
              </Text>
              <Text style={[styles.subTitle, isLandingState && styles.loginSubtitle, { color: colors.textMuted }]}>
                {isLandingState
                  ? "Sign in to continue to your school workspace."
                  : authTab === "staff"
                  ? staffMode === "forgot-request"
                    ? "Enter your account email and we'll send you a reset code."
                    : `Enter the code sent to ${resetEmail} and choose a new password.`
                  : studentStep === "code"
                  ? `We sent a 6-digit verification code to ${phone}.`
                  : studentCopy.description}
              </Text>
            </View>

            {resetMessage && isLandingState && authTab === "staff" ? (
              <View style={[styles.successRow, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                <Text style={[styles.successText, { color: colors.accent }]}>{resetMessage}</Text>
              </View>
            ) : null}

            {showToggle ? renderAuthToggle() : null}

            {authTab === "student" ? (
              <View style={styles.progressRow} accessibilityLabel={`Step ${studentStepIndex + 1} of 3`}>
                {STUDENT_STEP_ORDER.map((item, index) => (
                  <View key={item} style={[styles.progressSegment, { backgroundColor: index <= studentStepIndex ? colors.accent : colors.border }]} />
                ))}
              </View>
            ) : null}

            <Animated.View style={{ opacity: formOpacity, transform: [{ translateX: formTranslate }] }}>
              {authTab === "staff" ? (
                <>
                  {staffMode === "login" ? (
                    <View style={styles.loginFormContainer}>
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
                        <TextInput
                          style={[styles.input, { color: colors.textPrimary }]}
                          placeholder="you@schoolname.com"
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
                        <TextInput
                          style={[styles.input, { color: colors.textPrimary }]}
                          placeholder="Password 1234"
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

                      <Pressable hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => setStaffMode("forgot-request")} style={styles.forgotPasswordButton}>
                        <Text style={[styles.forgotPasswordText, { color: colors.accent }]}>Forgot password?</Text>
                      </Pressable>

                      {error ? (
                        <View style={styles.errorRow}>
                          <Ionicons name="alert-circle" size={16} color={colors.danger} />
                          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                        </View>
                      ) : null}

                      {__DEV__ ? (
                        <View style={styles.quickLoginSection}>
                          <View style={styles.quickLoginHeaderRow}>
                            <View style={[styles.quickLoginDivider, { backgroundColor: colors.border }]} />
                            <Text style={[styles.quickLoginLabel, { color: colors.textMuted }]}>Quick login · dev only</Text>
                            <View style={[styles.quickLoginDivider, { backgroundColor: colors.border }]} />
                          </View>
                          <View style={styles.quickLoginGrid}>
                            {DEV_QUICK_LOGIN_ACCOUNTS.map((account) => (
                              <Pressable
                                key={account.email}
                                onPress={() => handleQuickLogin(account.email, account.password)}
                                disabled={isLoading}
                                style={({ pressed }) => [
                                  styles.quickLoginCard,
                                  { backgroundColor: colors.surface, borderColor: colors.border },
                                  cardShadow,
                                  pressed && { opacity: pressedOpacity },
                                ]}
                                accessibilityRole="button"
                              >
                                <View style={[styles.quickLoginIcon, { backgroundColor: colors.accentSoft }]}>
                                  <Ionicons name={account.icon} size={18} color={colors.accent} />
                                </View>
                                <Text style={[styles.quickLoginTitle, { color: colors.textPrimary }]}>{account.label}</Text>
                                <Text style={[styles.quickLoginEmail, { color: colors.textMuted }]} numberOfLines={1}>
                                  {account.email}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {staffMode === "forgot-request" ? (
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

                  {staffMode === "forgot-reset" ? (
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
                </>
              ) : (
                <>
                  {studentStep === "phone" ? (
                    <View style={styles.form}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Phone number</Text>
                      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="call-outline" size={20} color={colors.accent} style={styles.inputIcon} />
                        <TextInput
                          style={[styles.input, { color: colors.textPrimary }]}
                          placeholder="+91XXXXXXXXXX"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="phone-pad"
                          value={phone}
                          onChangeText={setPhone}
                        />
                        {phone ? <Pressable onPress={() => setPhone("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
                      </View>

                      <ErrorMessage message={error} />
                    </View>
                  ) : null}

                  {studentStep === "code" ? (
                    <View style={styles.form}>
                      <View style={styles.codeRow}>
                        {digits.map((digit, index) => (
                          <TextInput
                            key={index}
                            ref={(ref) => { codeInputs.current[index] = ref; }}
                            style={[styles.codeBox, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: digit ? colors.accent : colors.border }]}
                            keyboardType="number-pad"
                            maxLength={1}
                            value={digit}
                            onChangeText={(value) => handleDigitChange(index, value)}
                            onKeyPress={({ nativeEvent }) => handleDigitKeyPress(index, nativeEvent.key)}
                          />
                        ))}
                      </View>
                      <ErrorMessage message={error} />
                      <Pressable onPress={handleRequestOtp} disabled={resendCooldown > 0} hitSlop={8} style={styles.resendButton}>
                        <Text style={[styles.resendText, { color: resendCooldown ? colors.textMuted : colors.accent }]}>{resendCooldown ? `Resend code in ${resendCooldown}s` : "Resend code"}</Text>
                      </Pressable>
                      {__DEV__ && devOtp ? <Pressable onPress={() => setDigits(devOtp.split(""))} style={[styles.devChip, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}><Ionicons name="flask-outline" size={14} color={colors.accent} /><Text style={[styles.devChipText, { color: colors.accent }]}>DEV code: {devOtp}. Tap to fill.</Text></Pressable> : null}
                    </View>
                  ) : null}

                  {studentStep === "select" ? (
                    <View style={styles.form}>
                      {candidates.map((student) => (
                        <Pressable key={student.id} onPress={() => selectStudent(student.id)} disabled={isLoading} style={({ pressed }) => [styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: PRESSED_OPACITY }]}>
                          <View style={[styles.studentAvatar, { backgroundColor: colors.accentSoft }]}><Text style={[styles.studentAvatarText, { color: colors.accent }]}>{student.fullName.slice(0, 1).toUpperCase()}</Text></View>
                          <Text style={[styles.studentName, { color: colors.textPrimary }]}>{student.fullName}</Text>
                          <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                        </Pressable>
                      ))}
                      {isLoading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
                    </View>
                  ) : null}
                </>
              )}
            </Animated.View>
          </Animated.View>
        </ScrollView>

        {footerButton ? (
          <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={footerButton.onPress}
                disabled={isLoading || footerButton.disabled}
                accessibilityRole="button"
                style={[
                  styles.saveButton,
                  styles.stickyFooterButton,
                  { backgroundColor: colors.accent },
                  (isLoading || footerButton.disabled) && styles.buttonDisabled,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.accentOn} />
                ) : (
                  <View style={styles.continueLabel}><Text style={[styles.saveButtonText, { color: colors.accentOn }]}>{footerButton.label}</Text><Ionicons name="arrow-forward" size={20} color={colors.accentOn} /></View>
                )}
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <View style={styles.errorRow}><Ionicons name="alert-circle" size={16} color={lightColors.danger} /><Text style={[styles.errorText, { color: lightColors.danger }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1 },
  scrollArea: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 34 },
  stickyFooter: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stickyFooterButton: { marginTop: 0 },
  simpleHeader: {
    marginBottom: 22,
  },
  simpleHeaderTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  loginHero: {
    alignItems: "center",
    marginBottom: 16,
  },
  loginLogo: {
    width: 132,
    height: 40,
  },
  loginArtworkSmall: {
    width: 150,
    height: 108,
    marginTop: 8,
  },
  simplePill: {
    fontFamily: typography.bold,
    fontSize: 11,
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
    fontFamily: typography.bold,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.7,
  },
  loginTitleSmall: {
    textAlign: "center",
    fontSize: 22,
    lineHeight: 27,
  },
  subTitle: {
    fontFamily: typography.semiBold,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 320,
  },
  loginSubtitle: {
    maxWidth: undefined,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
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
  loginFormContainer: {
    marginBottom: 20,
  },
  authToggle: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    padding: 5,
    marginBottom: 14,
  },
  authToggleIndicator: {
    position: "absolute",
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: 24,
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  authToggleActiveText: { fontFamily: typography.bold, fontSize: 14 },
  authToggleOption: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  authToggleText: { fontFamily: typography.semiBold, fontSize: 14 },
  inputLabel: {
    fontFamily: typography.semiBold,
    fontSize: 13,
    marginBottom: 7,
    marginTop: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 15,
    height: 58,
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
    flex: 1,
    fontFamily: typography.semiBold,
    fontSize: 12,
  },
  saveButton: {
    borderRadius: 14,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
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
    fontFamily: typography.bold,
    fontSize: 15,
  },
  continueLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  forgotPasswordButton: { alignSelf: "flex-end", marginTop: 12 },
  forgotPasswordText: {
    fontFamily: typography.semiBold,
    fontSize: 13,
    textAlign: "center",
    marginTop: 0,
  },
  devDividerText: {
    fontFamily: typography.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  quickLoginSection: {
    marginTop: 28,
    gap: 14,
  },
  quickLoginHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickLoginDivider: {
    flex: 1,
    height: 1,
  },
  quickLoginLabel: {
    fontFamily: typography.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  quickLoginGrid: {
    flexDirection: "row",
    gap: 12,
  },
  quickLoginCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
    alignItems: "flex-start",
  },
  quickLoginIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  quickLoginTitle: {
    fontFamily: typography.bold,
    fontSize: 14,
  },
  quickLoginEmail: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
  hero: { alignItems: "center", justifyContent: "center", minHeight: 42 },
  logo: { width: 118, height: 36 },
  artwork: { alignSelf: "center", width: 230, height: 156, marginTop: 12, marginBottom: 4 },
  heading: { marginTop: 26, marginBottom: 18 },
  title: { fontFamily: typography.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.7, textAlign: "center" },
  description: { fontFamily: typography.semiBold, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 6 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  form: { marginTop: 14 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  codeBox: { flex: 1, maxWidth: 48, height: 58, borderRadius: 13, borderWidth: 1.5, textAlign: "center", fontFamily: typography.bold, fontSize: 20 },
  resendButton: { alignSelf: "center", marginTop: 16 },
  resendText: { fontFamily: typography.semiBold, fontSize: 13 },
  devChip: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  devChipText: { fontFamily: typography.semiBold, fontSize: 11 },
  studentRow: { minHeight: 76, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, marginBottom: 10 },
  studentAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginRight: 12 },
  studentAvatarText: { fontFamily: typography.bold, fontSize: 17 },
  studentName: { flex: 1, fontFamily: typography.semiBold, fontSize: 15 },
  loading: { marginTop: 12 },
});
