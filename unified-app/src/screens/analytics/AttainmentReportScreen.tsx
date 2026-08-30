import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AttainmentReportRecord } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AttainmentReport">;
const BAND_COLORS = ["#18A957", "#7C3AED", "#F97316"];

function displayScore(score: number | null) {
  return score === null ? "—" : `${Math.round(score)}%`;
}

export function AttainmentReportScreen({ route }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const [report, setReport] = useState<AttainmentReportRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setReport(await api.getAttainmentReport(accessToken, topicId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attainment report");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, topicId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shareReport = useCallback(async () => {
    if (!report) return;
    await Share.share({ message: `${report.topicName} attainment report\nClass average: ${displayScore(report.averageScore)}\n${report.outcomes ?? ""}` });
  }, [report]);

  if (isLoading && !report) return <Screen style={styles.centered}><ActivityIndicator color={colors.accent} /></Screen>;
  if (!report) return <Screen style={styles.centered}><Text style={{ color: colors.danger }}>{error ?? "Report not available"}</Text></Screen>;

  const hasScores = report.averageScore !== null;
  const insight = report.improvementNotes ?? "No teacher observations recorded for this topic.";

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={[styles.analyticsLabel, { color: colors.textPrimary }]}>Analytics</Text>
          <Pressable style={({ pressed }) => [styles.shareButton, { borderColor: colors.accentSoftAlt }, pressed && { opacity: pressedOpacity }]} onPress={shareReport} accessibilityRole="button">
            <Ionicons name="share-social-outline" size={16} color={colors.accent} />
            <Text style={[styles.shareButtonText, { color: colors.accent }]}>Share report</Text>
          </Pressable>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>Attainment Report</Text>
        <Text style={[styles.topicTitle, { color: colors.textPrimary }]} numberOfLines={2}>{report.topicName}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>{report.className} - {report.sectionName} · {report.subject}</Text>

        <View style={[styles.reportTabs, { backgroundColor: colors.backgroundMuted }]}>
          <View style={[styles.reportTab, { backgroundColor: colors.accent }]}><Text style={styles.reportTabActiveText}>Class report</Text></View>
          <View style={styles.reportTab}><Text style={[styles.reportTabText, { color: colors.textMuted }]}>Student report</Text></View>
          <View style={styles.reportTab}><Text style={[styles.reportTabText, { color: colors.textMuted }]}>Topic report</Text></View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricRow}>
          <MetricCard icon="people-outline" iconColor="#7C3AED" label="Class size" value={String(report.studentCount)} detail="students" colors={colors} />
          <MetricCard icon="analytics-outline" iconColor="#18A957" label="Average attainment" value={displayScore(report.averageScore)} detail={hasScores ? "graded work" : "awaiting grades"} colors={colors} />
          <MetricCard icon="checkmark-done-outline" iconColor="#F97316" label="Graded" value={String(report.gradedSubmissionCount)} detail="submissions" colors={colors} />
        </ScrollView>

        <View style={[styles.card, styles.overallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Overall attainment</Text><Ionicons name="information-circle-outline" size={16} color={colors.textMuted} /></View>
          <View style={[styles.scoreRing, { borderColor: hasScores ? colors.accent : colors.border }]}><View style={[styles.scoreRingInner, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.scoreValue, { color: colors.textPrimary }]}>{displayScore(report.averageScore)}</Text><Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{hasScores ? "Attainment" : "No scores"}</Text></View></View>
          <Text style={[styles.overallSummary, { color: colors.textSecondary }]}>{hasScores ? "This class is building a solid understanding of the topic. Use the score bands below to target next steps." : "Grades will appear here once student submissions have been assessed."}</Text>
          <ScoreBand color={BAND_COLORS[0]} label="Above 80%" value={report.scoreBands.above80} colors={colors} />
          <ScoreBand color={BAND_COLORS[1]} label="60% - 80%" value={report.scoreBands.between60And80} colors={colors} />
          <ScoreBand color={BAND_COLORS[2]} label="Below 60%" value={report.scoreBands.below60} colors={colors} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Attainment by assignment</Text>
          {report.assignmentAttainment.length > 0 ? report.assignmentAttainment.map((assignment, index) => <View key={assignment.assignmentId} style={styles.barRow}><Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{assignment.title}</Text><View style={[styles.barTrack, { backgroundColor: colors.backgroundMuted }]}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, assignment.averageScore ?? 0))}%`, backgroundColor: index % 2 === 0 ? "#18A957" : "#7C3AED" }]} /></View><Text style={[styles.barValue, { color: colors.textPrimary }]}>{displayScore(assignment.averageScore)}</Text></View>) : <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No graded assignments for this topic yet.</Text>}
        </View>

        <View style={[styles.insightCard, { backgroundColor: colors.accentSoft }]}><View style={[styles.insightIcon, { backgroundColor: colors.surface }]}><Ionicons name="bulb-outline" size={19} color={colors.accent} /></View><View style={styles.insightCopy}><Text style={[styles.insightTitle, { color: colors.textPrimary }]}>Key insight</Text><Text style={[styles.insightText, { color: colors.textSecondary }]} numberOfLines={5}>{insight}</Text><View style={[styles.insightChip, { backgroundColor: colors.surface, borderColor: colors.accentSoftAlt }]}><Text style={[styles.insightChipText, { color: colors.accent }]}>Teacher reflection</Text><Ionicons name="arrow-forward" size={13} color={colors.accent} /></View></View></View>

        <ReportNote title="What was done" value={report.whatWasDone} colors={colors} />
        <ReportNote title="Outcomes" value={report.outcomes} colors={colors} />
      </ScrollView>
    </Screen>
  );
}

function MetricCard({ icon, iconColor, label, value, detail, colors }: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string; value: string; detail: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.metricIcon, { backgroundColor: `${iconColor}14` }]}><Ionicons name={icon} size={17} color={iconColor} /></View><Text style={[styles.metricValue, { color: iconColor }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.metricDetail, { color: colors.textMuted }]}>{detail}</Text></View>;
}

function ScoreBand({ color, label, value, colors }: { color: string; label: string; value: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={styles.bandRow}><View style={[styles.bandDot, { backgroundColor: color }]} /><Text style={[styles.bandLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.bandValue, { color: colors.textPrimary }]}>{value} {value === 1 ? "student" : "students"}</Text></View>;
}

function ReportNote({ title, value, colors }: { title: string; value: string | null; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.reportNote, { borderColor: colors.border }]}><Text style={[styles.reportNoteTitle, { color: colors.textPrimary }]}>{title}</Text><Text style={[styles.reportNoteBody, { color: colors.textSecondary }]}>{value ?? "Not recorded yet."}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 24, paddingBottom: 44 }, centered: { justifyContent: "center", alignItems: "center" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, analyticsLabel: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 }, shareButton: { minHeight: 39, paddingHorizontal: 13, borderWidth: 1, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 6 }, shareButtonText: { fontSize: 12, fontWeight: "800" },
  title: { marginTop: 34, fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.8 }, topicTitle: { marginTop: 6, fontSize: 19, lineHeight: 25, fontWeight: "800", letterSpacing: -0.35 }, meta: { marginTop: 3, fontSize: 13, fontWeight: "500" },
  reportTabs: { flexDirection: "row", padding: 4, borderRadius: 24, marginTop: 36 }, reportTab: { flex: 1, minHeight: 37, alignItems: "center", justifyContent: "center", borderRadius: 19 }, reportTabActiveText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, reportTabText: { fontSize: 12, fontWeight: "700" },
  metricRow: { gap: 12, paddingTop: 20, paddingBottom: 32 }, metricCard: { width: 130, minHeight: 146, borderWidth: 1, borderRadius: 16, padding: 15 }, metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, metricValue: { marginTop: 13, fontSize: 24, lineHeight: 28, fontWeight: "800" }, metricLabel: { marginTop: 3, fontSize: 11, lineHeight: 14, fontWeight: "700" }, metricDetail: { marginTop: 2, fontSize: 10, lineHeight: 13, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 28 }, overallCard: { alignItems: "stretch" }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 6 }, cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 }, scoreRing: { width: 128, height: 128, borderRadius: 64, borderWidth: 12, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 18, marginBottom: 19 }, scoreRingInner: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" }, scoreValue: { fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6 }, scoreLabel: { marginTop: 1, fontSize: 10, fontWeight: "700" },
  overallSummary: { fontSize: 13, lineHeight: 21, fontWeight: "500", marginBottom: 17 }, bandRow: { flexDirection: "row", alignItems: "center", minHeight: 27 }, bandDot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 }, bandLabel: { flex: 1, fontSize: 12, fontWeight: "500" }, bandValue: { fontSize: 12, fontWeight: "800" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15 }, barLabel: { width: 105, fontSize: 12, fontWeight: "500" }, barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" }, barFill: { height: "100%", borderRadius: 6 }, barValue: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "800" }, emptyChartText: { marginTop: 20, fontSize: 13, lineHeight: 19, textAlign: "center" },
  insightCard: { flexDirection: "row", borderRadius: 18, padding: 18, marginBottom: 24 }, insightIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 13 }, insightCopy: { flex: 1 }, insightTitle: { fontSize: 14, fontWeight: "800" }, insightText: { marginTop: 5, fontSize: 12, lineHeight: 19, fontWeight: "500" }, insightChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 18, marginTop: 13 }, insightChipText: { fontSize: 11, fontWeight: "800" },
  reportNote: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 }, reportNoteTitle: { fontSize: 13, fontWeight: "800", marginBottom: 6 }, reportNoteBody: { fontSize: 12, lineHeight: 19, fontWeight: "500" },
});
