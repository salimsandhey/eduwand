import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ThemeColors, typography, spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, Generation } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationReview">;

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
  explanatory_video: "Explanatory Video",
};

function buildMarkdownStyles(colors: ThemeColors) {
  const heading = { color: colors.textPrimary, fontFamily: typography.bold };
  return {
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    heading1: { ...heading, fontSize: 22, marginTop: 4, marginBottom: 10 },
    heading2: { ...heading, fontSize: 18, marginTop: 18, marginBottom: 8 },
    heading3: { ...heading, fontSize: 15, marginTop: 14, marginBottom: 6 },
    strong: { fontFamily: typography.semiBold, color: colors.textPrimary },
    em: { fontStyle: "italic" as const },
    paragraph: { marginTop: 0, marginBottom: 10 },
    bullet_list: { marginBottom: 10 },
    ordered_list: { marginBottom: 10 },
    list_item: { marginBottom: 4 },
    bullet_list_icon: { color: colors.accent },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 14 },
    link: { color: colors.accent },
    code_inline: {
      backgroundColor: colors.surfaceRaised,
      color: colors.textPrimary,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    code_block: { backgroundColor: colors.surfaceRaised, borderRadius: 8, padding: 10 },
    fence: { backgroundColor: colors.surfaceRaised, borderRadius: 8, padding: 10, borderWidth: 0 },
    table: { borderColor: colors.border, borderWidth: 1, borderRadius: 6, marginBottom: 10 },
    thead: { backgroundColor: colors.surfaceRaised },
    th: { color: colors.textPrimary, fontFamily: typography.semiBold, padding: 6 },
    tr: { borderColor: colors.border, borderBottomWidth: 1 },
    td: { color: colors.textSecondary, padding: 6 },
    blockquote: {
      backgroundColor: colors.surfaceRaised,
      borderLeftColor: colors.accent,
      borderLeftWidth: 3,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 10,
    },
  };
}

const markdownRules = { markdownit: MarkdownIt({ typographer: false }) };

// Edit-then-persist: the edited version, not the original AI output, is what
// saves and flows into the attainment report - client doc acceptance
// criterion 3. Distribution is a stub until the Communication Hub has a real
// delivery channel (Docs/Dev/AI_Module_Rebuild_Plan.md Phase 4 note).
export function GenerationReviewScreen({ route }: Props) {
  const { generationId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const g = await api.getGeneration(accessToken, generationId);
      setGeneration(g);
      setDraft(g.editedOutput ?? g.aiOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load generation");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, generationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(generation?.editedOutput ?? generation?.aiOutput ?? "");
    setError(null);
    setIsEditing(false);
  }

  async function save() {
    if (!accessToken || !draft.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.editGeneration(accessToken, generationId, draft.trim());
      setGeneration(updated);
      setIsEditing(false);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function retry() {
    if (!accessToken) return;
    setIsRetrying(true);
    setError(null);
    try {
      const updated = await api.retryGeneration(accessToken, generationId);
      setGeneration(updated);
      setDraft(updated.editedOutput ?? updated.aiOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }

  if (isLoading && !generation) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!generation) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Generation not found"}</Text>
      </Screen>
    );
  }

  if (generation.generationStatus === "failed") {
    return (
      <Screen style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <Text style={[styles.failedText, { color: colors.textPrimary }]}>Generation failed</Text>
        <Text style={[styles.meta, { color: colors.textMuted, textAlign: "center", marginBottom: 16 }]}>
          Your inputs were preserved. Try again below.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.accent }, (isRetrying || pressed) && { opacity: pressedOpacity }]}
          onPress={retry}
          disabled={isRetrying}
          accessibilityRole="button"
        >
          {isRetrying ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.retryButtonText, { color: colors.accentOn }]}>Retry</Text>}
        </Pressable>
      </Screen>
    );
  }

  const markdownStyles = buildMarkdownStyles(colors);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.outputTypeLabel, { color: colors.textPrimary }]}>
                {OUTPUT_TYPE_LABELS[generation.outputType] ?? generation.outputType}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {new Date(generation.generatedAt).toLocaleDateString()}
                {generation.editedOutput ? " · edited" : ""}
              </Text>
            </View>
            {!isEditing ? (
              <Pressable style={({ pressed }) => [styles.editButton, pressed && { opacity: pressedOpacity }]} onPress={startEditing} hitSlop={8} accessibilityRole="button">
                <Ionicons name="create-outline" size={14} color={colors.accent} />
                <Text style={[styles.editButtonText, { color: colors.accent }]}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          {isEditing ? (
            <>
              <Text style={[styles.meta, { color: colors.textMuted, marginTop: 10, marginBottom: 8 }]}>
                What you save here is what shares and flows into the attainment report - not the original AI output.
              </Text>
              <TextInput
                style={[styles.editor, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={draft}
                onChangeText={setDraft}
                multiline
                textAlignVertical="top"
                autoFocus
              />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

              <View style={styles.editActionRow}>
                <Pressable
                  style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  onPress={cancelEditing}
                  disabled={isSaving}
                  accessibilityRole="button"
                >
                  <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    { backgroundColor: colors.accent, flex: 1 },
                    (isSaving || !draft.trim() || pressed) && { opacity: pressedOpacity },
                  ]}
                  onPress={save}
                  disabled={isSaving || !draft.trim()}
                  accessibilityRole="button"
                >
                  {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save</Text>}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={{ marginTop: 10 }}>
                <Markdown style={markdownStyles} markdownit={markdownRules.markdownit}>
                  {draft}
                </Markdown>
              </View>
              {savedNotice ? <Text style={[styles.saved, { color: colors.accent }]}>Saved</Text> : null}
            </>
          )}
        </View>

        {generation.contextSources.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, { marginTop: 14 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Sources used</Text>
            {generation.contextSources.map((s) => (
              <View
                key={s.id}
                style={[styles.sourceRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              >
                <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {s.originalFilename ?? s.sourceUrl ?? s.sourceType}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  outputTypeLabel: { fontSize: 16, fontWeight: "800" },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  editButtonText: { fontSize: 13, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, marginTop: 2 },
  editor: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 320, fontSize: 13, lineHeight: 19 },
  error: { textAlign: "center", marginTop: 12 },
  saved: { textAlign: "center", marginTop: 12, fontWeight: "700" },
  editActionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelButton: { borderRadius: 10, height: 46, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cancelButtonText: { fontSize: 14, fontWeight: "700" },
  saveButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  saveButtonText: { fontSize: 14, fontWeight: "700" },
  failedText: { fontSize: 16, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  retryButton: { borderRadius: 10, height: 46, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  retryButtonText: { fontSize: 14, fontWeight: "700" },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
