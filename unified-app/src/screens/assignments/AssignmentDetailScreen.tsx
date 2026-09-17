import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Animated } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { ConfirmModal } from "../../components/ConfirmModal";
import { SlideToPublishButton } from "../../components/SlideToPublishButton";
import { api, ApiError, AssignmentDetail, ClassSection, StudentStub } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
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
  const [answerKeyStats, setAnswerKeyStats] = useState<{ verified: number; total: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  useAiGenerating(isGeneratingSuggestions);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [publishWarning, setPublishWarning] = useState<string | null>(null);
  const [completionKind, setCompletionKind] = useState<"publish" | "unpublish" | null>(null);
  const publishSuccessProgress = useRef(new Animated.Value(0)).current;
  const publishCheckScale = useRef(new Animated.Value(0)).current;

  const [showAllQuestions, setShowAllQuestions] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const a = await api.getAssignment(accessToken, assignmentId);
      setAssignment(a);

      const [studentsRes, sections, topic, answerKeys] = await Promise.all([
        api.listStudents(accessToken, a.classSectionId),
        api.listClassSections(accessToken),
        a.topicId ? api.getTopic(accessToken, a.topicId).catch(() => null) : Promise.resolve(null),
        api.getAnswerKey(accessToken, a.id).catch(() => []),
      ]);

      setStudents(studentsRes.data ?? []);
      setClassSection(sections.find((item) => item.id === a.classSectionId) ?? null);
      setTopicMeta(topic ? { subject: topic.subject, board: topic.board } : null);
      setAnswerKeyStats({ verified: answerKeys.filter((k) => !!k.teacherVerifiedAnswer).length, total: answerKeys.length });
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

  // Returns whether the publish call itself succeeded, rather than throwing -
  // SlideToPublishButton uses this to decide whether to play its success
  // animation or quietly reset, while this screen's own error/warning state
  // still surfaces the reason (unverified answer key vs. a real failure).
  async function publish(confirmUnverified = false): Promise<boolean> {
    if (!accessToken || !assignment) return false;
    setIsPublishing(true);
    setError(null);
    try {
      await api.publishAssignment(accessToken, assignment.id, confirmUnverified);
      setPublishWarning(null);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "unverified_answers") {
        setPublishWarning(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to publish");
      }
      return false;
    } finally {
      setIsPublishing(false);
    }
  }

  // Runs once publish has actually gone through - split out from publish()
  // so the slide-to-publish success animation isn't cut off by this screen
  // reloading (which flips assignment.status and unmounts the slider) or
  // navigating away mid-animation.
  async function afterPublishSuccess() {
    try {
      if (!accessToken || !assignment) return;
      if (assignment.personalisationEnabled) {
        setIsGeneratingSuggestions(true);
        try {
          await api.generatePersonalisationSuggestions(accessToken, assignment.id);
        } finally {
          setIsGeneratingSuggestions(false);
        }
        navigation.navigate("PersonalisationReview", { assignmentId: assignment.id });
        return;
      }
      await load();
    } finally {
      setCompletionKind(null);
    }
  }

  async function afterUnpublishSuccess() {
    try {
      await load();
    } finally {
      setCompletionKind(null);
    }
  }

  function playCompletion(kind: "publish" | "unpublish") {
    setCompletionKind(kind);
    publishSuccessProgress.setValue(0);
    publishCheckScale.setValue(0);
    Animated.parallel([
      Animated.timing(publishSuccessProgress, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(180),
        Animated.spring(publishCheckScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }

  async function unpublish(): Promise<boolean> {
    if (!accessToken || !assignment) return false;
    setIsUnpublishing(true);
    setError(null);
    try {
      await api.unpublishAssignment(accessToken, assignment.id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unpublish");
      return false;
    } finally {
      setIsUnpublishing(false);
    }
  }

  async function handleUnpublish() {
    const ok = await unpublish();
    if (!ok) return;
    playCompletion("unpublish");
    setTimeout(() => afterUnpublishSuccess(), 1500);
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
  const submissionProgress = students.length > 0 ? Math.min(100, Math.round((submittedCount / students.length) * 100)) : 0;
  const visibleQuestions = showAllQuestions ? assignment.questions : assignment.questions.slice(0, 3);
  const metaLine = [
    classSection?.className ? capitalizeFirst(classSection.className) : undefined,
    topicMeta?.subject ? capitalizeFirst(topicMeta.subject) : undefined,
    topicMeta?.board,
  ].filter(Boolean).join(" • ");
  const createdAt = new Date(assignment.createdAt);
  const now = new Date();
  const createdLabel =
    createdAt.getFullYear() === now.getFullYear() &&
    createdAt.getMonth() === now.getMonth() &&
    createdAt.getDate() === now.getDate()
      ? "Today"
      : createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const completionColor = completionKind === "unpublish" ? colors.danger : "#00A88F";
  const completionTitle = completionKind === "unpublish" ? "Assignment unpublished" : "Assignment published";
  const completionMessage = completionKind === "unpublish" ? "It is back in draft mode." : "Your students can access it now.";

  return (
    <Screen edges={completionKind ? [] : ["top", "bottom"]}>
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
            <Text style={[styles.heroSubMeta, { color: colors.textMuted }]}>Section {capitalizeFirst(classSection.sectionName)}</Text>
          ) : null}
          {assignment.status === "published" && assignment.submissions.length === 0 ? (
            <View style={styles.badgeRow}>
              <Pressable
                onPress={handleUnpublish}
                disabled={isUnpublishing}
                style={({ pressed }) => [
                  styles.unpublishPill,
                  { borderColor: colors.danger, backgroundColor: colors.danger },
                  (isUnpublishing || pressed) && { opacity: pressedOpacity },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Unpublish assignment"
              >
                {isUnpublishing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-undo-outline" size={13} color="#FFFFFF" />
                    <Text style={styles.unpublishPillText}>Unpublish</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.heroVisual}>
          <Image source={decorativeAssets.assignmentStudent} style={styles.heroImage} resizeMode="contain" />
        </View>

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

        <View style={styles.sectionHeadingRow}>
          <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginBottom: 0 }]}>Questions</Text>
          <Pressable
            onPress={() => navigation.navigate("AnswerKeyReview", { assignmentId })}
            style={({ pressed }) => [
              styles.answerKeyPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Review answer key"
          >
            <Ionicons name="key-outline" size={13} color={colors.accent} />
            <Text style={[styles.answerKeyPillText, { color: colors.accent }]} numberOfLines={1}>
              {!answerKeyStats || answerKeyStats.total === 0
                ? "Answer key"
                : answerKeyStats.verified === answerKeyStats.total
                ? "Answer key ✓"
                : `Answer key ${answerKeyStats.verified}/${answerKeyStats.total}`}
            </Text>
          </Pressable>
        </View>
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
              <View style={{ flex: 1 }}>
                <Text style={[styles.questionText, { color: colors.textSecondary }]}>{question.prompt}</Text>
                {question.type === "mcq" && question.options ? (
                  <View style={styles.mcqOptionList}>
                    {question.options.map((option, optionIndex) => (
                      <Text
                        key={optionIndex}
                        style={[
                          styles.mcqOptionText,
                          { color: optionIndex === question.correctOptionIndex ? colors.accent : colors.textMuted },
                        ]}
                      >
                        {optionIndex === question.correctOptionIndex ? "✓ " : "• "}
                        {option}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
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

        {assignment.status === "published" ? (
          <View style={[styles.submissionsCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.submissionsHeader}>
              <View style={styles.submissionsHeaderLeft}>
                <View style={[styles.infoIconWrap, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="people-outline" size={20} color={colors.accent} />
                </View>
                <View style={styles.infoCopy}>
                  <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Submissions</Text>
                  <View style={styles.liveStatus}>
                    <View style={styles.liveDot} />
                    <Text style={[styles.liveStatusText, { color: colors.textMuted }]}>Live</Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => navigation.navigate("LogSubmission", { assignmentId })}
                style={({ pressed }) => [
                  styles.logSubmissionPill,
                  { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Log a submission"
              >
                <Ionicons name="add" size={14} color={colors.accent} />
                <Text style={[styles.logSubmissionPillText, { color: colors.accent }]}>Add</Text>
              </Pressable>
            </View>

            <View style={styles.submissionProgressBlock}>
              <View style={styles.submissionProgressHeading}>
                <Text style={[styles.submissionProgressValue, { color: colors.textPrimary }]}>
                  {submittedCount}<Text style={[styles.submissionProgressTotal, { color: colors.textMuted }]}> / {students.length}</Text>
                </Text>
                <Text style={[styles.submissionProgressLabel, { color: colors.textMuted }]}>Submitted</Text>
              </View>
              <View style={styles.progressBarRow}>
                <View style={[styles.progressTrack, { backgroundColor: colors.backgroundMuted }]}>
                  <View style={[styles.progressFill, { width: `${submissionProgress}%`, backgroundColor: "#00A88F" }]} />
                </View>
                {submittedCount > 0 ? (
                  <Pressable
                    onPress={() => navigation.navigate("GradingReview", { assignmentId })}
                    style={({ pressed }) => [styles.reviewArrowButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel="Review submissions"
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.accentOn} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.submissionProgressMeta}>
                <Text style={[styles.submissionProgressMetaText, { color: colors.textMuted }]}>{pendingCount} awaiting submission</Text>
                <Text style={[styles.submissionProgressMetaText, { color: colors.textMuted }]}>{submissionProgress}% complete</Text>
              </View>
            </View>

          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {assignment.status === "draft" ? (
          <View style={[styles.bottomActions, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.publishCardHeader}>
              <Text style={[styles.publishCardTitle, { color: colors.textPrimary }]}>Ready to publish</Text>
              <View style={styles.publishCardActions}>
                <Pressable
                  style={({ pressed }) => [styles.miniActionButton, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => navigation.navigate("CreateAssignment", { assignmentId: assignment.id })}
                  accessibilityRole="button"
                  accessibilityLabel="Edit draft"
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.accent} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.miniActionButton, { backgroundColor: `${colors.danger}16` }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => setShowDeleteConfirm(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete draft"
                >
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
              </View>
            </View>
            <View style={styles.contentSlideWrap}>
              <SlideToPublishButton label="Slide to publish" disabled={isPublishing} onPublish={() => publish()} onSuccess={() => playCompletion("publish")} onDone={afterPublishSuccess} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {completionKind ? (
        <Animated.View style={[styles.publishSuccessOverlay, { backgroundColor: completionColor, opacity: publishSuccessProgress }]} accessibilityViewIsModal>
          <Animated.View style={[styles.publishSuccessIcon, { transform: [{ scale: publishCheckScale }, { rotate: publishCheckScale.interpolate({ inputRange: [0, 1], outputRange: ["-28deg", "0deg"] }) }] }]}>
            <Ionicons name="checkmark" size={64} color={completionColor} />
          </Animated.View>
          <Animated.View style={{ opacity: publishSuccessProgress, transform: [{ translateY: publishCheckScale.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
            <Text style={styles.publishSuccessTitle}>{completionTitle}</Text>
            <Text style={styles.publishSuccessText}>{completionMessage}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete assignment?"
        message={`"${assignment.title}" and its answer key will be permanently deleted. This can't be undone.`}
        confirmLabel={isDeleting ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        visible={publishWarning !== null}
        title="Answer key not fully reviewed"
        message={`${publishWarning ?? ""} Students won't see the answer key, but grading quality depends on it. Publish anyway?`}
        confirmLabel={isPublishing ? "Publishing…" : "Publish anyway"}
        onConfirm={async () => {
          const ok = await publish(true);
          if (ok) {
            playCompletion("publish");
            setTimeout(() => afterPublishSuccess(), 1500);
          }
        }}
        onCancel={() => setPublishWarning(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56 },
  centered: { justifyContent: "center", alignItems: "center" },
  publishSuccessOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  publishSuccessIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 24,
  },
  publishSuccessTitle: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  publishSuccessText: {
    color: "#FFFFFF",
    opacity: 0.82,
    textAlign: "center",
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
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
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  aiBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroImage: {
    alignSelf: "flex-end",
    width: 210,
    height: 174,
    zIndex: 1,
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
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  answerKeyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 170,
  },
  answerKeyPillText: {
    fontSize: 12,
    fontWeight: "700",
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
  mcqOptionList: {
    marginTop: 6,
    paddingLeft: 2,
    gap: 2,
  },
  mcqOptionText: {
    fontSize: 12,
    lineHeight: 17,
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
  liveStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#00A88F",
  },
  liveStatusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  heroVisual: {
    height: 174,
    marginTop: -130,
    marginBottom: 0,
    transform: [{ translateY: 30 }],
  },
  unpublishPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
  },
  unpublishPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
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
    justifyContent: "space-between",
  },
  submissionsHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logSubmissionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logSubmissionPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  submissionProgressBlock: {
    marginTop: 14,
    marginBottom: 18,
  },
  submissionProgressHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  submissionProgressValue: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
  },
  submissionProgressTotal: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  submissionProgressLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  progressBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  submissionProgressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  submissionProgressMetaText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  reviewArrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    textAlign: "center",
    marginTop: 2,
    marginBottom: 12,
  },
  bottomActions: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 8,
  },
  contentSlideWrap: {
    marginTop: 14,
  },
  publishCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  publishCardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  publishCardActions: {
    flexDirection: "row",
    gap: 8,
  },
  miniActionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
