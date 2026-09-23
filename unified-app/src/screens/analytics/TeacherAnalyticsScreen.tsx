import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Screen } from "../../components/Screen";
import { api, ClassAnalytics, ClassSection, StudentAnalytics } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type AnalyticsTab = "class" | "students";
const BAND_COLORS = ["#18A957", "#7C3AED", "#F97316"];

function scoreText(score: number | null) {
  return score === null ? "—" : `${Math.round(score)}%`;
}

// The weekly chart only has a real trend to show once at least two days in
// the window have graded work - otherwise there's nothing to compare.
function weeklyTrendPercent(trend: ClassAnalytics["weeklyTrend"]): number | null {
  const withScores = trend.filter((d): d is { label: string; score: number } => d.score !== null);
  if (withScores.length < 2) return null;
  const first = withScores[0].score;
  const last = withScores[withScores.length - 1].score;
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 100);
}

export function TeacherAnalyticsScreen() {
  const navigation = useNavigation<any>();
  const { colors, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const { accessToken } = useAuth();
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentAnalytics | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("class");
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingClasses(true);
    setError(null);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);
      setClassSectionId((current) => current ?? sections[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
    } finally {
      setIsLoadingClasses(false);
    }
  }, [accessToken]);

  useFocusEffect(useCallback(() => { loadClasses(); }, [loadClasses]));

  useEffect(() => {
    if (!accessToken || !classSectionId) return;
    let cancelled = false;
    setIsLoadingAnalytics(true);
    setError(null);
    api
      .getClassAnalytics(accessToken, classSectionId)
      .then((result) => { if (!cancelled) setAnalytics(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics"); })
      .finally(() => { if (!cancelled) setIsLoadingAnalytics(false); });
    return () => { cancelled = true; };
  }, [accessToken, classSectionId]);

  async function viewStudent(studentStubId: string) {
    if (!accessToken) return;
    setStudentDetailLoading(true);
    try {
      setStudentDetail(await api.getStudentAnalytics(accessToken, studentStubId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load student history");
    } finally {
      setStudentDetailLoading(false);
    }
  }

  const selectedClass = classSections.find((section) => section.id === classSectionId);
  const bands = analytics ? {
    above80: analytics.students.filter((student) => student.averageScore >= 80).length,
    between60And80: analytics.students.filter((student) => student.averageScore >= 60 && student.averageScore < 80).length,
    below60: analytics.students.filter((student) => student.averageScore < 60).length,
  } : null;
  const weakestArea = analytics?.struggleAreas[0];
  const trendPercent = analytics ? weeklyTrendPercent(analytics.weeklyTrend) : null;

  const shareAnalytics = useCallback(async () => {
    if (!analytics || !selectedClass) return;
    await Share.share({ message: `${capitalizeFirst(selectedClass.className)} ${capitalizeFirst(selectedClass.sectionName)} analytics\nClass average: ${scoreText(analytics.classAverage)}\nGraded submissions: ${analytics.submissionCount}` });
  }, [analytics, selectedClass]);

  return (
    <Screen edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.topRow}>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Analytics</Text>
          <Pressable style={({ pressed }) => [styles.shareButton, { borderColor: colors.accentSoftAlt }, pressed && { opacity: pressedOpacity }]} onPress={shareAnalytics} disabled={!analytics} accessibilityRole="button">
            <Ionicons name="share-social-outline" size={16} color={colors.accent} />
            <Text style={[styles.shareButtonText, { color: colors.accent }]}>Share</Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Turn class performance into the next best teaching step.</Text>

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        {classSections.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classPicker}>{classSections.map((section) => {
          const active = classSectionId === section.id;
          return <Pressable key={section.id} style={({ pressed }) => [styles.classChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => { setClassSectionId(section.id); setStudentDetail(null); setActiveTab("class"); }} accessibilityRole="button"><Text style={[styles.classChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{capitalizeFirst(section.className)} {capitalizeFirst(section.sectionName)}</Text></Pressable>;
        })}</ScrollView> : null}

        {isLoadingClasses ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}

        {!isLoadingClasses && classSections.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>You don't have any classes assigned yet.</Text>
          </View>
        ) : null}

        {isLoadingAnalytics ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}

        {!isLoadingAnalytics && analytics ? <>
          <View style={[styles.reportTabs, { backgroundColor: colors.backgroundMuted }]}>
            <Pressable style={[styles.reportTab, activeTab === "class" && { backgroundColor: colors.accent }]} onPress={() => setActiveTab("class")} accessibilityRole="tab"><Text style={[styles.reportTabText, { color: activeTab === "class" ? colors.accentOn : colors.textMuted }]}>Class report</Text></Pressable>
            <Pressable style={[styles.reportTab, activeTab === "students" && { backgroundColor: colors.accent }]} onPress={() => setActiveTab("students")} accessibilityRole="tab"><Text style={[styles.reportTabText, { color: activeTab === "students" ? colors.accentOn : colors.textMuted }]}>Student report</Text></Pressable>
          </View>

          {activeTab === "class" ? <>
            <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>{selectedClass ? `${capitalizeFirst(selectedClass.className)} ${capitalizeFirst(selectedClass.sectionName)}` : "Class report"}</Text>
            <Text style={[styles.reportMeta, { color: colors.textMuted }]}>Class-wide attainment overview</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricRow}>
              <Metric icon="people-outline" color="#7C3AED" value={String(analytics.students.length)} label="Students graded" colors={colors} />
              <Metric icon="analytics-outline" color="#18A957" value={scoreText(analytics.classAverage)} label="Average attainment" colors={colors} />
              <Metric icon="checkmark-done-outline" color="#F97316" value={String(analytics.submissionCount)} label="Graded work" colors={colors} />
            </ScrollView>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Overall attainment</Text><Ionicons name="information-circle-outline" size={16} color={colors.textMuted} /></View>
              <View style={[styles.scoreRing, { borderColor: analytics.classAverage === null ? colors.border : colors.accent }]}><View style={[styles.scoreRingInner, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.scoreValue, { color: colors.textPrimary }]}>{scoreText(analytics.classAverage)}</Text><Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Attainment</Text></View></View>
              <Text style={[styles.summary, { color: colors.textSecondary }]}>{analytics.classAverage === null ? "Scores will appear after submissions are graded." : "Use the score bands and focus areas below to plan your next lesson."}</Text>
              {bands ? <><ScoreBand color={BAND_COLORS[0]} label="Above 80%" value={bands.above80} colors={colors} /><ScoreBand color={BAND_COLORS[1]} label="60% - 80%" value={bands.between60And80} colors={colors} /><ScoreBand color={BAND_COLORS[2]} label="Below 60%" value={bands.below60} colors={colors} /></> : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Attainment by assignment</Text>
              {analytics.struggleAreas.length > 0 ? analytics.struggleAreas.map((area, index) => <View key={area.assignmentId} style={styles.barRow}><Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{area.title}</Text><View style={[styles.barTrack, { backgroundColor: colors.backgroundMuted }]}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, area.averageScore))}%`, backgroundColor: index === 0 ? "#F97316" : "#7C3AED" }]} /></View><Text style={[styles.barValue, { color: colors.textPrimary }]}>{Math.round(area.averageScore)}%</Text></View>) : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded assignments yet.</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.chartHeading}>
                <View><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Learning momentum</Text><Text style={[styles.chartCaption, { color: colors.textMuted }]}>Average attainment, last 7 days</Text></View>
                {trendPercent !== null ? (
                  <View style={[styles.trendBadge, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name={trendPercent >= 0 ? "trending-up" : "trending-down"} size={13} color={colors.accent} />
                    <Text style={[styles.trendBadgeText, { color: colors.accent }]}>{trendPercent >= 0 ? "+" : ""}{trendPercent}%</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.barChart}>
                {analytics.weeklyTrend.map((day, index) => (
                  <View key={`${day.label}-${index}`} style={styles.chartColumn}>
                    <Text style={[styles.chartValue, { color: colors.textSecondary }]}>{day.score === null ? "-" : day.score}</Text>
                    <View style={[styles.chartTrack, { backgroundColor: colors.backgroundMuted }]}>
                      {day.score !== null ? <View style={[styles.chartFill, { height: `${Math.max(4, day.score)}%`, backgroundColor: colors.accentSoftAlt }]} /> : null}
                    </View>
                    <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{day.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.insightCard, { backgroundColor: colors.accentSoft }]}><View style={[styles.insightIcon, { backgroundColor: colors.surface }]}><Ionicons name="bulb-outline" size={19} color={colors.accent} /></View><View style={styles.insightCopy}><Text style={[styles.insightTitle, { color: colors.textPrimary }]}>Key insight</Text><Text style={[styles.insightText, { color: colors.textSecondary }]}>{weakestArea ? `${weakestArea.title} is the lowest-scoring assignment at ${Math.round(weakestArea.averageScore)}%. Consider a short recap before moving ahead.` : "Grade an assignment to unlock class-level teaching insights."}</Text>{weakestArea ? <Pressable style={({ pressed }) => [styles.insightChip, { backgroundColor: colors.surface, borderColor: colors.accentSoftAlt }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("AssignmentDetail", { assignmentId: weakestArea.assignmentId })} accessibilityRole="button" accessibilityLabel={`Open ${weakestArea.title}`}><Text style={[styles.insightChipText, { color: colors.accent }]}>Focus area</Text><Ionicons name="arrow-forward" size={13} color={colors.accent} /></Pressable> : null}</View></View>
          </> : <>
            <Text style={[styles.studentHeading, { color: colors.textPrimary }]}>Student attainment</Text>
            {analytics.students.length === 0 ? <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded submissions yet for this class.</Text> : analytics.students.map((student) => <Pressable key={student.studentStubId} style={({ pressed }) => [styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => viewStudent(student.studentStubId)} accessibilityRole="button"><View style={[styles.studentAvatar, { backgroundColor: colors.accentSoft }]}><Text style={[styles.studentAvatarText, { color: colors.accent }]}>{student.fullName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.studentCopy}><Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(student.fullName)}</Text><Text style={[styles.studentMeta, { color: colors.textMuted }]}>{student.submissionCount} submission{student.submissionCount === 1 ? "" : "s"}</Text></View><Text style={[styles.studentScore, { color: student.averageScore < 60 ? colors.danger : colors.accent }]}>{Math.round(student.averageScore)}%</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></Pressable>)}
            {studentDetailLoading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
            {studentDetail ? <View style={[styles.detailCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><View style={styles.detailHeading}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{capitalizeFirst(studentDetail.fullName)}</Text><Pressable onPress={() => setStudentDetail(null)} hitSlop={8}><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable></View>{studentDetail.history.length === 0 ? <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded submissions yet.</Text> : studentDetail.history.map((history, index) => <View key={`${history.assignmentTitle}-${index}`} style={styles.historyRow}><Text style={[styles.historyTitle, { color: colors.textSecondary }]} numberOfLines={1}>{history.assignmentTitle}</Text><Text style={[styles.historyScore, { color: colors.textPrimary }]}>{scoreText(history.score)}</Text></View>)}</View> : null}
          </>}
        </> : null}
      </ScrollView>
    </Screen>
  );
}

function Metric({ icon, color, value, label, colors }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.metricIcon, { backgroundColor: `${color}14` }]}><Ionicons name={icon} size={17} color={color} /></View><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text></View>;
}

function ScoreBand({ color, label, value, colors }: { color: string; label: string; value: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={styles.bandRow}><View style={[styles.bandDot, { backgroundColor: color }]} /><Text style={[styles.bandLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.bandValue, { color: colors.textPrimary }]}>{value} {value === 1 ? "student" : "students"}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 24, paddingBottom: 132 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pageTitle: { fontSize: 25, fontWeight: "800", letterSpacing: -0.55 }, shareButton: { minHeight: 38, paddingHorizontal: 13, borderWidth: 1, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }, shareButtonText: { fontSize: 12, fontWeight: "800" }, subtitle: { marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  classPicker: { gap: 8, paddingTop: 18, paddingBottom: 20 }, classChip: { minHeight: 35, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, classChipText: { fontSize: 12, fontWeight: "800" }, errorText: { marginTop: 12, fontSize: 12, fontWeight: "600" }, loader: { marginTop: 34 },
  emptyState: { marginTop: 20, borderWidth: 1, borderRadius: 18, paddingVertical: 28, alignItems: "center", gap: 8 }, emptyStateText: { fontSize: 13, fontWeight: "600", textAlign: "center", paddingHorizontal: 20 },
  reportTabs: { flexDirection: "row", padding: 4, borderRadius: 24, marginBottom: 26 }, reportTab: { flex: 1, minHeight: 37, borderRadius: 19, alignItems: "center", justifyContent: "center" }, reportTabText: { fontSize: 12, fontWeight: "800" }, reportTitle: { fontSize: 27, lineHeight: 33, fontWeight: "800", letterSpacing: -0.7 }, reportMeta: { marginTop: 3, fontSize: 13, fontWeight: "500" },
  metricRow: { gap: 12, paddingTop: 20, paddingBottom: 31 }, metricCard: { width: 134, minHeight: 132, borderWidth: 1, borderRadius: 16, padding: 15 }, metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, metricValue: { marginTop: 13, fontSize: 24, lineHeight: 28, fontWeight: "800" }, metricLabel: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 25 }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 6 }, cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 }, scoreRing: { width: 128, height: 128, borderRadius: 64, borderWidth: 12, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 18, marginBottom: 19 }, scoreRingInner: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" }, scoreValue: { fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6 }, scoreLabel: { marginTop: 1, fontSize: 10, fontWeight: "700" }, summary: { fontSize: 13, lineHeight: 21, fontWeight: "500", marginBottom: 17 }, bandRow: { flexDirection: "row", alignItems: "center", minHeight: 27 }, bandDot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 }, bandLabel: { flex: 1, fontSize: 12, fontWeight: "500" }, bandValue: { fontSize: 12, fontWeight: "800" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15 }, barLabel: { width: 104, fontSize: 12, fontWeight: "500" }, barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" }, barFill: { height: "100%", borderRadius: 6 }, barValue: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "800" }, emptyText: { marginTop: 18, fontSize: 13, lineHeight: 19, textAlign: "center" },
  chartHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, chartCaption: { marginTop: 2, fontSize: 11, fontWeight: "500" }, trendBadge: { height: 27, paddingHorizontal: 9, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 4 }, trendBadgeText: { fontSize: 10, fontWeight: "800" }, barChart: { height: 162, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 15 }, chartColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" }, chartValue: { fontSize: 10, fontWeight: "800", marginBottom: 5 }, chartTrack: { width: 22, height: 104, borderRadius: 11, justifyContent: "flex-end", overflow: "hidden" }, chartFill: { width: "100%", borderRadius: 11 }, chartLabel: { marginTop: 7, fontSize: 10, fontWeight: "700" },
  insightCard: { flexDirection: "row", borderRadius: 18, padding: 18, marginBottom: 24 }, insightIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 13 }, insightCopy: { flex: 1 }, insightTitle: { fontSize: 14, fontWeight: "800" }, insightText: { marginTop: 5, fontSize: 12, lineHeight: 19, fontWeight: "500" }, insightChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 18, marginTop: 13 }, insightChipText: { fontSize: 11, fontWeight: "800" },
  studentHeading: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.35, marginBottom: 14 }, studentRow: { minHeight: 70, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }, studentAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, studentAvatarText: { fontSize: 14, fontWeight: "800" }, studentCopy: { flex: 1 }, studentName: { fontSize: 13, fontWeight: "800" }, studentMeta: { marginTop: 2, fontSize: 11, fontWeight: "500" }, studentScore: { fontSize: 16, fontWeight: "800" }, detailCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 8 }, detailHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 13 }, historyTitle: { flex: 1, fontSize: 12, fontWeight: "500" }, historyScore: { fontSize: 12, fontWeight: "800" },
});
