import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";

// First-run setup for individual-account teachers (accountType "individual")
// - reuses the same admin CRUD endpoints an institutional admin uses via
// admin-dashboard (authorizeForSchool grants the teacher admin rights on
// their own personal school), just with a mobile-native form instead. See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md. Individual accounts are capped at exactly 2 subjects, chosen
// here at onboarding.

type Props = NativeStackScreenProps<RootStackParamList, "CreateFirstClass">;

export function CreateFirstClassScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [className, setClassName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [subjectOne, setSubjectOne] = useState("");
  const [subjectTwo, setSubjectTwo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = className.trim() && sectionName.trim() && subjectOne.trim() && subjectTwo.trim() && subjectOne.trim() !== subjectTwo.trim();

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

      const classSection = await api.createClassSection(accessToken, user.schoolId, {
        academicYearId: currentYear.id,
        className: className.trim(),
        sectionName: sectionName.trim(),
      });

      await api.createSubject(accessToken, user.schoolId, { name: subjectOne.trim() });
      await api.createSubject(accessToken, user.schoolId, { name: subjectTwo.trim() });
      await api.assignTeacherToClassSection(accessToken, user.schoolId, classSection.id, user.id);

      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create your class");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Create your first class</Text>
        </View>

        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Set up a class and pick the 2 subjects you teach. You can request a subject change later from Credits &amp; Account.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Class name</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="e.g. Grade 5"
            placeholderTextColor={colors.textMuted}
            value={className}
            onChangeText={setClassName}
          />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Section</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="e.g. A"
            placeholderTextColor={colors.textMuted}
            value={sectionName}
            onChangeText={setSectionName}
          />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Subject 1</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="e.g. Mathematics"
            placeholderTextColor={colors.textMuted}
            value={subjectOne}
            onChangeText={setSubjectOne}
          />

          <Text style={[styles.label, { color: colors.textPrimary }]}>Subject 2</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="e.g. Science"
            placeholderTextColor={colors.textMuted}
            value={subjectTwo}
            onChangeText={setSubjectTwo}
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={!canSave || isSaving}
            style={[styles.saveButton, { backgroundColor: colors.accent }, (!canSave || isSaving) && { opacity: 0.5 }]}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Create class</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
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
