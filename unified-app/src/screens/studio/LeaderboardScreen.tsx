import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
type Entry = SchoolLeaderboardResult["entries"][number];

const MEDAL_COLORS = ["#F5B301", "#A8B0BA", "#CD7F32"];
// Podium order: 2nd on the left, 1st in the middle (and tallest), 3rd on the right.
const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHTS = [96, 124, 76];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

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

  const entries = result?.entries ?? [];
  const hasActivity = entries.some((e) => e.score > 0);
  const topScore = Math.max(1, ...entries.map((e) => e.score));
  const myIndex = entries.findIndex((e) => e.isCurrentUser);
  const me = myIndex >= 0 ? entries[myIndex] : null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  // "N more points to pass the teacher above you" - the nudge under the rank card.
  let nudge = "";
  if (me && hasActivity) {
    if (myIndex === 0) nudge = "You're leading this month. Keep it up!";
    else {
      const gap = entries[myIndex - 1].score - me.score;
      nudge = gap === 0 ? "Tied with the teacher above you - one more action takes the spot." : `${gap} more point${gap === 1 ? "" : "s"} to pass ${firstName(entries[myIndex - 1].fullName)}.`;
    }
  }

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
        ) : entries.length === 0 || !hasActivity ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface }, cardShadow]}>
            <Ionicons name="trophy-outline" size={40} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No activity yet this month</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Generate lessons with AI, create assignments and add lessons to climb the board.
            </Text>
          </View>
        ) : (
          <>
            {me ? (
              <LinearGradient colors={[colors.accent, colors.accent + "CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rankCard}>
                <View style={styles.rankCardLeft}>
                  <Text style={[styles.rankCardLabel, { color: colors.accentOn }]}>YOUR RANK</Text>
                  <Text style={[styles.rankCardRank, { color: colors.accentOn }]}>
                    #{myIndex + 1}
                    <Text style={styles.rankCardOf}> of {entries.length}</Text>
                  </Text>
                  {nudge ? <Text style={[styles.rankCardNudge, { color: colors.accentOn }]}>{nudge}</Text> : null}
                </View>
                <View style={styles.rankCardRight}>
                  <Text style={[styles.rankCardScore, { color: colors.accentOn }]}>{me.score}</Text>
                  <Text style={[styles.rankCardLabel, { color: colors.accentOn }]}>POINTS</Text>
                </View>
              </LinearGradient>
            ) : null}

            {podium.length >= 2 ? (
              <View style={styles.podium}>
                {PODIUM_ORDER.filter((i) => podium[i]).map((i) => {
                  const entry = podium[i];
                  const medal = MEDAL_COLORS[i];
                  return (
                    <View key={entry.teacherUserId} style={styles.podiumCol}>
                      {i === 0 ? <Ionicons name="trophy" size={22} color={medal} style={{ marginBottom: 4 }} /> : null}
                      <View style={[styles.avatar, i === 0 && styles.avatarLarge, { backgroundColor: colors.accentSoft, borderColor: medal }]}>
                        <Text style={[styles.avatarText, { color: colors.accent }, i === 0 && { fontSize: 20 }]}>{initials(entry.fullName)}</Text>
                      </View>
                      <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {firstName(entry.fullName)}
                        {entry.isCurrentUser ? " (you)" : ""}
                      </Text>
                      <Text style={[styles.podiumScore, { color: colors.accent }]}>{entry.score} pts</Text>
                      <View style={[styles.podiumBlock, { height: PODIUM_HEIGHTS[i], backgroundColor: medal + "33", borderColor: medal }]}>
                        <Text style={[styles.podiumRank, { color: medal }]}>{i + 1}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
              {(podium.length >= 2 ? rest : entries).map((entry) => {
                const index = entries.indexOf(entry);
                return <Row key={entry.teacherUserId} entry={entry} rank={index + 1} topScore={topScore} colors={colors} isLast={index === entries.length - 1} />;
              })}
              {podium.length >= 2 && rest.length === 0 ? (
                <Text style={[styles.restEmpty, { color: colors.textMuted }]}>Everyone's on the podium - invite more teachers to grow the board.</Text>
              ) : null}
            </View>

            <Text style={[styles.footnote, { color: colors.textMuted }]}>
              1 point for each AI generation, assignment created and lesson added this month. The board resets on the 1st.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ entry, rank, topScore, colors, isLast }: { entry: Entry; rank: number; topScore: number; colors: ReturnType<typeof useTheme>["colors"]; isLast: boolean }) {
  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border }, entry.isCurrentUser && { backgroundColor: colors.accentSoft }]}>
      <Text style={[styles.rankText, { color: colors.textMuted }]}>{rank}</Text>
      <View style={[styles.avatarSmall, { backgroundColor: colors.accentSoft }]}>
        <Text style={[styles.avatarSmallText, { color: colors.accent }]}>{initials(entry.fullName)}</Text>
      </View>
      <View style={styles.nameWrap}>
        <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
          {entry.fullName}
          {entry.isCurrentUser ? " (you)" : ""}
        </Text>
        <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${Math.max(entry.score > 0 ? 4 : 0, (entry.score / topScore) * 100)}%` }]} />
        </View>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          {entry.aiCount} AI · {entry.assignmentCount} assignments · {entry.topicCount} lessons
        </Text>
      </View>
      <Text style={[styles.scoreText, { color: colors.accent }]}>{entry.score}</Text>
    </View>
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
  emptyCard: { marginTop: 24, borderRadius: 20, padding: 28, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19 },

  rankCard: { marginTop: 20, borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rankCardLeft: { flex: 1, paddingRight: 12 },
  rankCardRight: { alignItems: "center" },
  rankCardLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, opacity: 0.85 },
  rankCardRank: { fontSize: 34, fontWeight: "800", marginTop: 2 },
  rankCardOf: { fontSize: 14, fontWeight: "600", opacity: 0.85 },
  rankCardNudge: { fontSize: 12, fontWeight: "600", marginTop: 6, opacity: 0.95, lineHeight: 17 },
  rankCardScore: { fontSize: 34, fontWeight: "800" },

  podium: { marginTop: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10 },
  podiumCol: { flex: 1, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  avatarLarge: { width: 66, height: 66, borderRadius: 33 },
  avatarText: { fontSize: 16, fontWeight: "800" },
  podiumName: { fontSize: 13, fontWeight: "700", marginTop: 8, maxWidth: "100%" },
  podiumScore: { fontSize: 12, fontWeight: "800", marginTop: 2, marginBottom: 8 },
  podiumBlock: { width: "100%", borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1.5, borderBottomWidth: 0, alignItems: "center", justifyContent: "center" },
  podiumRank: { fontSize: 30, fontWeight: "800" },

  card: { marginTop: 20, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14 },
  rankText: { width: 22, fontSize: 14, fontWeight: "800", textAlign: "center" },
  avatarSmall: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarSmallText: { fontSize: 13, fontWeight: "800" },
  nameWrap: { flex: 1 },
  nameText: { fontSize: 14, fontWeight: "700" },
  barTrack: { height: 6, borderRadius: 3, marginTop: 6, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  metaText: { fontSize: 11, marginTop: 5 },
  scoreText: { fontSize: 17, fontWeight: "800", minWidth: 32, textAlign: "right" },
  restEmpty: { padding: 18, fontSize: 12, textAlign: "center" },
  footnote: { fontSize: 11, textAlign: "center", marginTop: 18, lineHeight: 16 },
});
