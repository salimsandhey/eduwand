import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Image, RefreshControl, Modal, LayoutAnimation, Platform, UIManager } from "react-native";
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
import { api, TopicDetail, ContextSource, Generation, GenerationOutputType, Observation } from "../../api/client";
import { parseGenerationContent } from "./generation/content";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_ICONS, OUTPUT_TYPE_ORDER } from "./generation/outputTypeMeta";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";

type Props = NativeStackScreenProps<RootStackParamList, "TopicDetail">;

type DetailTab = "context" | "generations" | "observations";
type SourceFilter = "images" | "files" | "links";

const GENERATION_FILTER_OPTIONS: { key: GenerationOutputType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...OUTPUT_TYPE_ORDER.map((outputType) => ({ key: outputType, label: OUTPUT_TYPE_LABELS[outputType] })),
];

const SOURCE_TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  idream_k12: "library-outline",
};

const SOURCE_TYPE_LABELS: Record<ContextSource["sourceType"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  image: "Image",
  url: "Link",
  idream_k12: "K-12",
};

const SOURCE_TYPE_COLORS: Record<ContextSource["sourceType"], string> = {
  pdf: "#E4574F",
  docx: "#4C6FEA",
  pptx: "#E8952E",
  image: "#2FAE66",
  url: "#2AACC9",
  idream_k12: "#8B5CF6",
};

const FILE_SOURCE_TYPES: ContextSource["sourceType"][] = ["pdf", "docx", "pptx"];

const STICKY_NOTE_COLORS = ["#FFF3AD", "#FFD3E2", "#CBEFD4", "#CFE4FF", "#FFDFB8"];
const STICKY_NOTE_ROTATIONS = ["-2.5deg", "2deg", "-1.5deg", "1.5deg"];
const STICKY_NOTE_INK = "#332E1F";
const STICKY_NOTE_INK_MUTED = "#7A7359";

const SOURCE_FILTER_OPTIONS: { key: SourceFilter; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "files", label: "Files" },
  { key: "links", label: "Links" },
];

