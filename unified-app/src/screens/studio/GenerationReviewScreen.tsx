import { useCallback, useEffect, useRef, useState } from "react";
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
import { parseGenerationContent, StructuredGenerationContent } from "./generation/content";
import { LessonPlanView } from "./generation/LessonPlanView";
import { CustomActivityView } from "./generation/CustomActivityView";
import { FlashcardsView } from "./generation/FlashcardsView";
import { PresentationView } from "./generation/PresentationView";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_ICONS } from "./generation/outputTypeMeta";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationReview">;

const AUTOSAVE_DEBOUNCE_MS = 600;

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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// At-a-glance summary of what was generated, shown in the hero. Source count lives with the
// content itself (Overview tab for lesson plans, the sources card otherwise) not in this header.
function contentStats(content: StructuredGenerationContent | null): string[] {
  const stats: string[] = [];
  if (content) {
    switch (content.type) {
      case "lesson_plan":
        stats.push(`${content.durationMinutes} min`);
        stats.push(plural(content.objectives.length, "objective", "objectives"));
        stats.push(plural(content.activities.length, "activity", "activities"));
        break;
      case "custom_activity_report":
        stats.push(plural(content.activities.length, "activity", "activities"));
        break;
      case "flashcards":
        stats.push(plural(content.cards.length, "card", "cards"));
        break;
      case "presentation":
        stats.push(plural(content.slides.length, "slide", "slides"));
        break;
    }
  }
  return stats;
}

