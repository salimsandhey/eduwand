import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { Screen } from "../../components/Screen";
import { StudentAvatar } from "../../components/StudentAvatar";
import { SheetModal } from "../../components/SheetModal";
import { api, ClassAnalytics, ClassSection, StudentAnalytics, Topic } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type AnalyticsTab = "class" | "students";
type ReportType = "performance" | "attainment";
// Side padding of the page - full-bleed rows offset by exactly this much.
const PAGE_PADDING = 24;
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
  const { colors, cardShadow, pressedOpacity } = useTheme();
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState<"class-pdf" | "class-csv" | "student-pdf" | null>(null);

  // Scope picker: null subject = "All subjects" (today's whole-class-section
  // view). A subject narrows to it; a topic narrows further to just that
  // topic. Attainment only makes sense once a subject/topic is chosen - see
  // reportType below.
  const [topics, setTopics] = useState<Topic[]>([]);
  const [scopeSubject, setScopeSubject] = useState<string | null>(null);
  const [scopeTopicId, setScopeTopicId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>("performance");
  const subjects = [...new Set(topics.map((t) => t.subject))];
  const topicsInSubject = scopeSubject ? topics.filter((t) => t.subject === scopeSubject) : [];

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
    api
      .listTopics(accessToken, { classSectionId })
      .then((result) => { if (!cancelled) setTopics(result); })
      .catch(() => { if (!cancelled) setTopics([]); });
    return () => { cancelled = true; };
  }, [accessToken, classSectionId]);

  useEffect(() => {
    if (!accessToken || !classSectionId) return;
    let cancelled = false;
    setIsLoadingAnalytics(true);
    setError(null);
    api
      .getClassAnalytics(accessToken, classSectionId, { subject: scopeSubject ?? undefined, topicId: scopeTopicId ?? undefined })
      .then((result) => { if (!cancelled) setAnalytics(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics"); })
      .finally(() => { if (!cancelled) setIsLoadingAnalytics(false); });
    return () => { cancelled = true; };
  }, [accessToken, classSectionId, scopeSubject, scopeTopicId]);

  function selectScopeSubject(subject: string | null) {
    setScopeSubject(subject);
    setScopeTopicId(null);
    if (subject === null) setReportType("performance");
  }

  async function viewStudent(studentStubId: string) {
    if (!accessToken) return;
    setStudentDetailLoading(true);
    try {
      setStudentDetail(await api.getStudentAnalytics(accessToken, studentStubId, { subject: scopeSubject ?? undefined, topicId: scopeTopicId ?? undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load student history");
    } finally {
      setStudentDetailLoading(false);
    }
  }

  const selectedClass = classSections.find((section) => section.id === classSectionId);
  // Uses the school's real ClassBandConfig thresholds (computed server-side)
  // instead of a hardcoded 80/60 - see ai-analytics.ts.
  const bands = analytics ? analytics.scoreBands : null;
  const weakestArea = analytics?.struggleAreas[0];
  const trendPercent = analytics ? weeklyTrendPercent(analytics.weeklyTrend) : null;

  // Downloads a file from the backend (PDF or CSV) and hands it to the
  // native share sheet - same pattern AttainmentReportScreen's shareReport
  // uses, so a report actually leaves the phone as a real file instead of a
  // plain text blurb.
  async function downloadAndShare(url: string, fileName: string, mimeType: string, dialogTitle: string) {
    if (!accessToken) return;
    setError(null);
    try {
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.downloadAsync(url, fileUri, { headers: { Authorization: `Bearer ${accessToken}` } });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType, dialogTitle, UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.comma-separated-values-text" });
      } else {
        setError(`Report saved to ${fileUri}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export report");
    }
  }

  async function exportClassPdf() {
    if (!classSectionId || !selectedClass) return;
    setShowExportMenu(false);
    setIsExporting("class-pdf");
    const scope = { subject: scopeSubject ?? undefined, topicId: scopeTopicId ?? undefined };
    const fileName = `${selectedClass.className}-${selectedClass.sectionName}-performance-report.pdf`.replace(/\s+/g, "-");
    await downloadAndShare(api.classPerformancePdfUrl(classSectionId, scope), fileName, "application/pdf", "Share performance report");
    setIsExporting(null);
  }

  async function exportClassCsv() {
    if (!classSectionId || !selectedClass) return;
    setShowExportMenu(false);
    setIsExporting("class-csv");
    const scope = { subject: scopeSubject ?? undefined, topicId: scopeTopicId ?? undefined };
    const fileName = `${selectedClass.className}-${selectedClass.sectionName}-performance-report.csv`.replace(/\s+/g, "-");
    await downloadAndShare(api.classPerformanceCsvUrl(classSectionId, scope), fileName, "text/csv", "Share performance report (CSV)");
    setIsExporting(null);
  }

  async function exportStudentPdf() {
    if (!studentDetail) return;
    setIsExporting("student-pdf");
    const scope = { subject: scopeSubject ?? undefined, topicId: scopeTopicId ?? undefined };
    const fileName = `${studentDetail.fullName}-performance-report.pdf`.replace(/\s+/g, "-");
    await downloadAndShare(api.studentPerformancePdfUrl(studentDetail.studentStubId, scope), fileName, "application/pdf", "Share student performance report");
    setIsExporting(null);
  }

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
          <Pressable
            style={({ pressed }) => [styles.shareButton, { borderColor: colors.accentSoftAlt }, (!analytics || isExporting !== null || pressed) && { opacity: pressedOpacity }]}
            onPress={() => setShowExportMenu(true)}
            disabled={!analytics || isExporting !== null}
            accessibilityRole="button"
          >
            {isExporting === "class-pdf" || isExporting === "class-csv" ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="share-social-outline" size={16} color={colors.accent} />
            )}
            <Text style={[styles.shareButtonText, { color: colors.accent }]}>Export</Text>
          </Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Turn class performance into the next best teaching step.</Text>

        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

        {classSections.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classPicker}>{classSections.map((section) => {
          const active = classSectionId === section.id;
          return <Pressable key={section.id} style={({ pressed }) => [styles.classChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => { setClassSectionId(section.id); setStudentDetail(null); setActiveTab("class"); setScopeSubject(null); setScopeTopicId(null); setReportType("performance"); }} accessibilityRole="button"><Text style={[styles.classChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{capitalizeFirst(section.className)} {capitalizeFirst(section.sectionName)}</Text></Pressable>;
        })}</ScrollView> : null}

        {isLoadingClasses ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}

        {!isLoadingClasses && classSections.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surfaceRaised }, cardShadow]}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>You don't have any classes assigned yet.</Text>
          </View>
        ) : null}

        {classSectionId && subjects.length > 0 ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classPicker}>
              <Pressable style={({ pressed }) => [styles.classChip, { backgroundColor: scopeSubject === null ? colors.accent : colors.surfaceRaised, borderColor: scopeSubject === null ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => selectScopeSubject(null)} accessibilityRole="button">
                <Text style={[styles.classChipText, { color: scopeSubject === null ? colors.accentOn : colors.textSecondary }]}>All subjects</Text>
              </Pressable>
              {subjects.map((subject) => {
                const active = scopeSubject === subject;
                return <Pressable key={subject} style={({ pressed }) => [styles.classChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => selectScopeSubject(subject)} accessibilityRole="button"><Text style={[styles.classChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{capitalizeFirst(subject)}</Text></Pressable>;
              })}
            </ScrollView>
            {scopeSubject && topicsInSubject.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classPicker}>
                <Pressable style={({ pressed }) => [styles.classChip, { backgroundColor: scopeTopicId === null ? colors.accent : colors.surfaceRaised, borderColor: scopeTopicId === null ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => setScopeTopicId(null)} accessibilityRole="button">
                  <Text style={[styles.classChipText, { color: scopeTopicId === null ? colors.accentOn : colors.textSecondary }]}>All topics</Text>
                </Pressable>
                {topicsInSubject.map((topic) => {
                  const active = scopeTopicId === topic.id;
                  return <Pressable key={topic.id} style={({ pressed }) => [styles.classChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => setScopeTopicId(topic.id)} accessibilityRole="button"><Text style={[styles.classChipText, { color: active ? colors.accentOn : colors.textSecondary }]} numberOfLines={1}>{capitalizeFirst(topic.name)}</Text></Pressable>;
                })}
              </ScrollView>
            ) : null}

            <View style={[styles.reportTabs, { backgroundColor: colors.backgroundMuted }]}>
              <Pressable style={[styles.reportTab, reportType === "performance" && { backgroundColor: colors.accent }]} onPress={() => setReportType("performance")} accessibilityRole="tab">
                <Text style={[styles.reportTabText, { color: reportType === "performance" ? colors.accentOn : colors.textMuted }]}>Performance</Text>
              </Pressable>
              <Pressable
                style={[styles.reportTab, reportType === "attainment" && { backgroundColor: colors.accent }, scopeSubject === null && { opacity: 0.4 }]}
                onPress={() => scopeSubject !== null && setReportType("attainment")}
                disabled={scopeSubject === null}
                accessibilityRole="tab"
                accessibilityState={{ disabled: scopeSubject === null }}
              >
                <Text style={[styles.reportTabText, { color: reportType === "attainment" ? colors.accentOn : colors.textMuted }]}>Attainment</Text>
              </Pressable>
            </View>
            {scopeSubject === null ? <Text style={[styles.reportMeta, { color: colors.textMuted, marginTop: -14, marginBottom: 14 }]}>Pick a subject or topic above to see its Attainment Report.</Text> : null}
          </>
        ) : null}

        {reportType === "attainment" && scopeSubject !== null ? (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 12 }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() =>
              scopeTopicId
                ? navigation.navigate("AttainmentReport", { topicId: scopeTopicId })
                : navigation.navigate("AttainmentReport", {
                    classSectionId: classSectionId!,
                    subject: scopeSubject,
                    className: selectedClass?.className ?? "",
                    sectionName: selectedClass?.sectionName ?? "",
                  })
            }
            accessibilityRole="button"
          >
            <View style={[styles.metricIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="school-outline" size={18} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Open Attainment Report</Text>
              <Text style={[styles.reportMeta, { color: colors.textMuted }]}>What was taught, observed, and whether objectives met their benchmark.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {isLoadingAnalytics ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}

        {reportType === "performance" && !isLoadingAnalytics && analytics ? <>
          <ReportTabs activeTab={activeTab} onChange={setActiveTab} colors={colors} />

          {activeTab === "class" ? <>
            <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>{selectedClass ? `${capitalizeFirst(selectedClass.className)} ${capitalizeFirst(selectedClass.sectionName)}` : "Class report"}</Text>
            <Text style={[styles.reportMeta, { color: colors.textMuted }]}>Class-wide attainment overview</Text>
            {/* Full-bleed: breaks out of the page padding to span the screen edge to edge, with the
                padding moved inside the scroll so the first card still lines up with the page and
                card shadows have room to render instead of being clipped by the scroll view. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.metricScroller} contentContainerStyle={styles.metricRow}>
              <Metric icon="people-outline" color="#7C3AED" value={String(analytics.students.length)} label="Students graded" colors={colors} />
              <Metric icon="analytics-outline" color="#18A957" value={scoreText(analytics.classAverage)} label="Average attainment" colors={colors} />
              <Metric icon="checkmark-done-outline" color="#F97316" value={String(analytics.submissionCount)} label="Graded work" colors={colors} />
            </ScrollView>

            <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
              <View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Overall attainment</Text><Ionicons name="information-circle-outline" size={16} color={colors.textMuted} /></View>
              <View style={[styles.scoreRing, { borderColor: analytics.classAverage === null ? colors.border : colors.accent }]}><View style={[styles.scoreRingInner, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.scoreValue, { color: colors.textPrimary }]}>{scoreText(analytics.classAverage)}</Text><Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Attainment</Text></View></View>
              <Text style={[styles.summary, { color: colors.textSecondary }]}>{analytics.classAverage === null ? "Scores will appear after submissions are graded." : "Use the score bands and focus areas below to plan your next lesson."}</Text>
              {bands ? <><ScoreBand color={BAND_COLORS[0]} label="Above 80%" value={bands.above80} colors={colors} /><ScoreBand color={BAND_COLORS[1]} label="60% - 80%" value={bands.between60And80} colors={colors} /><ScoreBand color={BAND_COLORS[2]} label="Below 60%" value={bands.below60} colors={colors} /></> : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Attainment by assignment</Text>
              {analytics.struggleAreas.length > 0 ? analytics.struggleAreas.map((area, index) => <View key={area.assignmentId} style={styles.barRow}><Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{area.title}</Text><View style={[styles.barTrack, { backgroundColor: colors.backgroundMuted }]}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, area.averageScore))}%`, backgroundColor: index === 0 ? "#F97316" : "#7C3AED" }]} /></View><Text style={[styles.barValue, { color: colors.textPrimary }]}>{Math.round(area.averageScore)}%</Text></View>) : <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded assignments yet.</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
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
            {analytics.students.length === 0 ? <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded submissions yet for this class.</Text> : analytics.students.map((student) => <Pressable key={student.studentStubId} style={({ pressed }) => [styles.studentRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]} onPress={() => viewStudent(student.studentStubId)} accessibilityRole="button"><StudentAvatar studentId={student.studentStubId} picture={student} size={36} /><View style={styles.studentCopy}><Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(student.fullName)}</Text><Text style={[styles.studentMeta, { color: colors.textMuted }]}>{student.submissionCount} submission{student.submissionCount === 1 ? "" : "s"}</Text></View><Text style={[styles.studentScore, { color: student.averageScore < 60 ? colors.danger : colors.accent }]}>{Math.round(student.averageScore)}%</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></Pressable>)}
            {studentDetailLoading ? <ActivityIndicator color={colors.accent} style={styles.loader} /> : null}
            {studentDetail ? (
              <View style={[styles.detailCard, { backgroundColor: colors.surfaceRaised }, cardShadow]}>
                <View style={styles.detailHeading}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{capitalizeFirst(studentDetail.fullName)}</Text>
                  <View style={styles.detailHeadingActions}>
                    <Pressable onPress={exportStudentPdf} disabled={isExporting !== null} hitSlop={8} accessibilityRole="button" accessibilityLabel="Export this student's report as PDF">
                      {isExporting === "student-pdf" ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="download-outline" size={18} color={colors.accent} />}
                    </Pressable>
                    <Pressable onPress={() => setStudentDetail(null)} hitSlop={8}><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable>
                  </View>
                </View>

                {studentDetail.insights.strongest.length > 0 || studentDetail.insights.weakest.length > 0 ? (
                  <View style={styles.insightTagRow}>
                    {studentDetail.insights.strongest.map((s, i) => (
                      <View key={`strong-${i}`} style={[styles.insightTag, { backgroundColor: "#18A95722" }]}>
                        <Ionicons name="trending-up" size={11} color="#18A957" />
                        <Text style={[styles.insightTagText, { color: "#18A957" }]} numberOfLines={1}>{capitalizeFirst(s.label)}</Text>
                      </View>
                    ))}
                    {studentDetail.insights.weakest.map((w, i) => (
                      <View key={`weak-${i}`} style={[styles.insightTag, { backgroundColor: `${colors.danger}22` }]}>
                        <Ionicons name="trending-down" size={11} color={colors.danger} />
                        <Text style={[styles.insightTagText, { color: colors.danger }]} numberOfLines={1}>{capitalizeFirst(w.label)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Text style={[styles.studentInsightText, { color: colors.textSecondary }]}>{studentDetail.insights.aiSummary}</Text>
                <View style={[styles.nextStepRow, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="bulb-outline" size={14} color={colors.accent} />
                  <Text style={[styles.nextStepText, { color: colors.textPrimary }]}>{studentDetail.insights.aiNextStep}</Text>
                </View>

                <Text style={[styles.studentModalSectionLabel, { color: colors.textMuted }]}>History</Text>
                {studentDetail.history.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded submissions yet.</Text>
                ) : (
                  studentDetail.history.map((history, index) => (
                    <View key={`${history.assignmentTitle}-${index}`} style={styles.historyRow}>
                      <Text style={[styles.historyTitle, { color: colors.textSecondary }]} numberOfLines={1}>{history.assignmentTitle}</Text>
                      <Text style={[styles.historyScore, { color: colors.textPrimary }]}>{scoreText(history.score)}</Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>}
        </> : null}
      </ScrollView>

      <SheetModal visible={showExportMenu} onClose={() => setShowExportMenu(false)} closeLabel="Close export menu">
        <View style={styles.modalHeader}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Export performance report</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Every student currently listed, in one file.</Text>
          </View>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowExportMenu(false)} accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Pressable style={({ pressed }) => [styles.exportOptionRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={exportClassPdf} accessibilityRole="button">
          <View style={[styles.exportOptionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="document-text-outline" size={19} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.exportOptionTitle, { color: colors.textPrimary }]}>Export as PDF</Text>
            <Text style={[styles.exportOptionDetail, { color: colors.textMuted }]}>A formatted report - overview, trends, and every student's score.</Text>
          </View>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.exportOptionRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={exportClassCsv} accessibilityRole="button">
          <View style={[styles.exportOptionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="grid-outline" size={19} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.exportOptionTitle, { color: colors.textPrimary }]}>Export as CSV</Text>
            <Text style={[styles.exportOptionDetail, { color: colors.textMuted }]}>Just the student list and scores, for a spreadsheet.</Text>
          </View>
        </Pressable>
      </SheetModal>
    </Screen>
  );
}

const REPORT_TABS: { key: AnalyticsTab; label: string }[] = [
  { key: "class", label: "Class report" },
  { key: "students", label: "Student report" },
];
const REPORT_TABS_PADDING = 4;

// Segmented switch with a pill that slides between the two tabs (and label
// colors that cross-fade with it) instead of jumping. JS-driven because it
// animates a color alongside the position - it's two small views, so cheap.
function ReportTabs({ activeTab, onChange, colors }: { activeTab: AnalyticsTab; onChange: (tab: AnalyticsTab) => void; colors: ReturnType<typeof useTheme>["colors"] }) {
  const activeIndex = REPORT_TABS.findIndex((tab) => tab.key === activeTab);
  const position = useRef(new Animated.Value(activeIndex)).current;
  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    Animated.spring(position, { toValue: activeIndex, tension: 170, friction: 22, useNativeDriver: false }).start();
  }, [activeIndex, position]);

  return (
    <View
      style={[styles.reportTabs, { backgroundColor: colors.backgroundMuted }]}
      onLayout={(e) => setTabWidth((e.nativeEvent.layout.width - REPORT_TABS_PADDING * 2) / REPORT_TABS.length)}
      accessibilityRole="tablist"
    >
      {tabWidth > 0 ? (
        <Animated.View
          style={[
            styles.reportTabPill,
            { width: tabWidth, backgroundColor: colors.accent, transform: [{ translateX: Animated.multiply(position, tabWidth) }] },
          ]}
        />
      ) : null}
      {REPORT_TABS.map((tab, index) => (
        <Pressable
          key={tab.key}
          style={styles.reportTab}
          onPress={() => onChange(tab.key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab.key }}
        >
          <Animated.Text
            style={[
              styles.reportTabText,
              {
                color:
                  tabWidth > 0
                    ? position.interpolate({
                        inputRange: [index - 1, index, index + 1],
                        outputRange: [colors.textMuted, colors.accentOn, colors.textMuted],
                        extrapolate: "clamp",
                      })
                    : activeTab === tab.key
                      ? colors.accentOn
                      : colors.textMuted,
              },
            ]}
          >
            {tab.label}
          </Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

function Metric({ icon, color, value, label, colors }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: string; label: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  const { cardShadow } = useTheme();
  return <View style={[styles.metricCard, { backgroundColor: colors.surface }, cardShadow]}><View style={[styles.metricIcon, { backgroundColor: `${color}14` }]}><Ionicons name={icon} size={17} color={color} /></View><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text></View>;
}

function ScoreBand({ color, label, value, colors }: { color: string; label: string; value: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={styles.bandRow}><View style={[styles.bandDot, { backgroundColor: color }]} /><Text style={[styles.bandLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.bandValue, { color: colors.textPrimary }]}>{value} {value === 1 ? "student" : "students"}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: PAGE_PADDING, paddingBottom: 132 }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, pageTitle: { fontSize: 25, fontWeight: "800", letterSpacing: -0.55 }, shareButton: { minHeight: 38, paddingHorizontal: 13, borderWidth: 1, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }, shareButtonText: { fontSize: 12, fontWeight: "800" }, subtitle: { marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  classPicker: { gap: 8, paddingTop: 18, paddingBottom: 20 }, classChip: { minHeight: 35, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, classChipText: { fontSize: 12, fontWeight: "800" }, errorText: { marginTop: 12, fontSize: 12, fontWeight: "600" }, loader: { marginTop: 34 },
  emptyState: { marginTop: 20, borderRadius: 18, paddingVertical: 28, alignItems: "center", gap: 8 }, emptyStateText: { fontSize: 13, fontWeight: "600", textAlign: "center", paddingHorizontal: 20 },
  reportTabs: { flexDirection: "row", padding: REPORT_TABS_PADDING, borderRadius: 24, marginBottom: 26 }, reportTabPill: { position: "absolute", top: REPORT_TABS_PADDING, bottom: REPORT_TABS_PADDING, left: REPORT_TABS_PADDING, borderRadius: 19 }, reportTab: { flex: 1, minHeight: 37, borderRadius: 19, alignItems: "center", justifyContent: "center" }, reportTabText: { fontSize: 12, fontWeight: "800" }, reportTitle: { fontSize: 27, lineHeight: 33, fontWeight: "800", letterSpacing: -0.7 }, reportMeta: { marginTop: 3, fontSize: 13, fontWeight: "500" },
  metricScroller: { marginHorizontal: -PAGE_PADDING, overflow: "visible" }, metricRow: { gap: 12, paddingHorizontal: PAGE_PADDING, paddingTop: 20, paddingBottom: 31 }, metricCard: { width: 134, minHeight: 132, borderRadius: 16, padding: 15 }, metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, metricValue: { marginTop: 13, fontSize: 24, lineHeight: 28, fontWeight: "800" }, metricLabel: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  card: { borderRadius: 22, padding: 20, marginBottom: 25 }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 6 }, cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 }, scoreRing: { width: 128, height: 128, borderRadius: 64, borderWidth: 12, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 18, marginBottom: 19 }, scoreRingInner: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" }, scoreValue: { fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6 }, scoreLabel: { marginTop: 1, fontSize: 10, fontWeight: "700" }, summary: { fontSize: 13, lineHeight: 21, fontWeight: "500", marginBottom: 17 }, bandRow: { flexDirection: "row", alignItems: "center", minHeight: 27 }, bandDot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 }, bandLabel: { flex: 1, fontSize: 12, fontWeight: "500" }, bandValue: { fontSize: 12, fontWeight: "800" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15 }, barLabel: { width: 104, fontSize: 12, fontWeight: "500" }, barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" }, barFill: { height: "100%", borderRadius: 6 }, barValue: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "800" }, emptyText: { marginTop: 18, fontSize: 13, lineHeight: 19, textAlign: "center" },
  chartHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }, chartCaption: { marginTop: 2, fontSize: 11, fontWeight: "500" }, trendBadge: { height: 27, paddingHorizontal: 9, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 4 }, trendBadgeText: { fontSize: 10, fontWeight: "800" }, barChart: { height: 162, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 15 }, chartColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" }, chartValue: { fontSize: 10, fontWeight: "800", marginBottom: 5 }, chartTrack: { width: 22, height: 104, borderRadius: 11, justifyContent: "flex-end", overflow: "hidden" }, chartFill: { width: "100%", borderRadius: 11 }, chartLabel: { marginTop: 7, fontSize: 10, fontWeight: "700" },
  insightCard: { flexDirection: "row", borderRadius: 18, padding: 18, marginBottom: 24 }, insightIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 13 }, insightCopy: { flex: 1 }, insightTitle: { fontSize: 14, fontWeight: "800" }, insightText: { marginTop: 5, fontSize: 12, lineHeight: 19, fontWeight: "500" }, insightChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 18, marginTop: 13 }, insightChipText: { fontSize: 11, fontWeight: "800" },
  studentHeading: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.35, marginBottom: 14 }, studentRow: { minHeight: 70, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }, studentCopy: { flex: 1 }, studentName: { fontSize: 13, fontWeight: "800" }, studentMeta: { marginTop: 2, fontSize: 11, fontWeight: "500" }, studentScore: { fontSize: 16, fontWeight: "800" }, detailCard: { borderRadius: 16, padding: 16, marginTop: 8 }, detailHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, detailHeadingActions: { flexDirection: "row", alignItems: "center", gap: 16 }, historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 13 }, historyTitle: { flex: 1, fontSize: 12, fontWeight: "500" }, historyScore: { fontSize: 12, fontWeight: "800" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalSubtitle: { marginTop: 3, fontSize: 12, fontWeight: "500" },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  exportOptionRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  exportOptionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  exportOptionTitle: { fontSize: 14, fontWeight: "800" },
  exportOptionDetail: { marginTop: 2, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  insightTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  insightTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, maxWidth: 160 },
  insightTagText: { fontSize: 11, fontWeight: "700" },
  studentInsightText: { marginTop: 12, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  nextStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, padding: 10, marginTop: 10 },
  nextStepText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  studentModalSectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", marginTop: 16, marginBottom: 4 },
});
