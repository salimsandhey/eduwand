import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Switch } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, ClassSection, AssignmentQuestion } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "CreateAssignment">;

let nextQuestionId = 1;

export function CreateAssignmentScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [title, setTitle] = useState("");
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssignmentQuestion[]>([{ id: `q${nextQuestionId++}`, prompt: "" }]);
  const [personalisationEnabled, setPersonalisationEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listClassSections(accessToken)
      .then((sections) => {
        setClassSections(sections);
        if (sections.length > 0) setClassSectionId(sections[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load class sections"));
  }, [accessToken]);

  function updateQuestion(id: string, prompt: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, prompt } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, { id: `q${nextQuestionId++}`, prompt: "" }]);
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
      const assignment = await api.createAssignment(accessToken, {
        title: title.trim(),
        classSectionId,
        questions: filledQuestions,
        personalisationEnabled,
      });

      if (publish) {
        await api.publishAssignment(accessToken, assignment.id);
        if (personalisationEnabled) {
          await api.generatePersonalisationSuggestions(accessToken, assignment.id);
          navigation.replace("PersonalisationReview", { assignmentId: assignment.id });
          return;
        }
      }

      navigation.replace("AssignmentDetail", { assignmentId: assignment.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save assignment");
    } finally {
      setIsSaving(false);
    }
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
                Suggests a difficulty mix per student on publish - nothing is applied until you review it
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
            <View key={q.id} style={styles.questionRow}>
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
            <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Save as draft</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, (isSaving || pressed) && { opacity: pressedOpacity }]}
            onPress={() => save(true)}
            disabled={isSaving || !title.trim()}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Publish</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
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
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 },
  questionNumber: { fontSize: 13, fontWeight: "700", marginTop: 12 },
  questionInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 44, fontSize: 14 },
  error: { textAlign: "center", marginBottom: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  secondaryButton: { flex: 1, borderWidth: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
  primaryButton: { flex: 1, borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 14, fontWeight: "700" },
});
