import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { Stepper } from "../../components/Stepper";
import { api, AssignmentDetail, PersonalisationEligibility } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "PersonalisationReview">;

const DIFFICULTY_DOT_COLOR: Record<"easy" | "medium" | "hard", string> = {
  easy: "#52DFD6",
  medium: "#FBAA0A",
  hard: "#FB5F7E",
};

function MixDots({ mix }: { mix: Record<string, number> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.mixDotsRow}>
      {(["easy", "medium", "hard"] as const).map((level) => (
        <View key={level} style={styles.mixDotItem}>
          <View style={[styles.dot, { backgroundColor: DIFFICULTY_DOT_COLOR[level] }]} />
          <Text style={[styles.mixDotText, { color: colors.textSecondary }]}>
            {level === "easy" ? "Easy" : level === "medium" ? "Medium" : "Hard"} {mix[level] ?? 0}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PersonalisationReviewScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [eligibility, setEligibility] = useState<PersonalisationEligibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [overrideMix, setOverrideMix] = useState<{ easy: number; medium: number; hard: number }>({ easy: 0, medium: 0, hard: 0 });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [a, elig] = await Promise.all([
        api.getAssignment(accessToken, assignmentId),
        api.getPersonalisationEligibility(accessToken, assignmentId),
      ]);
      setAssignment(a);
      setEligibility(elig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignment");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function decide(id: string, status: "approved" | "opted_out" | "overridden", appliedMix?: Record<string, number>) {
    if (!accessToken) return;
    setBusyId(id);
    setError(null);
    try {
      await api.decidePersonalisationSuggestion(accessToken, id, { status, appliedMix });
      setExpandedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setBusyId(null);
    }
  }

  async function approveAll() {
    if (!assignment) return;
    for (const s of assignment.personalisationSuggestions) {
      if (s.status === "pending") await decide(s.id, "approved");
    }
  }

  function toggleExpand(suggestionId: string, mix: Record<string, number>) {
    if (expandedId === suggestionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(suggestionId);
    setOverrideMix({ easy: mix.easy ?? 0, medium: mix.medium ?? 0, hard: mix.hard ?? 0 });
  }

  if (isLoading && !assignment) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Assignment not found"}</Text>
      </Screen>
    );
  }

  const pendingCount = assignment.personalisationSuggestions.filter((s) => s.status === "pending").length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Personalisation</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.accentSoft }]}>
          <View style={styles.infoCardTop}>
            <View style={[styles.infoIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="person-add-outline" size={16} color={colors.accent} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>AI-suggested difficulty mix</Text>
            <View style={[styles.pendingPill, { backgroundColor: colors.surface }]}>
              <Text style={[styles.pendingPillText, { color: colors.accent }]}>{pendingCount} pending</Text>
            </View>
          </View>
          <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
            Review the suggested question mix for each student - the mix you approve determines which questions they're
            actually shown, not just a note on file. You can approve, override, or opt out.
          </Text>
        </View>

        {pendingCount > 1 ? (
          <Pressable
            style={({ pressed }) => [styles.approveAllButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={approveAll}
            accessibilityRole="button"
          >
            <Text style={[styles.approveAllText, { color: colors.accentOn }]}>Approve all suggestions</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {assignment.personalisationSuggestions.map((s) => {
          const isBusy = busyId === s.id;
          const isExpanded = expandedId === s.id;
          return (
            <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.studentStub?.fullName ? capitalizeFirst(s.studentStub.fullName) : "Student"}</Text>
                {s.status === "pending" ? (
                  <View style={[styles.suggestedPill, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="color-wand" size={10} color={colors.accent} />
                    <Text style={[styles.suggestedPillText, { color: colors.accent }]}>AI suggested</Text>
                  </View>
                ) : (
                  <Text style={[styles.statusTag, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{s.status.replace("_", " ")}</Text>
                )}
              </View>

              <MixDots mix={s.status === "pending" ? s.suggestedMix : s.appliedMix ?? s.suggestedMix} />
              {s.status === "pending" ? <Text style={[styles.reasoning, { color: colors.textMuted }]}>{s.reasoning}</Text> : null}

              {s.status === "pending" ? (
                isExpanded ? (
                  <View style={styles.overrideBox}>
                    <View style={styles.stepperRow}>
                      {(["easy", "medium", "hard"] as const).map((level) => (
                        <View key={level} style={styles.stepperItem}>
                          <View style={styles.stepperLabelRow}>
                            <View style={[styles.dot, { backgroundColor: DIFFICULTY_DOT_COLOR[level] }]} />
                            <Text style={[styles.stepperLabel, { color: colors.textMuted }]}>{level === "easy" ? "Easy" : level === "medium" ? "Medium" : "Hard"}</Text>
                          </View>
                          <Stepper value={overrideMix[level]} onChange={(v) => setOverrideMix((prev) => ({ ...prev, [level]: v }))} />
                        </View>
                      ))}
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable
                        style={({ pressed }) => [styles.smallButton, { borderColor: colors.border }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => decide(s.id, "opted_out")}
                        disabled={isBusy}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.smallButtonText, { color: colors.textSecondary }]}>Opt out</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.smallButton, { borderColor: colors.border }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => decide(s.id, "overridden", overrideMix)}
                        disabled={isBusy}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.smallButtonText, { color: colors.textSecondary }]}>Override</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.smallButtonFilled, { backgroundColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => decide(s.id, "approved")}
                        disabled={isBusy}
                        accessibilityRole="button"
                      >
                        {isBusy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Approve</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.rowActions}>
                    <Pressable
                      style={({ pressed }) => [styles.approveButton, { borderColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                      onPress={() => decide(s.id, "approved")}
                      disabled={isBusy}
                      accessibilityRole="button"
                    >
                      {isBusy ? <ActivityIndicator color={colors.accent} size="small" /> : <Text style={[styles.approveButtonText, { color: colors.accent }]}>Approve</Text>}
                    </Pressable>
                    <Pressable onPress={() => toggleExpand(s.id, s.suggestedMix)} hitSlop={8} accessibilityRole="button">
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                )
              ) : (
                <Text style={[styles.appliedText, { color: colors.textMuted }]}>
                  {s.appliedMix ? "Applied above" : "No mix applied"}
                </Text>
              )}
            </View>
          );
        })}

        {(() => {
          const reviewedIds = new Set(assignment.personalisationSuggestions.map((s) => s.studentStubId));
          const ineligible = eligibility.filter((e) => !e.eligible && !reviewedIds.has(e.studentStubId));
          if (ineligible.length === 0) return null;
          return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <Text style={[styles.studentName, { color: colors.textPrimary, marginBottom: 6 }]}>Personalisation unavailable</Text>
              {ineligible.map((e) => (
                <Text key={e.studentStubId} style={[styles.reasoning, { color: colors.textMuted }]}>
                  {capitalizeFirst(e.fullName)}: needs 2 prior graded assignments on this topic first
                </Text>
              ))}
            </View>
          );
        })()}

        <Pressable
          style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.replace("AssignmentDetail", { assignmentId })}
          accessibilityRole="button"
        >
          <Text style={[styles.doneButtonText, { color: colors.accentOn }]}>Done reviewing</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.accentOn} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 14 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  infoCard: { borderRadius: 16, padding: 14, marginBottom: 16 },
  infoCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoTitle: { flex: 1, fontSize: 13, fontWeight: "800" },
  pendingPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pendingPillText: { fontSize: 10, fontWeight: "800" },
  infoBody: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  approveAllButton: { borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  approveAllText: { fontSize: 13, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { fontSize: 15, fontWeight: "700" },
  suggestedPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  suggestedPillText: { fontSize: 10, fontWeight: "800" },
  statusTag: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  mixDotsRow: { flexDirection: "row", gap: 14, marginTop: 10 },
  mixDotItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  mixDotText: { fontSize: 12, fontWeight: "700" },
  reasoning: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  appliedText: { fontSize: 12, marginTop: 10, fontStyle: "italic" },
  rowActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  approveButton: { flex: 1, borderWidth: 1.5, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginRight: 12 },
  approveButtonText: { fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  smallButton: { flex: 1, borderWidth: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonFilled: { flex: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 12, fontWeight: "700" },
  overrideBox: { marginTop: 12 },
  stepperRow: { flexDirection: "row", gap: 10 },
  stepperItem: { flex: 1, alignItems: "center", gap: 6 },
  stepperLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepperLabel: { fontSize: 11, fontWeight: "700" },
  doneButton: { flexDirection: "row", gap: 8, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center", marginTop: 8 },
  doneButtonText: { fontSize: 14, fontWeight: "700" },
});
