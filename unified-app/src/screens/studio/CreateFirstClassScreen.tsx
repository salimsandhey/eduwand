import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";

// First-run setup for individual-account teachers (accountType "individual")
// - reuses the same admin CRUD endpoints an institutional admin uses via
// admin-dashboard (authorizeForSchool grants the teacher admin rights on
// their own personal school), just with a mobile-native form instead.
// Classes and subjects are both fixed sets chosen once here, up to whatever
// limit is currently configured (GET /schools/:id/limits - admin-editable,
// default 2 each) - changing them later requires a change request, not a
// further edit here. See Docs/superpowers/plans/2026-09-09-individual-
// teacher-onboarding-and-credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "CreateFirstClass">;

interface ClassDraft {
  className: string;
  sectionName: string;
}

export function CreateFirstClassScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classLimit, setClassLimit] = useState(2);
  const [subjectLimit, setSubjectLimit] = useState(2);
  const [isLoadingLimits, setIsLoadingLimits] = useState(true);

  const [classes, setClasses] = useState<ClassDraft[]>([{ className: "", sectionName: "" }]);
  const [subjects, setSubjects] = useState<string[]>([""]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.schoolId) return;
    api
      .getSchoolLimits(accessToken, user.schoolId)
      .then((limits) => {
        setClassLimit(limits.classLimit);
        setSubjectLimit(limits.subjectLimit);
        setSubjects(Array.from({ length: Math.min(limits.subjectLimit, 2) }, () => ""));
      })
      .catch(() => {})
      .finally(() => setIsLoadingLimits(false));
  }, [accessToken, user?.schoolId]);

  function updateClass(index: number, field: keyof ClassDraft, value: string) {
    setClasses((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addClass() {
    if (classes.length >= classLimit) return;
    setClasses((prev) => [...prev, { className: "", sectionName: "" }]);
  }

  function removeClass(index: number) {
    if (classes.length <= 1) return;
    setClasses((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSubject(index: number, value: string) {
    setSubjects((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addSubject() {
    if (subjects.length >= subjectLimit) return;
    setSubjects((prev) => [...prev, ""]);
  }

  function removeSubject(index: number) {
    if (subjects.length <= 1) return;
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  }

  const trimmedSubjects = subjects.map((s) => s.trim()).filter(Boolean);
  const subjectsValid = trimmedSubjects.length === subjects.length && new Set(trimmedSubjects).size === trimmedSubjects.length;
  const classesValid = classes.every((c) => c.className.trim() && c.sectionName.trim());
  const canSave = classesValid && subjectsValid && trimmedSubjects.length > 0;

  async function save() {
    if (!accessToken || !user?.schoolId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const academicYears = await api.listAcademicYears(accessToken);
      const currentYear = academicYears.find((y) => y.isCurrent) ?? academicYears[0];
      if (!currentYear) {
        throw new Error("No academic year found for this workspace");
      }

      for (const subject of trimmedSubjects) {
        await api.createSubject(accessToken, user.schoolId, { name: subject });
      }

      for (const cls of classes) {
        const classSection = await api.createClassSection(accessToken, user.schoolId, {
          academicYearId: currentYear.id,
          className: cls.className.trim(),
          sectionName: cls.sectionName.trim(),
        });
        await api.assignTeacherToClassSection(accessToken, user.schoolId, classSection.id, user.id);
      }

      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create your class");
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Set up your classes</Text>
        </View>

        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Add up to {classLimit} class{classLimit === 1 ? "" : "es"} and {subjectLimit} subject{subjectLimit === 1 ? "" : "s"}. This is a one-time
          setup - changing them later needs a request reviewed by an admin.
        </Text>

        {isLoadingLimits ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Classes</Text>
              {classes.map((cls, index) => (
                <View key={index} style={index > 0 ? styles.entryDivider : undefined}>
                  <View style={styles.entryHeader}>
                    <Text style={[styles.label, { color: colors.textPrimary, marginTop: index === 0 ? 12 : 16 }]}>Class {index + 1}</Text>
                    {classes.length > 1 ? (
                      <Pressable onPress={() => removeClass(index)} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="e.g. Grade 5"
                    placeholderTextColor={colors.textMuted}
                    value={cls.className}
                    onChangeText={(v) => updateClass(index, "className", v)}
                  />
                  <Text style={[styles.label, { color: colors.textPrimary }]}>Section</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="e.g. A"
                    placeholderTextColor={colors.textMuted}
                    value={cls.sectionName}
                    onChangeText={(v) => updateClass(index, "sectionName", v)}
                  />
                </View>
              ))}
              {classes.length < classLimit ? (
                <Pressable onPress={addClass} style={styles.addRow} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                  <Text style={[styles.addRowText, { color: colors.accent }]}>Add another class</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Subjects</Text>
              {subjects.map((subject, index) => (
                <View key={index}>
                  <View style={styles.entryHeader}>
                    <Text style={[styles.label, { color: colors.textPrimary, marginTop: index === 0 ? 12 : 8 }]}>Subject {index + 1}</Text>
                    {subjects.length > 1 ? (
                      <Pressable onPress={() => removeSubject(index)} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="e.g. Mathematics"
                    placeholderTextColor={colors.textMuted}
                    value={subject}
                    onChangeText={(v) => updateSubject(index, v)}
                  />
                </View>
              ))}
              {subjects.length < subjectLimit ? (
                <Pressable onPress={addSubject} style={styles.addRow} accessibilityRole="button">
                  <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                  <Text style={[styles.addRowText, { color: colors.accent }]}>Add another subject</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Pressable
              onPress={save}
              disabled={!canSave || isSaving}
              style={[styles.saveButton, { backgroundColor: colors.accent }, (!canSave || isSaving) && { opacity: 0.5 }]}
              accessibilityRole="button"
            >
              {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Create classes</Text>}
            </Pressable>
          </>
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
  subtitle: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    ...softCardShadow,
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  entryDivider: {
    marginTop: 4,
    paddingTop: 4,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  addRowText: {
    fontSize: 13,
    fontWeight: "700",
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
