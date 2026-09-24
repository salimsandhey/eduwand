import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDetail, AnswerKeyEntry } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AnswerKeyReview">;

export function AnswerKeyReviewScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [entries, setEntries] = useState<AnswerKeyEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  useAiGenerating(isGenerating);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [a, keys] = await Promise.all([api.getAssignment(accessToken, assignmentId), api.getAnswerKey(accessToken, assignmentId)]);
      setAssignment(a);
      setEntries(keys);
      setDrafts(Object.fromEntries(keys.map((k) => [k.id, k.teacherVerifiedAnswer ?? k.aiAnswer])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load answer key");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, assignmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    try {
      const keys = await api.generateAnswerKey(accessToken, assignmentId);
      setEntries(keys);
      setDrafts(Object.fromEntries(keys.map((k) => [k.id, k.teacherVerifiedAnswer ?? k.aiAnswer])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate answer key");
    } finally {
      setIsGenerating(false);
    }
  }

  async function save(entry: AnswerKeyEntry) {
    if (!accessToken) return;
    const draft = drafts[entry.id];
    if (!draft || !draft.trim()) return;
    setSavingId(entry.id);
    setError(null);
    try {
      const updated = await api.updateAnswerKeyEntry(accessToken, entry.id, { teacherVerifiedAnswer: draft.trim() });
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
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

  const verifiedCount = entries.filter((e) => !!e.teacherVerifiedAnswer).length;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Answer Key</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>
        </View>

        <View style={[styles.aiBadge, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="color-wand" size={12} color={colors.accent} />
          <Text style={[styles.aiBadgeText, { color: colors.accent }]}>AI generated</Text>
        </View>

        {entries.length > 0 ? (
          <View style={[styles.statsCard, { backgroundColor: colors.surface }, cardShadow]}>
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>QUESTIONS</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{entries.length}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>VERIFIED</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {verifiedCount} of {entries.length}
              </Text>
            </View>
          </View>
        ) : null}

        {entries.length === 0 ? (
          <Pressable
            style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]}
            onPress={generate}
            disabled={isGenerating}
            accessibilityRole="button"
          >
            {/* No spinner while generating - the AI generating overlay covers the screen. */}
            <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate draft answer key</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {entries.map((entry) => {
          const question = assignment.questions[entry.questionIndex];
          const isVerified = !!entry.teacherVerifiedAnswer;
          const isEditing = editingId === entry.id;
          return (
            <View key={entry.id} style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.questionText, { color: colors.textPrimary }]}>
                  {entry.questionIndex + 1}. {question?.prompt ?? "Question"}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.editButton, { borderColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => setEditingId(isEditing ? null : entry.id)}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={13} color={colors.accent} />
                  <Text style={[styles.editButtonText, { color: colors.accent }]}>Edit</Text>
                </Pressable>
              </View>

              <View style={[styles.pill, { backgroundColor: isVerified ? colors.accentSoft : colors.surfaceRaised }]}>
                <Ionicons
                  name={isVerified ? "checkmark-circle" : "ellipse-outline"}
                  size={12}
                  color={isVerified ? colors.accent : colors.warning}
                />
                <Text style={[styles.pillText, { color: isVerified ? colors.accent : colors.warning }]}>
                  {isVerified ? "Teacher verified" : "AI draft · Review required"}
                </Text>
              </View>

              {isEditing ? (
                <>
                  <TextInput
                    style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                    value={drafts[entry.id] ?? ""}
                    onChangeText={(text) => setDrafts((prev) => ({ ...prev, [entry.id]: text }))}
                    multiline
                    autoFocus
                  />
                  <Pressable
                    style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent }, (savingId === entry.id || pressed) && { opacity: pressedOpacity }]}
                    onPress={() => save(entry)}
                    disabled={savingId === entry.id}
                    accessibilityRole="button"
                  >
                    {savingId === entry.id ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save</Text>}
                  </Pressable>
                </>
              ) : (
                <Text style={[styles.answerText, { color: colors.textSecondary }]}>{drafts[entry.id] ?? entry.aiAnswer}</Text>
              )}
            </View>
          );
        })}

        {entries.length > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.doneButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("AssignmentDetail", { assignmentId })}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.doneButtonText, { color: colors.textSecondary }]}>Done reviewing</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  aiBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  aiBadgeText: { fontSize: 11, fontWeight: "700" },
  statsCard: { flexDirection: "row", borderRadius: 16, padding: 14, marginBottom: 16 },
  stat: { flex: 1 },
  statDivider: { width: 1, marginHorizontal: 12 },
  statLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  statValue: { marginTop: 5, fontSize: 14, fontWeight: "800" },
  generateButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  questionText: { fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 18 },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editButtonText: { fontSize: 11, fontWeight: "700" },
  pill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
  pillText: { fontSize: 11, fontWeight: "700" },
  answerText: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  answerInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, fontSize: 13, marginTop: 8 },
  saveButton: { borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveButtonText: { fontSize: 12, fontWeight: "700" },
  doneButton: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 8 },
  doneButtonText: { fontSize: 13, fontWeight: "700" },
});
