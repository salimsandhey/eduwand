import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, PresentationDensity } from "../../api/client";
import { PRESENTATION_DENSITY_LABELS } from "./generation/content";

type Props = NativeStackScreenProps<RootStackParamList, "PresentationDensity">;

const DENSITY_ORDER: PresentationDensity[] = ["light", "balanced", "dense"];

// Step 7: "One lever, three positions, phrased in the teacher's language."
// Confirming here kicks off step 8's outline pass.
export function PresentationDensityScreen({ route, navigation }: Props) {
  const { topicId, presentationReason, presentationClasses, totalSlides } = route.params;
  const { accessToken } = useAuth();
  const { colors, pressedOpacity, cardShadow } = useTheme();
  const [density, setDensity] = useState<PresentationDensity>("balanced");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  useAiGenerating(isGenerating);
  const [error, setError] = useState<string | null>(null);

  // Revision decks always run dense (spec: "Revision decks ignore the
  // density lever... The lever stays visible but has no effect on this
  // structure") - shown, not disabled, so the teacher can still see/tap it,
  // but the request always sends "dense" for this reason.
  const isRevision = presentationReason === "revision_deck";

  async function generateOutline() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    try {
      // Sources were already attached to this topic earlier (Context tab) -
      // the new flow has no separate per-generation source picker, same as
      // the assignment-generation flow's use of a topic's taught content.
      const topic = await api.getTopic(accessToken, topicId);
      const sources = topic.contextSources.filter((s) => s.extractionStatus === "extracted").map((s) => ({ contextSourceId: s.id }));

      const generation = await api.createPresentationOutline(accessToken, topicId, {
        presentationReason,
        presentationDensity: isRevision ? "dense" : density,
        presentationClasses,
        totalSlides,
        customPrompt: customPrompt.trim() || undefined,
        sources,
      });
      navigation.replace("PresentationOutlineReview", { generationId: generation.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the outline");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>How much detail?</Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              How much text goes on each slide.
            </Text>
          </View>
        </View>

        <View style={styles.densityRow}>
          {DENSITY_ORDER.map((key) => {
            const meta = PRESENTATION_DENSITY_LABELS[key];
            const active = isRevision ? key === "dense" : density === key;
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.densityChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
                onPress={() => setDensity(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.densityLabel, { color: active ? colors.accentOn : colors.textPrimary }]}>{meta.label}</Text>
                <Text style={[styles.densityCaption, { color: active ? colors.accentOn : colors.textMuted }]}>{meta.caption}</Text>
              </Pressable>
            );
          })}
        </View>
        {isRevision ? (
          <Text style={[styles.revisionNote, { color: colors.textMuted }]}>
            Revision decks always use full detail, regardless of what's picked above - that's the point of a revision deck.
          </Text>
        ) : null}

        <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Anything specific to include? (optional)</Text>
        <TextInput
          style={[styles.focusInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
          value={customPrompt}
          onChangeText={setCustomPrompt}
          placeholder="e.g. focus on the diagram-based questions, keep the tone simple..."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.continueButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]}
            onPress={generateOutline}
            disabled={isGenerating}
            accessibilityRole="button"
          >
            <Text style={[styles.continueText, { color: colors.accentOn }]}>Generate outline</Text>
            <Ionicons name="arrow-forward" size={19} color={colors.accentOn} />
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.textMuted }]}>You'll review the outline before anything is fully written.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1, marginLeft: 14 },
  topTitle: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  topSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  densityRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  densityChip: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 84, justifyContent: "center" },
  densityLabel: { fontSize: 14, fontWeight: "800" },
  densityCaption: { marginTop: 4, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  revisionNote: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: "500", fontStyle: "italic" },
  inputLabel: { fontSize: 13, fontWeight: "800", marginTop: 24, marginBottom: 9 },
  focusInput: { minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  error: { textAlign: "center", marginTop: 16, fontSize: 13 },
  footer: { marginTop: 26 },
  continueButton: { height: 55, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  continueText: { fontSize: 15, fontWeight: "800" },
  footerNote: { textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: "500" },
});
