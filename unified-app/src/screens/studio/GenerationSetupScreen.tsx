import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, GenerationOutputType } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationSetup">;

const OUTPUT_TYPES: { key: GenerationOutputType; label: string }[] = [
  { key: "lesson_plan", label: "Lesson Plan" },
  { key: "custom_activity_report", label: "Custom Activity" },
  { key: "flashcards", label: "Flashcards" },
  { key: "presentation", label: "Presentation" },
  { key: "explanatory_video", label: "Explanatory Video" },
];
const LANGUAGES = ["English", "Hindi"];
const CLASS_COUNTS = [1, 2, 3, 5];
const DURATIONS = [30, 45, 60, 90];

// Dropdown-driven generation setup - no prompt writing required at any step
// (client doc functional requirement), with an optional custom prompt field
// for teachers who want to add specific instructions.
export function GenerationSetupScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [outputType, setOutputType] = useState<GenerationOutputType>("lesson_plan");
  const [mode, setMode] = useState<"plan" | "generate">("generate");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [classCount, setClassCount] = useState(1);
  const [minutesPerClass, setMinutesPerClass] = useState(45);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function renderChipRow<T extends string | number>(options: T[], value: T, onChange: (v: T) => void, label: (v: T) => string) {
    return (
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={String(opt)}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => onChange(opt)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label(opt)}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generation = await api.createGeneration(accessToken, topicId, {
        outputType,
        mode,
        classCount,
        minutesPerClass,
        language,
        customPrompt: customPrompt.trim() || undefined,
      });
      // A failed generation is still returned (not thrown) with the inputs
      // preserved - GenerationReviewScreen offers the one-click retry.
      navigation.replace("GenerationReview", { generationId: generation.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Output type</Text>
          {renderChipRow(
            OUTPUT_TYPES.map((o) => o.key),
            outputType,
            setOutputType,
            (key) => OUTPUT_TYPES.find((o) => o.key === key)!.label
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Mode</Text>
          {renderChipRow(["generate", "plan"] as const, mode, setMode, (m) => (m === "plan" ? "Plan (preview outline)" : "Generate"))}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Language</Text>
          {renderChipRow(LANGUAGES, language, setLanguage, (l) => l)}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Classes covered</Text>
          {renderChipRow(CLASS_COUNTS, classCount, setClassCount, (n) => String(n))}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Minutes per class</Text>
          {renderChipRow(DURATIONS, minutesPerClass, setMinutesPerClass, (n) => `${n} min`)}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Custom instructions (optional)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={customPrompt}
            onChangeText={setCustomPrompt}
            placeholder="Anything specific to include..."
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]}
            onPress={generate}
            disabled={isGenerating}
            accessibilityRole="button"
          >
            {isGenerating ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44, fontSize: 14 },
  multilineInput: { height: 70, textAlignVertical: "top" },
  error: { textAlign: "center", marginTop: 12 },
  generateButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
});
