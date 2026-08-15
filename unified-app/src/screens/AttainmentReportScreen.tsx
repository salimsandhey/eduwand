import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, AttainmentReportRecord } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AttainmentReport">;

// Auto-assembled per-topic record (client doc section 4) - no data entry by
// the teacher. PDF export is a known backend gap (501, needs a PDF library
// decision - Docs/Dev/AI_Module_Rebuild_Plan.md Phase 4) so this screen shows
// the report content only, not an export action that would silently fail.
export function AttainmentReportScreen({ route }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow } = useTheme();

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (isLoading && !report) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!report) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Report not available"}</Text>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Attainment Report</Text>
        <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 16 }]}>
          Generated {new Date(report.generatedAt).toLocaleDateString()} · PDF export coming soon
        </Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>What was done</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{report.whatWasDone ?? "Not recorded yet."}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Outcomes</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{report.outcomes ?? "Not recorded yet."}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Observations / what to improve next time</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{report.improvementNotes ?? "Not recorded yet."}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  meta: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 },
  body: { fontSize: 13, lineHeight: 19 },
});
