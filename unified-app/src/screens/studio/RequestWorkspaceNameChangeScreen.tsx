import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, SchoolSummary } from "../../api/client";
import { FieldError } from "../../components/FieldError";
import { useFormErrors } from "../../hooks/useForm";
import { rules } from "../../utils/validation";

// Submits a workspace (School.name) change request - same request/approval-
// only pattern as RequestClassChangeScreen/RequestSubjectChangeScreen: the
// name appears on branded PDFs/emails/reports, so a change goes through a
// platform admin rather than a self-service edit.

type Props = NativeStackScreenProps<RootStackParamList, "RequestWorkspaceNameChange">;

export function RequestWorkspaceNameChangeScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [requestedName, setRequestedName] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.getMySchool(accessToken).then(setSchool).catch(() => {});
  }, [accessToken]);

  // Rules mirror backend/src/lib/validation.ts; field names match the API's.
  const v = useFormErrors(
    { requestedName, note },
    {
      requestedName: (value) =>
        rules.label("Workspace name", true, 120)(value) ??
        (value.trim().toLowerCase() === (school?.name ?? "").trim().toLowerCase() ? "That is already your workspace name" : null),
      note: rules.note("Note", false, 500),
    }
  );

  async function submit() {
    if (!accessToken || !user?.schoolId) return;
    if (!v.submit()) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.requestSchoolNameChange(accessToken, user.schoolId, {
        requestedName: requestedName.trim(),
        note: note.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      if (!v.applyServerError(err)) setError(err instanceof Error ? err.message : "Failed to submit request");
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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Request workspace name change</Text>
          </View>

          {submitted ? (
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
              <Text style={[styles.submittedTitle, { color: colors.textPrimary }]}>Request submitted</Text>
              <Text style={[styles.submittedText, { color: colors.textMuted }]}>
                A platform admin will review this request. Your workspace name will update everywhere - including
                branded PDFs and emails - once it's approved.
              </Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {school ? (
                <View style={[styles.currentNameRow, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.currentNameLabel, { color: colors.textMuted }]}>Current name</Text>
                  <Text style={[styles.currentNameValue, { color: colors.textPrimary }]}>{school.name}</Text>
                </View>
              ) : null}

              <Text style={[styles.label, { color: colors.textPrimary }]}>New workspace name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: v.error("requestedName") ? colors.danger : colors.border }]}
                placeholder="e.g. Riverside Learning Studio"
                placeholderTextColor={colors.textMuted}
                value={requestedName}
                onChangeText={setRequestedName}
                onBlur={() => v.blur("requestedName")}
                maxLength={120}
                autoFocus
              />
              <FieldError message={v.error("requestedName")} />

              <Text style={[styles.label, { color: colors.textPrimary }]}>Note (optional)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: v.error("note") ? colors.danger : colors.border }]}
                placeholder="Why are you making this change?"
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                onBlur={() => v.blur("note")}
                maxLength={500}
                multiline
              />
              <FieldError message={v.error("note")} />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <Pressable
                onPress={submit}
                disabled={isSaving}
                style={[styles.saveButton, { backgroundColor: colors.accent }, isSaving && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Submit request</Text>}
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
    flexShrink: 1,
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
    ...softCardShadow,
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
  },
  currentNameRow: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  currentNameLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  currentNameValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
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
