import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StudentTabParamList, RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, StudentAssignmentView, StudentSubmissionStatus } from "../api/client";

type Props = CompositeScreenProps<BottomTabScreenProps<StudentTabParamList, "Home">, NativeStackScreenProps<RootStackParamList>>;

const STATUS_LABEL: Record<StudentSubmissionStatus, string> = {
  not_submitted: "Not submitted",
  submitted: "Submitted",
  graded: "Graded",
};

function statusColor(status: StudentSubmissionStatus, colors: ReturnType<typeof useTheme>["colors"]) {
  if (status === "graded") return colors.accent;
  if (status === "submitted") return colors.textMuted;
  return colors.danger;
}

export function StudentHomeScreen({ navigation }: Props) {
  const { user, accessToken, logout } = useAuth();
  const { colors, cardShadow } = useTheme();
  const [assignments, setAssignments] = useState<StudentAssignmentView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setAssignments(await api.listStudentAssignments(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
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
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Hi, {user?.fullName ?? "Student"}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable onPress={logout} hitSlop={10} accessibilityRole="button" accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.empty, { color: colors.textMuted }]}>No assignments yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const canSubmit = item.submissionStatus === "not_submitted";
            return (
              <Pressable
                disabled={!canSubmit}
                onPress={() =>
                  canSubmit &&
                  navigation.navigate("StudentAssignmentSubmit", {
                    assignmentId: item.id,
                    questions: item.questions,
                    title: item.title,
                  })
                }
                accessibilityRole={canSubmit ? "button" : undefined}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.accent },
                  cardShadow,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      { color: statusColor(item.submissionStatus, colors), backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    {STATUS_LABEL[item.submissionStatus]}
                  </Text>
                </View>
                <View style={styles.cardMetaRow}>
                  <Ionicons name="help-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                    {item.questions.length} question{item.questions.length === 1 ? "" : "s"}
                  </Text>
                </View>
                {item.grade ? (
                  <View style={styles.gradeRow}>
                    <Text style={[styles.gradeScore, { color: colors.accent }]}>{item.grade.finalScore ?? "—"}</Text>
                    {item.grade.finalFeedback ? (
                      <Text style={[styles.gradeFeedback, { color: colors.textMuted }]} numberOfLines={2}>
                        {item.grade.finalFeedback}
                      </Text>
                    ) : null}
                  </View>
                ) : canSubmit ? (
                  <Text style={[styles.tapToSubmit, { color: colors.accent }]}>Tap to submit</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  error: { textAlign: "center", marginTop: 12 },
  list: { padding: 16, gap: 12, flexGrow: 1, paddingBottom: 40 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  empty: { textAlign: "center" },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  statusBadge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  cardMeta: { fontSize: 12 },
  gradeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  gradeScore: { fontSize: 18, fontWeight: "800" },
  gradeFeedback: { fontSize: 12, flex: 1 },
  tapToSubmit: { fontSize: 12, fontWeight: "700", marginTop: 10 },
});
