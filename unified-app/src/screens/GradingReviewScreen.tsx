import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, AssignmentDetail } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "GradingReview">;

export function GradingReviewScreen({ route }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);

  const [overridingSubmissionId, setOverridingSubmissionId] = useState<string | null>(null);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideFeedback, setOverrideFeedback] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setAssignment(await api.getAssignment(accessToken, assignmentId));
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

  async function gradeNow(submissionId: string) {
    if (!accessToken) return;
    setBusyId(submissionId);
    setError(null);
    try {
      await api.gradeSubmission(accessToken, submissionId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed");
    } finally {
      setBusyId(null);
    }
  }

  async function acceptAiGrade(gradeId: string) {
    if (!accessToken) return;
    setBusyId(gradeId);
    setError(null);
    try {
      await api.updateGrade(accessToken, gradeId, {});
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept grade");
    } finally {
      setBusyId(null);
    }
  }

  function startOverride(submissionId: string, currentScore: number | null, currentFeedback: string | null) {
    setOverridingSubmissionId(submissionId);
    setOverrideScore(currentScore !== null ? String(currentScore) : "");
    setOverrideFeedback(currentFeedback ?? "");
  }

  async function confirmOverride(gradeId: string) {
    if (!accessToken) return;
    setBusyId(gradeId);
    setError(null);
    try {
      await api.updateGrade(accessToken, gradeId, {
        finalScore: overrideScore ? Number(overrideScore) : undefined,
        finalFeedback: overrideFeedback || undefined,
      });
      setOverridingSubmissionId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to override grade");
    } finally {
      setBusyId(null);
    }
  }

  async function releaseGrades() {
    if (!accessToken) return;
    setIsReleasing(true);
    setError(null);
    try {
      await api.releaseGrades(accessToken, assignmentId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release grades");
    } finally {
      setIsReleasing(false);
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

  const releasableCount = assignment.submissions.filter((s) => s.grade?.status === "ai_graded").length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Grading Review</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {assignment.submissions.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>No submissions logged yet.</Text>
        ) : (
          assignment.submissions.map((s) => {
            const grade = s.grade;
            const isBusy = busyId === s.id || busyId === grade?.id;
            const isOverriding = overridingSubmissionId === s.id;
            return (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.studentStub?.fullName ?? "Student"}</Text>
                  {grade?.flaggedForAttention ? (
                    <View style={styles.flagTag}>
                      <Ionicons name="flag" size={11} color={colors.danger} />
                      <Text style={[styles.flagText, { color: colors.danger }]}>Flagged</Text>
                    </View>
                  ) : null}
                </View>

                {!grade || grade.status === "pending" ? (
                  <Pressable
                    style={({ pressed }) => [styles.gradeButton, { backgroundColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                    onPress={() => gradeNow(s.id)}
                    disabled={isBusy}
                    accessibilityRole="button"
                  >
                    {isBusy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.gradeButtonText, { color: colors.accentOn }]}>Grade with AI</Text>}
                  </Pressable>
                ) : (
                  <>
                    <Text style={[styles.scoreText, { color: colors.textPrimary }]}>
                      AI score: {grade.aiScore}
                      {grade.finalScore !== null && grade.finalScore !== grade.aiScore ? ` → Final: ${grade.finalScore}` : ""}
                    </Text>
                    <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>{grade.finalFeedback ?? grade.aiFeedback}</Text>

                    {grade.status === "released" ? (
                      <Text style={[styles.releasedTag, { color: colors.accent }]}>Released to student record</Text>
                    ) : isOverriding ? (
                      <View style={styles.overrideBox}>
                        <TextInput
                          style={[styles.scoreInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                          keyboardType="number-pad"
                          value={overrideScore}
                          onChangeText={setOverrideScore}
                          placeholder="Score"
                          placeholderTextColor={colors.textMuted}
                        />
                        <TextInput
                          style={[styles.feedbackInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                          value={overrideFeedback}
                          onChangeText={setOverrideFeedback}
                          placeholder="Feedback"
                          placeholderTextColor={colors.textMuted}
                          multiline
                        />
                        <View style={styles.actionRow}>
                          <Pressable style={({ pressed }) => [styles.smallButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => setOverridingSubmissionId(null)} accessibilityRole="button">
                            <Text style={[styles.smallButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [styles.smallButtonFilled, { backgroundColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                            onPress={() => confirmOverride(grade.id)}
                            disabled={isBusy}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save override</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.actionRow}>
                        <Pressable
                          style={({ pressed }) => [styles.smallButton, { borderColor: colors.border }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                          onPress={() => startOverride(s.id, grade.finalScore ?? grade.aiScore, grade.finalFeedback ?? grade.aiFeedback)}
                          disabled={isBusy}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.smallButtonText, { color: colors.textSecondary }]}>Override</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [styles.smallButtonFilled, { backgroundColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                          onPress={() => acceptAiGrade(grade.id)}
                          disabled={isBusy}
                          accessibilityRole="button"
                        >
                          {isBusy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Accept AI grade</Text>}
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}

        {releasableCount > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.releaseButton, { backgroundColor: colors.accent }, (isReleasing || pressed) && { opacity: pressedOpacity }]}
            onPress={releaseGrades}
            disabled={isReleasing}
            accessibilityRole="button"
          >
            {isReleasing ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.releaseButtonText, { color: colors.accentOn }]}>Release {releasableCount} grade{releasableCount === 1 ? "" : "s"}</Text>}
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
  titleSection: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  error: { textAlign: "center", marginBottom: 12 },
  meta: { fontSize: 13, textAlign: "center", marginTop: 20 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { fontSize: 15, fontWeight: "700" },
  flagTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagText: { fontSize: 11, fontWeight: "700" },
  gradeButton: { borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginTop: 10 },
  gradeButtonText: { fontSize: 13, fontWeight: "700" },
  scoreText: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  feedbackText: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  releasedTag: { fontSize: 11, fontWeight: "700", marginTop: 10, textTransform: "uppercase" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  smallButton: { flex: 1, borderWidth: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonFilled: { flex: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 12, fontWeight: "700" },
  overrideBox: { marginTop: 12, gap: 8 },
  scoreInput: { borderWidth: 1, borderRadius: 8, height: 38, paddingHorizontal: 10, fontSize: 14, width: 100 },
  feedbackInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44, fontSize: 13 },
  releaseButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  releaseButtonText: { fontSize: 14, fontWeight: "700" },
});
