import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentDraftOptions, QuestionDifficulty } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "AssignmentAiSetup">;

const QUESTION_COUNTS = [3, 5, 8, 10];
const QUESTION_TYPE_OPTIONS: { key: "short_answer" | "mcq" | "mixed"; label: string }[] = [
  { key: "short_answer", label: "Short answer" },
  { key: "mcq", label: "Multiple choice" },
  { key: "mixed", label: "Mixed" },
];
const DIFFICULTIES: { key: QuestionDifficulty; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
];

export function AssignmentAiSetupScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [options, setOptions] = useState<AssignmentDraftOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [questionCount, setQuestionCount] = useState(5);
  const [mix, setMix] = useState<Record<QuestionDifficulty, number>>({ easy: 1, medium: 1, hard: 1 });
  const [questionTypes, setQuestionTypes] = useState<"short_answer" | "mcq" | "mixed">("short_answer");
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [focusPrompt, setFocusPrompt] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getAssignmentDraftOptions(accessToken, topicId)
      .then(setOptions)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load topic"))
      .finally(() => setIsLoadingOptions(false));
  }, [accessToken, topicId]);

  function adjustMix(key: QuestionDifficulty, delta: number) {
    setMix((prev) => ({ ...prev, [key]: Math.max(0, Math.min(9, prev[key] + delta)) }));
  }

  function toggleObjective(objective: string) {
    setSelectedObjectives((prev) => (prev.includes(objective) ? prev.filter((o) => o !== objective) : [...prev, objective]));
  }

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    try {
      const assignment = await api.createAssignmentDraft(accessToken, topicId, {
        questionCount,
        difficultyMix: mix,
        objectives: selectedObjectives,
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

  if (isLoadingOptions) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const blocked = !loadError && options && !options.hasGenerations && !options.hasContextSources;

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
          {options ? (
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {capitalizeFirst(options.classSection.className)} {capitalizeFirst(options.classSection.sectionName)}
            </Text>
          ) : null}
        </View>
      </View>

      {loadError || blocked ? (
        <View style={styles.centered}>
          <Ionicons name="sparkles-outline" size={32} color={colors.textMuted} />
          <Text style={[styles.blockedTitle, { color: colors.textPrimary }]}>
            {loadError ? "Couldn't load this topic" : "Nothing to ground the AI on yet"}
          </Text>
          <Text style={[styles.blockedText, { color: colors.textMuted }]}>
            {loadError ?? "Generate a lesson for this topic (or add context sources) first, so the AI knows what was taught."}
          </Text>
          {!loadError ? (
            <Pressable
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.replace("GenerationSetup", { topicId })}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Generate a lesson first</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.linkButton, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.replace("CreateAssignment", { topicId })}
            accessibilityRole="button"
          >
            <Text style={[styles.linkButtonText, { color: colors.accent }]}>Prefer to write your own? →</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>How many questions?</Text>
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
                      onPress={() => setQuestionCount(count)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Difficulty mix</Text>
              <View style={styles.mixRow}>
                {DIFFICULTIES.map(({ key, label }) => (
                  <View key={key} style={[styles.mixStepper, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[styles.mixLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <View style={styles.mixControls}>
                      <Pressable onPress={() => adjustMix(key, -1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Fewer ${label}`}>
                        <Ionicons name="remove-circle-outline" size={20} color={colors.accent} />
                      </Pressable>
                      <Text style={[styles.mixValue, { color: colors.textPrimary }]}>{mix[key]}</Text>
                      <Pressable onPress={() => adjustMix(key, 1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More ${label}`}>
                        <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Question type</Text>
              <View style={styles.chipRow}>
                {QUESTION_TYPE_OPTIONS.map(({ key, label }) => {
                  const active = questionTypes === key;
                  return (
                    <Pressable
                      key={key}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => setQuestionTypes(key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {options && options.objectives.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 0 }]}>
                  Learning objectives to assess (optional)
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>
                  Pulled from what you've already generated for this topic. Leave all unselected to let the AI decide.
                </Text>
                <View style={styles.chipRow}>
                  {options.objectives.map((objective) => {
                    const active = selectedObjectives.includes(objective);
                    return (
                      <Pressable
                        key={objective}
                        style={({ pressed }) => [
                          styles.objectiveChip,
                          { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                          pressed && { opacity: pressedOpacity },
                        ]}
                        onPress={() => toggleObjective(objective)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.objectiveChipText, { color: active ? colors.accentOn : colors.textSecondary }]} numberOfLines={2}>
                          {objective}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]}
              onPress={generate}
              disabled={isGenerating}
              accessibilityRole="button"
            >
              {isGenerating ? (
                <ActivityIndicator color={colors.accentOn} />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color={colors.accentOn} />
                  <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Generate questions</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.replace("CreateAssignment", { topicId })}
              accessibilityRole="button"
            >
              <Text style={[styles.linkButtonText, { color: colors.accent }]}>Prefer to write your own? →</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
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
  mixRow: { flexDirection: "row", gap: 8 },
  mixStepper: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 6 },
  mixLabel: { fontSize: 11, fontWeight: "700" },
  mixControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  mixValue: { fontSize: 16, fontWeight: "800", minWidth: 18, textAlign: "center" },
  focusInput: { minHeight: 80, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  error: { textAlign: "center", marginBottom: 12 },
  primaryButton: { flexDirection: "row", gap: 8, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
  linkButton: { alignItems: "center", justifyContent: "center", marginTop: 14, padding: 8 },
  linkButtonText: { fontSize: 13, fontWeight: "700" },
  blockedTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  blockedText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
});
