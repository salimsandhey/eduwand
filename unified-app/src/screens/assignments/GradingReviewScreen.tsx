import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDetail, SubmissionRecord } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "GradingReview">;
type Filter = "all" | "needs_review" | "graded";
type Sort = "newest" | "oldest";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function GradingReviewScreen({ route }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");

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

  const visibleSubmissions = useMemo(() => {
    if (!assignment) return [] as SubmissionRecord[];
    let list = assignment.submissions;
    if (filter === "needs_review") list = list.filter((s) => !s.grade || s.grade.status === "pending" || s.grade.flaggedForAttention);
    else if (filter === "graded") list = list.filter((s) => s.grade && s.grade.status !== "pending");
    list = [...list].sort((a, b) => {
      const diff = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      return sort === "newest" ? -diff : diff;
    });
    return list;
  }, [assignment, filter, sort]);

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
  const gradedCount = assignment.submissions.filter((s) => s.grade && s.grade.status !== "pending").length;
  const aiGradedCount = assignment.submissions.filter((s) => s.grade?.status === "ai_graded").length;
  const needsReviewCount = assignment.submissions.filter((s) => !s.grade || s.grade.status === "pending" || s.grade.flaggedForAttention).length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Grading Review</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>
        </View>

        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>
              {gradedCount}/{assignment.submissions.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Submissions graded</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.accent }]}>{aiGradedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>AI graded</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{needsReviewCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Need review</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(["all", "needs_review", "graded"] as Filter[]).map((item) => {
            const active = filter === item;
            const label = item === "all" ? "All" : item === "needs_review" ? "Needs review" : "Graded";
            return (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={({ pressed }) => [styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
            style={({ pressed }) => [styles.sortButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="swap-vertical-outline" size={13} color={colors.textSecondary} />
            <Text style={[styles.sortButtonText, { color: colors.textSecondary }]}>{sort === "newest" ? "Newest" : "Oldest"}</Text>
          </Pressable>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {visibleSubmissions.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {assignment.submissions.length === 0 ? "No submissions logged yet." : "No submissions match this filter."}
          </Text>
        ) : (
          visibleSubmissions.map((s) => {
            const grade = s.grade;
            const isBusy = busyId === s.id || busyId === grade?.id;
            const isOverriding = overridingSubmissionId === s.id;
            const studentName = s.studentStub?.fullName ?? "Student";
            const statusLabel = grade?.status === "released" ? "Released" : grade?.status === "ai_graded" ? "AI graded" : grade?.flaggedForAttention ? "Flagged for review" : null;
            return (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={styles.cardHeader}>
                  <View style={styles.studentIdentity}>
                    <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(studentName)}</Text>
                    </View>
                    <View>
                      <Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(studentName)}</Text>
                      <Text style={[styles.submittedMeta, { color: colors.textMuted }]}>Submitted {new Date(s.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
                    </View>
                  </View>
                  {statusLabel ? (
                    <View style={[styles.statusPill, { backgroundColor: grade?.flaggedForAttention ? colors.danger + "18" : colors.accentSoft }]}>
                      <Text style={[styles.statusPillText, { color: grade?.flaggedForAttention ? colors.danger : colors.accent }]}>{statusLabel}</Text>
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
                      Score: {((grade.aiScore ?? 0) / 10).toFixed(1)} / 10
                      {grade.finalScore !== null && grade.finalScore !== grade.aiScore ? ` → Final: ${(grade.finalScore / 10).toFixed(1)} / 10` : ""}
                    </Text>
                    <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>{grade.finalFeedback ?? grade.aiFeedback}</Text>

                    {grade.questionDetails && grade.questionDetails.length > 0 ? (
                      <View style={styles.questionDetailList}>
                        {grade.questionDetails.map((d, i) => {
                          const question = assignment.questions.find((q) => q.id === d.questionId);
                          const icon = d.correct === true ? "checkmark-circle" : d.correct === false ? "close-circle" : "help-circle-outline";
                          const iconColor = d.correct === true ? colors.accent : d.correct === false ? colors.danger : colors.textMuted;
                          return (
                            <View key={d.questionId} style={styles.questionDetailRow}>
                              <Ionicons name={icon} size={14} color={iconColor} style={{ marginTop: 1 }} />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.questionDetailPrompt, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {i + 1}. {question?.prompt ?? "Question"}
                                </Text>
                                <Text style={[styles.questionDetailNote, { color: colors.textMuted }]}>{d.note}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    {grade.status === "released" ? (
                      <Text style={[styles.releasedTag, { color: colors.accent }]}>Released to student record</Text>
                    ) : isOverriding ? (
                      <View style={styles.overrideBox}>
                        <Text style={[styles.overrideLabel, { color: colors.textMuted }]}>Score (0-100)</Text>
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
  statsCard: { flexDirection: "row", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  stat: { flex: 1, alignItems: "center" },
  statDivider: { width: 1, marginHorizontal: 4 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { marginTop: 4, fontSize: 10, fontWeight: "600", textAlign: "center" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" },
  chip: { minHeight: 30, borderRadius: 15, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 12, fontWeight: "700" },
  sortButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12 },
  sortButtonText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  meta: { fontSize: 13, textAlign: "center", marginTop: 20 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  studentIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontWeight: "800" },
  studentName: { fontSize: 14, fontWeight: "700" },
  submittedMeta: { fontSize: 11, marginTop: 2, fontWeight: "500" },
  statusPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  gradeButton: { borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginTop: 10 },
  gradeButtonText: { fontSize: 13, fontWeight: "700" },
  scoreText: { fontSize: 14, fontWeight: "700", marginTop: 10 },
  feedbackText: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  questionDetailList: { marginTop: 10, gap: 8 },
  questionDetailRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  questionDetailPrompt: { fontSize: 12, fontWeight: "700" },
  questionDetailNote: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  releasedTag: { fontSize: 11, fontWeight: "700", marginTop: 10, textTransform: "uppercase" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  smallButton: { flex: 1, borderWidth: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonFilled: { flex: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 12, fontWeight: "700" },
  overrideBox: { marginTop: 12, gap: 8 },
  overrideLabel: { fontSize: 11, fontWeight: "700" },
  scoreInput: { borderWidth: 1, borderRadius: 8, height: 38, paddingHorizontal: 10, fontSize: 14, width: 100 },
  feedbackInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44, fontSize: 13 },
  releaseButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  releaseButtonText: { fontSize: 14, fontWeight: "700" },
});
