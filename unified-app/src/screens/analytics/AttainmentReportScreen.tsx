import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AttainmentReportRecord, SubjectAttainmentReport, StudentAttainmentRow, GenerationOutputType } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { OUTPUT_TYPE_ICONS } from "../studio/generation/outputTypeMeta";

type Props = NativeStackScreenProps<RootStackParamList, "AttainmentReport">;
const BAND_COLORS = ["#18A957", "#7C3AED", "#F97316"];

// Same relative-time formatting already used for notes in TopicDetailScreen.tsx
// (not exported from a shared util - kept local, same small-duplicated-helper
// pattern used elsewhere in this codebase).
function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return past.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type ReportTab = "class" | "students" | "topics";
type ClassSubTab = "overview" | "notes";

function displayScore(score: number | null) {
  return score === null ? "-" : `${Math.round(score)}%`;
}

export function AttainmentReportScreen({ route, navigation }: Props) {
  const params = route.params;
  const isTopicMode = "topicId" in params;
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [topicReport, setTopicReport] = useState<AttainmentReportRecord | null>(null);
  const [subjectReport, setSubjectReport] = useState<SubjectAttainmentReport | null>(null);
  const [branding, setBranding] = useState<{ logoUrl: string | null; primaryColor: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("class");
  const [classSubTab, setClassSubTab] = useState<ClassSubTab>("overview");
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentAttainmentRow | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !user) return;
    setIsLoading(true);
    setError(null);
    try {
      const [report, brandingResult] = await Promise.all([
        isTopicMode ? api.getAttainmentReport(accessToken, params.topicId) : api.getSubjectAttainmentReport(accessToken, params.classSectionId, params.subject),
        user.schoolId ? api.getSchoolBranding(accessToken, user.schoolId).catch(() => null) : Promise.resolve(null),
      ]);
      if (isTopicMode) setTopicReport(report as AttainmentReportRecord);
      else setSubjectReport(report as SubjectAttainmentReport);
      setBranding(brandingResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attainment report");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user, isTopicMode, isTopicMode ? (params as any).topicId : (params as any).classSectionId, isTopicMode ? null : (params as any).subject]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Downloads the real, designed PDF (branding, charts, notes+photos - see
  // backend/src/lib/pdfExport.ts) and hands it to the native share sheet,
  // same pattern already used for the presentation .pptx export in
  // GenerationReviewScreen.tsx's exportPptx.
  const shareReport = useCallback(async () => {
    if (!accessToken) return;
    const url = isTopicMode
      ? api.attainmentReportPdfUrl(params.topicId)
      : api.subjectAttainmentReportPdfUrl(params.classSectionId, params.subject);
    const fileName = isTopicMode ? `${params.topicId}-attainment-report.pdf` : `${params.classSectionId}-${params.subject}-attainment-report.pdf`;
    setIsExportingPdf(true);
    setError(null);
    try {
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.downloadAsync(url, fileUri, { headers: { Authorization: `Bearer ${accessToken}` } });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: "Share attainment report", UTI: "com.adobe.pdf" });
      } else {
        setError(`Report saved to ${fileUri}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export report");
    } finally {
      setIsExportingPdf(false);
    }
  }, [accessToken, isTopicMode, params]);

  if (isLoading && !topicReport && !subjectReport) return <Screen style={styles.centered}><ActivityIndicator color={colors.accent} /></Screen>;
  const report = isTopicMode ? topicReport : subjectReport;
  if (!report) return <Screen style={styles.centered}><Text style={{ color: colors.danger }}>{error ?? "Report not available"}</Text></Screen>;

  const hasScores = report.averageScore !== null;
  const brandAccent = branding?.primaryColor || colors.accent;
  const tabs: { key: ReportTab; label: string }[] = isTopicMode
    ? [{ key: "class", label: "Class report" }, { key: "students", label: "Student report" }]
    : [{ key: "class", label: "Class report" }, { key: "students", label: "Student report" }, { key: "topics", label: "Topic report" }];

  const insight = isTopicMode ? topicReport!.improvementNotes ?? "No teacher observations recorded for this topic." : null;
  const studentAttainment: StudentAttainmentRow[] = report.studentAttainment;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={[styles.analyticsLabel, { color: colors.textPrimary }]}>Analytics</Text>
          <Pressable style={({ pressed }) => [styles.shareButton, { borderColor: colors.accentSoftAlt }, (isExportingPdf || pressed) && { opacity: pressedOpacity }]} onPress={shareReport} disabled={isExportingPdf} accessibilityRole="button">
            {isExportingPdf ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="share-social-outline" size={16} color={colors.accent} />}
            <Text style={[styles.shareButtonText, { color: colors.accent }]}>{isExportingPdf ? "Preparing PDF..." : "Share report"}</Text>
          </Pressable>
        </View>
        {error ? <Text style={[styles.exportError, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Attainment Report</Text>
            {isTopicMode ? (
              <>
                <Text style={[styles.topicTitle, { color: colors.textPrimary }]} numberOfLines={2}>{capitalizeFirst(topicReport!.topicName)}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{capitalizeFirst(topicReport!.className)} - {capitalizeFirst(topicReport!.sectionName)} · {capitalizeFirst(topicReport!.subject)}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.topicTitle, { color: colors.textPrimary }]} numberOfLines={2}>{capitalizeFirst(subjectReport!.subject)}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{capitalizeFirst(subjectReport!.className)} - {capitalizeFirst(subjectReport!.sectionName)} · {subjectReport!.topicCount} topic{subjectReport!.topicCount === 1 ? "" : "s"}</Text>
              </>
            )}
          </View>
          {branding?.logoUrl ? <Image source={{ uri: branding.logoUrl }} style={styles.brandLogo} resizeMode="contain" /> : null}
        </View>

        <View style={[styles.reportTabs, { backgroundColor: colors.backgroundMuted }]}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.reportTab, activeTab === tab.key && { backgroundColor: brandAccent }]}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
            >
              <Text style={[styles.reportTabText, { color: activeTab === tab.key ? "#FFFFFF" : colors.textMuted }]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === "class" ? (
          <>
            {isTopicMode ? (
              <View style={[styles.subTabs, { borderColor: colors.border }]}>
                <Pressable style={styles.subTab} onPress={() => setClassSubTab("overview")} accessibilityRole="tab">
                  <Text style={[styles.subTabText, { color: classSubTab === "overview" ? brandAccent : colors.textMuted }, classSubTab === "overview" && styles.subTabTextActive]}>Overview</Text>
                  {classSubTab === "overview" ? <View style={[styles.subTabIndicator, { backgroundColor: brandAccent }]} /> : null}
                </Pressable>
                <Pressable style={styles.subTab} onPress={() => setClassSubTab("notes")} accessibilityRole="tab">
                  <Text style={[styles.subTabText, { color: classSubTab === "notes" ? brandAccent : colors.textMuted }, classSubTab === "notes" && styles.subTabTextActive]}>Notes & Reflection</Text>
                  {classSubTab === "notes" ? <View style={[styles.subTabIndicator, { backgroundColor: brandAccent }]} /> : null}
                </Pressable>
              </View>
            ) : null}

            {!isTopicMode || classSubTab === "overview" ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricRow}>
                  <MetricCard icon="people-outline" iconColor="#7C3AED" label="Class size" value={String(report.studentCount)} detail="students" colors={colors} />
                  <MetricCard icon="analytics-outline" iconColor="#18A957" label="Average attainment" value={displayScore(report.averageScore)} detail={hasScores ? "graded work" : "awaiting grades"} colors={colors} />
                  <MetricCard icon="checkmark-done-outline" iconColor="#F97316" label="Graded" value={String(report.gradedSubmissionCount)} detail="submissions" colors={colors} />
                </ScrollView>

                <View style={[styles.card, styles.overallCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Overall attainment</Text><Ionicons name="information-circle-outline" size={16} color={colors.textMuted} /></View>
                  <View style={[styles.scoreRing, { borderColor: hasScores ? brandAccent : colors.border }]}><View style={[styles.scoreRingInner, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.scoreValue, { color: colors.textPrimary }]}>{displayScore(report.averageScore)}</Text><Text style={[styles.scoreLabel, { color: colors.textMuted }]}>{hasScores ? "Attainment" : "No scores"}</Text></View></View>
                  <Text style={[styles.overallSummary, { color: colors.textSecondary }]}>{hasScores ? "This class is building a solid understanding of the topic. Use the score bands below to target next steps." : "Grades will appear here once student submissions have been assessed."}</Text>
                  <ScoreBand color={BAND_COLORS[0]} label="Above 80%" value={report.scoreBands.above80} colors={colors} />
                  <ScoreBand color={BAND_COLORS[1]} label="60% - 80%" value={report.scoreBands.between60And80} colors={colors} />
                  <ScoreBand color={BAND_COLORS[2]} label="Below 60%" value={report.scoreBands.below60} colors={colors} />
                </View>

                {isTopicMode ? (
                  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Attainment by assignment</Text>
                    {topicReport!.assignmentAttainment.length > 0 ? topicReport!.assignmentAttainment.map((assignment, index) => <BarRow key={assignment.assignmentId} label={assignment.title} value={assignment.averageScore} accentA="#18A957" accentB="#7C3AED" index={index} colors={colors} />) : <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No graded assignments for this topic yet.</Text>}
                  </View>
                ) : (
                  <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Attainment by topic</Text>
                    {subjectReport!.perTopicAttainment.filter((t) => t.averageScore !== null).length > 0 ? subjectReport!.perTopicAttainment.filter((t) => t.averageScore !== null).map((topic, index) => <BarRow key={topic.topicId} label={topic.topicName} value={topic.averageScore} accentA="#18A957" accentB="#7C3AED" index={index} colors={colors} />) : <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No graded topics for this subject yet.</Text>}
                  </View>
                )}
              </>
            ) : null}

            {isTopicMode && classSubTab === "notes" ? (
              <View style={styles.tabContentTop}>
                <View style={[styles.insightCard, { backgroundColor: colors.accentSoft }]}><View style={[styles.insightIcon, { backgroundColor: colors.surface }]}><Ionicons name="bulb-outline" size={19} color={colors.accent} /></View><View style={styles.insightCopy}><Text style={[styles.insightTitle, { color: colors.textPrimary }]}>Key insight</Text><Text style={[styles.insightText, { color: colors.textSecondary }]} numberOfLines={5}>{insight}</Text><View style={[styles.insightChip, { backgroundColor: colors.surface, borderColor: colors.accentSoftAlt }]}><Text style={[styles.insightChipText, { color: colors.accent }]}>Teacher reflection</Text></View></View></View>

                <WhatWasDoneSection items={topicReport!.generationSummaries} colors={colors} />
                <ReportNote title="Outcomes" value={topicReport!.outcomes} colors={colors} />

                <NotesSection observations={topicReport!.observations} colors={colors} pressedOpacity={pressedOpacity} onOpenPhoto={setViewingPhoto} />
              </View>
            ) : null}
          </>
        ) : null}

        {activeTab === "students" ? (
          <View style={styles.tabContentTop}>
            <StudentList students={studentAttainment} colors={colors} pressedOpacity={pressedOpacity} onOpenStudent={setSelectedStudent} />
          </View>
        ) : null}

        {activeTab === "topics" && !isTopicMode ? (
          <View style={styles.tabContentTop}>
            <TopicList
              topics={subjectReport!.perTopicAttainment}
              colors={colors}
              pressedOpacity={pressedOpacity}
              onOpenTopic={(topicId) => navigation.navigate("AttainmentReport", { topicId })}
            />
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={viewingPhoto !== null} animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
        <Pressable style={styles.photoModalBackdrop} onPress={() => setViewingPhoto(null)} accessibilityRole="button" accessibilityLabel="Close photo">
          {viewingPhoto ? <Image source={{ uri: viewingPhoto }} style={styles.photoModalImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <Modal transparent visible={selectedStudent !== null} animationType="slide" onRequestClose={() => setSelectedStudent(null)}>
        <Pressable style={styles.studentModalBackdrop} onPress={() => setSelectedStudent(null)} accessibilityRole="button" accessibilityLabel="Close student detail">
          <Pressable style={[styles.studentModalSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            {selectedStudent ? (
              <>
                <View style={styles.studentModalHeader}>
                  <View style={[styles.studentAvatar, { backgroundColor: colors.accentSoft }]}><Text style={[styles.studentAvatarText, { color: colors.accent }]}>{selectedStudent.fullName.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.studentCopy}>
                    <Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(selectedStudent.fullName)}</Text>
                    <Text style={[styles.studentMeta, { color: colors.textMuted }]}>{selectedStudent.submissionCount} submission{selectedStudent.submissionCount === 1 ? "" : "s"} · {Math.round(selectedStudent.averageScore)}% average</Text>
                  </View>
                </View>
                <Text style={[styles.studentModalSectionLabel, { color: colors.textMuted }]}>{isTopicMode ? "By assignment" : "By topic"}</Text>
                <ScrollView style={styles.studentModalScroll} showsVerticalScrollIndicator={false}>
                  {selectedStudent.breakdown.map((item, index) => (
                    <View key={`${item.label}-${index}`} style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]} numberOfLines={1}>{capitalizeFirst(item.label)}</Text>
                      <Text style={[styles.breakdownScore, { color: item.averageScore < 60 ? colors.danger : colors.textPrimary }]}>{displayScore(item.averageScore)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function MetricCard({ icon, iconColor, label, value, detail, colors }: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; label: string; value: string; detail: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.metricIcon, { backgroundColor: `${iconColor}14` }]}><Ionicons name={icon} size={17} color={iconColor} /></View><Text style={[styles.metricValue, { color: iconColor }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.metricDetail, { color: colors.textMuted }]}>{detail}</Text></View>;
}

function ScoreBand({ color, label, value, colors }: { color: string; label: string; value: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={styles.bandRow}><View style={[styles.bandDot, { backgroundColor: color }]} /><Text style={[styles.bandLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.bandValue, { color: colors.textPrimary }]}>{value} {value === 1 ? "student" : "students"}</Text></View>;
}

function BarRow({ label, value, accentA, accentB, index, colors }: { label: string; value: number | null; accentA: string; accentB: string; index: number; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: colors.textSecondary }]} numberOfLines={1}>{capitalizeFirst(label)}</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.backgroundMuted }]}><View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, value ?? 0))}%`, backgroundColor: index % 2 === 0 ? accentA : accentB }]} /></View>
      <Text style={[styles.barValue, { color: colors.textPrimary }]}>{displayScore(value)}</Text>
    </View>
  );
}

