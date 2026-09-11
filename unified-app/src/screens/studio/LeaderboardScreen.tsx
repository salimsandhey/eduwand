import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, SchoolLeaderboardResult } from "../../api/client";

// School-scoped teacher usage leaderboard for the current calendar month.
// Score = AI generations + assignments created + lessons/topics created,
// flat/unweighted (see backend/src/routes/teacher-onboarding.ts). The
// "prize" for the top teacher stays a manual/offline decision by the
// school - nothing here handles payouts.

type Props = NativeStackScreenProps<RootStackParamList, "Leaderboard">;

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export function LeaderboardScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [result, setResult] = useState<SchoolLeaderboardResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await api.getSchoolLeaderboard(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const monthLabel = result?.periodStart
    ? new Date(result.periodStart).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "";

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Leaderboard</Text>
            {monthLabel ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{monthLabel}</Text> : null}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : (result?.entries.length ?? 0) === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No teacher activity yet this month.</Text>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            {result!.entries.map((entry, index) => (
              <View
                key={entry.teacherUserId}
                style={[
                  styles.row,
                  index < result!.entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  entry.isCurrentUser && { backgroundColor: colors.accentSoft },
                ]}
              >
                <View style={styles.rankWrap}>
                  {index < 3 ? (
                    <Ionicons name="trophy" size={18} color={MEDAL_COLORS[index]} />
                  ) : (
                    <Text style={[styles.rankText, { color: colors.textMuted }]}>{index + 1}</Text>
                  )}
                </View>
                <View style={styles.nameWrap}>
                  <Text style={[styles.nameText, { color: colors.textPrimary }]}>
                    {entry.fullName}
                    {entry.isCurrentUser ? " (you)" : ""}
                  </Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {entry.aiCount} AI · {entry.assignmentCount} assignments · {entry.topicCount} lessons
                  </Text>
                </View>
                <Text style={[styles.scoreText, { color: colors.accent }]}>{entry.score}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 60 },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  loader: { marginTop: 40 },
  error: { marginTop: 20, textAlign: "center" },
  emptyText: { marginTop: 24, textAlign: "center", fontSize: 13 },
  card: { marginTop: 20, borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rankWrap: { width: 28, alignItems: "center" },
  rankText: { fontSize: 14, fontWeight: "800" },
  nameWrap: { flex: 1 },
  nameText: { fontSize: 14, fontWeight: "700" },
  metaText: { fontSize: 11, marginTop: 2 },
  scoreText: { fontSize: 16, fontWeight: "800" },
});
