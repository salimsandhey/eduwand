import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { StudentOtpMatch } from "../api/client";

type Step = "phone" | "code" | "select";

const STEP_ORDER: Step[] = ["phone", "code", "select"];
const CODE_LENGTH = 6;

const STEP_ICON: Record<Step, keyof typeof Ionicons.glyphMap> = {
  phone: "call",
  code: "key",
  select: "people",
};

const STEP_TITLE: Record<Step, string> = {
  phone: "Student Login",
  code: "Enter Code",
  select: "Who's Learning?",
};

interface Props {
  onBackToStaffLogin: () => void;
}

export function StudentLoginScreen({ onBackToStaffLogin }: Props) {
  const { requestStudentOtp, verifyStudentOtp, selectStudent, isLoading, error } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<StudentOtpMatch[]>([]);
  const [resendCooldown, setResendCooldown] = useState(0);

  const codeInputs = useRef<Array<TextInput | null>>([]);
  const buttonScale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true, tension: 100, friction: 6 }).start();
  }
  function pressOut() {
    Animated.spring(buttonScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }).start();
  }

  function startResendCooldown() {
    setResendCooldown(30);
    const timer = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function handleRequestOtp() {
    const code = await requestStudentOtp(phone);
    setDevOtp(code ?? null);
    setDigits(Array(CODE_LENGTH).fill(""));
    setStep("code");
    startResendCooldown();
    setTimeout(() => codeInputs.current[0]?.focus(), 250);
  }

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/[^0-9]/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    next[index] = clean[clean.length - 1];
    setDigits(next);
    if (index < CODE_LENGTH - 1) {
      codeInputs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyPress(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      codeInputs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyOtp() {
    const code = digits.join("");
    const students = await verifyStudentOtp(phone, code);
    if (students.length === 1) {
      await selectStudent(students[0].id);
      return;
    }
    setCandidates(students);
    setStep("select");
  }

  function goBack() {
    if (step === "phone") {
      onBackToStaffLogin();
      return;
    }
    if (step === "code") {
      setStep("phone");
      return;
    }
    setStep("code");
  }

  const codeComplete = digits.every((d) => d.length === 1);
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: "#F9FAF9" }}>
      <View style={[styles.topCurve, { backgroundColor: colors.accent }]} />
      <View style={[styles.bottomCurve, { backgroundColor: colors.accent }]} />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerBlock}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.mainTitle, { color: colors.textPrimary }]}>{STEP_TITLE[step]}</Text>
            <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
              {step === "phone" && "Enter your guardian's registered phone number to get started."}
              {step === "code" && `We sent a 6-digit code to ${phone}.`}
              {step === "select" && "More than one student is linked to this number. Pick one."}
            </Text>
          </View>
          <Animated.View
            style={[
              styles.iconIllustrationContainer,
              { backgroundColor: colors.accent + "12" },
              step === "code" && { transform: [{ scale: 1 }] },
            ]}
          >
            <View style={[styles.iconOuterRing, { borderColor: colors.accent + "20" }]}>
              <Ionicons name={STEP_ICON[step]} size={30} color={colors.accent} />
            </View>
          </Animated.View>
        </View>

        {/* Step progress dots */}
        <View style={styles.progressRow}>
          {STEP_ORDER.map((s, i) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                {
                  backgroundColor: i <= stepIndex ? colors.accent : colors.border,
                  width: i === stepIndex ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>

        {step === "phone" ? (
          <View style={styles.formContainer}>
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
                autoFocus
              />
              {phone.length > 0 && (
                <Pressable onPress={() => setPhone("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            ) : null}

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <Pressable
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={handleRequestOtp}
                disabled={isLoading || !phone}
                accessibilityRole="button"
                style={[styles.saveButton, { backgroundColor: colors.accent }, (isLoading || !phone) && styles.buttonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.accentOn} />
                ) : (
                  <>
                    <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Send code</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.accentOn} />
                  </>
                )}
              </Pressable>
            </Animated.View>
          </View>
        ) : null}

        {step === "code" ? (
          <View style={styles.formContainer}>
            <View style={styles.codeRow}>
              {digits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => {
                    codeInputs.current[i] = ref;
                  }}
                  style={[
                    styles.codeBox,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.surface,
                      borderColor: digit ? colors.accent : colors.border,
                    },
                  ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(v) => handleDigitChange(i, v)}
                  onKeyPress={({ nativeEvent }) => handleDigitKeyPress(i, nativeEvent.key)}
                />
              ))}
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            ) : null}

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <Pressable
                onPressIn={pressIn}
                onPressOut={pressOut}
                onPress={handleVerifyOtp}
                disabled={isLoading || !codeComplete}
                accessibilityRole="button"
                style={[styles.saveButton, { backgroundColor: colors.accent }, (isLoading || !codeComplete) && styles.buttonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.accentOn} />
                ) : (
                  <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Verify & continue</Text>
                )}
              </Pressable>
            </Animated.View>

            <Pressable
              onPress={handleRequestOtp}
              disabled={resendCooldown > 0}
              hitSlop={8}
              style={{ marginTop: 4 }}
            >
              <Text style={[styles.linkText, { color: resendCooldown > 0 ? colors.textMuted : colors.accent }]}>
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
              </Text>
            </Pressable>

            {__DEV__ && devOtp ? (
              <Pressable
                onPress={() => setDigits(devOtp.split(""))}
                style={[styles.devChip, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "30" }]}
              >
                <Ionicons name="flask-outline" size={14} color={colors.accent} />
                <Text style={[styles.devChipText, { color: colors.accent }]}>DEV code: {devOtp} · tap to fill</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step === "select" ? (
          <View style={styles.formContainer}>
            {candidates.map((student) => (
              <Pressable
                key={student.id}
                onPress={() => selectStudent(student.id)}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.studentRow,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  pressed && { opacity: pressedOpacity },
                ]}
              >
                <View style={[styles.studentAvatar, { backgroundColor: colors.accent + "15" }]}>
                  <Text style={[styles.studentAvatarText, { color: colors.accent }]}>
                    {student.fullName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.studentName, { color: colors.textPrimary }]}>{student.fullName}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
            {isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingBottom: 40, position: "relative" },
  topCurve: { position: "absolute", width: 200, height: 100, borderBottomLeftRadius: 100, top: 0, right: 0 },
  bottomCurve: { position: "absolute", width: 120, height: 90, borderTopRightRadius: 90, bottom: 0, left: 0 },
  headerBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  headerLeft: { flex: 1, paddingRight: 12 },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginLeft: -6, marginBottom: 6 },
  mainTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subTitle: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  iconIllustrationContainer: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  iconOuterRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  progressRow: { flexDirection: "row", gap: 6, marginBottom: 24 },
  progressDot: { height: 8, borderRadius: 4 },

  formContainer: { marginBottom: 20, gap: 10 },
  inputLabel: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, height: 48 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, height: "100%", paddingVertical: 0 },

  codeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  codeBox: {
    width: 44,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
  },

  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
    height: 48,
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
  linkText: { fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 4 },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  errorText: { fontSize: 12, fontWeight: "600" },

  devChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  devChipText: { fontSize: 11, fontWeight: "700" },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  studentAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  studentAvatarText: { fontSize: 16, fontWeight: "800" },
  studentName: { fontSize: 15, fontWeight: "700", flex: 1 },
});
