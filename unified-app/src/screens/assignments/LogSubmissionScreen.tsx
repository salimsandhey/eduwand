import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDetail, StudentStub } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "LogSubmission">;

// Records work a student handed in in class, while student login is still
// unavailable in this build - a manual stand-in for a real student submission.
export function LogSubmissionScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submittingStudentId, setSubmittingStudentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoggingSubmission, setIsLoggingSubmission] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const a = await api.getAssignment(accessToken, assignmentId);
      setAssignment(a);
      const studentsRes = await api.listStudents(accessToken, a.classSectionId);
      setStudents(studentsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignment");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function logSubmission() {
    if (!accessToken || !submittingStudentId) return;
    setIsLoggingSubmission(true);
    setError(null);
    try {
      await api.createSubmission(accessToken, { assignmentId, studentStubId: submittingStudentId, answers });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log submission");
    } finally {
      setIsLoggingSubmission(false);
    }
  }

  if (isLoading && !assignment) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Assignment not found"}</Text>
      </Screen>
    );
  }

  const submittedIds = new Set(assignment.submissions.map((submission) => submission.studentStubId));
  const available = students.filter((student) => !submittedIds.has(student.id));

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.textPrimary }]}>Log a submission</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            Represents work handed in in class while student login is still unavailable in this build.
          </Text>

          {available.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 12 }]}>
              Every student in this class already has a submission.
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Student</Text>
              <View style={styles.chipRow}>
                {available.map((student) => {
                  const active = submittingStudentId === student.id;
                  return (
                    <Pressable
                      key={student.id}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => setSubmittingStudentId(student.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{student.fullName}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {submittingStudentId ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Answers</Text>
            {assignment.questions.map((question, index) => (
              <View key={question.id} style={styles.answerGroup}>
                <Text style={[styles.answerPrompt, { color: colors.textSecondary }]}>
                  {index + 1}. {question.prompt}
                </Text>
                {question.type === "mcq" ? (
                  <View style={styles.mcqAnswerOptions}>
                    {(question.options ?? []).map((option, optionIndex) => {
                      const selected = (answers[question.id] ?? "") === option;
                      return (
                        <Pressable
                          key={optionIndex}
                          style={[
                            styles.mcqAnswerOption,
                            { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised },
                          ]}
                          onPress={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                        >
                          <View style={[styles.mcqAnswerDot, { borderColor: selected ? colors.accent : colors.textMuted }]}>
                            {selected ? <View style={[styles.mcqAnswerDotFill, { backgroundColor: colors.accent }]} /> : null}
                          </View>
                          <Text style={[styles.mcqAnswerOptionText, { color: colors.textPrimary }]}>{option}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                    value={answers[question.id] ?? ""}
                    onChangeText={(text) => setAnswers((prev) => ({ ...prev, [question.id]: text }))}
                    placeholder="Student's answer"
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                )}
              </View>
            ))}

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.logButton, { backgroundColor: colors.accent }, (isLoggingSubmission || pressed) && { opacity: pressedOpacity }]}
              onPress={logSubmission}
              disabled={isLoggingSubmission}
              accessibilityRole="button"
            >
              {isLoggingSubmission ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.logButtonText, { color: colors.accentOn }]}>Log submission</Text>}
            </Pressable>
          </View>
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 16, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  meta: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: "700" },
  answerGroup: { marginTop: 12 },
  answerPrompt: { marginBottom: 6, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  answerInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, fontSize: 14, lineHeight: 20 },
  mcqAnswerOptions: { gap: 8 },
  mcqAnswerOption: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  mcqAnswerDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mcqAnswerDotFill: { width: 10, height: 10, borderRadius: 5 },
  mcqAnswerOptionText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: { textAlign: "center", marginTop: 12, marginBottom: 4 },
  logButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", marginTop: 16 },
  logButtonText: { fontSize: 14, fontWeight: "700" },
});
