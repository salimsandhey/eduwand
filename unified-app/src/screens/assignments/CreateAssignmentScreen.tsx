import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Switch, Platform, KeyboardAvoidingView, Alert } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTricklingProgress } from "../../hooks/useTricklingProgress";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ApiError, ClassSection, AssignmentQuestion, QuestionDifficulty } from "../../api/client";
import { sanitizeQuestion } from "./questionText";
import { capitalizeFirst } from "../../utils/text";
import { FieldError } from "../../components/FieldError";
import { useFormErrors } from "../../hooks/useForm";
import { rules, assignmentQuestionProblem } from "../../utils/validation";

type Props = NativeStackScreenProps<RootStackParamList, "CreateAssignment">;

let nextQuestionId = 1;

const DIFFICULTIES: QuestionDifficulty[] = ["easy", "medium", "hard"];

export function CreateAssignmentScreen({ navigation, route }: Props) {
  const topicId = route.params?.topicId;
  const assignmentId = route.params?.assignmentId;
  const isEditMode = !!assignmentId;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [title, setTitle] = useState("");
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([{ id: `q${nextQuestionId++}`, prompt: "", difficulty: "medium" }]);
  const [personalisationEnabled, setPersonalisationEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const suggestionsProgress = useTricklingProgress(isGeneratingSuggestions, "Personalizing question suggestions…");
  useAiGenerating(isGeneratingSuggestions, undefined, suggestionsProgress);
  const [error, setError] = useState<string | null>(null);

  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const isSaveDisabled = isSaving || (!isEditMode && !classSectionId);

  // Inline validation - rules mirror backend/src/lib/validation.ts. Blank
  // question rows are ignored on save (as before); a question that has text
  // must be complete (options + a correct answer, full pairs, and so on).
  const titleV = useFormErrors({ title }, { title: rules.label("Title", true, 120) });
  const [showQuestionErrors, setShowQuestionErrors] = useState(false);
  const questionErrors = questions.map((q) => (q.prompt.trim() ? assignmentQuestionProblem(q) : null));

  useEffect(() => {
    if (!accessToken) return;
    api
      .listClassSections(accessToken)
      .then((sections) => {
        setClassSections(sections);
        if (!isEditMode && sections.length > 0) setClassSectionId(sections[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load class sections"));
  }, [accessToken, isEditMode]);

  useEffect(() => {
    if (!accessToken || !assignmentId) return;
    setIsLoadingExisting(true);
    api
      .getAssignment(accessToken, assignmentId)
      .then((a) => {
        if (a.status !== "draft") {
          setBlockedReason("This assignment is already published. Unpublish it from the assignment screen before editing.");
          return;
        }
        setTitle(a.title);
        setClassSectionId(a.classSectionId);
        setQuestions(a.questions.length > 0 ? a.questions.map((q) => sanitizeQuestion({ ...q, difficulty: q.difficulty ?? "medium" })) : questions);
        setPersonalisationEnabled(a.personalisationEnabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load assignment"))
      .finally(() => setIsLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, assignmentId]);

  function updateQuestion(id: string, prompt: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, prompt } : q)));
  }

  function updateDifficulty(id: string, difficulty: QuestionDifficulty) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, difficulty } : q)));
  }

  // MCQ/true_false, match_following and sequencing question types carry
  // extra structured fields (options, pairs, items) beyond the plain prompt
  // this screen otherwise only edits - same shape and mutators as
  // AssignmentDraftReviewScreen.tsx, so a teacher editing an already-created
  // assignment sees and can change the same detail they saw when it was
  // first drafted, not just the prompt text.
  function updateOption(id: string, index: number, text: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, options: (q.options ?? []).map((o, i) => (i === index ? text : o)) } : q))
    );
  }
  function setCorrectOption(id: string, index: number) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, correctOptionIndex: index } : q)));
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
    setQuestions((prev) => [...prev, { id: `q${nextQuestionId++}`, prompt: "", difficulty: "medium" }]);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((q) => q.id !== id) : prev));
  }

  async function save(publish: boolean) {
    if (!accessToken) return;
    const titleValid = titleV.submit();
    setShowQuestionErrors(true);
    if (!titleValid) return;
    if (!classSectionId) {
      setError(
        classSections.length === 0
          ? "You haven't been assigned to any class section yet - ask your admin to assign you one before creating an assignment."
          : "Select a class"
      );
      return;
    }
    const filledQuestions = questions.filter((q) => q.prompt.trim().length > 0);
    if (filledQuestions.length === 0) {
      setError("Add at least one question");
      return;
    }
    if (questionErrors.some(Boolean)) {
      setError("Please fix the highlighted questions");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const id = isEditMode
        ? (await api.updateAssignment(accessToken, assignmentId!, {
            title: title.trim(),
            questions: filledQuestions,
            personalisationEnabled,
          })).id
        : (
            await api.createAssignment(accessToken, {
              title: title.trim(),
              classSectionId,
              questions: filledQuestions,
              personalisationEnabled,
              topicId,
            })
          ).id;

      if (publish) {
        const publishedOk = await tryPublish(id);
        if (!publishedOk) return; // teacher is being asked to confirm; leave them on this screen
        if (personalisationEnabled) {
          setIsGeneratingSuggestions(true);
          try {
            await api.generatePersonalisationSuggestions(accessToken, id);
          } finally {
            setIsGeneratingSuggestions(false);
          }
          navigation.replace("PersonalisationReview", { assignmentId: id });
          return;
        }
      }

      navigation.replace("AssignmentDetail", { assignmentId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setIsSaving(false);
    }
  }

  // Publishing warns (via a 409) instead of blocking when the answer key
  // hasn't been reviewed yet - resolved here with a native confirm rather
  // than a custom modal, since this screen doesn't otherwise need one.
  // Returns true once the assignment is actually published.
  async function tryPublish(id: string, confirmUnverified = false): Promise<boolean> {
    if (!accessToken) return false;
    try {
      await api.publishAssignment(accessToken, id, confirmUnverified);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "unverified_answers") {
        Alert.alert("Answer key not fully reviewed", `${err.message} Publish anyway?`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Publish anyway",
            style: "destructive",
            onPress: async () => {
              setIsSaving(true);
              const ok = await tryPublish(id, true);
              if (ok) {
                if (personalisationEnabled) {
                  setIsGeneratingSuggestions(true);
                  try {
                    await api.generatePersonalisationSuggestions(accessToken, id);
                  } finally {
                    setIsGeneratingSuggestions(false);
                  }
                  navigation.replace("PersonalisationReview", { assignmentId: id });
                } else {
                  navigation.replace("AssignmentDetail", { assignmentId: id });
                }
              }
              setIsSaving(false);
            },
          },
        ]);
        return false;
      }
      throw err;
    }
  }

  if (isLoadingExisting) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (blockedReason) {
    return (
      <Screen style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={32} color={colors.textMuted} />
        <Text style={[styles.blockedText, { color: colors.textSecondary }]}>{blockedReason}</Text>
        <Pressable
          style={({ pressed }) => [styles.blockedButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.replace("AssignmentDetail", { assignmentId: assignmentId! })}
          accessibilityRole="button"
        >
          <Text style={[styles.blockedButtonText, { color: colors.textSecondary }]}>Back to assignment</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: titleV.error("title") ? colors.danger : colors.border, color: colors.textPrimary }]}
            value={title}
            onChangeText={setTitle}
            onBlur={() => titleV.blur("title")}
            placeholder="e.g. Fractions Practice"
            placeholderTextColor={colors.textMuted}
            maxLength={120}
          />
          <FieldError message={titleV.error("title")} />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Class</Text>
          {classSections.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No class sections configured</Text>
          ) : isEditMode ? (
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 4 }]}>
              {capitalizeFirst(classSections.find((cs) => cs.id === classSectionId)?.className ?? "")}{" "}
              {capitalizeFirst(classSections.find((cs) => cs.id === classSectionId)?.sectionName ?? "")} (class can't be changed after creation)
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {classSections.map((cs) => {
                const active = classSectionId === cs.id;
                return (
                  <Pressable
                    key={cs.id}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setClassSectionId(cs.id)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                      {capitalizeFirst(cs.className)} {capitalizeFirst(cs.sectionName)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Personalise for each student</Text>
              <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>
                Every student gets all of the questions below, unchanged. On publish, this also generates an extra,
                difficulty-matched section of questions for students with enough grading history to calibrate it - you
                review and approve each one before it's added.
              </Text>
            </View>
            <Switch value={personalisationEnabled} onValueChange={setPersonalisationEnabled} trackColor={{ true: colors.accent }} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <View style={styles.questionsHeader}>
            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Questions</Text>
            <Pressable onPress={addQuestion} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.accent }]}>+ Add</Text>
            </Pressable>
          </View>
          {questions.map((q, i) => (
            <View key={q.id} style={styles.questionBlock}>
              <View style={styles.questionRow}>
                <Text style={[styles.questionNumber, { color: colors.textMuted }]}>{i + 1}.</Text>
                <TextInput
                  style={[styles.questionInput, { backgroundColor: colors.surfaceRaised, borderColor: showQuestionErrors && questionErrors[i] ? colors.danger : colors.border, color: colors.textPrimary }]}
                  value={q.prompt}
                  onChangeText={(text) => updateQuestion(q.id, text)}
                  placeholder="Question prompt"
                  placeholderTextColor={colors.textMuted}
                  maxLength={1000}
                  multiline
                />
                {questions.length > 1 ? (
                  <Pressable onPress={() => removeQuestion(q.id)} hitSlop={8} accessibilityRole="button">
                    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
              <FieldError message={showQuestionErrors ? questionErrors[i] : null} />
              {personalisationEnabled ? (
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
              ) : null}

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
            </View>
          ))}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border },
              (isSaving || pressed || isSaveDisabled) && { opacity: pressedOpacity },
            ]}
            onPress={() => save(false)}
            disabled={isSaveDisabled}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>{isEditMode ? "Save changes" : "Save as draft"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.accent },
              (isSaving || pressed || isSaveDisabled) && { opacity: pressedOpacity },
            ]}
            onPress={() => save(true)}
            disabled={isSaveDisabled}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>{isEditMode ? "Save & Publish" : "Publish"}</Text>}
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  blockedText: { fontSize: 14, textAlign: "center", fontWeight: "600", lineHeight: 20 },
  blockedButton: { borderWidth: 1, borderRadius: 10, height: 44, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  blockedButtonText: { fontSize: 13, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44, fontSize: 14 },
  meta: { fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, paddingTop: 14, borderTopWidth: 0 },
  questionsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { fontWeight: "700", fontSize: 13 },
  questionBlock: { marginTop: 10 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  questionNumber: { fontSize: 13, fontWeight: "700", marginTop: 12 },
  questionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44, fontSize: 14 },
  difficultyRow: { flexDirection: "row", gap: 6, marginTop: 6, marginLeft: 22 },
  difficultyChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  difficultyChipText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  optionsBlock: { marginTop: 10, marginLeft: 22 },
  smallLabel: { fontSize: 11, fontWeight: "700" },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  optionCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13 },
  addOptionText: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  warningText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
  primaryButton: { flex: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
});
