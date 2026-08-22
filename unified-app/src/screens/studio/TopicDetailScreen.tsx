import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Image, RefreshControl, Modal, KeyboardAvoidingView, Platform } from "react-native";
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
import { api, TopicDetail, ContextSource, Generation, GenerationOutputType } from "../../api/client";
import { parseGenerationContent } from "./generation/content";

type Props = NativeStackScreenProps<RootStackParamList, "TopicDetail">;

type DetailTab = "context" | "generations" | "observations";

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

const OUTPUT_TYPE_ICONS: Record<GenerationOutputType, keyof typeof Ionicons.glyphMap> = {
  lesson_plan: "book-outline",
  custom_activity_report: "clipboard-outline",
  flashcards: "albums-outline",
  presentation: "easel-outline",
};

const OUTPUT_TYPE_ORDER: GenerationOutputType[] = [
  "lesson_plan",
  "custom_activity_report",
  "flashcards",
  "presentation",
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

function truncate(text: string, max = 110): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// A short "what's actually in here" preview under each generation row.
// Structured content (backend/src/lib/ai.ts) is stored as a single-line JSON
// string - falling through to the Markdown-line-splitting logic below would
// just show the raw JSON blob, so each type gets a real human-readable
// summary line first. Only a legacy pre-JSON generation reaches the Markdown
// fallback path.
function generationPreview(g: Generation): string {
  const text = g.editedOutput ?? g.aiOutput;
  const content = parseGenerationContent(g.outputType, text);
  if (content) {
    switch (content.type) {
      case "lesson_plan":
        return truncate(content.overview);
      case "custom_activity_report":
        return truncate(content.objective);
      case "flashcards":
        return `${content.cards.length} flashcard${content.cards.length === 1 ? "" : "s"}`;
      case "presentation":
        return `${content.slides.length} slide${content.slides.length === 1 ? "" : "s"}`;
    }
  }

  const lines = text.split("\n").map((l) => l.trim());
  const contentLine = lines.find((l, i) => i > 0 && l.length > 0 && !l.startsWith("#")) ?? lines[0] ?? "";
  const cleaned = contentLine.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").replace(/\*\*/g, "");
  return truncate(cleaned);
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
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});

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
    <Screen edges={["top", "bottom"]}>
      <View style={styles.headArea}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back to topics"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Studio</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setShowUrlInput(false);
              setShowAddContext(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add topic source"
          >
            <Ionicons name="add" size={23} color={colors.accentOn} />
          </Pressable>
        </View>

        <View style={[styles.topicHero, { backgroundColor: colors.surfaceAccent }]}>
          <View style={[styles.topicIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="sparkles-outline" size={22} color={colors.accentOn} />
          </View>
          <View style={styles.topicHeroCopy}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{topic.name}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>{topic.subject} / {topic.board}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryChip, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.accent }]}>{topic.contextSources.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Sources</Text></View>
          <View style={[styles.summaryChip, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.accent }]}>{topic.generations.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Generated</Text></View>
          <View style={[styles.summaryChip, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.accent }]}>{topic.observations.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Notes</Text></View>
        </View>

        <Pressable style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("GenerationSetup", { topicId })} accessibilityRole="button">
          <Ionicons name="sparkles-outline" size={19} color={colors.accentOn} />
          <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate content</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.accentOn} style={styles.generateArrow} />
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryLink, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("CreateAssignment", { topicId })}
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.secondaryLinkText, { color: colors.textSecondary }]}>New assignment</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryLink, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("AttainmentReport", { topicId })}
            accessibilityRole="button"
          >
            <Ionicons name="bar-chart-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.secondaryLinkText, { color: colors.textSecondary }]}>Attainment report</Text>
          </Pressable>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={[styles.tabBar, { backgroundColor: colors.surfaceRaised }]}>
          {(["context", "generations", "observations"] as DetailTab[]).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "context" ? "Context" : tab === "generations" ? "Generated" : "Notes";
            const icon: keyof typeof Ionicons.glyphMap = tab === "context" ? "folder-open-outline" : tab === "generations" ? "sparkles-outline" : "chatbubble-ellipses-outline";
            const count = tab === "context" ? topic.contextSources.length : tab === "generations" ? topic.generations.length : topic.observations.length;
            return (
              <Pressable key={tab} style={({ pressed }) => [styles.tab, active && { backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]} onPress={() => setActiveTab(tab)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Ionicons name={icon} size={14} color={active ? colors.accent : colors.textMuted} />
                <Text style={[styles.tabText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
                <View style={[styles.tabCount, { backgroundColor: active ? colors.accentSoft : colors.backgroundMuted }]}><Text style={[styles.tabCountText, { color: active ? colors.accent : colors.textMuted }]}>{count}</Text></View>
              </Pressable>
            );
          })}
        </View>
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
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Learning sources</Text>
              <Pressable
                onPress={() => {
                  setShowUrlInput(false);
                  setShowAddContext(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={[styles.link, { color: colors.accent }]}>+ Add source</Text>
              </Pressable>
            </View>
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 2 }]}>
              Upload a textbook chapter, presentation, or link — it's used as the basis for generation.
            </Text>
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
                      <View style={[styles.sourcePreview, { backgroundColor: colors.surfaceRaised, aspectRatio: imageRatios[c.id] ?? 4 / 3 }]}>
                        <Image
                          source={{ uri: accessToken ? api.contextSourceFileUrl(topicId, c.id, accessToken) : undefined }}
                          style={styles.sourceThumbnail}
                          resizeMode="contain"
                          onLoad={({ nativeEvent }) => {
                            const { width, height } = nativeEvent.source;
                            if (width > 0 && height > 0) {
                              const ratio = width / height;
                              setImageRatios((current) => current[c.id] === ratio ? current : { ...current, [c.id]: ratio });
                            }
                          }}
                        />
                      </View>
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
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Generated materials</Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{topic.generations.length} total</Text>
            </View>
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
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Teaching notes</Text>
              <Pressable onPress={() => setShowAddObservation(true)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.accent }]}>+ Add note</Text>
              </Pressable>
            </View>
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

      <Modal transparent animationType="slide" visible={showAddContext} onRequestClose={() => setShowAddContext(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddContext(false)} accessibilityRole="button" accessibilityLabel="Close add source" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add context</Text><Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Give your generation reliable source material.</Text></View>
              <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowAddContext(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
            </View>
            {!showUrlInput ? (
              <View style={styles.sourceActionGrid}>
                {[
                  ["camera-outline", "Camera", pickContextPhoto],
                  ["image-outline", "Gallery", pickContextGalleryImage],
                  ["document-attach-outline", "File", pickContextDocument],
                  ["link-outline", "Web link", () => setShowUrlInput(true)],
                ].map(([icon, label, onPress]) => (
                  <Pressable key={String(label)} style={({ pressed }) => [styles.sourceAction, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, (isAddingContext || pressed) && { opacity: pressedOpacity }]} onPress={onPress as () => void} disabled={isAddingContext} accessibilityRole="button">
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.accent} />
                    <Text style={[styles.sourceActionText, { color: colors.textPrimary }]}>{String(label)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View>
                <Pressable style={styles.backToSources} onPress={() => setShowUrlInput(false)} accessibilityRole="button"><Ionicons name="arrow-back" size={16} color={colors.accent} /><Text style={[styles.backToSourcesText, { color: colors.accent }]}>Choose another source</Text></Pressable>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Source URL</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={contextUrl} onChangeText={setContextUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="url" autoFocus />
                <Pressable style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (isAddingContext || !contextUrl.trim() || pressed) && { opacity: pressedOpacity }]} onPress={addContextUrl} disabled={isAddingContext || !contextUrl.trim()} accessibilityRole="button">
                  {isAddingContext ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Add link</Text>}
                </Pressable>
              </View>
            )}
            {isAddingContext && !showUrlInput ? <ActivityIndicator color={colors.accent} style={styles.modalLoader} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent animationType="slide" visible={showAddObservation} onRequestClose={() => setShowAddObservation(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddObservation(false)} accessibilityRole="button" accessibilityLabel="Close new note" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add teaching note</Text><Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Capture what happened while it is fresh.</Text></View>
              <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowAddObservation(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
            </View>
            <TextInput style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={observationText} onChangeText={setObservationText} placeholder="What happened in class?" placeholderTextColor={colors.textMuted} multiline autoFocus />
            <Pressable style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (isAddingObservation || !observationText.trim() || pressed) && { opacity: pressedOpacity }]} onPress={addObservation} disabled={isAddingObservation || !observationText.trim()} accessibilityRole="button">
              {isAddingObservation ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save note</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  headArea: { paddingHorizontal: 24, paddingTop: 8 },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  topBar: { height: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, marginLeft: 16, fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topicHero: { flexDirection: "row", alignItems: "center", borderRadius: 20, padding: 18, marginTop: 14 },
  topicIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  topicHeroCopy: { flex: 1, marginLeft: 13 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.5 },
  meta: { fontSize: 12, lineHeight: 18, fontWeight: "500" },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 14 },
  summaryChip: { flex: 1, minHeight: 57, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  summaryValue: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  summaryLabel: { marginTop: 1, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  generateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: 14, height: 54, marginBottom: 10 },
  generateButtonText: { fontSize: 15, fontWeight: "800" },
  generateArrow: { position: "absolute", right: 18 },
  linkRow: { flexDirection: "row", gap: spacing.sm, marginBottom: 16 },
  secondaryLink: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 13, height: 44 },
  secondaryLinkText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  tabBar: { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 2 },
  tab: { flex: 1, minHeight: 40, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  tabText: { fontSize: 11, fontWeight: "700" },
  tabCount: { minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabCountText: { fontSize: 9, lineHeight: 12, fontWeight: "800" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  sectionCount: { fontSize: 12, fontWeight: "600" },
  link: { fontWeight: "700", fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, height: 48, fontSize: 14 },
  multilineInput: { height: 120, textAlignVertical: "top", marginTop: 18 },
  smallButton: { borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center", marginTop: 12 },
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
  sourcePreview: { width: "100%", borderRadius: radius.sm, marginTop: spacing.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  sourceThumbnail: { width: "100%", height: "100%" },
  snippet: { fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(22, 15, 20, 0.5)" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 28 },
  modalHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  modalTitle: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  modalSubtitle: { marginTop: 3, maxWidth: 270, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sourceActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 22 },
  sourceAction: { width: "48%", minHeight: 86, borderWidth: 1, borderRadius: 14, padding: 14, justifyContent: "space-between" },
  sourceActionText: { marginTop: 12, fontSize: 14, fontWeight: "700" },
  backToSources: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, marginBottom: 2 },
  backToSourcesText: { fontSize: 13, fontWeight: "700" },
  fieldLabel: { marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: "600" },
  modalLoader: { marginTop: 18 },
  lightboxBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  lightboxImage: { width: "100%", height: "80%" },
  lightboxClose: { position: "absolute", top: 50, right: 20, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
});
