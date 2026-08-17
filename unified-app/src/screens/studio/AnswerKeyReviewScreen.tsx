import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDetail, AnswerKeyEntry } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AnswerKeyReview">;

// Teacher verification step before distribution (client doc workflow steps
// 18-19). The teacher-verified answer, once set, is authoritative - never
// the AI's original aiAnswer.
export function AnswerKeyReviewScreen({ route }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [entries, setEntries] = useState<AnswerKeyEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
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

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Answer Key</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{assignment.title}</Text>
        </View>

        {entries.length === 0 ? (
          <Pressable
            style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]}
            onPress={generate}
            disabled={isGenerating}
            accessibilityRole="button"
          >
            {isGenerating ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate draft answer key</Text>}
          </Pressable>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {entries.map((entry) => {
          const question = assignment.questions[entry.questionIndex];
          const isVerified = !!entry.teacherVerifiedAnswer;
          return (
            <View key={entry.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.questionText, { color: colors.textPrimary }]}>
                  {entry.questionIndex + 1}. {question?.prompt ?? "Question"}
                </Text>
                {entry.photoSubmissionRequired ? <Ionicons name="camera-outline" size={16} color={colors.textMuted} /> : null}
              </View>
              {isVerified ? (
                <View style={styles.verifiedTag}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                  <Text style={[styles.verifiedText, { color: colors.accent }]}>Teacher-verified</Text>
                </View>
              ) : (
                <Text style={[styles.meta, { color: colors.textMuted }]}>AI draft - review before this is used</Text>
              )}
              <TextInput
                style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={drafts[entry.id] ?? ""}
                onChangeText={(text) => setDrafts((prev) => ({ ...prev, [entry.id]: text }))}
                multiline
              />
              <Pressable
                style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent }, (savingId === entry.id || pressed) && { opacity: pressedOpacity }]}
                onPress={() => save(entry)}
                disabled={savingId === entry.id}
                accessibilityRole="button"
              >
                {savingId === entry.id ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save</Text>}
              </Pressable>
            </View>
          );
        })}
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
  generateButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  questionText: { fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 18 },
  meta: { fontSize: 11, marginTop: 4 },
  verifiedTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  verifiedText: { fontSize: 11, fontWeight: "700" },
  answerInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, fontSize: 13, marginTop: 8 },
  saveButton: { borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveButtonText: { fontSize: 12, fontWeight: "700" },
});
