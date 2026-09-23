import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Assessment, AssessmentInsight } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AssessmentInsight">;

const BAND_META: Record<"level_1" | "level_2" | "level_3", { label: string; color: string }> = {
  level_1: { label: "Above 80%", color: "#2FAE66" },
  level_2: { label: "50-80%", color: "#E8952E" },
  level_3: { label: "Below 50%", color: "#E4574F" },
};

export function AssessmentInsightScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [insight, setInsight] = useState<AssessmentInsight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReleasing, setIsReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [a, i] = await Promise.all([api.getAssessment(accessToken, assessmentId), api.getAssessmentInsight(accessToken, assessmentId)]);
      setAssessment(a);
      setInsight(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load results");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, assessmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function release() {
    if (!accessToken || !assessment) return;
    setIsReleasing(true);
    setError(null);
    try {
      const updated = await api.releaseAssessmentResults(accessToken, assessment.id);
      setAssessment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release results");
    } finally {
      setIsReleasing(false);
    }
  }

  if (isLoading && !insight) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!assessment || !insight) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Results not found"}</Text>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.popToTop()}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>{assessment.title}</Text>
          <Text style={[styles.topSubtitle, { color: colors.textMuted }]}>
            {insight.respondentCount} responded{insight.totalDoubts > 0 ? ` · ${insight.totalDoubts} doubt${insight.totalDoubts === 1 ? "" : "s"} raised` : ""}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <View style={styles.cardHeadingRow}>
            <Ionicons name="bulb-outline" size={16} color={colors.accent} />
            <Text style={[styles.cardHeading, { color: colors.accent }]}>Recommendation</Text>
          </View>
          <Text style={[styles.bodyText, { color: colors.textPrimary, marginTop: 6 }]}>{insight.recommendation}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>Understanding bands</Text>
          {(["level_1", "level_2", "level_3"] as const).map((band) => (
            <View key={band} style={styles.bandRow}>
              <View style={[styles.bandDot, { backgroundColor: BAND_META[band].color }]} />
              <Text style={[styles.bandLabel, { color: colors.textPrimary }]}>{BAND_META[band].label}</Text>
              <Text style={[styles.bandCount, { color: colors.textMuted }]}>{insight.bands[band].length} student{insight.bands[band].length === 1 ? "" : "s"}</Text>
            </View>
          ))}
          {insight.bands.level_3.length > 0 ? (
            <Text style={[styles.bodyTextSmall, { color: colors.textMuted, marginTop: 8 }]} numberOfLines={3}>
              Below 50%: {insight.bands.level_3.map((s) => s.fullName).join(", ")}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <Text style={[styles.cardHeading, { color: colors.textPrimary }]}>Question breakdown</Text>
          {insight.itemAnalysis.map((q, i) => (
            <View key={q.questionId} style={styles.itemRow}>
              <Text style={[styles.bodyTextSmall, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>{i + 1}. {q.prompt}</Text>
              {q.doubtCount > 0 ? (
                <View style={[styles.doubtTag, { backgroundColor: colors.warning + "26" }]}>
                  <Ionicons name="help-circle-outline" size={11} color={colors.warning} />
                  <Text style={[styles.doubtTagText, { color: colors.warning }]}>{q.doubtCount}</Text>
                </View>
              ) : null}
              <Text style={[styles.itemRate, { color: q.correctRate !== null && q.correctRate < 0.5 ? colors.danger : colors.accent }]}>
                {q.correctRate === null ? "—" : `${Math.round(q.correctRate * 100)}%`}
              </Text>
            </View>
          ))}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.releaseButton,
            { backgroundColor: assessment.resultsReleasedToStudents ? colors.surfaceRaised : colors.accent, borderColor: assessment.resultsReleasedToStudents ? colors.border : colors.accent },
            (isReleasing || pressed) && { opacity: pressedOpacity },
          ]}
          onPress={release}
          disabled={isReleasing || assessment.resultsReleasedToStudents}
          accessibilityRole="button"
        >
          {isReleasing ? (
            <ActivityIndicator color={colors.accentOn} />
          ) : (
            <Text style={[styles.releaseButtonText, { color: assessment.resultsReleasedToStudents ? colors.textMuted : colors.accentOn }]}>
              {assessment.resultsReleasedToStudents ? "Results released to students" : "Release results to students"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1 },
  topTitle: { fontSize: 17, fontWeight: "800" },
  topSubtitle: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  cardHeadingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardHeading: { fontSize: 14, fontWeight: "800" },
  bodyText: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  bodyTextSmall: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
  bandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  bandDot: { width: 9, height: 9, borderRadius: 4.5 },
  bandLabel: { flex: 1, fontSize: 13, fontWeight: "700" },
  bandCount: { fontSize: 12, fontWeight: "600" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  doubtTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 },
  doubtTagText: { fontSize: 10, fontWeight: "800" },
  itemRate: { fontSize: 13, fontWeight: "800" },
  error: { textAlign: "center", fontSize: 13 },
  releaseButton: { height: 52, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  releaseButtonText: { fontSize: 14, fontWeight: "800" },
});
