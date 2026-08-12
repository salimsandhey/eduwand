import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, ClassSection, ClassAnalytics, StudentAnalytics } from "../api/client";

export function TeacherAnalyticsScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ClassAnalytics | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listClassSections(accessToken)
      .then((sections) => {
        setClassSections(sections);
        if (sections.length > 0) setClassSectionId(sections[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load class sections"));
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken || !classSectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      setAnalytics(await api.getClassAnalytics(accessToken, classSectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, classSectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function viewStudent(studentStubId: string) {
    if (!accessToken) return;
    setStudentDetail(null);
    try {
      setStudentDetail(await api.getStudentAnalytics(accessToken, studentStubId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load student detail");
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Analytics</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Per-student and per-class performance</Text>
        </View>

        {classSections.length > 0 ? (
          <View style={styles.chipRow}>
            {classSections.map((cs) => {
              const active = classSectionId === cs.id;
              return (
                <Pressable
                  key={cs.id}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => {
                    setClassSectionId(cs.id);
                    setStudentDetail(null);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                    {cs.className} {cs.sectionName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
        ) : analytics ? (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{analytics.classAverage !== null ? `${analytics.classAverage.toFixed(0)}%` : "—"}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Class average</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>{analytics.submissionCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Graded submissions</Text>
              </View>
            </View>

            {analytics.struggleAreas.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Common struggle areas</Text>
                {analytics.struggleAreas.map((a) => (
                  <View key={a.assignmentId} style={styles.struggleRow}>
                    <Text style={[styles.struggleTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text style={[styles.struggleScore, { color: colors.danger }]}>{a.averageScore.toFixed(0)}% avg</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Per-student</Text>
            {analytics.students.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>No graded submissions yet for this class.</Text>
            ) : (
              analytics.students.map((s) => (
                <Pressable
                  key={s.studentStubId}
                  style={({ pressed }) => [styles.studentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => viewStudent(s.studentStubId)}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.fullName}</Text>
                    <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>{s.submissionCount} submission(s)</Text>
                  </View>
                  <Text style={[styles.studentScore, { color: colors.textPrimary }]}>{s.averageScore.toFixed(0)}%</Text>
                </Pressable>
              ))
            )}

            {studentDetail ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={styles.drillHeader}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{studentDetail.fullName}</Text>
                  <Pressable onPress={() => setStudentDetail(null)} hitSlop={8}>
                    <Ionicons name="close-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                {studentDetail.history.map((h, i) => (
                  <View key={i} style={styles.historyRow}>
                    <Text style={[styles.historyTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {h.assignmentTitle}
                    </Text>
                    <Text style={[styles.historyScore, { color: colors.textPrimary }]}>{h.score !== null ? `${h.score}%` : "—"}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14 },
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  struggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  struggleTitle: { fontSize: 13, flex: 1, marginRight: 8 },
  struggleScore: { fontSize: 12, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  meta: { fontSize: 13, marginBottom: 8 },
  studentRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  studentName: { fontSize: 14, fontWeight: "700" },
  studentScore: { fontSize: 16, fontWeight: "800" },
  drillHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  historyTitle: { fontSize: 13, flex: 1, marginRight: 8 },
  historyScore: { fontSize: 13, fontWeight: "700" },
});
