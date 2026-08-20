import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Image, RefreshControl, Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { SegmentedControl } from "../../components/SegmentedControl";
import { api, TopicDetail, ContextSource, Generation, GenerationOutputType } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "TopicDetail">;

type DetailTab = "context" | "generations" | "observations";

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
  explanatory_video: "Explanatory Video",
};

const OUTPUT_TYPE_ICONS: Record<GenerationOutputType, keyof typeof Ionicons.glyphMap> = {
  lesson_plan: "book-outline",
  custom_activity_report: "clipboard-outline",
  flashcards: "albums-outline",
  presentation: "easel-outline",
  explanatory_video: "play-circle-outline",
};

const OUTPUT_TYPE_ORDER: GenerationOutputType[] = [
  "lesson_plan",
  "custom_activity_report",
  "flashcards",
  "presentation",
  "explanatory_video",
];

const SOURCE_TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  idream_k12: "library-outline",
};

const EXTRACTION_STATUS_LABELS: Record<ContextSource["extractionStatus"], string> = {
  extracted: "Ready",
  pending: "Processing",
  failed_no_text: "No text found",
};

function groupGenerationsByOutputType(generations: Generation[]): { outputType: GenerationOutputType; items: Generation[] }[] {
  return OUTPUT_TYPE_ORDER.map((outputType) => ({
    outputType,
    items: generations.filter((g) => g.outputType === outputType),
  })).filter((group) => group.items.length > 0);
}

// First real content line after the title heading, stripped of Markdown
// bullet/bold markers - a short "what's actually in here" preview under each
// generation row instead of just a date.
function generationPreview(g: Generation): string {
  const text = g.editedOutput ?? g.aiOutput;
  const lines = text.split("\n").map((l) => l.trim());
  const contentLine = lines.find((l, i) => i > 0 && l.length > 0 && !l.startsWith("#")) ?? lines[0] ?? "";
  const cleaned = contentLine.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").replace(/\*\*/g, "");
  return cleaned.length > 110 ? `${cleaned.slice(0, 110)}…` : cleaned;
}

