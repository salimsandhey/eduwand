import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ClassSection, Topic, QuestionDifficulty, QuestionType } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "AssignmentAiMultiSetup">;

// Same options as AssignmentAiSetupScreen.tsx (single-topic, reached from
// inside a Topic) - duplicated rather than shared, so this new "mix of
// topics" flow (reached from the Assignment tab) can't destabilize the
// existing one. 20 is the backend's own hard ceiling.
const QUESTION_COUNTS = [3, 5, 8, 10, 12, 15, 20];
const QUESTION_TYPE_OPTIONS: { key: QuestionType; label: string }[] = [
  { key: "mcq", label: "Multiple choice" },
  { key: "true_false", label: "True / False" },
  { key: "fill_blank", label: "Fill in the blanks" },
  { key: "very_short", label: "Very short / one word" },
  { key: "short_answer", label: "Short answer" },
  { key: "match_following", label: "Match the following" },
  { key: "sequencing", label: "Sequencing / ordering" },
];
const DIFFICULTIES: { key: QuestionDifficulty; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
];
const MAX_TOPICS = 10;

function classLabel(c: { className: string; sectionName: string }): string {
  return `${capitalizeFirst(c.className)} ${capitalizeFirst(c.sectionName)}`;
}

export function AssignmentAiMultiSetupScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  const [questionCount, setQuestionCount] = useState(5);
  const [mix, setMix] = useState<Record<QuestionDifficulty, number>>({ easy: 1, medium: 1, hard: 1 });
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [focusPrompt, setFocusPrompt] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  useAiGenerating(isGenerating);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listClassSections(accessToken)
      .then((sections) => {
        setClassSections(sections);
        if (sections.length === 1) setSelectedClassId(sections[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your classes"))
      .finally(() => setIsLoadingClasses(false));
  }, [accessToken]);

  const loadTopics = useCallback(
    async (classSectionId: string) => {
      if (!accessToken) return;
      setIsLoadingTopics(true);
      setError(null);
      try {
        setTopics(await api.listTopics(accessToken, { classSectionId }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load topics for this class");
      } finally {
        setIsLoadingTopics(false);
      }
    },
    [accessToken]
  );

  function selectClass(id: string) {
    setSelectedClassId(id);
    setSelectedTopicIds([]);
    loadTopics(id);
  }

  function toggleTopic(id: string) {
    setSelectedTopicIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= MAX_TOPICS) return prev;
      return [...prev, id];
    });
  }

  // "+" is a no-op once the split already accounts for every question - the
  // stepper itself must never let the total exceed questionCount.
  function adjustMix(key: QuestionDifficulty, delta: number) {
    setMix((prev) => {
      if (delta > 0 && prev.easy + prev.medium + prev.hard >= questionCount) return prev;
      return { ...prev, [key]: Math.max(0, prev[key] + delta) };
    });
  }

  function selectQuestionCount(count: number) {
    setQuestionCount(count);
    setMix((prev) => {
      const total = prev.easy + prev.medium + prev.hard;
      if (total === 0) return { easy: 0, medium: count, hard: 0 };
      const scaled = {
        easy: Math.round((prev.easy / total) * count),
        medium: Math.round((prev.medium / total) * count),
        hard: Math.round((prev.hard / total) * count),
      };
      const drift = count - (scaled.easy + scaled.medium + scaled.hard);
      scaled.medium += drift;
      return scaled;
    });
  }

  function toggleQuestionType(key: QuestionType) {
    setQuestionTypes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  const mixTotal = mix.easy + mix.medium + mix.hard;
  const mixMatches = mixTotal === questionCount;
  const canGenerate = selectedTopicIds.length > 0 && mixMatches && !isGenerating;

  async function generate() {
    if (!accessToken || !selectedClassId || !canGenerate) return;
    setIsGenerating(true);
    setError(null);
    try {
      const assignment = await api.createMultiTopicAssignmentDraft(accessToken, selectedClassId, {
        topicIds: selectedTopicIds,
        questionCount,
        difficultyMix: mix,
        questionTypes,
        focusPrompt: focusPrompt.trim() || undefined,
      });
      navigation.replace("AssignmentDraftReview", { assignmentId: assignment.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Generate assignment</Text>
          <Text style={[styles.topSubtitle, { color: colors.textMuted }]}>One topic, or a mix of several</Text>
        </View>
      </View>

      {isLoadingClasses ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Class</Text>
              <View style={styles.chipRow}>
                {classSections.map((c) => {
                  const active = selectedClassId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => selectClass(c.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{classLabel(c)}</Text>
                    </Pressable>
                  );
                })}
                {classSections.length === 0 ? <Text style={[styles.meta, { color: colors.textMuted }]}>No classes yet.</Text> : null}
              </View>
            </View>

            {selectedClassId ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Topics to draw from</Text>
                <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>
                  Pick one for a single-topic assignment, or several for one covering a mix of topics (up to {MAX_TOPICS}).
                </Text>
                {isLoadingTopics ? (
                  <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
                ) : topics.length === 0 ? (
                  <Text style={[styles.meta, { color: colors.textMuted }]}>No topics in this class yet.</Text>
                ) : (
                  <View style={styles.chipRow}>
                    {topics.map((t) => {
                      const active = selectedTopicIds.includes(t.id);
                      return (
                        <Pressable
                          key={t.id}
                          style={({ pressed }) => [
                            styles.objectiveChip,
                            { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                            pressed && { opacity: pressedOpacity },
                          ]}
                          onPress={() => toggleTopic(t.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.objectiveChipText, { color: active ? colors.accentOn : colors.textSecondary }]} numberOfLines={2}>
                            {capitalizeFirst(t.name)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {selectedTopicIds.length > 0 ? (
              <>
                <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                  <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>How many questions?</Text>
                  <View style={styles.chipRow}>
                    {QUESTION_COUNTS.map((count) => {
                      const active = questionCount === count;
                      return (
                        <Pressable
                          key={count}
                          style={({ pressed }) => [
                            styles.chip,
                            { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                            pressed && { opacity: pressedOpacity },
                          ]}
                          onPress={() => selectQuestionCount(count)}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{count}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.mixHeadingRow}>
                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>Difficulty mix</Text>
                    <Text style={[styles.mixTotalText, { color: mixMatches ? colors.textMuted : colors.danger }]}>
                      {mixTotal} of {questionCount} assigned
                    </Text>
                  </View>
                  <View style={styles.mixRow}>
                    {DIFFICULTIES.map(({ key, label }) => (
                      <View key={key} style={[styles.mixStepper, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                        <Text style={[styles.mixLabel, { color: colors.textSecondary }]}>{label}</Text>
                        <View style={styles.mixControls}>
                          <Pressable onPress={() => adjustMix(key, -1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Fewer ${label}`}>
                            <Ionicons name="remove-circle-outline" size={20} color={colors.accent} />
                          </Pressable>
                          <Text style={[styles.mixValue, { color: colors.textPrimary }]}>{mix[key]}</Text>
                          <Pressable onPress={() => adjustMix(key, 1)} disabled={mixTotal >= questionCount} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More ${label}`}>
                            <Ionicons name="add-circle-outline" size={20} color={mixTotal >= questionCount ? colors.textMuted : colors.accent} />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>

                  <Text style={[styles.label, { color: colors.textSecondary }]}>Question format</Text>
                  <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>Pick one or more. Leave all unselected to let the AI choose.</Text>
                  <View style={styles.chipRow}>
                    {QUESTION_TYPE_OPTIONS.map(({ key, label }) => {
                      const active = questionTypes.includes(key);
                      return (
                        <Pressable
                          key={key}
                          style={({ pressed }) => [
                            styles.chip,
                            { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                            pressed && { opacity: pressedOpacity },
                          ]}
                          onPress={() => toggleQuestionType(key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                  <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>Anything specific to include? (optional)</Text>
                  <TextInput
                    style={[styles.focusInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                    value={focusPrompt}
                    onChangeText={setFocusPrompt}
                    placeholder="e.g. focus on real-world examples, keep language simple..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

                <Pressable
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, (!canGenerate || pressed) && { opacity: pressedOpacity }]}
                  onPress={generate}
                  disabled={!canGenerate}
                  accessibilityRole="button"
                >
                  {/* No spinner while generating - the AI generating overlay covers the screen. */}
                  <Ionicons name="sparkles" size={18} color={colors.accentOn} />
                  <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Generate questions</Text>
                </Pressable>
              </>
            ) : (
              error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, minHeight: 48 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1, marginLeft: 14 },
  topTitle: { fontSize: 19, fontWeight: "800", letterSpacing: -0.4 },
  topSubtitle: { marginTop: 1, fontSize: 12, fontWeight: "500" },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 8, marginTop: 14 },
  meta: { fontSize: 12, lineHeight: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 13, fontWeight: "700" },
  objectiveChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "100%" },
  objectiveChipText: { fontSize: 12, fontWeight: "600" },
  mixHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 8 },
  mixTotalText: { fontSize: 11, fontWeight: "700" },
  mixRow: { flexDirection: "row", gap: 8 },
  mixStepper: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 6 },
  mixLabel: { fontSize: 11, fontWeight: "700" },
  mixControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  mixValue: { fontSize: 16, fontWeight: "800", minWidth: 18, textAlign: "center" },
  focusInput: { minHeight: 80, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  error: { textAlign: "center", marginBottom: 12 },
  primaryButton: { flexDirection: "row", gap: 8, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
});
