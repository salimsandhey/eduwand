import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDetail, PersonalisationEligibility } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "PersonalisationReview">;

function formatMix(mix: Record<string, number>): string {
  return Object.entries(mix)
    .map(([k, v]) => `${v} ${k}`)
    .join(" · ");
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

  const [overridingId, setOverridingId] = useState<string | null>(null);
  const [overrideMix, setOverrideMix] = useState<{ easy: string; medium: string; hard: string }>({
    easy: "0",
    medium: "0",
    hard: "0",
  });

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
      setOverridingId(null);
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

  function startOverride(suggestionId: string, mix: Record<string, number>) {
    setOverridingId(suggestionId);
    setOverrideMix({
      easy: String(mix.easy ?? 0),
      medium: String(mix.medium ?? 0),
      hard: String(mix.hard ?? 0),
    });
  }

  function confirmOverride(suggestionId: string) {
    decide(suggestionId, "overridden", {
      easy: Number(overrideMix.easy) || 0,
      medium: Number(overrideMix.medium) || 0,
      hard: Number(overrideMix.hard) || 0,
    });
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Personalisation Review</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {assignment.title} · {pendingCount} pending decision{pendingCount === 1 ? "" : "s"}
          </Text>
        </View>

        {pendingCount > 1 ? (
          <Pressable
            style={({ pressed }) => [styles.approveAllButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={approveAll}
            accessibilityRole="button"
          >
            <Text style={[styles.approveAllText, { color: colors.accentOn }]}>Approve all suggested mixes</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {assignment.personalisationSuggestions.map((s) => {
          const isBusy = busyId === s.id;
          const isOverriding = overridingId === s.id;
          return (
            <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.studentName, { color: colors.textPrimary }]}>{s.studentStub?.fullName ?? "Student"}</Text>
                {s.status !== "pending" ? (
                  <Text style={[styles.statusTag, { color: colors.accent, backgroundColor: colors.accent + "15" }]}>{s.status.replace("_", " ")}</Text>
                ) : null}
              </View>
              <Text style={[styles.mixText, { color: colors.textSecondary }]}>Suggested: {formatMix(s.suggestedMix)}</Text>
              <Text style={[styles.reasoning, { color: colors.textMuted }]}>{s.reasoning}</Text>

              {s.status === "pending" ? (
                isOverriding ? (
                  <View style={styles.overrideBox}>
                    <View style={styles.overrideRow}>
                      {(["easy", "medium", "hard"] as const).map((level) => (
                        <View key={level} style={styles.overrideField}>
                          <Text style={[styles.overrideLabel, { color: colors.textMuted }]}>{level}</Text>
                          <TextInput
                            style={[styles.overrideInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                            keyboardType="number-pad"
                            value={overrideMix[level]}
                            onChangeText={(v) => setOverrideMix((prev) => ({ ...prev, [level]: v }))}
                          />
                        </View>
                      ))}
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable style={({ pressed }) => [styles.smallButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => setOverridingId(null)} accessibilityRole="button">
                        <Text style={[styles.smallButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.smallButtonFilled, { backgroundColor: colors.accent }, (isBusy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => confirmOverride(s.id)}
                        disabled={isBusy}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Confirm override</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
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
                      onPress={() => startOverride(s.id, s.suggestedMix)}
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
                )
              ) : (
                <Text style={[styles.appliedText, { color: colors.textMuted }]}>
                  {s.appliedMix ? `Applied: ${formatMix(s.appliedMix)}` : "No mix applied"}
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
                  {e.fullName}: needs 2 prior graded assignments on this topic first
                </Text>
              ))}
            </View>
          );
        })()}

        <Pressable
          style={({ pressed }) => [styles.doneButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.replace("AssignmentDetail", { assignmentId })}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.doneButtonText, { color: colors.textSecondary }]}>Done reviewing</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  approveAllButton: { borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  approveAllText: { fontSize: 13, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  studentName: { fontSize: 15, fontWeight: "700" },
  statusTag: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  mixText: { fontSize: 13, fontWeight: "700", marginTop: 8, textTransform: "capitalize" },
  reasoning: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  appliedText: { fontSize: 12, marginTop: 10, fontStyle: "italic" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  smallButton: { flex: 1, borderWidth: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonFilled: { flex: 1, borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 12, fontWeight: "700" },
  overrideBox: { marginTop: 12 },
  overrideRow: { flexDirection: "row", gap: 8 },
  overrideField: { flex: 1 },
  overrideLabel: { fontSize: 11, fontWeight: "700", textTransform: "capitalize", marginBottom: 4 },
  overrideInput: { borderWidth: 1, borderRadius: 8, height: 38, textAlign: "center", fontSize: 14 },
  doneButton: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
  doneButtonText: { fontSize: 13, fontWeight: "700" },
});