function ReportNote({ title, value, colors }: { title: string; value: string | null; colors: ReturnType<typeof useTheme>["colors"] }) {
  return <View style={[styles.reportNote, { borderColor: colors.border }]}><Text style={[styles.reportNoteTitle, { color: colors.textPrimary }]}>{title}</Text><Text style={[styles.reportNoteBody, { color: colors.textSecondary }]}>{value ?? "Not recorded yet."}</Text></View>;
}

// Each generation gets its own tile (icon + readable heading + a plain
// sentence) instead of one wall of "outputType: summary" text glued
// together - and the heading always comes from OUTPUT_TYPE_ICONS/label, never
// the raw snake_case outputType value.
function WhatWasDoneSection({ items, colors }: { items: AttainmentReportRecord["generationSummaries"]; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, styles.doneCardTitle, { color: colors.textPrimary }]}>What was done</Text>
      {items.length === 0 ? (
        <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No generations recorded for this topic yet.</Text>
      ) : (
        items.map((item, index) => (
          <View key={index} style={styles.doneTile}>
            <View style={[styles.doneTileIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={OUTPUT_TYPE_ICONS[item.outputType as GenerationOutputType] ?? "document-text-outline"} size={16} color={colors.accent} />
            </View>
            <View style={styles.doneTileCopy}>
              <Text style={[styles.doneTileHeading, { color: colors.textPrimary }]}>{item.label}</Text>
              <Text style={[styles.doneTileBody, { color: colors.textSecondary }]}>{item.summary}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function StudentList({ students, colors, pressedOpacity, onOpenStudent }: { students: StudentAttainmentRow[]; colors: ReturnType<typeof useTheme>["colors"]; pressedOpacity: number; onOpenStudent: (student: StudentAttainmentRow) => void }) {
  if (students.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textMuted }]}>No graded submissions yet.</Text>;
  }
  return (
    <View>
      {students.map((student) => (
        <Pressable
          key={student.studentStubId}
          style={({ pressed }) => [styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => onOpenStudent(student)}
          accessibilityRole="button"
        >
          <View style={[styles.studentAvatar, { backgroundColor: colors.accentSoft }]}><Text style={[styles.studentAvatarText, { color: colors.accent }]}>{student.fullName.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.studentCopy}>
            <Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(student.fullName)}</Text>
            <Text style={[styles.studentMeta, { color: colors.textMuted }]}>{student.submissionCount} submission{student.submissionCount === 1 ? "" : "s"}</Text>
          </View>
          <Text style={[styles.studentScore, { color: student.averageScore < 60 ? colors.danger : colors.accent }]}>{Math.round(student.averageScore)}%</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function TopicList({ topics, colors, pressedOpacity, onOpenTopic }: { topics: SubjectAttainmentReport["perTopicAttainment"]; colors: ReturnType<typeof useTheme>["colors"]; pressedOpacity: number; onOpenTopic: (topicId: string) => void }) {
  if (topics.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textMuted }]}>No topics recorded for this subject yet.</Text>;
  }
  return (
    <View>
      {topics.map((topic) => (
        <Pressable
          key={topic.topicId}
          style={({ pressed }) => [styles.topicRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => onOpenTopic(topic.topicId)}
          accessibilityRole="button"
        >
          <View style={styles.topicRowCopy}>
            <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>{capitalizeFirst(topic.topicName)}</Text>
            <Text style={[styles.studentMeta, { color: colors.textMuted }]}>{topic.gradedSubmissionCount} graded submission{topic.gradedSubmissionCount === 1 ? "" : "s"}</Text>
          </View>
          <Text style={[styles.studentScore, { color: colors.textPrimary }]}>{displayScore(topic.averageScore)}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function NotesSection({ observations, colors, pressedOpacity, onOpenPhoto }: { observations: AttainmentReportRecord["observations"]; colors: ReturnType<typeof useTheme>["colors"]; pressedOpacity: number; onOpenPhoto: (url: string) => void }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Class notes</Text>
      {observations.length === 0 ? (
        <Text style={[styles.emptyChartText, { color: colors.textMuted }]}>No notes recorded for this topic yet.</Text>
      ) : (
        observations.map((note) => (
          <View key={note.id} style={styles.noteRow}>
            <View style={styles.noteRowHeader}>
              <Text style={[styles.noteRowTime, { color: colors.textMuted }]}>{formatRelativeTime(note.recordedAt)}</Text>
            </View>
            <Text style={[styles.noteRowBody, { color: colors.textSecondary }]}>{note.body}</Text>
            {note.photoUrl ? (
              <Pressable onPress={() => onOpenPhoto(note.photoUrl!)} style={({ pressed }) => pressed && { opacity: pressedOpacity }} accessibilityRole="button" accessibilityLabel="View note photo">
                <Image source={{ uri: note.photoUrl }} style={styles.noteThumb} resizeMode="cover" />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 24, paddingBottom: 44 }, centered: { justifyContent: "center", alignItems: "center" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, analyticsLabel: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 }, shareButton: { minHeight: 39, paddingHorizontal: 13, borderWidth: 1, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 6 }, shareButtonText: { fontSize: 12, fontWeight: "800" }, exportError: { marginTop: 8, fontSize: 12, fontWeight: "600" },
  titleRow: { marginTop: 34, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, titleCol: { flex: 1 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.8 }, topicTitle: { marginTop: 6, fontSize: 19, lineHeight: 25, fontWeight: "800", letterSpacing: -0.35 }, meta: { marginTop: 3, fontSize: 13, fontWeight: "500" },
  brandLogo: { width: 52, height: 40, marginTop: 4 },
  reportTabs: { flexDirection: "row", padding: 4, borderRadius: 24, marginTop: 26 }, reportTab: { flex: 1, minHeight: 37, alignItems: "center", justifyContent: "center", borderRadius: 19 }, reportTabText: { fontSize: 12, fontWeight: "800" },
  subTabs: { flexDirection: "row", gap: 22, marginTop: 24, borderBottomWidth: StyleSheet.hairlineWidth }, subTab: { paddingBottom: 12 }, subTabText: { fontSize: 13, fontWeight: "700" }, subTabTextActive: { fontWeight: "800" }, subTabIndicator: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1 },
  tabContentTop: { marginTop: 22 },
  metricRow: { gap: 12, paddingTop: 20, paddingBottom: 32 }, metricCard: { width: 130, minHeight: 146, borderWidth: 1, borderRadius: 16, padding: 15 }, metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, metricValue: { marginTop: 13, fontSize: 24, lineHeight: 28, fontWeight: "800" }, metricLabel: { marginTop: 3, fontSize: 11, lineHeight: 14, fontWeight: "700" }, metricDetail: { marginTop: 2, fontSize: 10, lineHeight: 13, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 28 }, overallCard: { alignItems: "stretch" }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 6 }, cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 }, scoreRing: { width: 128, height: 128, borderRadius: 64, borderWidth: 12, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 18, marginBottom: 19 }, scoreRingInner: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center" }, scoreValue: { fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.6 }, scoreLabel: { marginTop: 1, fontSize: 10, fontWeight: "700" },
  overallSummary: { fontSize: 13, lineHeight: 21, fontWeight: "500", marginBottom: 17 }, bandRow: { flexDirection: "row", alignItems: "center", minHeight: 27 }, bandDot: { width: 8, height: 8, borderRadius: 4, marginRight: 9 }, bandLabel: { flex: 1, fontSize: 12, fontWeight: "500" }, bandValue: { fontSize: 12, fontWeight: "800" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15 }, barLabel: { width: 105, fontSize: 12, fontWeight: "500" }, barTrack: { flex: 1, height: 10, borderRadius: 6, overflow: "hidden" }, barFill: { height: "100%", borderRadius: 6 }, barValue: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "800" }, emptyChartText: { marginTop: 20, fontSize: 13, lineHeight: 19, textAlign: "center" },
  insightCard: { flexDirection: "row", borderRadius: 18, padding: 18, marginBottom: 24 }, insightIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 13 }, insightCopy: { flex: 1 }, insightTitle: { fontSize: 14, fontWeight: "800" }, insightText: { marginTop: 5, fontSize: 12, lineHeight: 19, fontWeight: "500" }, insightChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 18, marginTop: 13 }, insightChipText: { fontSize: 11, fontWeight: "800" },
  reportNote: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 }, reportNoteTitle: { fontSize: 13, fontWeight: "800", marginBottom: 6 }, reportNoteBody: { fontSize: 12, lineHeight: 19, fontWeight: "500" },
  doneCardTitle: { marginBottom: 6 },
  doneTile: { flexDirection: "row", gap: 12, marginTop: 16 }, doneTileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" }, doneTileCopy: { flex: 1, paddingBottom: 2 }, doneTileHeading: { fontSize: 13, fontWeight: "800" }, doneTileBody: { marginTop: 4, fontSize: 12, lineHeight: 19, fontWeight: "500" },
  emptyText: { marginTop: 18, fontSize: 13, lineHeight: 19, textAlign: "center" },
  studentRow: { minHeight: 70, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }, studentAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, studentAvatarText: { fontSize: 14, fontWeight: "800" }, studentCopy: { flex: 1 }, studentName: { fontSize: 13, fontWeight: "800" }, studentMeta: { marginTop: 2, fontSize: 11, fontWeight: "500" }, studentScore: { fontSize: 16, fontWeight: "800" },
  topicRow: { minHeight: 66, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 }, topicRowCopy: { flex: 1 },
  noteRow: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "transparent" }, noteRowHeader: { flexDirection: "row", justifyContent: "space-between" }, noteRowTime: { fontSize: 11, fontWeight: "600" }, noteRowBody: { marginTop: 4, fontSize: 13, lineHeight: 19, fontWeight: "500" }, noteThumb: { marginTop: 10, width: "100%", height: 160, borderRadius: 12 },
  photoModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" }, photoModalImage: { width: "100%", height: "80%" },
  studentModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  studentModalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "70%" },
  modalHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 18 },
  studentModalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  studentModalSectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 10 },
  studentModalScroll: { maxHeight: 260 },
  breakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  breakdownLabel: { flex: 1, fontSize: 13, fontWeight: "600", marginRight: 12 }, breakdownScore: { fontSize: 13, fontWeight: "800" },
});