const EXTRACTION_STATUS_LABELS: Record<ContextSource["extractionStatus"], string> = {
  extracted: "Ready",
  pending: "Not read",
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

export function TopicDetailScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("context");
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabIndicatorX = useRef(new Animated.Value(0)).current;

  const [contextUrl, setContextUrl] = useState("");
  const [showAddContext, setShowAddContext] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isAddingContext, setIsAddingContext] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("images");

  const [observationText, setObservationText] = useState("");
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [isAddingObservation, setIsAddingObservation] = useState(false);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [openObservation, setOpenObservation] = useState<Observation | null>(null);
  const [generationFilter, setGenerationFilter] = useState<GenerationOutputType | "all">("all");

  const [openSource, setOpenSource] = useState<ContextSource | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [isEditingSourceText, setIsEditingSourceText] = useState(false);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [isRetryingSource, setIsRetryingSource] = useState(false);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  function selectTab(tab: DetailTab) {
    if (tab === activeTab) return;
    const tabIndex = (["context", "generations", "observations"] as DetailTab[]).indexOf(tab);
    if (tabBarWidth > 0) {
      Animated.timing(tabIndicatorX, {
        toValue: (tabBarWidth / 3) * tabIndex,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  }

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

  function openContextSource(source: ContextSource) {
    if (!accessToken) return;
    if (source.fileLocation) {
      Linking.openURL(api.contextSourceFileUrl(topicId, source.id, accessToken));
    } else if (source.sourceUrl) {
      Linking.openURL(source.sourceUrl);
    }
  }

  function openSourceDetail(source: ContextSource) {
    setOpenSource(source);
    setSourceDraft(source.extractedText ?? "");
    setIsEditingSourceText(false);
    setError(null);
  }

  async function saveSourceText() {
    if (!accessToken || !openSource || !sourceDraft.trim()) return;
    setIsSavingSource(true);
    setError(null);
    try {
      const updated = await api.updateTopicContextText(accessToken, topicId, openSource.id, sourceDraft.trim());
      setOpenSource(updated);
      setSourceDraft(updated.extractedText ?? "");
      setIsEditingSourceText(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save text");
    } finally {
      setIsSavingSource(false);
    }
  }

  async function retrySourceExtraction() {
    if (!accessToken || !openSource) return;
    setIsRetryingSource(true);
    setError(null);
    try {
      const updated = await api.retryTopicContextExtraction(accessToken, topicId, openSource.id);
      setOpenSource(updated);
      setSourceDraft(updated.extractedText ?? "");
      setIsEditingSourceText(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extraction failed");
    } finally {
      setIsRetryingSource(false);
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

  const displayedSources = topic.contextSources.filter((source) => {
    if (sourceFilter === "images") return source.sourceType === "image";
    if (sourceFilter === "files") return ["pdf", "docx", "pptx"].includes(source.sourceType);
    return source.sourceType === "url" || source.sourceType === "idream_k12";
  });

  const displayedGenerationGroups = groupGenerationsByOutputType(
    generationFilter === "all" ? topic.generations : topic.generations.filter((g) => g.outputType === generationFilter)
  );

  function sourceStatus(c: ContextSource) {
    const statusLabel =
      c.extractionStatus === "failed_no_text"
        ? c.sourceType === "image"
          ? "Image"
          : "Preview only"
        : EXTRACTION_STATUS_LABELS[c.extractionStatus];
    const statusColor =
      c.extractionStatus === "failed_no_text"
        ? c.sourceType === "image"
          ? colors.accent
          : colors.textMuted
        : c.extractionStatus === "extracted"
          ? colors.accent
          : colors.textMuted;
    return { statusLabel, statusColor };
  }

  function renderImageCard(c: ContextSource) {
    const { statusLabel, statusColor } = sourceStatus(c);
    const typeColor = SOURCE_TYPE_COLORS[c.sourceType];
    return (
      <Pressable
        key={c.id}
        style={({ pressed }) => [
          styles.sourceCard,
          styles.sourceImageCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={() => openSourceDetail(c)}
        accessibilityRole="button"
      >
        <View style={styles.sourceCardTopRow}>
          <View style={[styles.typeTag, { backgroundColor: `${typeColor}1F` }]}>
            <Ionicons name={SOURCE_TYPE_ICONS[c.sourceType]} size={11} color={typeColor} />
            <Text style={[styles.typeTagText, { color: typeColor }]}>{SOURCE_TYPE_LABELS[c.sourceType]}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={[styles.sourcePreview, { backgroundColor: colors.surfaceRaised }]}>
          <Image
            source={{ uri: accessToken ? api.contextSourceFileUrl(topicId, c.id, accessToken) : undefined }}
            style={styles.sourceThumbnail}
            resizeMode="cover"
          />
        </View>
      </Pressable>
    );
  }

  function renderSourceListRow(c: ContextSource) {
    const label = c.originalFilename ?? c.sourceUrl ?? c.idreamK12ReferenceId ?? c.sourceType;
    const isFileType = FILE_SOURCE_TYPES.includes(c.sourceType);
    const snippet =
      !isFileType && c.extractionStatus === "extracted" && c.extractedText
        ? c.extractedText.replace(/\s+/g, " ").trim().slice(0, 90)
        : null;
    const typeColor = SOURCE_TYPE_COLORS[c.sourceType];
    const { statusLabel, statusColor } = sourceStatus(c);
    return (
      <Pressable
        key={c.id}
        style={({ pressed }) => [
          styles.sourceListRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={() => openSourceDetail(c)}
        accessibilityRole="button"
      >
        <View style={[styles.sourceListIcon, { backgroundColor: `${typeColor}1F` }]}>
          <Ionicons name={SOURCE_TYPE_ICONS[c.sourceType]} size={16} color={typeColor} />
        </View>
        <View style={styles.sourceListCopy}>
          <Text style={[styles.sourceName, { color: colors.textPrimary, marginTop: 0 }]} numberOfLines={1}>{label}</Text>
          <View style={styles.sourceListMetaRow}>
            <Text style={[styles.sourceListTypeText, { color: typeColor }]}>{SOURCE_TYPE_LABELS[c.sourceType]}</Text>
            {snippet ? <Text style={[styles.sourceListSnippet, { color: colors.textMuted }]} numberOfLines={1}>· {snippet}</Text> : null}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.headArea}>
        <View style={[styles.topBar, { justifyContent: "space-between" }]}>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back to topics"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={[styles.topicHero, { backgroundColor: colors.accent }]}>
          <View style={styles.topicHeroGlowLarge} />
          <View style={styles.topicHeroGlowSmall} />
          <View style={styles.topicHeroCopy}>
            <Text style={styles.topicHeroTitle} numberOfLines={2}>{topic.name}</Text>
            <Text style={styles.topicHeroMeta} numberOfLines={1}>{topic.subject} · {topic.board}</Text>
            <View style={styles.topicHeroStats}>
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.contextSources.length}</Text><Text style={styles.topicHeroStatLabel}>sources</Text></View>
              <View style={styles.topicHeroStatDivider} />
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.generations.length}</Text><Text style={styles.topicHeroStatLabel}>created</Text></View>
              <View style={styles.topicHeroStatDivider} />
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.observations.length}</Text><Text style={styles.topicHeroStatLabel}>notes</Text></View>
            </View>
            <View style={styles.heroActions}>
              <Pressable style={({ pressed }) => [styles.heroGenerateButton, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("GenerationSetup", { topicId })} accessibilityRole="button">
                <Ionicons name="color-wand-outline" size={16} color={colors.accent} />
                <Text style={[styles.heroGenerateButtonText, { color: colors.accent }]}>Generate</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.accent} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.heroIconAction, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("AssignmentAiSetup", { topicId })} accessibilityRole="button" accessibilityLabel="Generate assignment with AI"><Ionicons name="document-text-outline" size={18} color="#FFFFFF" /></Pressable>
              <Pressable style={({ pressed }) => [styles.heroIconAction, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("AttainmentReport", { topicId })} accessibilityRole="button" accessibilityLabel="View attainment report"><Ionicons name="bar-chart-outline" size={18} color="#FFFFFF" /></Pressable>
            </View>
          </View>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={[styles.tabBar, { borderBottomColor: colors.border }]} onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}>
          {(["context", "generations", "observations"] as DetailTab[]).map((tab) => {
            const active = activeTab === tab;
            const label = tab === "context" ? "Context" : tab === "generations" ? "Generated" : "Notes";
            const icon: keyof typeof Ionicons.glyphMap = tab === "context" ? "layers-outline" : tab === "generations" ? "documents-outline" : "clipboard-outline";
            const count = tab === "context" ? topic.contextSources.length : tab === "generations" ? topic.generations.length : topic.observations.length;
            return (
              <Pressable key={tab} style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && { opacity: pressedOpacity }]} onPress={() => selectTab(tab)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <View style={[styles.tabIcon, active && { backgroundColor: colors.accentSoft }]}><Ionicons name={icon} size={14} color={active ? colors.accent : colors.textMuted} /></View>
                <Text style={[styles.tabText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text>
                <View style={[styles.tabCount, { backgroundColor: active ? colors.accentSoft : colors.backgroundMuted }]}><Text style={[styles.tabCountText, { color: active ? colors.accent : colors.textMuted }]}>{count}</Text></View>
              </Pressable>
            );
          })}
          {tabBarWidth > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.tabActiveIndicator, { width: tabBarWidth / 3, transform: [{ translateX: tabIndicatorX }] }]}>
              <View style={[styles.tabActiveIndicatorLine, { backgroundColor: colors.accent }]} />
            </Animated.View>
          ) : null}
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
            <View style={styles.workbenchLead}>
              <View style={styles.workbenchCopy}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Sources</Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowUrlInput(false);
                  setShowAddContext(true);
                }}
                style={({ pressed }) => [styles.workbenchAction, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={16} color={colors.accent} />
                <Text style={[styles.workbenchActionText, { color: colors.accent }]}>Add</Text>
              </Pressable>
            </View>
            {topic.contextSources.length === 0 ? (
              <EmptyWorkbench icon="layers-outline" title="No sources yet" detail="Add context to begin." colors={colors} />
            ) : (
              <>
                <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceFilterRow}>
                    {SOURCE_FILTER_OPTIONS.map((filter) => {
                      const active = sourceFilter === filter.key;
                      return (
                        <Pressable
                          key={filter.key}
                          style={({ pressed }) => [styles.sourceFilterChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                          onPress={() => setSourceFilter(filter.key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.sourceFilterText, { color: active ? colors.accentOn : colors.textMuted }]}>{filter.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {displayedSources.length === 0 ? (
                  <EmptyWorkbench icon="filter-outline" title={`No ${sourceFilter} here`} detail="Choose another source type." colors={colors} />
                ) : sourceFilter === "images" ? (
                  <View style={styles.sourceGrid}>{displayedSources.map(renderImageCard)}</View>
                ) : (
                  <View style={styles.sourceList}>{displayedSources.map(renderSourceListRow)}</View>
                )}
              </>
            )}
          </View>
        ) : null}

        {activeTab === "generations" ? (
          <View>
            <View style={styles.workbenchLead}>
              <View style={styles.workbenchCopy}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Generated materials</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.workbenchAction, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("GenerationSetup", { topicId })} accessibilityRole="button">
                <Ionicons name="add" size={16} color={colors.accent} />
                <Text style={[styles.workbenchActionText, { color: colors.accent }]}>Create</Text>
              </Pressable>
            </View>
            {topic.generations.length === 0 ? (
              <EmptyWorkbench icon="sparkles-outline" title="Nothing generated yet" detail="Create your first output." colors={colors} />
            ) : (
              <>
                <View style={[styles.filterBar, { borderBottomColor: colors.border }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceFilterRow}>
                    {GENERATION_FILTER_OPTIONS.map((filter) => {
                      const active = generationFilter === filter.key;
                      return (
                        <Pressable
                          key={filter.key}
                          style={({ pressed }) => [styles.sourceFilterChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                          onPress={() => setGenerationFilter(filter.key)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.sourceFilterText, { color: active ? colors.accentOn : colors.textMuted }]}>{filter.label}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
                {displayedGenerationGroups.length === 0 ? (
                  <EmptyWorkbench icon="filter-outline" title="No matches" detail="Choose another output type." colors={colors} />
                ) : (
                  displayedGenerationGroups.map((group) => (
                <View key={group.outputType} style={{ marginTop: 6 }}>
                  <View style={styles.groupHeadingRow}>
                    <Ionicons name={OUTPUT_TYPE_ICONS[group.outputType]} size={13} color={colors.accent} />
                    <Text style={[styles.groupHeading, { color: colors.textMuted }]}>{OUTPUT_TYPE_LABELS[group.outputType]}</Text>
                  </View>
                  <View style={styles.genGrid}>
                    {group.items.map((g) => (
                      <Pressable
                        key={g.id}
                        style={({ pressed }) => [
                          styles.genCard,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                          cardShadow,
                          pressed && { opacity: pressedOpacity },
                        ]}
                        onPress={() => navigation.navigate("GenerationReview", { generationId: g.id })}
                        accessibilityRole="button"
                      >
                        <View style={styles.genCardTopRow}>
                          <View style={[styles.genCardIcon, { backgroundColor: colors.accentSoft }]}>
                            <Ionicons name={OUTPUT_TYPE_ICONS[group.outputType]} size={16} color={colors.accent} />
                          </View>
                          {g.shareStatus === "published" ? (
                            <View style={[styles.genCardSharedBadge, { backgroundColor: colors.accentSoft }]}>
                              <Ionicons name="people" size={10} color={colors.accent} />
                              <Text style={[styles.genCardSharedBadgeText, { color: colors.accent }]}>Shared</Text>
                            </View>
                          ) : null}
                        </View>
                        {g.generationStatus === "failed" ? (
                          <Text style={[styles.genCardPreview, { color: colors.danger }]}>Failed - tap to retry</Text>
                        ) : (
                          <>
                            <Text style={[styles.genCardPreview, { color: colors.textSecondary }]} numberOfLines={3}>
                              {generationPreview(g)}
                            </Text>
                            <Text style={[styles.genCardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                              {new Date(g.generatedAt).toLocaleDateString()}
                              {g.editedOutput ? " · edited" : ""}
                              {g.contextSources.length > 0 ? ` · ${g.contextSources.length} source(s)` : ""}
                            </Text>
                          </>
                        )}
                        <View style={[styles.genCardArrow, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name="chevron-forward" size={13} color={colors.accent} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))
                )}
              </>
            )}
          </View>
        ) : null}

        {activeTab === "observations" ? (
          <View>
            <View style={styles.workbenchLead}>
              <View style={styles.workbenchCopy}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Notes</Text>
                <Text style={[styles.notesSubtitle, { color: colors.textMuted }]}>Quick teaching reflections for this topic</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.workbenchIconAction, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                onPress={() => setShowAddObservation(true)}
                accessibilityRole="button"
                accessibilityLabel="Add note"
              >
                <Ionicons name="add" size={19} color={colors.accent} />
              </Pressable>
            </View>
            {topic.observations.length === 0 ? (
              <EmptyWorkbench icon="clipboard-outline" title="No notes yet" detail="Capture a quick reflection." colors={colors} />
            ) : (
              <View style={styles.stickyNoteBoard}>
                {topic.observations.map((o, index) => (
                  <Pressable
                    key={o.id}
                    style={({ pressed }) => [
                      styles.stickyNote,
                      {
                        backgroundColor: STICKY_NOTE_COLORS[index % STICKY_NOTE_COLORS.length],
                        transform: [{ rotate: STICKY_NOTE_ROTATIONS[index % STICKY_NOTE_ROTATIONS.length] }],
                      },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setOpenObservation(o)}
                    accessibilityRole="button"
                  >
                    <View style={styles.stickyNoteTape} />
                    <View style={styles.stickyNotePin} />
                    <View style={styles.stickyNoteFold} />
                    <Text style={styles.stickyNoteBody} numberOfLines={5}>{o.body}</Text>
                    <View style={styles.stickyNoteFooter}>
                      <View style={styles.stickyNoteFooterDot} />
                      <Text style={styles.stickyNoteTime}>{formatRelativeTime(o.recordedAt)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent animationType="slide" visible={showAddContext} onRequestClose={() => setShowAddContext(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddContext(false)} accessibilityRole="button" accessibilityLabel="Close add source" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, marginBottom: keyboardHeight }]}>
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
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={showAddObservation} onRequestClose={() => setShowAddObservation(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowAddObservation(false)} accessibilityRole="button" accessibilityLabel="Close new note" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, marginBottom: keyboardHeight }]}>
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
        </View>
      </Modal>

      <Modal visible={lightboxUrl !== null} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUrl(null)}>
          {lightboxUrl ? <Image source={{ uri: lightboxUrl }} style={styles.lightboxImage} resizeMode="contain" /> : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUrl(null)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="slide" visible={openObservation !== null} onRequestClose={() => setOpenObservation(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpenObservation(null)} accessibilityRole="button" accessibilityLabel="Close note" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Note</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {openObservation ? formatRelativeTime(openObservation.recordedAt) : ""}
                </Text>
              </View>
              <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setOpenObservation(null)} accessibilityRole="button">
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={styles.noteDetailScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.noteDetailBody, { color: colors.textSecondary }]}>{openObservation?.body}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={openSource !== null} onRequestClose={() => setOpenSource(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpenSource(null)} accessibilityRole="button" accessibilityLabel="Close source" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, marginBottom: keyboardHeight }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {openSource?.originalFilename ?? openSource?.sourceUrl ?? openSource?.sourceType ?? "Source"}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {openSource ? (openSource.extractionStatus === "extracted" ? "Text ready — used when you generate" : openSource.extractionStatus === "pending" ? "Not read yet — won't be used until it is" : "No text found — won't be used") : ""}
                </Text>
              </View>
              <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setOpenSource(null)} accessibilityRole="button">
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            {openSource?.extractionError ? (
              <Text style={[styles.meta, { color: colors.danger, marginTop: 8 }]}>{openSource.extractionError}</Text>
            ) : null}
            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <View style={styles.sourceDetailActionRow}>
              {openSource && (openSource.fileLocation || openSource.sourceUrl) ? (
                <Pressable
                  style={({ pressed }) => [styles.sourceGhostButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => {
                    if (openSource.sourceType === "image" && openSource.fileLocation && accessToken) {
                      setLightboxUrl(api.contextSourceFileUrl(topicId, openSource.id, accessToken));
                    } else {
                      openContextSource(openSource);
                    }
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name={openSource.sourceType === "image" ? "image-outline" : openSource.sourceType === "url" ? "link-outline" : "document-text-outline"} size={15} color={colors.accent} />
                  <Text style={[styles.sourceGhostButtonText, { color: colors.accent }]}>
                    {openSource.sourceType === "image" ? "View image" : openSource.sourceType === "url" ? "Open link" : "Open file"}
                  </Text>
                </Pressable>
              ) : null}
              {openSource && openSource.sourceType !== "idream_k12" ? (
                <Pressable
                  style={({ pressed }) => [styles.sourceGhostButton, { borderColor: colors.border }, (isRetryingSource || pressed) && { opacity: pressedOpacity }]}
                  onPress={retrySourceExtraction}
                  disabled={isRetryingSource}
                  accessibilityRole="button"
                >
                  {isRetryingSource ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={15} color={colors.accent} />
                      <Text style={[styles.sourceGhostButtonText, { color: colors.accent }]}>
                        {openSource.sourceType === "image" ? "Re-transcribe" : "Re-extract"}
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            <View style={styles.sourceTextHeaderRow}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: isEditingSourceText ? 18 : 0 }]}>
                {isEditingSourceText ? "Edit extracted text" : "Extracted text"}
              </Text>
              {!isEditingSourceText ? (
                <Pressable
                  style={({ pressed }) => [styles.editTextButton, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => setIsEditingSourceText(true)}
                  accessibilityRole="button"
                >
                  <Ionicons name="pencil-outline" size={13} color={colors.accent} />
                  <Text style={[styles.editTextButtonText, { color: colors.accent }]}>Edit</Text>
                </Pressable>
              ) : null}
            </View>

            {isEditingSourceText ? (
              <>
                <TextInput
                  style={[styles.input, styles.sourceTextInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                  value={sourceDraft}
                  onChangeText={setSourceDraft}
                  placeholder="Nothing was pulled from this source. Paste or type the text you want the AI to use."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
                <View style={styles.sourceEditActionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.sourceGhostButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => {
                      setSourceDraft(openSource?.extractedText ?? "");
                      setIsEditingSourceText(false);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.sourceGhostButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.smallButton, styles.sourceSaveButton, { backgroundColor: colors.accent }, (isSavingSource || !sourceDraft.trim() || pressed) && { opacity: pressedOpacity }]}
                    onPress={saveSourceText}
                    disabled={isSavingSource || !sourceDraft.trim()}
                    accessibilityRole="button"
                  >
                    {isSavingSource ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save text</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <ScrollView style={[styles.sourceTextView, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Text style={[styles.sourceTextViewBody, { color: colors.textSecondary }]}>
                  {sourceDraft.trim() ? sourceDraft : "Nothing was pulled from this source yet. Tap Edit to add text yourself."}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function EmptyWorkbench({
  icon,
  title,
  detail,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.emptyWorkbench, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <View style={[styles.emptyWorkbenchIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={19} color={colors.accent} />
      </View>
      <Text style={[styles.emptyWorkbenchTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyWorkbenchDetail, { color: colors.textMuted }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headArea: { paddingHorizontal: 16, paddingTop: 8 },
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  topBar: { minHeight: 40, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topicHero: { position: "relative", minHeight: 194, borderRadius: 22, padding: 19, marginBottom: 14, overflow: "hidden" },
  topicHeroGlowLarge: { position: "absolute", width: 196, height: 196, borderRadius: 98, right: -80, top: -91, backgroundColor: "rgba(251,170,10,0.27)" },
  topicHeroGlowSmall: { position: "absolute", width: 100, height: 100, borderRadius: 50, right: 37, bottom: -64, backgroundColor: "rgba(255,255,255,0.1)" },
  topicHeroCopy: { width: "100%" },
  topicHeroTitle: { color: "#FFFFFF", fontSize: 23, lineHeight: 29, fontWeight: "800", letterSpacing: -0.55 },
  topicHeroMeta: { color: "rgba(255,255,255,0.78)", marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  topicHeroStats: { flexDirection: "row", alignItems: "center", marginTop: 13, gap: 9 },
  topicHeroStat: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  topicHeroStatValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  topicHeroStatLabel: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "700" },
  topicHeroStatDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.32)" },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13 },
  heroGenerateButton: { flex: 1, minHeight: 38, paddingHorizontal: 13, borderRadius: 11, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  heroGenerateButtonText: { fontSize: 12, fontWeight: "800" },
  heroIconAction: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.38)", backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.4 },
  meta: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  error: { textAlign: "center", marginBottom: 12 },
  sourceDetailActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  sourceGhostButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 38, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14 },
  sourceGhostButtonText: { fontSize: 12, fontWeight: "700" },
  sourceTextInput: { height: 200, marginTop: 6 },
  sourceTextHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editTextButton: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, borderRadius: 15, paddingHorizontal: 12 },
  editTextButtonText: { fontSize: 11, fontWeight: "800" },
  sourceTextView: { maxHeight: 220, minHeight: 90, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 6 },
  sourceTextViewBody: { fontSize: 13, lineHeight: 20, fontWeight: "500" },
  sourceEditActionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  sourceSaveButton: { flex: 1, marginTop: 0 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 16 },
  tab: { position: "relative", flex: 1, minHeight: 51, paddingBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  tabActive: { marginTop: -1 },
  tabIcon: { width: 24, height: 24, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 10, fontWeight: "800" },
  tabCount: { minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  tabCountText: { fontSize: 9, lineHeight: 12, fontWeight: "800" },
  tabActiveIndicator: { position: "absolute", left: 0, bottom: -1, height: 3, paddingHorizontal: 18 },
  tabActiveIndicatorLine: { flex: 1, height: 3, borderRadius: 3 },
  folderSheet: { position: "relative", minHeight: 350, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: "hidden" },
  folderSheetLip: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  folderBinder: { position: "absolute", top: 30, bottom: 24, left: 10, width: 9, alignItems: "center", justifyContent: "space-between" },
  folderBinderRing: { width: 9, height: 9, borderRadius: 5 },
  folderContent: { paddingTop: 22, paddingRight: 16, paddingBottom: 20, paddingLeft: 28 },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  workbenchLead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  workbenchCopy: { flex: 1 },
  workbenchAction: { minWidth: 68, height: 36, borderRadius: radius.pill, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  workbenchIconAction: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  workbenchActionText: { fontSize: 12, fontWeight: "800" },
  emptyWorkbench: { minHeight: 150, borderWidth: 1, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 20, alignItems: "center", justifyContent: "center" },
  emptyWorkbenchIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emptyWorkbenchTitle: { marginTop: 10, fontSize: 15, fontWeight: "800" },
  emptyWorkbenchDetail: { maxWidth: 260, marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, height: 48, fontSize: 14 },
  multilineInput: { height: 120, textAlignVertical: "top", marginTop: 18 },
  smallButton: { borderRadius: 12, height: 50, alignItems: "center", justifyContent: "center", marginTop: 12 },
  smallButtonText: { fontSize: 13, fontWeight: "700" },
  genGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  genCard: {
    position: "relative",
    width: "47.5%",
    minHeight: 128,
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
    paddingBottom: 38,
  },
  genCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  genCardIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  genCardSharedBadge: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  genCardSharedBadgeText: { fontSize: 9, fontWeight: "800" },
  genCardPreview: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  genCardMeta: { marginTop: 6, fontSize: 10, fontWeight: "600" },
  genCardArrow: { position: "absolute", right: 12, bottom: 12, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  notesSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: "500" },
  stickyNoteBoard: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 21, paddingTop: 10, paddingBottom: 8 },
  stickyNote: {
    position: "relative",
    width: "47.5%",
    minHeight: 156,
    borderRadius: 3,
    paddingHorizontal: 14,
    paddingTop: 25,
    paddingBottom: 13,
    borderWidth: 1,
    borderColor: "rgba(78, 61, 32, 0.08)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  stickyNoteTape: {
    position: "absolute",
    top: 4,
    left: "50%",
    width: 42,
    height: 12,
    marginLeft: -21,
    backgroundColor: "rgba(255,255,255,0.4)",
    transform: [{ rotate: "-3deg" }],
  },
  stickyNotePin: {
    position: "absolute",
    top: 8,
    left: "50%",
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#C6433D",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    shadowColor: "#5C1B18",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  stickyNoteFold: { position: "absolute", right: -11, bottom: -11, width: 30, height: 30, backgroundColor: "rgba(255,255,255,0.43)", transform: [{ rotate: "45deg" }] },
  stickyNoteFooter: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 10 },
  stickyNoteFooterDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(51,46,31,0.5)" },
  stickyNoteBody: { fontSize: 12, lineHeight: 18, fontWeight: "600", color: STICKY_NOTE_INK },
  stickyNoteTime: { fontSize: 10, fontWeight: "700", color: STICKY_NOTE_INK_MUTED },
  noteDetailScroll: { maxHeight: 360, marginTop: 4 },
  noteDetailBody: { fontSize: 15, lineHeight: 23, fontWeight: "500" },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusBadgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  groupHeadingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  groupHeading: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  filterBar: { marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  sourceFilterRow: { flexDirection: "row", gap: 7 },
  sourceFilterChip: { height: 32, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  sourceFilterText: { fontSize: 11, fontWeight: "800" },
  sourceCard: { width: "48%", minHeight: 142, borderWidth: 1, borderRadius: 13, padding: 12, justifyContent: "flex-start" },
  sourceImageCard: { height: 230 },
  sourceCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  typeTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  typeTagText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.2 },
  sourceList: { gap: 8 },
  sourceListRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, minHeight: 56 },
  sourceListIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sourceListCopy: { flex: 1 },
  sourceListMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  sourceListTypeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.2 },
  sourceListSnippet: { fontSize: 11, marginLeft: 4, flexShrink: 1, fontWeight: "500" },
  sourceName: { marginTop: 9, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  sourcePreview: { flex: 1, width: "100%", borderRadius: radius.sm, marginTop: spacing.sm, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  sourceThumbnail: { width: "100%", height: "100%" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(22, 15, 20, 0.5)" },
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
