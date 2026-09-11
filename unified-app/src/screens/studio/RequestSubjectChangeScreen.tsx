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
import { api, Subject } from "../../api/client";

// Submits a fixed-set subject swap request for individual-account teachers.
// The 6-month cooldown is enforced server-side; this screen just surfaces
// whatever the server says (including the cooldown message verbatim) rather
// than trying to compute the countdown itself. See Docs/superpowers/plans/
// 2026-09-09-individual-teacher-onboarding-and-credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "RequestSubjectChange">;

export function RequestSubjectChangeScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [currentSubjects, setCurrentSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subjectOne, setSubjectOne] = useState("");
  const [subjectTwo, setSubjectTwo] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      setCurrentSubjects(await api.listSubjects(accessToken));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canSave = subjectOne.trim() && subjectTwo.trim() && subjectOne.trim() !== subjectTwo.trim();

  async function submit() {
    if (!accessToken || !user?.schoolId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.requestSubjectChange(accessToken, user.schoolId, {
        requestedSubjects: [subjectOne.trim(), subjectTwo.trim()],
        note: note.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Request subject change</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : submitted ? (
          <View style={styles.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
            <Text style={[styles.submittedTitle, { color: colors.textPrimary }]}>Request submitted</Text>
            <Text style={[styles.submittedText, { color: colors.textMuted }]}>
              An admin will review this request. You'll be able to change subjects again 6 months after it's approved.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.currentLabel, { color: colors.textMuted }]}>
              Current subjects: {currentSubjects.map((s) => s.name).join(", ") || "None"}
            </Text>

            <Text style={[styles.label, { color: colors.textPrimary }]}>New subject 1</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. English"
              placeholderTextColor={colors.textMuted}
              value={subjectOne}
              onChangeText={setSubjectOne}
            />

            <Text style={[styles.label, { color: colors.textPrimary }]}>New subject 2</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. History"
              placeholderTextColor={colors.textMuted}
              value={subjectTwo}
              onChangeText={setSubjectTwo}
            />

            <Text style={[styles.label, { color: colors.textPrimary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Why are you changing subjects?"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={!canSave || isSaving}
              style={[styles.saveButton, { backgroundColor: colors.accent }, (!canSave || isSaving) && { opacity: 0.5 }]}
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
  currentLabel: {
    fontSize: 13,
    marginBottom: 8,
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
