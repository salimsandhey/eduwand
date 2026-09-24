import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, Pressable, RefreshControl, LayoutAnimation } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, StudentSubmissionRecord, StudentAssessmentRecord } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type ResultItem =
  | { kind: "assignment"; id: string; date: string; data: StudentSubmissionRecord }
  | { kind: "assessment"; id: string; date: string; data: StudentAssessmentRecord };

type Filter = "all" | "assignment" | "assessment";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assignment", label: "Assignments" },
  { key: "assessment", label: "Quizzes" },
];

// Performance bands are set per school from the score (backend
// submissions.ts computePerformanceBand) - shown as a small colored label,
// the one place color carries meaning on these cards.
const BAND_META: Record<string, { label: string; color: string }> = {
  level_1: { label: "Strong", color: "#2FA678" },
  level_2: { label: "On track", color: "#B7791F" },
  level_3: { label: "Needs practice", color: "#C2415D" },
};

const CORRECT_COLOR = "#2FA678";
const CHART_BARS = 8;

// Scores are percentages for assignments and correct/total for quizzes; both
// become a 0-100 number so they can be averaged and charted together.
function percentOf(item: ResultItem): number | null {
  if (item.kind === "assignment") {
    const score = item.data.grade?.finalScore;
    return score == null ? null : Math.round(score);
  }
  const { correctCount, totalQuestions } = item.data.score;
  return totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function StudentResultsScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const [items, setItems] = useState<ResultItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [submissions, assessments] = await Promise.all([
        api.listStudentSubmissions(accessToken),
        api.listStudentAssessments(accessToken),
      ]);
      const merged: ResultItem[] = [
        ...submissions.map((s): ResultItem => ({ kind: "assignment", id: s.id, date: s.submittedAt, data: s })),
        ...assessments.map((a): ResultItem => ({ kind: "assessment", id: a.id, date: a.resultsReleasedAt, data: a })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItems(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setHasLoaded(true);
    }
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

  const summary = useMemo(() => {
    const scored = items.map((item) => ({ item, percent: percentOf(item) })).filter((s): s is { item: ResultItem; percent: number } => s.percent !== null);
    const average = scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.percent, 0) / scored.length) : null;
    const best = scored.length > 0 ? Math.max(...scored.map((s) => s.percent)) : null;
    const awaiting = items.filter((i) => i.kind === "assignment" && !i.data.grade).length;
    // Oldest to newest, left to right, so the chart reads as a trend.
    const recent = scored.slice(0, CHART_BARS).reverse().map((s) => s.percent);
    return { average, best, gradedCount: scored.length, awaiting, recent };
  }, [items]);

  const visibleItems = filter === "all" ? items : items.filter((i) => i.kind === filter);

  function toggleExpanded(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((current) => (current === key ? null : key));
  }

  const header = (
    <>
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Results</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Your grades, quiz scores and feedback.</Text>
      </View>

      <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={styles.heroScoreBlock}>
            <Text style={styles.heroEyebrow}>OVERALL AVERAGE</Text>
            <Text style={styles.heroScore}>
              {summary.average === null ? "—" : summary.average}
              {summary.average === null ? null : <Text style={styles.heroScoreUnit}>%</Text>}
            </Text>
            <Text style={styles.heroCaption}>
              {summary.gradedCount === 0
                ? "Scores appear once your work is graded"
                : `Across ${summary.gradedCount} graded result${summary.gradedCount === 1 ? "" : "s"}`}
            </Text>
          </View>

          <View style={styles.chart} accessibilityLabel={`Last ${summary.recent.length} scores`}>
            {summary.recent.length === 0 ? (
              <Text style={styles.chartEmpty}>No scores yet</Text>
            ) : (
              summary.recent.map((percent, index) => (
                <View key={index} style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      { height: `${Math.max(6, percent)}%`, opacity: index === summary.recent.length - 1 ? 1 : 0.55 },
                    ]}
                  />
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.heroStats}>
          <HeroStat value={summary.gradedCount} label="Graded" />
          <View style={styles.heroStatDivider} />
          <HeroStat value={summary.awaiting} label="Awaiting grade" />
          <View style={styles.heroStatDivider} />
          <HeroStat value={summary.best === null ? "—" : `${summary.best}%`} label="Best score" />
        </View>
      </LinearGradient>

      <View style={styles.filterRow}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          const count = item.key === "all" ? items.length : items.filter((i) => i.kind === item.key).length;
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

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </>
  );

  return (
    <Screen>
      <FlatList
        data={hasLoaded ? visibleItems : []}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !hasLoaded ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : (
            <View style={[styles.emptyCard, { borderColor: colors.border }]}>
              <Image source={decorativeAssets.badgeRibbon} style={styles.emptyGraphic} resizeMode="contain" />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {filter === "assessment" ? "No quiz results yet" : filter === "assignment" ? "No assignment results yet" : "No results yet"}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Submit your assignments and take class quizzes - your scores and feedback will show up here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const key = `${item.kind}-${item.id}`;
          return (
            <ResultCard item={item} expanded={expandedId === key} onToggle={item.kind === "assessment" ? () => toggleExpanded(key) : undefined} />
          );
        }}
      />
    </Screen>
  );
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Same card anatomy as the Home screen's assignment cards: neutral type tile,
// title + details, score top-right, then a footer with the outcome.
function ResultCard({ item, expanded, onToggle }: { item: ResultItem; expanded: boolean; onToggle?: () => void }) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const percent = percentOf(item);
  const isAssignment = item.kind === "assignment";
  const isAwaiting = isAssignment && !item.data.grade;
  const band = isAssignment && item.data.grade?.performanceBand ? BAND_META[item.data.grade.performanceBand] : undefined;
  const feedback = isAssignment ? item.data.grade?.finalFeedback : null;

  const title = isAssignment ? item.data.assignment.title : item.data.title || item.data.topicName;
  const meta = isAssignment
    ? `Submitted ${formatDate(item.data.submittedAt)} · ${item.data.submissionType === "photo" ? "Photo" : "Online"}`
    : `${item.data.topicName} · ${formatDate(item.data.resultsReleasedAt)}`;

  const body = (
    <>
      <View style={styles.cardBody}>
        <View style={[styles.tile, { backgroundColor: colors.backgroundMuted }]}>
          <Ionicons name={isAssignment ? "document-text-outline" : "flash-outline"} size={20} color={colors.textSecondary} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={[styles.kind, { color: colors.textMuted }]}>{isAssignment ? "ASSIGNMENT" : "QUIZ"}</Text>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {!isAwaiting ? (
          <View style={styles.scoreBlock}>
            <Text style={[styles.scoreValue, { color: colors.textPrimary }]}>
              {isAssignment ? (percent ?? "—") : item.data.score.correctCount}
            </Text>
            <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>
              {isAssignment ? "/ 100" : `/ ${item.data.score.totalQuestions}`}
            </Text>
          </View>
        ) : null}
      </View>

      {percent !== null ? (
        <View style={[styles.scoreTrack, { backgroundColor: colors.backgroundMuted }]}>
          <View style={[styles.scoreFill, { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: colors.accent }]} />
        </View>
      ) : null}

      {feedback ? (
        <View style={[styles.feedbackBox, { backgroundColor: colors.backgroundMuted }]}>
          <Text style={[styles.feedbackLabel, { color: colors.textMuted }]}>Teacher feedback</Text>
          <Text style={[styles.feedbackText, { color: colors.textSecondary }]}>{feedback}</Text>
        </View>
      ) : null}

      {!isAssignment && expanded ? (
        <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
          {item.data.questions.map((q, index) => (
            <View key={index} style={styles.breakdownRow}>
              <Ionicons
                name={q.wasCorrect === true ? "checkmark-circle" : q.wasCorrect === false ? "close-circle" : "remove-circle-outline"}
                size={17}
                color={q.wasCorrect === true ? CORRECT_COLOR : q.wasCorrect === false ? colors.danger : colors.textMuted}
              />
              <Text style={[styles.breakdownText, { color: colors.textSecondary }]} numberOfLines={2}>
                {index + 1}. {q.prompt}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {isAwaiting ? (
          <View style={styles.footerStatus}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.footerText, { color: colors.textMuted }]}>Awaiting grade from your teacher</Text>
          </View>
        ) : isAssignment ? (
          <View style={styles.footerStatus}>
            <View style={[styles.bandDot, { backgroundColor: band?.color ?? colors.textMuted }]} />
            <Text style={[styles.footerText, { color: band?.color ?? colors.textMuted }]}>{band?.label ?? "Graded"}</Text>
          </View>
        ) : (
          <View style={styles.footerStatus}>
            <Ionicons name="checkmark-done-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {item.data.score.correctCount} of {item.data.score.totalQuestions} correct
            </Text>
          </View>
        )}
        {onToggle ? (
          <View style={styles.footerAction}>
            <Text style={[styles.footerActionText, { color: colors.accent }]}>{expanded ? "Hide answers" : "See answers"}</Text>
            <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.accent} />
          </View>
        ) : null}
      </View>
    </>
  );

  if (onToggle) {
    return (
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${percent ?? 0} percent. ${expanded ? "Hide" : "Show"} answers`}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>{body}</View>;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 12, flexGrow: 1 },
  titleSection: { marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 13, fontWeight: "500" },
  error: { textAlign: "center", fontSize: 13, fontWeight: "600" },
  loader: { marginTop: 32 },

  hero: { borderRadius: 22, padding: 18, overflow: "hidden", marginTop: 8 },
  heroGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, right: -60, top: -80, backgroundColor: "#FFFFFF", opacity: 0.12 },
  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16 },
  heroScoreBlock: { flex: 1 },
  heroEyebrow: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  heroScore: { marginTop: 4, color: "#FFFFFF", fontSize: 44, lineHeight: 50, fontWeight: "800", letterSpacing: -1.2 },
  heroScoreUnit: { fontSize: 22, fontWeight: "700" },
  heroCaption: { marginTop: 2, color: "rgba(255,255,255,0.84)", fontSize: 12, fontWeight: "500" },
  chart: { width: 128, height: 72, flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 5 },
  chartEmpty: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", alignSelf: "center" },
  chartTrack: { width: 11, height: "100%", borderRadius: 4, justifyContent: "flex-end", backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  chartFill: { width: "100%", borderRadius: 4, backgroundColor: "#FFFFFF" },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 16, borderRadius: 14, paddingVertical: 11, backgroundColor: "rgba(255,255,255,0.14)" },
  heroStat: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  heroStatValue: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  heroStatLabel: { marginTop: 1, color: "rgba(255,255,255,0.8)", fontSize: 10.5, fontWeight: "600" },
  heroStatDivider: { width: 1, height: 26, backgroundColor: "rgba(255,255,255,0.25)" },

  filterRow: { flexDirection: "row", gap: 8, marginTop: 18, marginBottom: 2 },
  filterChip: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  filterText: { fontSize: 12, fontWeight: "700" },

  card: { borderRadius: 18, paddingTop: 14, paddingHorizontal: 14 },
  cardBody: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tile: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1 },
  kind: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.7 },
  cardTitle: { marginTop: 2, fontSize: 14.5, lineHeight: 20, fontWeight: "700" },
  cardMeta: { marginTop: 2, fontSize: 11.5, fontWeight: "500" },
  scoreBlock: { alignItems: "flex-end" },
  scoreValue: { fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  scoreUnit: { fontSize: 10.5, fontWeight: "600" },
  scoreTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 12 },
  scoreFill: { height: "100%", borderRadius: 3 },
  feedbackBox: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  feedbackLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  feedbackText: { fontSize: 12.5, lineHeight: 18 },
  breakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  breakdownRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  breakdownText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth },
  footerStatus: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  footerText: { fontSize: 12, fontWeight: "700" },
  bandDot: { width: 7, height: 7, borderRadius: 4 },
  footerAction: { flexDirection: "row", alignItems: "center", gap: 3 },
  footerActionText: { fontSize: 12, fontWeight: "800" },

  emptyCard: { alignItems: "center", borderWidth: 1.5, borderStyle: "dashed", borderRadius: 20, paddingVertical: 28, paddingHorizontal: 22 },
  emptyGraphic: { width: 80, height: 80, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptyText: { marginTop: 4, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
});
