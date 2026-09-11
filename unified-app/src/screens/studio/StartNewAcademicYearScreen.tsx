import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { DatePicker, parseISODate } from "../../components/DatePicker";
import { api, AcademicYear, ClassSection } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

// Manual, teacher-triggered rollover to a new academic year - never
// automatic (no institutional school auto-rolls either, see
// backend/src/worker.ts). Reuses the existing POST /schools/:id/academic-
// years endpoint's copyFromAcademicYearId, which now also carries the
// teacher's assignment forward onto the copied classes (previously
// dropped). See Docs/superpowers/plans/2026-09-09-individual-teacher-
// onboarding-and-credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "StartNewAcademicYear">;

function nextYearWindow(current: AcademicYear | null): { label: string; startDate: string; endDate: string } {
  const baseYear = current ? parseISODate(current.endDate).getFullYear() : new Date().getFullYear();
  return {
    label: `${baseYear}-${baseYear + 1}`,
    startDate: `${baseYear}-06-01`,
    endDate: `${baseYear + 1}-04-30`,
  };
}

export function StartNewAcademicYearScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);
  const [currentClasses, setCurrentClasses] = useState<ClassSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ label: string; carried: number } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [years, classes] = await Promise.all([api.listAcademicYears(accessToken), api.listClassSections(accessToken)]);
      const current = years.find((y) => y.isCurrent) ?? years[0] ?? null;
      setCurrentYear(current);
      setCurrentClasses(classes);
      const suggestion = nextYearWindow(current);
      setLabel(suggestion.label);
      setStartDate(suggestion.startDate);
      setEndDate(suggestion.endDate);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canSave = !!currentYear && label.trim() && startDate && endDate && parseISODate(endDate) > parseISODate(startDate);

  async function submit() {
    if (!accessToken || !user?.schoolId || !currentYear || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.startNewAcademicYear(accessToken, user.schoolId, {
        label: label.trim(),
        startDate,
        endDate,
        copyFromAcademicYearId: currentYear.id,
      });
      setSubmitted({ label: label.trim(), carried: currentClasses.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the new academic year");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>New academic year</Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : submitted ? (
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
              <Text style={[styles.submittedTitle, { color: colors.textPrimary }]}>{submitted.label} started</Text>
              <Text style={[styles.submittedText, { color: colors.textMuted }]}>
                {submitted.carried} class{submitted.carried === 1 ? "" : "es"} carried forward with your students and subjects intact.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {currentYear ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  Current session: <Text style={{ fontWeight: "700" }}>{currentYear.label}</Text>
                </Text>
              ) : null}

              <Text style={[styles.label, { color: colors.textPrimary }]}>Session label</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="e.g. 2027-2028"
                placeholderTextColor={colors.textMuted}
                value={label}
                onChangeText={setLabel}
              />

              <Text style={[styles.label, { color: colors.textPrimary }]}>Starts</Text>
              <DatePicker value={startDate} onChange={setStartDate} placeholder="Select start date" />

              <Text style={[styles.label, { color: colors.textPrimary }]}>Ends</Text>
              <DatePicker value={endDate} onChange={setEndDate} placeholder="Select end date" minimumDate={startDate ? parseISODate(startDate) : undefined} />

              <View style={[styles.noticeBox, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                <Text style={[styles.noticeText, { color: colors.textPrimary }]}>
                  Your {currentClasses.length} current class{currentClasses.length === 1 ? "" : "es"}
                  {currentClasses.length > 0 ? ` (${currentClasses.map((c) => `${capitalizeFirst(c.className)} ${capitalizeFirst(c.sectionName)}`).join(", ")})` : ""} will
                  be recreated in the new session, so you don't have to redo setup. This can't be undone from here.
                </Text>
              </View>

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Pressable
                onPress={submit}
                disabled={!canSave || isSaving}
                style={[styles.saveButton, { backgroundColor: colors.accent }, (!canSave || isSaving) && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Start new session</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  loader: {
    marginTop: 40,
  },
  centered: {
    marginTop: 60,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  submittedTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
  },
  submittedText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  hint: {
    fontSize: 13,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  noticeBox: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