export function GenerationReviewScreen({ route, navigation }: Props) {
  const { generationId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [structuredContent, setStructuredContent] = useState<StructuredGenerationContent | null>(null);
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const g = await api.getGeneration(accessToken, generationId);
      setGeneration(g);
      const raw = g.editedOutput ?? g.aiOutput;
      setStructuredContent(parseGenerationContent(g.outputType, raw));
      setDraft(raw);
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

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

  function handleStructuredChange(next: StructuredGenerationContent) {
    setStructuredContent(next);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!accessToken) return;
      setIsSaving(true);
      try {
        const updated = await api.editGeneration(accessToken, generationId, JSON.stringify(next));
        setGeneration(updated);
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function retry() {
    if (!accessToken) return;
    setIsRetrying(true);
    setError(null);
    try {
      const updated = await api.retryGeneration(accessToken, generationId);
      setGeneration(updated);
      const raw = updated.editedOutput ?? updated.aiOutput;
      setStructuredContent(parseGenerationContent(updated.outputType, raw));
      setDraft(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }

  async function togglePublish() {
    if (!accessToken || !generation) return;
    setIsPublishing(true);
    setError(null);
    try {
      const updated =
        generation.shareStatus === "published"
          ? await api.unpublishGeneration(accessToken, generationId)
          : await api.publishGeneration(accessToken, generationId);
      setGeneration(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sharing");
    } finally {
      setIsPublishing(false);
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
      <Screen edges={["top", "bottom"]}>
        <View style={styles.screenHeader}>
          <View style={styles.topBar}>
            <Pressable style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} accessibilityRole="button" accessibilityLabel="Go to home"><Ionicons name="home-outline" size={20} color={colors.textPrimary} /></Pressable>
          </View>
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <Text style={[styles.failedText, { color: colors.textPrimary }]}>Generation failed</Text>
          <Text style={[styles.meta, { color: colors.textMuted, textAlign: "center", marginBottom: 16 }]}>Your inputs were preserved. Try again below.</Text>
          <Pressable style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.accent }, (isRetrying || pressed) && { opacity: pressedOpacity }]} onPress={retry} disabled={isRetrying} accessibilityRole="button">
            {isRetrying ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.retryButtonText, { color: colors.accentOn }]}>Retry</Text>}
          </Pressable>
        </View>
      </Screen>
    );
  }

  const markdownStyles = buildMarkdownStyles(colors);
  const heroStats = contentStats(structuredContent);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.screenHeader}>
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.topBarCopy}>
            <Text style={[styles.generationHeroTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {generation.topic?.name ? capitalizeFirst(generation.topic.name) : OUTPUT_TYPE_LABELS[generation.outputType] ?? generation.outputType}
            </Text>
            <Text style={[styles.topBarSubtitle, { color: isSaving || savedNotice ? colors.accent : colors.textMuted }]} numberOfLines={1}>
              {isSaving
                ? "Saving…"
                : savedNotice
                ? "Saved"
                : generation.editedOutput
                ? "Edited — your version, not the original"
                : `${OUTPUT_TYPE_LABELS[generation.outputType]}${
                    generation.topic
                      ? ` • ${generation.topic.classSection.className} ${generation.topic.classSection.sectionName} • ${generation.topic.subject}`
                      : ""
                  }`}
            </Text>
          </View>
          <Pressable style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} accessibilityRole="button" accessibilityLabel="Go to home"><Ionicons name="home-outline" size={20} color={colors.textPrimary} /></Pressable>
        </View>

        <View style={styles.generationHero}>
          <View style={styles.heroFooterRow}>
            {heroStats.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.heroStatsRow}>
                {heroStats.map((stat, i) => (
                  <View key={i} style={[styles.statChip, { backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[styles.statChipText, { color: colors.textSecondary }]}>{stat}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {structuredContent ? (
              <Pressable
                style={({ pressed }) => [
                  styles.editToggle,
                  isEditing
                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => setIsEditing((v) => !v)}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isEditing ? "checkmark" : "create-outline"}
                  size={15}
                  color={isEditing ? colors.accentOn : colors.accent}
                />
                <Text style={[styles.editToggleText, { color: isEditing ? colors.accentOn : colors.accent }]}>
                  {isEditing ? "Done" : "Edit"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {structuredContent ? (
          <View>
            {structuredContent.type !== "lesson_plan" ? <View style={styles.structuredReviewHeader}>
              <View>
                <Text style={[styles.outputTypeLabel, { color: colors.textPrimary }]}>Content review</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {new Date(generation.generatedAt).toLocaleDateString()}
                  {generation.editedOutput ? " / edited" : ""}
                  {isSaving ? " / saving..." : savedNotice ? " / saved" : ""}
                </Text>
              </View>
              <View style={[styles.reviewStatus, { backgroundColor: colors.accentSoft }]}><Ionicons name={isSaving ? "sync" : isEditing ? "create-outline" : "eye-outline"} size={13} color={colors.accent} /><Text style={[styles.reviewStatusText, { color: colors.accent }]}>{isSaving ? "Saving" : isEditing ? "Editing" : "Read only"}</Text></View>
            </View> : null}
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
            {structuredContent.type === "lesson_plan" ? (
              <LessonPlanView content={structuredContent} editable={isEditing} onChange={handleStructuredChange} sources={generation.contextSources} />
            ) : structuredContent.type === "custom_activity_report" ? (
              <CustomActivityView content={structuredContent} editable={isEditing} onChange={handleStructuredChange} />
            ) : structuredContent.type === "flashcards" ? (
              <FlashcardsView content={structuredContent} editable={isEditing} onChange={handleStructuredChange} />
            ) : (
              <PresentationView content={structuredContent} editable={isEditing} onChange={handleStructuredChange} />
            )}
          </View>
        ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.outputTypeLabel, { color: colors.textPrimary }]}>Content review</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {new Date(generation.generatedAt).toLocaleDateString()}
                {generation.editedOutput ? " / edited" : ""}
                {isSaving ? " / saving..." : savedNotice ? " / saved" : ""}
              </Text>
            </View>
            {!structuredContent && !isEditing ? (
              <Pressable style={({ pressed }) => [styles.editButton, pressed && { opacity: pressedOpacity }]} onPress={startEditing} hitSlop={8} accessibilityRole="button">
                <Ionicons name="create-outline" size={14} color={colors.accent} />
                <Text style={[styles.editButtonText, { color: colors.accent }]}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

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
            <View style={{ marginTop: 10 }}>
              <Markdown style={markdownStyles} markdownit={markdownRules.markdownit}>
                {draft}
              </Markdown>
            </View>
          )}
        </View>
        )}

        {generation.contextSources.length > 0 && structuredContent?.type !== "lesson_plan" ? (
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

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.shareButton, { backgroundColor: generation.shareStatus === "published" ? colors.surfaceRaised : colors.accent, borderColor: generation.shareStatus === "published" ? colors.border : colors.accent }, (isPublishing || pressed) && { opacity: pressedOpacity }]}
            onPress={togglePublish}
            disabled={isPublishing}
            accessibilityRole="button"
          >
            {isPublishing ? <ActivityIndicator color={generation.shareStatus === "published" ? colors.textPrimary : colors.accentOn} /> : <><Text style={[styles.shareButtonText, { color: generation.shareStatus === "published" ? colors.textPrimary : colors.accentOn }]}>{generation.shareStatus === "published" ? "Unshare from students" : "Share with students"}</Text><Ionicons name="arrow-forward" size={19} color={generation.shareStatus === "published" ? colors.textPrimary : colors.accentOn} /></>}
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.textMuted }]}>{generation.shareStatus === "published" ? "Students can see this in their Materials tab." : "Review before students receive it."}</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  screenHeader: { paddingHorizontal: 20, paddingTop: 6 },
  topBar: { minHeight: 50, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarCopy: { flex: 1, marginLeft: 14, marginRight: 10 },
  topBarSubtitle: { marginTop: 1, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  generationHero: { marginTop: 4 },
  generationHeroTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800", letterSpacing: -0.4 },
  heroFooterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  heroStatsRow: { flexDirection: "row", gap: 8 },
  statChip: { borderRadius: radius.pill, paddingHorizontal: 11, height: 30, alignItems: "center", justifyContent: "center" },
  statChipText: { fontSize: 11, fontWeight: "700" },
  editToggle: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 13, height: 34 },
  editToggleText: { fontSize: 13, fontWeight: "800" },
  shareButton: { borderWidth: 1, borderRadius: 15, height: 54, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  shareButtonText: { fontSize: 15, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 20, padding: spacing.lg },
  structuredReviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  reviewStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  reviewStatusText: { fontSize: 11, fontWeight: "700" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  outputTypeLabel: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  editButtonText: { fontSize: 13, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, marginTop: 2 },
  editor: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 320, fontSize: 13, lineHeight: 19 },
  error: { textAlign: "center", marginTop: 12 },
  editActionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelButton: { borderRadius: 10, height: 46, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  cancelButtonText: { fontSize: 14, fontWeight: "700" },
  saveButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center" },
  saveButtonText: { fontSize: 14, fontWeight: "700" },
  failedText: { fontSize: 16, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  retryButton: { borderRadius: 10, height: 46, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  retryButtonText: { fontSize: 14, fontWeight: "700" },
  footer: { marginTop: 20 },
  footerNote: { textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: "500" },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
});
