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

type Props = NativeStackScreenProps<RootStackParamList, "AssignmentDetail">;

export function AssignmentDetailScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const [showAddSubmission, setShowAddSubmission] = useState(false);
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
    if (!accessToken || !submittingStudentId || !assignment) return;
    setIsLoggingSubmission(true);
    setError(null);
    try {
      await api.createSubmission(accessToken, { assignmentId: assignment.id, studentStubId: submittingStudentId, answers });
      setShowAddSubmission(false);
      setSubmittingStudentId(null);
      setAnswers({});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log submission");
    } finally {
      setIsLoggingSubmission(false);
    }
  }

  async function publish() {
    if (!accessToken || !assignment) return;
    setIsPublishing(true);
    setError(null);
    try {
      await api.publishAssignment(accessToken, assignment.id);
      if (assignment.personalisationEnabled) {
        await api.generatePersonalisationSuggestions(accessToken, assignment.id);
        navigation.navigate("PersonalisationReview", { assignmentId: assignment.id });
        return;
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setIsPublishing(false);
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

  const pendingSuggestions = assignment.personalisationSuggestions.filter((s) => s.status === "pending").length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{assignment.title}</Text>
          <Text
            style={[
              styles.statusBadge,
              { color: assignment.status === "published" ? colors.accent : colors.textMuted, backgroundColor: colors.surfaceRaised },
            ]}
          >
            {assignment.status}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Questions</Text>
          {assignment.questions.map((q, i) => (
            <Text key={q.id} style={[styles.questionText, { color: colors.textSecondary }]}>
              {i + 1}. {q.prompt}
            </Text>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("AnswerKeyReview", { assignmentId })}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Answer Key</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>Review and verify before distributing</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {assignment.personalisationEnabled ? (
          <Pressable
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("PersonalisationReview", { assignmentId })}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Personalisation Review</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {pendingSuggestions > 0 ? `${pendingSuggestions} decision(s) pending` : `${assignment.personalisationSuggestions.length} student(s) reviewed`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {assignment.status === "published" ? (
          <Pressable
            style={({ pressed }) => [styles.linkCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("GradingReview", { assignmentId })}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 2 }]}>Grading Review</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{assignment.submissions.length} submission(s)</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {assignment.status === "published" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.addSubmissionHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Log a submission</Text>
              <Pressable onPress={() => setShowAddSubmission((v) => !v)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.accent }]}>{showAddSubmission ? "Cancel" : "+ Add"}</Text>
              </Pressable>
            </View>

            {showAddSubmission ? (
              (() => {
                const submittedIds = new Set(assignment.submissions.map((s) => s.studentStubId));
                const available = students.filter((s) => !submittedIds.has(s.id));
                if (available.length === 0) {
                  return <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8 }]}>Every student in this class already has a submission.</Text>;
                }
                return (
                  <>
                    <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8, marginBottom: 8 }]}>Represents work handed in in class - there is no student login in this build phase.</Text>
                    <View style={styles.chipRow}>
                      {available.map((s) => {
                        const active = submittingStudentId === s.id;
                        return (
                          <Pressable
                            key={s.id}
                            style={({ pressed }) => [
                              styles.chip,
                              { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                              pressed && { opacity: pressedOpacity },
                            ]}
                            onPress={() => setSubmittingStudentId(s.id)}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{s.fullName}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {submittingStudentId ? (
                      <>
                        {assignment.questions.map((q, i) => (
                          <View key={q.id} style={{ marginTop: 10 }}>
                            <Text style={[styles.meta, { color: colors.textSecondary, marginBottom: 4 }]}>
                              {i + 1}. {q.prompt}
                            </Text>
                            <TextInput
                              style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                              value={answers[q.id] ?? ""}
                              onChangeText={(text) => setAnswers((prev) => ({ ...prev, [q.id]: text }))}
                              placeholder="Student's answer"
                              placeholderTextColor={colors.textMuted}
                              multiline
                            />
                          </View>
                        ))}
                        <Pressable
                          style={({ pressed }) => [styles.logButton, { backgroundColor: colors.accent }, (isLoggingSubmission || pressed) && { opacity: pressedOpacity }]}
                          onPress={logSubmission}
                          disabled={isLoggingSubmission}
                          accessibilityRole="button"
                        >
                          {isLoggingSubmission ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.logButtonText, { color: colors.accentOn }]}>Log submission</Text>}
                        </Pressable>
                      </>
                    ) : null}
                  </>
                );
              })()
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {assignment.status === "draft" ? (
          <Pressable
            style={({ pressed }) => [styles.publishButton, { backgroundColor: colors.accent }, (isPublishing || pressed) && { opacity: pressedOpacity }]}
            onPress={publish}
            disabled={isPublishing}
            accessibilityRole="button"
          >
            {isPublishing ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.publishButtonText, { color: colors.accentOn }]}>Publish</Text>}
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, flex: 1 },
  statusBadge: { fontSize: 11, fontWeight: "700", textTransform: "capitalize", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: "hidden" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  questionText: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  linkCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  meta: { fontSize: 12 },
  error: { textAlign: "center", marginVertical: 12 },
  publishButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  publishButtonText: { fontSize: 14, fontWeight: "700" },
  addSubmissionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { fontWeight: "700", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  answerInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 40, fontSize: 13 },
  logButton: { borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 14 },
  logButtonText: { fontSize: 13, fontWeight: "700" },
});
