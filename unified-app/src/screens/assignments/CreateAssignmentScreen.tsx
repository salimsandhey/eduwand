import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Switch } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ClassSection, AssignmentQuestion, QuestionDifficulty } from "../../api/client";

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
  const [error, setError] = useState<string | null>(null);

  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

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
        setQuestions(a.questions.length > 0 ? a.questions.map((q) => ({ ...q, difficulty: q.difficulty ?? "medium" })) : questions);
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

  function addQuestion() {
    setQuestions((prev) => [...prev, { id: `q${nextQuestionId++}`, prompt: "", difficulty: "medium" }]);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((q) => q.id !== id) : prev));
  }

  async function save(publish: boolean) {
    if (!accessToken || !title.trim() || !classSectionId) return;
    const filledQuestions = questions.filter((q) => q.prompt.trim().length > 0);
    if (filledQuestions.length === 0) {
      setError("Add at least one question");
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
        await api.publishAssignment(accessToken, id);
        if (personalisationEnabled) {
          await api.generatePersonalisationSuggestions(accessToken, id);
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Fractions Practice"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Class</Text>
          {classSections.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No class sections configured</Text>
          ) : isEditMode ? (
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 4 }]}>
              {classSections.find((cs) => cs.id === classSectionId)?.className ?? ""}{" "}
              {classSections.find((cs) => cs.id === classSectionId)?.sectionName ?? ""} (class can't be changed after creation)
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
                      {cs.className} {cs.sectionName}
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
                On publish, suggests a difficulty mix per student - the approved mix determines which of the questions below they
                actually receive.
              </Text>
            </View>
            <Switch value={personalisationEnabled} onValueChange={setPersonalisationEnabled} trackColor={{ true: colors.accent }} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
                  style={[styles.questionInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                  value={q.prompt}
                  onChangeText={(text) => updateQuestion(q.id, text)}
                  placeholder="Question prompt"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                {questions.length > 1 ? (
                  <Pressable onPress={() => removeQuestion(q.id)} hitSlop={8} accessibilityRole="button">
                    <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
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
            </View>
          ))}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border }, (isSaving || pressed) && { opacity: pressedOpacity }]}
            onPress={() => save(false)}
            disabled={isSaving || !title.trim()}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>{isEditMode ? "Save changes" : "Save as draft"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, (isSaving || pressed) && { opacity: pressedOpacity }]}
            onPress={() => save(true)}
            disabled={isSaving || !title.trim()}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>{isEditMode ? "Save & Publish" : "Publish"}</Text>}
          </Pressable>
        </View>
      </ScrollView>
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
  error: { textAlign: "center", marginBottom: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
  primaryButton: { flex: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
});