// Matches the local (non-exported) helper in unified-app/src/screens/shared/HomeScreen.tsx.
function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return past.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Hub screen for a Topic - context sources, generations, observations, per
// Docs/Dev/EduWand_UI_Screen_Spec.md section 4 (Content Library/Context,
// Generation Review, Observation Capture are reached from here).
export function TopicDetailScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("context");

  const [contextUrl, setContextUrl] = useState("");
  const [showAddContext, setShowAddContext] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isAddingContext, setIsAddingContext] = useState(false);

  const [observationText, setObservationText] = useState("");
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [isAddingObservation, setIsAddingObservation] = useState(false);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const t = await api.getTopic(accessToken, topicId);
      setTopic(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topic");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, topicId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addContextUrl() {
    if (!accessToken || !contextUrl.trim()) return;
    setIsAddingContext(true);
    setError(null);
    try {
      await api.addTopicContextUrl(accessToken, topicId, { sourceType: "url", sourceUrl: contextUrl.trim() });
      setContextUrl("");
      setShowUrlInput(false);
      setShowAddContext(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setIsAddingContext(false);
    }
  }

  async function addContextFile(file: { uri: string; name: string; mimeType: string }) {
    if (!accessToken) return;
    setIsAddingContext(true);
    setError(null);
    try {
      await api.addTopicContextFile(accessToken, topicId, file);
      setShowAddContext(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsAddingContext(false);
    }
  }

  async function pickContextPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to take a photo");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await addContextFile({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
    }
  }

  async function pickContextGalleryImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to choose a photo");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      await addContextFile({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
    }
  }

  async function pickContextDocument() {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    await addContextFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream" });
  }

  // Files open through the token-authenticated download route; URL sources
  // (no fileLocation) open the original page directly - previously this only
  // handled files, so tapping a URL source card silently did nothing.
  function openContextSource(source: ContextSource) {
    if (!accessToken) return;
    if (source.fileLocation) {
      Linking.openURL(api.contextSourceFileUrl(topicId, source.id, accessToken));
    } else if (source.sourceUrl) {
      Linking.openURL(source.sourceUrl);
    }
  }

  async function addObservation() {
    if (!accessToken || !observationText.trim()) return;
    setIsAddingObservation(true);
    setError(null);
    try {
      await api.addTopicObservation(accessToken, topicId, observationText.trim());
      setObservationText("");
      setShowAddObservation(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add observation");
    } finally {
      setIsAddingObservation(false);
    }
  }

  if (isLoading && !topic) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!topic) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Topic not found"}</Text>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <View style={styles.headArea}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{topic.name}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {topic.subject} · {topic.board}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("GenerationSetup", { topicId })}
          accessibilityRole="button"
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.accentOn} />
          <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate content</Text>
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryLink, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("CreateAssignment", { topicId })}
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.secondaryLinkText, { color: colors.textSecondary }]}>New assignment</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryLink, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("AttainmentReport", { topicId })}
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.secondaryLinkText, { color: colors.textSecondary }]}>Attainment report</Text>
          </Pressable>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <SegmentedControl
          options={[
            { key: "context", label: "Context" },
            { key: "generations", label: "Generations" },
            { key: "observations", label: "Observations" },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as DetailTab)}
        />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
      >
        {activeTab === "context" ? (
          <View>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Context</Text>
              <Pressable
                onPress={() => {
                  setShowAddContext((v) => !v);
                  setShowUrlInput(false);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={[styles.link, { color: colors.accent }]}>{showAddContext ? "Cancel" : "+ Add source"}</Text>
              </Pressable>
            </View>
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 2 }]}>
              Upload a textbook chapter, presentation, or link — it's used as the basis for generation.
            </Text>
            {showAddContext ? (
              <View style={{ marginTop: 10 }}>
                <View style={styles.sourceChipRow}>
                  <Pressable
                    onPress={pickContextPhoto}
                    disabled={isAddingContext}
                    style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, (isAddingContext || pressed) && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="camera-outline" size={13} color={colors.accent} />
                    <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Camera</Text>
                  </Pressable>
                  <Pressable
                    onPress={pickContextGalleryImage}
                    disabled={isAddingContext}
                    style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, (isAddingContext || pressed) && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="image-outline" size={13} color={colors.accent} />
                    <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Gallery</Text>
                  </Pressable>
                  <Pressable
                    onPress={pickContextDocument}
                    disabled={isAddingContext}
                    style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, (isAddingContext || pressed) && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="document-attach-outline" size={13} color={colors.accent} />
                    <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>Files</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowUrlInput((v) => !v)}
                    disabled={isAddingContext}
                    style={({ pressed }) => [styles.sourceChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, (isAddingContext || pressed) && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="link-outline" size={13} color={colors.accent} />
                    <Text style={[styles.sourceChipText, { color: colors.textSecondary }]}>URL</Text>
                  </Pressable>
                </View>
                {isAddingContext ? <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} /> : null}
                {showUrlInput ? (
                  <View style={{ marginTop: 8 }}>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                      value={contextUrl}
                      onChangeText={setContextUrl}
                      placeholder="https://..."
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    <Pressable
                      style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (isAddingContext || pressed) && { opacity: pressedOpacity }]}
                      onPress={addContextUrl}
                      disabled={isAddingContext || !contextUrl.trim()}
                      accessibilityRole="button"
                    >
                      {isAddingContext ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Add</Text>}
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
            {topic.contextSources.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8 }]}>No context added yet.</Text>
            ) : (
              topic.contextSources.map((c) => {
                const label = c.originalFilename ?? c.sourceUrl ?? c.idreamK12ReferenceId ?? c.sourceType;
                const isImage = c.sourceType === "image" && Boolean(c.fileLocation);
                const canOpen = isImage || Boolean(c.fileLocation) || (c.sourceType === "url" && Boolean(c.sourceUrl));
                // Images preview in-app (lightbox) - everything else still
                // hands off externally (browser/OS viewer), since there's no
                // reliable in-app renderer for PDF/DOCX/PPTX without a much
                // heavier addition (native PDF lib needing a custom dev
                // client, or a WebView+Google-Docs-Viewer trick that only
                // works for publicly-reachable URLs, not this dev backend).
                function handlePress() {
                  if (isImage && accessToken) {
                    setLightboxUrl(api.contextSourceFileUrl(topicId, c.id, accessToken));
                  } else {
                    openContextSource(c);
                  }
                }
                // Collapse whitespace before slicing - raw extracted text can
                // carry tab/newline-heavy layout artifacts (e.g. from a PDF's
                // column structure) that look broken when just truncated raw.
                const snippet =
                  c.extractionStatus === "extracted" && c.sourceType !== "image" && c.extractedText
                    ? c.extractedText.replace(/\s+/g, " ").trim().slice(0, 160)
                    : null;
                return (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      styles.sourceCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      cardShadow,
                      canOpen && pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={canOpen ? handlePress : undefined}
                    disabled={!canOpen}
                    accessibilityRole={canOpen ? "button" : undefined}
                  >
                    <View style={styles.sourceCardHeader}>
                      <Ionicons name={SOURCE_TYPE_ICONS[c.sourceType]} size={14} color={colors.textMuted} />
                      <Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                        {label}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: colors.surfaceRaised }]}>
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: c.extractionStatus === "failed_no_text" ? colors.danger : c.extractionStatus === "extracted" ? colors.accent : colors.textMuted },
                          ]}
                        >
                          {EXTRACTION_STATUS_LABELS[c.extractionStatus]}
                        </Text>
                      </View>
                    </View>
                    {c.sourceType === "image" ? (
                      <Image
                        source={{ uri: accessToken ? api.contextSourceFileUrl(topicId, c.id, accessToken) : undefined }}
                        style={styles.sourceThumbnail}
                        resizeMode="cover"
                      />
                    ) : snippet ? (
                      <Text style={[styles.snippet, { color: colors.textMuted }]} numberOfLines={3}>
                        {snippet}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}

        {activeTab === "generations" ? (
          <View>
            {topic.generations.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>Nothing generated for this topic yet.</Text>
            ) : (
              groupGenerationsByOutputType(topic.generations).map((group) => (
                <View key={group.outputType} style={{ marginTop: 6 }}>
                  <View style={styles.groupHeadingRow}>
                    <Ionicons name={OUTPUT_TYPE_ICONS[group.outputType]} size={13} color={colors.accent} />
                    <Text style={[styles.groupHeading, { color: colors.textMuted }]}>{OUTPUT_TYPE_LABELS[group.outputType]}</Text>
                  </View>
                  {group.items.map((g) => (
                    <Pressable
                      key={g.id}
                      style={({ pressed }) => [
                        styles.listRow,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                        cardShadow,
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => navigation.navigate("GenerationReview", { generationId: g.id })}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        {g.generationStatus === "failed" ? (
                          <Text style={[styles.meta, { color: colors.danger, marginBottom: 0 }]}>Failed - tap to retry</Text>
                        ) : (
                          <>
                            <Text style={[styles.meta, { color: colors.textSecondary, marginBottom: 2 }]} numberOfLines={1}>
                              {generationPreview(g)}
                            </Text>
                            <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0, fontSize: 10 }]}>
                              {new Date(g.generatedAt).toLocaleDateString()}
                              {g.editedOutput ? " · edited" : ""}
                              {g.contextSources.length > 0 ? ` · ${g.contextSources.length} source(s)` : ""}
                            </Text>
                          </>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === "observations" ? (
          <View>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Observations</Text>
              <Pressable onPress={() => setShowAddObservation((v) => !v)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.accent }]}>{showAddObservation ? "Cancel" : "+ Add"}</Text>
              </Pressable>
            </View>
            {showAddObservation ? (
              <View style={{ marginTop: 8 }}>
                <TextInput
                  style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                  value={observationText}
                  onChangeText={setObservationText}
                  placeholder="What happened in class..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
                <Pressable
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (isAddingObservation || pressed) && { opacity: pressedOpacity }]}
                  onPress={addObservation}
                  disabled={isAddingObservation || !observationText.trim()}
                  accessibilityRole="button"
                >
                  {isAddingObservation ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save observation</Text>}
                </Pressable>
              </View>
            ) : null}
            {topic.observations.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8 }]}>Nothing recorded yet.</Text>
            ) : (
              topic.observations.map((o) => (
                <View
                  key={o.id}
                  style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: "flex-start" }, cardShadow]}
                >
                  <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>{o.body}</Text>
                    <Text style={[styles.meta, { color: colors.textMuted, fontSize: 10 }]}>{formatRelativeTime(o.recordedAt)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={lightboxUrl !== null} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUrl(null)}>
          {lightboxUrl ? <Image source={{ uri: lightboxUrl }} style={styles.lightboxImage} resizeMode="contain" /> : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUrl(null)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headArea: { paddingHorizontal: 16, paddingTop: 16 },
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  meta: { fontSize: 12 },
  generateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: 10, height: 46, marginBottom: 10 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
  linkRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  secondaryLink: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, height: 40 },
  secondaryLinkText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  link: { fontWeight: "700", fontSize: 13 },
  input: { borderWidth: 1, borderRadius: radius.sm, padding: 10, height: 44, fontSize: 14 },
  multilineInput: { height: 80, textAlignVertical: "top" },
  smallButton: { borderRadius: radius.sm, height: 40, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  smallButtonText: { fontSize: 13, fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.sm },
  sourceChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sourceChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 6 },
  sourceChipText: { fontSize: 11, fontWeight: "700" },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusBadgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  groupHeadingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  groupHeading: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  sourceCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.sm },
  sourceCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sourceThumbnail: { width: "100%", height: 140, borderRadius: radius.sm, marginTop: spacing.sm },
  snippet: { fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  lightboxBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  lightboxImage: { width: "100%", height: "80%" },
  lightboxClose: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
});
