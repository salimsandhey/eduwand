import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { StudentTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { TypewriterText } from "../../components/TypewriterText";
import { MadeWithLoveFooter } from "../../components/MadeWithLoveFooter";
import { StudentAvatar } from "../../components/StudentAvatar";
import { api, StudentAssessmentRecord, StudentAssignmentView, StudentMaterial } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";
import { OUTPUT_TYPE_ICONS, OUTPUT_TYPE_LABELS } from "../studio/generation/outputTypeMeta";

type Props = CompositeScreenProps<BottomTabScreenProps<StudentTabParamList, "Home">, NativeStackScreenProps<RootStackParamList>>;

type AssignmentFilter = "todo" | "done" | "all";

const FILTERS: { key: AssignmentFilter; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

// Status is carried by a thin left rail on each row (not a colored badge):
// to do = brand accent, waiting on the teacher = muted, graded = green.
const GRADED_COLOR = "#2FA678";

const RING_SIZE = 104;
const RING_STROKE = 10;

interface ResultItem {
  key: string;
  kind: "Assignment" | "Quiz";
  title: string;
  percent: number;
  detail: string;
  date: string;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(fullName?: string | null): string {
  if (!fullName) return "there";
  return capitalizeFirst(fullName.trim().split(/\s+/)[0] ?? "there");
}

function formatShortDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function questionCount(n: number): string {
  return `${n} question${n === 1 ? "" : "s"}`;
}

export function StudentHomeScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();

  const [assignments, setAssignments] = useState<StudentAssignmentView[]>([]);
  const [assessments, setAssessments] = useState<StudentAssessmentRecord[]>([]);
  const [materials, setMaterials] = useState<StudentMaterial[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssignmentFilter>("todo");

  // Each section loads independently - a failing materials call shouldn't
  // blank out the assignments the student actually needs to act on.
  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    const [assignmentRes, assessmentRes, materialRes] = await Promise.allSettled([
      api.listStudentAssignments(accessToken),
      api.listStudentAssessments(accessToken),
      api.listStudentMaterials(accessToken),
    ]);
    if (assignmentRes.status === "fulfilled") setAssignments(assignmentRes.value);
    else setError(assignmentRes.reason instanceof Error ? assignmentRes.reason.message : "Failed to load assignments");
    if (assessmentRes.status === "fulfilled") setAssessments(assessmentRes.value);
    if (materialRes.status === "fulfilled") setMaterials(materialRes.value);
    setHasLoaded(true);
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function refresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  // Oldest pending first - with no due dates, the one that's been waiting
  // longest is the most pressing.
  const toDo = useMemo(
    () =>
      assignments
        .filter((a) => a.submissionStatus === "not_submitted")
        .sort((a, b) => new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime()),
    [assignments]
  );
  const submittedCount = assignments.filter((a) => a.submissionStatus === "submitted").length;
  const gradedCount = assignments.filter((a) => a.submissionStatus === "graded").length;
  const total = assignments.length;
  const completion = total > 0 ? Math.round(((submittedCount + gradedCount) / total) * 100) : 0;

  const results = useMemo<ResultItem[]>(() => {
    const fromAssignments: ResultItem[] = assignments
      .filter((a) => a.grade?.finalScore != null)
      .map((a) => ({
        key: `a-${a.id}`,
        kind: "Assignment",
        title: a.title,
        percent: Math.round(a.grade!.finalScore!),
        detail: questionCount(a.questions.length),
        date: a.grade!.releasedAt ?? a.publishedAt ?? "",
      }));
    const fromQuizzes: ResultItem[] = assessments
      .filter((q) => q.score.totalQuestions > 0)
      .map((q) => ({
        key: `q-${q.id}`,
        kind: "Quiz",
        title: q.topicName,
        percent: Math.round((q.score.correctCount / q.score.totalQuestions) * 100),
        detail: `${q.score.correctCount}/${q.score.totalQuestions} correct`,
        date: q.resultsReleasedAt,
      }));
    return [...fromAssignments, ...fromQuizzes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [assignments, assessments]);

  const averageScore = results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.percent, 0) / results.length) : null;

  const visibleAssignments = useMemo(() => {
    if (filter === "todo") return toDo;
    if (filter === "done") return assignments.filter((a) => a.submissionStatus !== "not_submitted");
    return assignments;
  }, [filter, toDo, assignments]);

  function openAssignment(assignment: StudentAssignmentView) {
    navigation.navigate("StudentAssignmentSubmit", {
      assignmentId: assignment.id,
      questions: assignment.questions,
      title: assignment.title,
    });
  }

  const nextUp = toDo[0];
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const hero = nextUp
    ? {
        eyebrow: "UP NEXT",
        title: nextUp.title,
        subtitle: `${questionCount(nextUp.questions.length)}${toDo.length > 1 ? ` · ${toDo.length - 1} more waiting` : ""}`,
        cta: "Start now",
        onPress: () => openAssignment(nextUp),
      }
    : total > 0
      ? {
          eyebrow: "ALL CAUGHT UP",
          title: "Nothing left to submit",
          subtitle: "Nice work! Check your results or revise with your study materials.",
          cta: "View results",
          onPress: () => navigation.navigate("Results"),
        }
      : {
          eyebrow: "WELCOME",
          title: "Your learning space",
          subtitle: "Assignments and study material from your teacher will show up here.",
          cta: "Browse materials",
          onPress: () => navigation.navigate("Materials"),
        };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>
              {greeting()},{" "}
              <TypewriterText
                text={firstName(user?.fullName)}
                style={[styles.greetingName, { color: colors.accent }]}
                cursorColor={colors.accent}
                showCursor={false}
                speed={70}
              />
            </Text>
            <Text style={[styles.dateText, { color: colors.textMuted }]}>{todayLabel}</Text>
          </View>
          <View style={[styles.headerActions, { backgroundColor: colors.surface }, cardShadow]}>
            <Pressable
              onPress={() => navigation.navigate("Messages")}
              style={({ pressed }) => [styles.headerIcon, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Open messages"
            >
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.accent} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate("Profile")}
              style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              {user ? (
                <StudentAvatar studentId={user.id} picture={user} size={36} photoUrl={accessToken ? api.myPhotoUrl(accessToken) : null} />
              ) : null}
            </Pressable>
          </View>
        </View>

        <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroCopy}>
            <View style={styles.heroTextGroup}>
              <Text style={styles.heroEyebrow}>{hero.eyebrow}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {hero.title}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={2}>
                {hero.subtitle}
              </Text>
            </View>
            <Pressable
              onPress={hero.onPress}
              style={({ pressed }) => [styles.heroButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Text style={[styles.heroButtonText, { color: colors.accent }]}>{hero.cta}</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.accent} />
            </Pressable>
          </View>
          <Image source={decorativeAssets.assignmentStudent} style={styles.heroGraphic} resizeMode="contain" />
        </LinearGradient>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {!hasLoaded ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : (
          <>
            <View style={[styles.progressCard, { backgroundColor: colors.surface }, cardShadow]}>
              <View style={styles.progressTop}>
                <ProgressRing percent={completion} color={colors.accent} trackColor={colors.backgroundMuted}>
                  <Text style={[styles.ringValue, { color: colors.textPrimary }]}>{completion}%</Text>
                  <Text style={[styles.ringLabel, { color: colors.textMuted }]}>done</Text>
                </ProgressRing>
                <View style={styles.progressStats}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Your progress</Text>
                  <StatRow color={colors.accent} label="To do" value={toDo.length} />
                  <StatRow color={colors.textMuted} label="Awaiting grade" value={submittedCount} />
                  <StatRow color={GRADED_COLOR} label="Graded" value={gradedCount} />
                </View>
              </View>
              <View style={[styles.progressFooter, { borderTopColor: colors.border }]}>
                <Text style={[styles.progressFooterLabel, { color: colors.textMuted }]}>Average score</Text>
                <Text style={[styles.progressFooterValue, { color: colors.textPrimary }]}>
                  {averageScore === null ? "No results yet" : `${averageScore}%`}
                </Text>
              </View>
            </View>

            {results.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="Recent results" actionLabel="See all" onAction={() => navigation.navigate("Results")} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.resultsScroller} contentContainerStyle={styles.resultsRow}>
                  {results.slice(0, 6).map((result) => (
                    <Pressable
                      key={result.key}
                      onPress={() => navigation.navigate("Results")}
                      style={({ pressed }) => [styles.resultCard, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${result.title}, ${result.percent} percent`}
                    >
                      <Text style={[styles.resultKind, { color: colors.textMuted }]}>{result.kind.toUpperCase()}</Text>
                      <Text style={[styles.resultTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                        {result.title}
                      </Text>
                      <Text style={[styles.resultScore, { color: colors.textPrimary }]}>{result.percent}%</Text>
                      <View style={[styles.resultTrack, { backgroundColor: colors.backgroundMuted }]}>
                        <View style={[styles.resultFill, { width: `${Math.max(0, Math.min(100, result.percent))}%`, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={[styles.resultDetail, { color: colors.textMuted }]} numberOfLines={1}>
                        {result.detail}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {materials.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="New study material" actionLabel="See all" onAction={() => navigation.navigate("Materials")} />
                <View style={[styles.listCard, { backgroundColor: colors.surface }, cardShadow]}>
                  {materials.slice(0, 3).map((material, index, list) => (
                    <Pressable
                      key={material.id}
                      onPress={() => navigation.navigate("Materials")}
                      style={({ pressed }) => [
                        styles.materialRow,
                        index < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      accessibilityRole="button"
                    >
                      <Ionicons name={OUTPUT_TYPE_ICONS[material.outputType] ?? "document-text-outline"} size={20} color={colors.textMuted} />
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {capitalizeFirst(material.topic.name)}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {OUTPUT_TYPE_LABELS[material.outputType] ?? material.outputType} · {capitalizeFirst(material.topic.subject)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader title="Your assignments" />
              <View style={styles.filterRow}>
                {FILTERS.map((item) => {
                  const active = filter === item.key;
                  const count = item.key === "todo" ? toDo.length : item.key === "done" ? total - toDo.length : total;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilter(item.key)}
                      style={({ pressed }) => [
                        styles.filterChip,
                        { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.filterText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                        {item.label} {count}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {visibleAssignments.length === 0 ? (
                <View style={[styles.emptyCard, { borderColor: colors.border }]}>
                  <Image source={filter === "todo" ? decorativeAssets.checkCircle : decorativeAssets.book} style={styles.emptyGraphic} resizeMode="contain" />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                    {filter === "todo" ? "You're all caught up" : "No assignments yet"}
                  </Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    {filter === "todo" ? "New assignments from your teacher will appear here." : "Once your teacher publishes one, it'll show up here."}
                  </Text>
                </View>
              ) : (
                visibleAssignments.map((assignment) => (
                  <AssignmentRow key={assignment.id} assignment={assignment} onOpen={() => openAssignment(assignment)} />
                ))
              )}
            </View>
          </>
        )}

        <MadeWithLoveFooter />
      </ScrollView>
    </Screen>
  );
}

function ProgressRing({ percent, color, trackColor, children }: { percent: number; color: string; trackColor: string; children: React.ReactNode }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} stroke={trackColor} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          fill="none"
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

function StatRow({ color, label, value }: { color: string; label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statRow}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.sectionAction, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
          <Text style={[styles.sectionActionText, { color: colors.accent }]}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const STATUS_META: Record<StudentAssignmentView["submissionStatus"], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  not_submitted: { label: "Not submitted", icon: "document-text-outline" },
  submitted: { label: "Submitted · awaiting grade", icon: "time-outline" },
  graded: { label: "Graded", icon: "checkmark-done-outline" },
};

// Modelled on the assignment cards in Google Classroom / Canvas Student: a
// neutral type tile, title + details, and a footer that states where the
// work stands on the left and the one thing to do (or the score) on the right.
function AssignmentRow({ assignment, onOpen }: { assignment: StudentAssignmentView; onOpen: () => void }) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const status = assignment.submissionStatus;
  const canSubmit = status === "not_submitted";
  const meta = STATUS_META[status];
  const statusColor = status === "graded" ? GRADED_COLOR : status === "submitted" ? colors.textMuted : colors.accent;
  const score = assignment.grade?.finalScore;
  const feedback = status === "graded" ? assignment.grade?.finalFeedback : null;

  return (
    <Pressable
      disabled={!canSubmit}
      onPress={onOpen}
      style={({ pressed }) => [styles.assignmentCard, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
      accessibilityRole={canSubmit ? "button" : undefined}
      accessibilityLabel={`${assignment.title}, ${meta.label}${status === "graded" && score != null ? `, ${Math.round(score)} percent` : ""}`}
    >
      <View style={styles.assignmentBody}>
        <View style={[styles.assignmentTile, { backgroundColor: colors.backgroundMuted }]}>
          <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.assignmentTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {assignment.title}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {questionCount(assignment.questions.length)}
            {assignment.publishedAt ? ` · Set ${formatShortDate(assignment.publishedAt)}` : ""}
          </Text>
        </View>
        {status === "graded" ? (
          <View style={styles.scoreBlock}>
            <Text style={[styles.scoreValue, { color: colors.textPrimary }]}>{score == null ? "—" : Math.round(score)}</Text>
            <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>/ 100</Text>
          </View>
        ) : null}
      </View>

      {feedback ? (
        <View style={[styles.feedbackBox, { backgroundColor: colors.backgroundMuted }]}>
          <Text style={[styles.feedbackLabel, { color: colors.textMuted }]}>Teacher feedback</Text>
          <Text style={[styles.feedbackText, { color: colors.textSecondary }]} numberOfLines={3}>
            {feedback}
          </Text>
        </View>
      ) : null}

      <View style={[styles.assignmentFooter, { borderTopColor: colors.border }]}>
        <View style={styles.statusLine}>
          <Ionicons name={meta.icon} size={14} color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{meta.label}</Text>
        </View>
        {canSubmit ? (
          <View style={[styles.startButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.startButtonText, { color: colors.accentOn }]}>Start</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.accentOn} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 18 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  greeting: { fontSize: 23, lineHeight: 29, fontWeight: "600", letterSpacing: -0.45 },
  greetingName: { fontWeight: "800" },
  dateText: { marginTop: 2, fontSize: 12, fontWeight: "500" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 22, padding: 3 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  heroCard: { minHeight: 196, borderRadius: 22, padding: 18, overflow: "hidden" },
  heroGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -55, top: -72, backgroundColor: "#FFFFFF", opacity: 0.12 },
  heroCopy: { flex: 1, maxWidth: "62%", justifyContent: "space-between", gap: 14, zIndex: 2 },
  heroTextGroup: { gap: 3 },
  heroEyebrow: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { marginTop: 2, color: "#FFFFFF", fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5 },
  heroSubtitle: { marginTop: 2, color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: 17, fontWeight: "500" },
  heroButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  heroButtonText: { fontSize: 12, fontWeight: "800" },
  heroGraphic: { position: "absolute", right: -26, bottom: -4, width: 176, height: 124 },

  error: { textAlign: "center", fontSize: 13, fontWeight: "600" },
  loader: { marginTop: 24 },

  progressCard: { borderRadius: 22, padding: 16 },
  progressTop: { flexDirection: "row", alignItems: "center", gap: 18 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringCenter: { position: "absolute", alignItems: "center" },
  ringValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  ringLabel: { fontSize: 10, fontWeight: "700", marginTop: -2 },
  progressStats: { flex: 1, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "800", marginBottom: 2 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statLabel: { flex: 1, fontSize: 12.5, fontWeight: "500" },
  statValue: { fontSize: 14, fontWeight: "800" },
  progressFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  progressFooterLabel: { fontSize: 12, fontWeight: "600" },
  progressFooterValue: { fontSize: 14, fontWeight: "800" },

  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionActionText: { fontSize: 13, fontWeight: "800" },

  // Full-bleed so the cards scroll to the screen edge, with room for shadows.
  resultsScroller: { marginHorizontal: -16 },
  resultsRow: { gap: 12, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 12 },
  resultCard: { width: 156, borderRadius: 18, padding: 14 },
  resultKind: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.7 },
  resultTitle: { marginTop: 4, minHeight: 36, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  resultScore: { marginTop: 8, fontSize: 26, fontWeight: "800", letterSpacing: -0.6 },
  resultTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  resultFill: { height: "100%", borderRadius: 3 },
  resultDetail: { marginTop: 8, fontSize: 11, fontWeight: "500" },

  listCard: { borderRadius: 20, paddingHorizontal: 14 },
  materialRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowMeta: { marginTop: 2, fontSize: 11.5, fontWeight: "500" },

  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  filterText: { fontSize: 12, fontWeight: "700" },

  assignmentCard: { borderRadius: 18, paddingTop: 14, paddingHorizontal: 14 },
  assignmentBody: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  assignmentTile: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  assignmentTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: "700" },
  scoreBlock: { alignItems: "flex-end" },
  scoreValue: { fontSize: 20, lineHeight: 24, fontWeight: "800", letterSpacing: -0.4 },
  scoreUnit: { fontSize: 10.5, fontWeight: "600" },
  feedbackBox: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  feedbackLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  feedbackText: { fontSize: 12.5, lineHeight: 18 },
  assignmentFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },
  startButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  startButtonText: { fontSize: 12.5, fontWeight: "800" },

  emptyCard: { alignItems: "center", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 20, paddingVertical: 24, paddingHorizontal: 20 },
  emptyGraphic: { width: 72, height: 72, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyText: { marginTop: 4, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
});
