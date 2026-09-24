import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, TeacherOnboardingTasksResult } from "../../api/client";
import { avatarSetForRole, avatarSourceFor } from "../../theme/avatars";

// Teacher "getting started" checklist - profile completion + the fixed set
// of starter tasks (mirrors backend/src/lib/onboarding.ts). Tasks are marked
// complete server-side by the relevant creation routes, this screen only
// reads and displays state.

type Props = NativeStackScreenProps<RootStackParamList, "GettingStarted">;

const TASK_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  first_class: "albums-outline",
  first_lesson: "document-text-outline",
  first_assignment: "clipboard-outline",
  first_student: "people-outline",
};

export function GettingStartedScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [result, setResult] = useState<TeacherOnboardingTasksResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setResult(await api.getOnboardingTasks(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checklist");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const profileFields = useMemo(
    () => [
      { label: "Full name", done: !!user?.fullName },
      { label: "Phone number", done: !!user?.phone },
      { label: "Profile photo", done: !!user?.photoMimeType || !!avatarSourceFor(user?.avatarKey, avatarSetForRole(user?.role)) },
    ],
    [user]
  );
  const profileDoneCount = profileFields.filter((f) => f.done).length;
  const profilePercent = Math.round((profileDoneCount / profileFields.length) * 100);

  const taskPercent = result && result.totalCount > 0 ? Math.round((result.completedCount / result.totalCount) * 100) : 0;

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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Getting started</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Profile completion</Text>
                <Text style={[styles.cardPercent, { color: colors.accent }]}>{profilePercent}%</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${profilePercent}%` }]} />
              </View>
              <View style={styles.fieldList}>
                {profileFields.map((f) => (
                  <View key={f.label} style={styles.fieldRow}>
                    <Ionicons
                      name={f.done ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={f.done ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.fieldLabel, { color: f.done ? colors.textPrimary : colors.textMuted }]}>{f.label}</Text>
                  </View>
                ))}
              </View>
              {profilePercent < 100 ? (
                <Pressable
                  onPress={() => navigation.navigate("Profile")}
                  style={({ pressed }) => [styles.completeButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.completeButtonText, { color: colors.accentOn }]}>Complete profile</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Starter tasks</Text>
                <Text style={[styles.cardPercent, { color: colors.accent }]}>
                  {result?.completedCount ?? 0}/{result?.totalCount ?? 0}
                </Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${taskPercent}%` }]} />
              </View>

              <View style={styles.badgeGrid}>
                {(result?.tasks ?? []).map((task) => (
                  <View
                    key={task.key}
                    style={[
                      styles.badgeCard,
                      { borderColor: task.completed ? colors.accent : colors.border, backgroundColor: task.completed ? colors.accentSoft : colors.surfaceRaised },
                    ]}
                  >
                    <Ionicons
                      name={task.completed ? "ribbon" : (TASK_ICONS[task.key] ?? "ellipse-outline")}
                      size={22}
                      color={task.completed ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.badgeLabel, { color: task.completed ? colors.textPrimary : colors.textMuted }]}>{task.label}</Text>
                    {task.completed ? <Text style={[styles.badgeUnlocked, { color: colors.accent }]}>{task.badge} unlocked</Text> : null}
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              onPress={() => navigation.navigate("Leaderboard")}
              style={({ pressed }) => [styles.linkRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="trophy-outline" size={18} color={colors.accent} />
              <Text style={[styles.linkText, { color: colors.textPrimary }]}>See your school leaderboard</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </>
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
  loader: { marginTop: 40 },
  error: { marginTop: 20, textAlign: "center" },
  card: { marginTop: 20, borderWidth: 1, borderRadius: 16, padding: 16 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  cardPercent: { fontSize: 14, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 10, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  fieldList: { marginTop: 14, gap: 10 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  completeButton: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  completeButtonText: { fontWeight: "700", fontSize: 13 },
  badgeGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeCard: { width: "47%", borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  badgeLabel: { fontSize: 12, fontWeight: "700" },
  badgeUnlocked: { fontSize: 11, fontWeight: "700" },
  linkRow: { marginTop: 20, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14 },
  linkText: { flex: 1, fontSize: 14, fontWeight: "700" },
});
