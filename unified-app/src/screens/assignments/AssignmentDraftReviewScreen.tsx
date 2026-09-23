import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentQuestion, AnswerKeyEntry, QuestionDifficulty, AssignmentDetail } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AssignmentDraftReview">;

const DIFFICULTIES: QuestionDifficulty[] = ["easy", "medium", "hard"];
// Platform-wide cap (matches the backend's own generation limit) - used only
// when this assignment wasn't AI-generated, so there's no "decided" count to
// hold it to.
const MAX_QUESTIONS = 20;

let nextLocalId = 1;

function answerTextFor(entry: AnswerKeyEntry | undefined): string {
  if (!entry) return "";
  return entry.teacherVerifiedAnswer ?? entry.aiAnswer;
}

export function AssignmentDraftReviewScreen({ route, navigation }: Props) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [answerKeys, setAnswerKeys] = useState<AnswerKeyEntry[]>([]);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([]);
  const [answerTextById, setAnswerTextById] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  useAiGenerating(regeneratingId !== null || isGeneratingKey);
  const [error, setError] = useState<string | null>(null);

  const [regenerateTargetId, setRegenerateTargetId] = useState<string | null>(null);
  const [regenerateInstruction, setRegenerateInstruction] = useState("");
  // The one question "Looks good" found a problem with, so its card can be
  // highlighted instead of leaving the teacher to hunt for it from the error
  // text alone.
  const [invalidQuestionId, setInvalidQuestionId] = useState<string | null>(null);

  // The total the teacher actually decided on - "+ Add question" shouldn't
  // silently grow past it. aiGenParams.questionCount is the real source when
  // it exists; failing that (a manually built assignment, or an older draft
  // saved before that field existed), how many questions were already on the
  // draft the moment this screen opened is still a real decided count and a
  // far better cap than an arbitrary platform max.
  const [originalQuestionCount, setOriginalQuestionCount] = useState<number | null>(null);
  const questionCap = assignment?.aiGenParams?.questionCount ?? originalQuestionCount ?? MAX_QUESTIONS;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [a, keys] = await Promise.all([
        api.getAssignment(accessToken, assignmentId),
        api.getAnswerKey(accessToken, assignmentId),
      ]);
      setAssignment(a);
      setQuestions(a.questions);
      setOriginalQuestionCount((prev) => prev ?? a.questions.length);
      setAnswerKeys(keys);
      const byId = new Map(keys.map((k) => [k.questionId, k]));
      setAnswerTextById(Object.fromEntries(a.questions.map((q) => [q.id, answerTextFor(byId.get(q.id))])));
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

  function updatePrompt(id: string, prompt: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, prompt } : q)));
  }
  function updateDifficulty(id: string, difficulty: QuestionDifficulty) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, difficulty } : q)));
  }
  function updateAnswerText(id: string, text: string) {
    setAnswerTextById((prev) => ({ ...prev, [id]: text }));
  }
  function updateOption(id: string, index: number, text: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, options: (q.options ?? []).map((o, i) => (i === index ? text : o)) } : q))
    );
  }
  function setCorrectOption(id: string, index: number) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, correctOptionIndex: index } : q)));
    setInvalidQuestionId((prev) => (prev === id ? null : prev));
  }
  function addOption(id: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && (q.options?.length ?? 0) < 5 ? { ...q, options: [...(q.options ?? []), ""] } : q))
    );
  }
  function removeOption(id: string, index: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id || (q.options?.length ?? 0) <= 2) return q;
        const options = (q.options ?? []).filter((_, i) => i !== index);
        const correctOptionIndex =
          q.correctOptionIndex === index ? 0 : q.correctOptionIndex! > index ? q.correctOptionIndex! - 1 : q.correctOptionIndex;
        return { ...q, options, correctOptionIndex };
      })
    );
  }
  function updatePair(id: string, index: number, side: "left" | "right", text: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, pairs: (q.pairs ?? []).map((p, i) => (i === index ? { ...p, [side]: text } : p)) } : q))
    );
  }
  function addPair(id: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && (q.pairs?.length ?? 0) < 5 ? { ...q, pairs: [...(q.pairs ?? []), { left: "", right: "" }] } : q))
    );
  }
  function removePair(id: string, index: number) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && (q.pairs?.length ?? 0) > 2 ? { ...q, pairs: (q.pairs ?? []).filter((_, i) => i !== index) } : q))
    );
  }
  function updateItem(id: string, index: number, text: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, items: (q.items ?? []).map((it, i) => (i === index ? text : it)) } : q)));
  }
  function addItem(id: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && (q.items?.length ?? 0) < 5 ? { ...q, items: [...(q.items ?? []), ""] } : q))
    );
  }
  function removeItem(id: string, index: number) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id && (q.items?.length ?? 0) > 2 ? { ...q, items: (q.items ?? []).filter((_, i) => i !== index) } : q))
    );
  }

  function addQuestion() {
    if (questions.length >= questionCap) return;
    const id = `local${nextLocalId++}`;
    setQuestions((prev) => [...prev, { id, prompt: "", difficulty: "medium", type: "short_answer" }]);
    setAnswerTextById((prev) => ({ ...prev, [id]: "" }));
  }

  function removeQuestion(id: string) {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setAnswerTextById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function openRegenerate(id: string) {
    setRegenerateTargetId(id);
    setRegenerateInstruction("");
  }

  async function confirmRegenerate() {
    if (!accessToken || !regenerateTargetId) return;
    const questionId = regenerateTargetId;
    setRegenerateTargetId(null);
    setRegeneratingId(questionId);
    setError(null);
    try {
      const updated = await api.regenerateAssignmentQuestion(accessToken, assignmentId, questionId, regenerateInstruction.trim() || undefined);
      const replacement = updated.questions.find((q) => q.id === questionId);
      if (replacement) {
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? replacement : q)));
      }
      const keys = await api.getAnswerKey(accessToken, assignmentId);
      setAnswerKeys(keys);
      const entry = keys.find((k) => k.questionId === questionId);
      setAnswerTextById((prev) => ({ ...prev, [questionId]: entry?.aiAnswer ?? prev[questionId] ?? "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function looksGood() {
    if (!accessToken || !assignment) return;
    setInvalidQuestionId(null);
    const filledQuestions = questions.filter((q) => q.prompt.trim().length > 0);
    if (filledQuestions.length === 0) {
      setError("Add at least one question");
      return;
    }
    for (const q of filledQuestions) {
      if (
        (q.type === "mcq" || q.type === "true_false") &&
        (!q.options ||
          q.options.filter((o) => o.trim()).length < 2 ||
          typeof q.correctOptionIndex !== "number" ||
          q.correctOptionIndex < 0 ||
          q.correctOptionIndex >= q.options.length)
      ) {
        setInvalidQuestionId(q.id);
        setError(`"${q.prompt.slice(0, 40)}..." needs at least 2 options and a correct answer selected.`);
        return;
      }
      if (q.type === "match_following" && (!q.pairs || q.pairs.filter((p) => p.left.trim() && p.right.trim()).length < 2)) {
        setInvalidQuestionId(q.id);
        setError(`"${q.prompt.slice(0, 40)}..." needs at least 2 complete pairs.`);
        return;
      }
      if (q.type === "sequencing" && (!q.items || q.items.filter((it) => it.trim()).length < 2)) {
        setInvalidQuestionId(q.id);
        setError(`"${q.prompt.slice(0, 40)}..." needs at least 2 steps.`);
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      await api.updateAssignment(accessToken, assignmentId, { questions: filledQuestions });

      const existingIds = new Set(answerKeys.map((k) => k.questionId));
      const hasNewQuestions = filledQuestions.some((q) => !existingIds.has(q.id));
      let currentKeys = answerKeys;
      if (hasNewQuestions) {
        setIsGeneratingKey(true);
        try {
          currentKeys = await api.generateAnswerKey(accessToken, assignmentId);
        } finally {
          setIsGeneratingKey(false);
        }
      }

      // Everything shown on this screen has now been looked at by the
      // teacher - commit it as verified (not just the rows they edited),
      // so AssignmentDetail doesn't send them through a second identical
      // review pass on AnswerKeyReview for answers they already saw here.
      const keyByQuestion = new Map(currentKeys.map((k) => [k.questionId, k]));
      for (const q of filledQuestions) {
        const entry = keyByQuestion.get(q.id);
        const edited = (answerTextById[q.id] ?? "").trim();
        if (!entry || !edited) continue;
        if (entry.teacherVerifiedAnswer !== edited) {
          await api.updateAnswerKeyEntry(accessToken, entry.id, { teacherVerifiedAnswer: edited });
        }
      }

      navigation.replace("AssignmentDetail", { assignmentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setIsSaving(false);
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {assignment.title}
            </Text>
            <View style={[styles.aiBadge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={[styles.aiBadgeText, { color: colors.accent }]}>AI draft</Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Review each question and its model answer. Edit, regenerate, or remove anything before continuing.
          </Text>

          {questions.map((q, i) => (
            <View
              key={q.id}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderWidth: invalidQuestionId === q.id ? 1.5 : 0, borderColor: colors.danger },
                cardShadow,
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.questionNumber, { color: colors.accent }]}>{String(i + 1).padStart(2, "0")}</Text>
                <View style={styles.cardHeaderActions}>
                  <Pressable
                    onPress={() => openRegenerate(q.id)}
                    disabled={regeneratingId === q.id}
                    hitSlop={8}
                    style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate this question"
                  >
                    {regeneratingId === q.id ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons name="refresh-outline" size={19} color={colors.accent} />
                    )}
                  </Pressable>
                  {questions.length > 1 ? (
                    <Pressable onPress={() => removeQuestion(q.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete this question">
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <TextInput
                style={[styles.questionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={q.prompt}
                onChangeText={(text) => updatePrompt(q.id, text)}
                placeholder="Question prompt"
                placeholderTextColor={colors.textMuted}
                multiline
              />

              <View style={styles.difficultyRow}>
                {DIFFICULTIES.map((level) => {
                  const active = (q.difficulty ?? "medium") === level;
                  return (
                    <Pressable
                      key={level}
                      style={({ pressed }) => [
                        styles.difficultyChip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => updateDifficulty(q.id, level)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.difficultyChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{level}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {q.type === "mcq" || q.type === "true_false" ? (
                <View style={styles.optionsBlock}>
                  <Text style={[styles.smallLabel, { color: colors.textMuted }]}>Options - tap ✓ to mark the correct one</Text>
                  {typeof q.correctOptionIndex !== "number" || q.correctOptionIndex < 0 || q.correctOptionIndex >= (q.options?.length ?? 0) ? (
                    <View style={styles.warningRow}>
                      <Ionicons name="alert-circle" size={14} color={colors.danger} />
                      <Text style={[styles.warningText, { color: colors.danger }]}>No correct answer selected yet</Text>
                    </View>
                  ) : null}
                  {(q.options ?? []).map((option, idx) => {
                    const correct = q.correctOptionIndex === idx;
                    return (
                      <View key={idx} style={styles.optionRow}>
                        <Pressable
                          onPress={() => setCorrectOption(q.id, idx)}
                          style={[styles.optionCheck, { borderColor: correct ? colors.accent : colors.border, backgroundColor: correct ? colors.accent : "transparent" }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark option ${idx + 1} correct`}
                        >
                          {correct ? <Ionicons name="checkmark" size={13} color={colors.accentOn} /> : null}
                        </Pressable>
                        <TextInput
                          style={[styles.optionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                          value={option}
                          onChangeText={(text) => updateOption(q.id, idx, text)}
                          placeholder={`Option ${idx + 1}`}
                          placeholderTextColor={colors.textMuted}
                          editable={q.type !== "true_false"}
                        />
                        {q.type === "mcq" && (q.options?.length ?? 0) > 2 ? (
                          <Pressable onPress={() => removeOption(q.id, idx)} hitSlop={8} accessibilityRole="button">
                            <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                  {q.type === "mcq" && (q.options?.length ?? 0) < 5 ? (
                    <Pressable onPress={() => addOption(q.id)} hitSlop={8} accessibilityRole="button">
                      <Text style={[styles.addOptionText, { color: colors.accent }]}>+ Add option</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : q.type === "match_following" ? (
                <View style={styles.optionsBlock}>
                  <Text style={[styles.smallLabel, { color: colors.textMuted }]}>Pairs</Text>
                  {(q.pairs ?? []).map((pair, idx) => (
                    <View key={idx} style={styles.optionRow}>
                      <TextInput
                        style={[styles.optionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary, flex: 1 }]}
                        value={pair.left}
                        onChangeText={(text) => updatePair(q.id, idx, "left", text)}
                        placeholder="Left item"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TextInput
                        style={[styles.optionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary, flex: 1 }]}
                        value={pair.right}
                        onChangeText={(text) => updatePair(q.id, idx, "right", text)}
                        placeholder="Matching right item"
                        placeholderTextColor={colors.textMuted}
                      />
                      {(q.pairs?.length ?? 0) > 2 ? (
                        <Pressable onPress={() => removePair(q.id, idx)} hitSlop={8} accessibilityRole="button">
                          <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                  {(q.pairs?.length ?? 0) < 5 ? (
                    <Pressable onPress={() => addPair(q.id)} hitSlop={8} accessibilityRole="button">
                      <Text style={[styles.addOptionText, { color: colors.accent }]}>+ Add pair</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : q.type === "sequencing" ? (
                <View style={styles.optionsBlock}>
                  <Text style={[styles.smallLabel, { color: colors.textMuted }]}>Steps, in the correct order</Text>
                  {(q.items ?? []).map((item, idx) => (
                    <View key={idx} style={styles.optionRow}>
                      <Text style={[styles.smallLabel, { color: colors.textMuted, marginTop: 0 }]}>{idx + 1}.</Text>
                      <TextInput
                        style={[styles.optionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                        value={item}
                        onChangeText={(text) => updateItem(q.id, idx, text)}
                        placeholder={`Step ${idx + 1}`}
                        placeholderTextColor={colors.textMuted}
                      />
                      {(q.items?.length ?? 0) > 2 ? (
                        <Pressable onPress={() => removeItem(q.id, idx)} hitSlop={8} accessibilityRole="button">
                          <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                  {(q.items?.length ?? 0) < 5 ? (
                    <Pressable onPress={() => addItem(q.id)} hitSlop={8} accessibilityRole="button">
                      <Text style={[styles.addOptionText, { color: colors.accent }]}>+ Add step</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <Text style={[styles.smallLabel, { color: colors.textMuted, marginTop: 12 }]}>Model answer</Text>
              <TextInput
                style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={answerTextById[q.id] ?? ""}
                onChangeText={(text) => updateAnswerText(q.id, text)}
                placeholder="Model answer"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>
          ))}

          {questions.length < questionCap ? (
            <Pressable
              onPress={addQuestion}
              style={({ pressed }) => [styles.addQuestionButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={colors.accent} />
              <Text style={[styles.addQuestionText, { color: colors.accent }]}>Add question ({questions.length} of {questionCap})</Text>
            </Pressable>
          ) : (
            <Text style={[styles.questionCapNote, { color: colors.textMuted }]}>
              {assignment?.aiGenParams ? `You've reached the ${questionCap} questions you asked for.` : `Assignments are capped at ${questionCap} questions.`}
            </Text>
          )}

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, (isSaving || pressed) && { opacity: pressedOpacity }]}
            onPress={looksGood}
            disabled={isSaving}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Looks good →</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent animationType="fade" visible={regenerateTargetId !== null} onRequestClose={() => setRegenerateTargetId(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setRegenerateTargetId(null)} accessibilityRole="button" accessibilityLabel="Cancel regenerate" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Regenerate this question</Text>
            <TextInput
              style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary, minHeight: 70 }]}
              value={regenerateInstruction}
              onChangeText={setRegenerateInstruction}
              placeholder="Optional: tell the AI what to change (e.g. make it harder)"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />
            <Pressable
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, marginTop: 14 }, pressed && { opacity: pressedOpacity }]}
              onPress={confirmRegenerate}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Regenerate</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4, flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 16 },
  aiBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  aiBadgeText: { fontSize: 11, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  questionNumber: { fontSize: 13, fontWeight: "800" },
  cardHeaderActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  questionInput: { marginTop: 10, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 50, fontSize: 14 },
  difficultyRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  difficultyChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  difficultyChipText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  optionsBlock: { marginTop: 12 },
  smallLabel: { fontSize: 11, fontWeight: "700" },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  optionCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13 },
  addOptionText: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  warningText: { fontSize: 12, fontWeight: "700" },
  answerInput: { marginTop: 6, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, fontSize: 13 },
  addQuestionButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, height: 46, marginBottom: 16 },
  addQuestionText: { fontSize: 13, fontWeight: "700" },
  questionCapNote: { textAlign: "center", fontSize: 12, marginBottom: 16 },
  error: { textAlign: "center", marginBottom: 12 },
  primaryButton: { borderRadius: 10, height: 50, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(22, 15, 20, 0.48)" },
  modalSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 },
  modalTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
});
