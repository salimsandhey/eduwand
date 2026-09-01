import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { ConfirmModal } from "../../components/ConfirmModal";
import { api, AssignmentDetail, ClassSection, StudentStub } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

type Props = NativeStackScreenProps<RootStackParamList, "AssignmentDetail">;

export function AssignmentDetailScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [classSection, setClassSection] = useState<ClassSection | null>(null);
  const [topicMeta, setTopicMeta] = useState<{ subject: string; board: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showAddSubmission, setShowAddSubmission] = useState(false);
  const [submittingStudentId, setSubmittingStudentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoggingSubmission, setIsLoggingSubmission] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const a = await api.getAssignment(accessToken, assignmentId);
      setAssignment(a);

      const [studentsRes, sections, topic] = await Promise.all([
        api.listStudents(accessToken, a.classSectionId),
        api.listClassSections(accessToken),
        a.topicId ? api.getTopic(accessToken, a.topicId).catch(() => null) : Promise.resolve(null),
      ]);

      setStudents(studentsRes.data ?? []);
      setClassSection(sections.find((item) => item.id === a.classSectionId) ?? null);
      setTopicMeta(topic ? { subject: topic.subject, board: topic.board } : null);
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

  async function unpublish() {
    if (!accessToken || !assignment) return;
    setIsUnpublishing(true);
    setError(null);
    try {
      await api.unpublishAssignment(accessToken, assignment.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish");
    } finally {
      setIsUnpublishing(false);
    }
  }

  async function confirmDelete() {
    if (!accessToken || !assignment) return;
    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteAssignment(accessToken, assignment.id);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
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

  const submittedCount = assignment.submissions.length;
  const pendingCount = Math.max(students.length - submittedCount, 0);
  const visibleQuestions = showAllQuestions ? assignment.questions : assignment.questions.slice(0, 3);
  const metaLine = [classSection?.className, topicMeta?.subject, topicMeta?.board].filter(Boolean).join(" • ");
  const createdAt = new Date(assignment.createdAt);
  const now = new Date();
  const createdLabel =
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth() &&
    createdAt.getDate() === now.getDate()
      ? "Today"
      : createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Assignment Lab</Text>
          <Pressable
            onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.heroCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{assignment.title}</Text>
          {metaLine ? <Text style={[styles.heroMeta, { color: colors.textMuted }]}>{metaLine}</Text> : null}
          {classSection?.sectionName ? (
            <Text style={[styles.heroSubMeta, { color: colors.textMuted }]}>Section {classSection.sectionName}</Text>
          ) : null}
          {assignment.topicId ? (
            <View style={[styles.aiBadge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="color-wand" size={12} color={colors.accent} />
              <Text style={[styles.aiBadgeText, { color: colors.accent }]}>AI generated</Text>
            </View>
          ) : null}
        </View>

        <Image source={decorativeAssets.assignmentStudent} style={styles.heroImage} resizeMode="contain" />

        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>QUESTIONS</Text>
            <View style={styles.statValueRow}>
              <Ionicons name="list" size={15} color={colors.accent} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{assignment.questions.length} Questions</Text>
            </View>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>CREATED</Text>
            <View style={styles.statValueRow}>
              <Ionicons name="calendar-outline" size={15} color={colors.accent} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{createdLabel}</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Questions</Text>
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {visibleQuestions.map((question, index) => (
            <View
              key={question.id}
              style={[
                styles.questionRow,
                { borderBottomColor: colors.border },
                index === visibleQuestions.length - 1 && assignment.questions.length <= 3 ? styles.questionRowLast : null,
              ]}
            >
              <Text style={[styles.questionIndex, { color: colors.accent }]}>{String(index + 1).padStart(2, "0")}</Text>
              <Text style={[styles.questionText, { color: colors.textSecondary }]}>{question.prompt}</Text>
            </View>
          ))}

          {assignment.questions.length > 3 ? (
            <Pressable
              onPress={() => setShowAllQuestions((value) => !value)}
              style={({ pressed }) => [
                styles.viewAllButton,
                { backgroundColor: colors.backgroundMuted, borderTopColor: colors.border },
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, { color: colors.accent }]}>{showAllQuestions ? "Show less" : "View all"} →</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.accent, borderColor: colors.accent }, cardShadow]}>
          <View style={styles.infoCardContent}>
            <View style={[styles.infoIconWrap, { backgroundColor: colors.accentOn }]}>
              <Ionicons name="key-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={[styles.infoTitle, { color: colors.accentOn }]}>Answer Key</Text>
              <Text style={[styles.infoMeta, { color: colors.accentOn, opacity: 0.85 }]}>
                {assignment.status === "draft" ? "AI draft - Review required" : "Review and verify before distributing"}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate("AnswerKeyReview", { assignmentId })}
            style={({ pressed }) => [
              styles.outlineAction,
              { backgroundColor: colors.accentOn, borderColor: colors.accentOn },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.outlineActionText, { color: colors.accent }]}>Review →</Text>
          </Pressable>
        </View>

        {assignment.status === "published" ? (
          <Pressable
            onPress={() => navigation.navigate("GradingReview", { assignmentId })}
            style={({ pressed }) => [
              styles.submissionsCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
          >
            <View style={styles.submissionsHeader}>
              <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="people-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Submissions</Text>
              </View>
            </View>

            <View style={styles.submissionStats}>
              <View style={styles.submissionStat}>
                <Text style={[styles.submissionValue, { color: colors.accent }]}>{students.length}</Text>
                <Text style={[styles.submissionLabel, { color: colors.textMuted }]}>Students</Text>
              </View>
              <View style={[styles.submissionDivider, { backgroundColor: colors.border }]} />
              <View style={styles.submissionStat}>
                <Text style={[styles.submissionValue, { color: "#00A88F" }]}>{submittedCount}</Text>
                <Text style={[styles.submissionLabel, { color: colors.textMuted }]}>Submitted</Text>
              </View>
              <View style={[styles.submissionDivider, { backgroundColor: colors.border }]} />
              <View style={styles.submissionStat}>
                <Text style={[styles.submissionValue, { color: colors.warning }]}>{pendingCount}</Text>
                <Text style={[styles.submissionLabel, { color: colors.textMuted }]}>Pending</Text>
              </View>
            </View>

            <View style={[styles.primaryInlineAction, { backgroundColor: colors.accent }]}>
              <Text style={[styles.primaryInlineActionText, { color: colors.accentOn }]}>Review submissions</Text>
              <View style={[styles.primaryInlineActionCircle, { backgroundColor: colors.accentOn }]}>
                <Ionicons name="chevron-forward" size={16} color={colors.accent} />
              </View>
            </View>
          </Pressable>
        ) : null}

        {assignment.status === "published" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.addSubmissionHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Log a submission</Text>
              <Pressable onPress={() => setShowAddSubmission((value) => !value)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.linkText, { color: colors.accent }]}>{showAddSubmission ? "Cancel" : "+ Add"}</Text>
              </Pressable>
            </View>

            {showAddSubmission ? (
              (() => {
                const submittedIds = new Set(assignment.submissions.map((submission) => submission.studentStubId));
                const available = students.filter((student) => !submittedIds.has(student.id));

                if (available.length === 0) {
                  return <Text style={[styles.infoMeta, { color: colors.textMuted, marginTop: 8 }]}>Every student in this class already has a submission.</Text>;
                }

                return (
                  <>
                    <Text style={[styles.infoMeta, { color: colors.textMuted, marginTop: 8, marginBottom: 10 }]}>
                      Represents work handed in in class while student login is still unavailable in this build.
                    </Text>

                    <View style={styles.chipRow}>
                      {available.map((student) => {
                        const active = submittingStudentId === student.id;
                        return (
                          <Pressable
                            key={student.id}
                            style={({ pressed }) => [
                              styles.chip,
                              {
                                backgroundColor: active ? colors.accent : colors.surfaceRaised,
                                borderColor: active ? colors.accent : colors.border,
                              },
                              pressed && { opacity: pressedOpacity },
                            ]}
                            onPress={() => setSubmittingStudentId(student.id)}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{student.fullName}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {submittingStudentId ? (
                      <>
                        {assignment.questions.map((question, index) => (
                          <View key={question.id} style={styles.answerGroup}>
                            <Text style={[styles.answerPrompt, { color: colors.textSecondary }]}>
                              {index + 1}. {question.prompt}
                            </Text>
                            <TextInput
                              style={[
                                styles.answerInput,
                                { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary },
                              ]}
                              value={answers[question.id] ?? ""}
                              onChangeText={(text) => setAnswers((prev) => ({ ...prev, [question.id]: text }))}
                              placeholder="Student's answer"
                              placeholderTextColor={colors.textMuted}
                              multiline
                            />
                          </View>
                        ))}

                        <Pressable
                          style={({ pressed }) => [
                            styles.logButton,
                            { backgroundColor: colors.accent },
                            (isLoggingSubmission || pressed) && { opacity: pressedOpacity },
                          ]}
                          onPress={logSubmission}
                          disabled={isLoggingSubmission}
                          accessibilityRole="button"
                        >
                          {isLoggingSubmission ? (
                            <ActivityIndicator color={colors.accentOn} />
                          ) : (
                            <Text style={[styles.logButtonText, { color: colors.accentOn }]}>Log submission</Text>
                          )}
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
          <View style={styles.bottomActions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryFooterButton,
                { backgroundColor: colors.accent },
                (isPublishing || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={publish}
              disabled={isPublishing}
              accessibilityRole="button"
            >
              {isPublishing ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <Text style={[styles.primaryFooterButtonText, { color: colors.accentOn }]}>Publish assignment →</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryFooterButton,
                { borderColor: colors.accent },
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => navigation.navigate("CreateAssignment", { assignmentId: assignment.id })}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryFooterButtonText, { color: colors.accent }]}>Edit draft</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.deleteLinkButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => setShowDeleteConfirm(true)}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.deleteLinkText, { color: colors.textMuted }]}>Delete draft</Text>
            </Pressable>
          </View>
        ) : assignment.submissions.length === 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.secondaryFooterButton,
              { borderColor: colors.border },
              (isUnpublishing || pressed) && { opacity: pressedOpacity },
            ]}
            onPress={unpublish}
            disabled={isUnpublishing}
            accessibilityRole="button"
          >
            {isUnpublishing ? (
              <ActivityIndicator color={colors.textSecondary} size="small" />
            ) : (
              <Text style={[styles.secondaryFooterButtonText, { color: colors.textSecondary }]}>Unpublish (no submissions yet)</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete assignment?"
        message={`"${assignment.title}" and its answer key will be permanently deleted. This can't be undone.`}
        confirmLabel={isDeleting ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56 },
  centered: { justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    marginLeft: 16,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroCopy: {
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heroMeta: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  heroSubMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  aiBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 18,
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroImage: {
    alignSelf: "flex-end",
    width: 210,
    height: 174,
    marginTop: -130,
    marginBottom: 0,
    transform: [{ translateY: 30}],
  },
  statsCard: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 26,
  },
  statBlock: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  statValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  sectionHeading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    marginBottom: 14,
  },
  questionCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 18,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  questionRowLast: {
    borderBottomWidth: 0,
  },
  questionIndex: {
    width: 30,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    paddingLeft: 2,
  },
  viewAllButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  viewAllText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  infoCardContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 12,
  },
  infoIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  infoMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  outlineAction: {
    minWidth: 106,
    height: 40,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  outlineActionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  submissionsCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
  },
  submissionsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  submissionStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    marginTop: 14,
    marginBottom: 18,
  },
  submissionStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  submissionDivider: {
    width: 1,
    marginHorizontal: 4,
  },
  submissionValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  submissionLabel: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
  primaryInlineAction: {
    borderRadius: 14,
    minHeight: 46,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryInlineActionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryInlineActionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  addSubmissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  linkText: {
    fontSize: 14,
    fontWeight: "800",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  answerGroup: {
    marginTop: 12,
  },
  answerPrompt: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  answerInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    fontSize: 14,
    lineHeight: 20,
  },
  logButton: {
    marginTop: 16,
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  error: {
    textAlign: "center",
    marginTop: 2,
    marginBottom: 12,
  },
  bottomActions: {
    marginTop: 8,
  },
  primaryFooterButton: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  primaryFooterButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  secondaryFooterButton: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  secondaryFooterButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  deleteLinkButton: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  deleteLinkText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
});
