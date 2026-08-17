import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, StudentSubmissionRecord } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

// Full history of past submissions (client doc section 5, "remains available
// to the student to review"). Grade only shows once released - the API
// already enforces this (student-portal.ts filters on releasedToStudent).
export function StudentResultsScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow } = useTheme();
  const [submissions, setSubmissions] = useState<StudentSubmissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setSubmissions(await api.listStudentSubmissions(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Results</Text>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={submissions}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Image source={decorativeAssets.badgeRibbon} style={styles.emptyGraphic} resizeMode="contain" />
              <Text style={[styles.empty, { color: colors.textMuted }]}>No submissions yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.accent }, cardShadow]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.assignment.title}
                </Text>
                <Text style={[styles.typeTag, { color: colors.textMuted, backgroundColor: colors.surfaceRaised }]}>{item.submissionType}</Text>
              </View>
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>Submitted {new Date(item.submittedAt).toLocaleDateString()}</Text>
              {item.grade ? (
                <View style={styles.gradeRow}>
                  <Text style={[styles.gradeScore, { color: colors.accent }]}>{item.grade.finalScore ?? "—"}</Text>
                  {item.grade.finalFeedback ? (
                    <Text style={[styles.gradeFeedback, { color: colors.textMuted }]} numberOfLines={2}>
                      {item.grade.finalFeedback}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={[styles.pending, { color: colors.textMuted }]}>Awaiting grade</Text>
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  error: { textAlign: "center", marginTop: 12 },
  list: { padding: 16, gap: 12, flexGrow: 1, paddingBottom: 132 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyGraphic: { width: 86, height: 86 },
  empty: { textAlign: "center" },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  typeTag: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  cardMeta: { fontSize: 12, marginTop: 4 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  gradeScore: { fontSize: 18, fontWeight: "800" },
  gradeFeedback: { fontSize: 12, flex: 1 },
  pending: { fontSize: 12, marginTop: 10, fontStyle: "italic" },
});
