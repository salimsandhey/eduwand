import { useCallback, useRef, useState } from "react";
import { Animated, Easing, View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Image, RefreshControl, Modal, LayoutAnimation, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import { Swipeable, GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { api, TopicDetail, ContextSource, Generation, GenerationOutputType, Observation, Assignment, SavedVideo } from "../../api/client";
import { VideoPlayerModal } from "../../components/VideoPlayerModal";
import { parseGenerationContent } from "./generation/content";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_ICONS, OUTPUT_TYPE_ORDER } from "./generation/outputTypeMeta";
import { capitalizeFirst } from "../../utils/text";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { formatDateShort } from "../../utils/date";
import { DatePicker, parseISODate } from "../../components/DatePicker";

type Props = NativeStackScreenProps<RootStackParamList, "TopicDetail">;

type DetailTab = "context" | "generations" | "assignments" | "observations";
type SourceFilter = "images" | "pdfs" | "files" | "links";

const DETAIL_TABS: DetailTab[] = ["context", "generations", "assignments", "observations"];

const DETAIL_TAB_LABELS: Record<DetailTab, string> = {
  context: "Context",
  generations: "Material",
  assignments: "Assignments",
  observations: "Notes",
};

const DETAIL_TAB_ICONS: Record<DetailTab, keyof typeof Ionicons.glyphMap> = {
  context: "layers-outline",
  generations: "documents-outline",
  assignments: "document-text-outline",
  observations: "clipboard-outline",
};

const ASSIGNMENT_STATUS_LABELS: Record<Assignment["status"], string> = {
  draft: "Draft",
  published: "Published",
};

const GENERATION_FILTER_OPTIONS: { key: GenerationOutputType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  ...OUTPUT_TYPE_ORDER.map((outputType) => ({ key: outputType, label: OUTPUT_TYPE_LABELS[outputType] })),
];

type DateFilterPreset = "all" | "today" | "week" | "month" | "custom";

const DATE_FILTER_PRESET_LABELS: Record<DateFilterPreset, string> = {
  all: "Any date",
  today: "Today",
  week: "This week",
  month: "This month",
  custom: "Custom",
};

const DATE_FILTER_PRESETS: DateFilterPreset[] = ["all", "today", "week", "month", "custom"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDateRangeForPreset(
  preset: DateFilterPreset,
  customFrom: string,
  customTo: string
): { start: Date; end: Date } | null {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);

  if (preset === "today") return { start: todayStart, end: tomorrowStart };
  if (preset === "week") {
    const weekStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - 6);
    return { start: weekStart, end: tomorrowStart };
  }
  if (preset === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: monthStart, end: tomorrowStart };
  }
  if (preset === "custom") {
    if (!customFrom || !customTo) return null;
    const [fy, fm, fd] = customFrom.split("-").map(Number);
    const [ty, tm, td] = customTo.split("-").map(Number);
    const start = new Date(fy, (fm || 1) - 1, fd || 1);
    const endExclusive = new Date(ty, (tm || 1) - 1, (td || 1) + 1);
    return { start, end: endExclusive };
  }
  return null;
}

const SOURCE_TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  youtube: "logo-youtube",
  idream_k12: "library-outline",
};

const SOURCE_TYPE_LABELS: Record<ContextSource["sourceType"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  image: "Image",
  url: "Link",
  youtube: "YouTube",
  idream_k12: "K-12",
};

const SOURCE_TYPE_COLORS: Record<ContextSource["sourceType"], string> = {
  pdf: "#E4574F",
  docx: "#4C6FEA",
  pptx: "#E8952E",
  image: "#2FAE66",
  url: "#2AACC9",
  youtube: "#FF0000",
  idream_k12: "#8B5CF6",
};

const FILE_SOURCE_TYPES: ContextSource["sourceType"][] = ["pdf", "docx", "pptx"];

const STICKY_NOTE_COLORS = ["#FFF3AD", "#FFD3E2", "#CBEFD4", "#CFE4FF", "#FFDFB8"];
const STICKY_NOTE_ROTATIONS = ["-2.5deg", "2deg", "-1.5deg", "1.5deg"];
const STICKY_NOTE_INK = "#332E1F";
const STICKY_NOTE_INK_MUTED = "#7A7359";

const SOURCE_FILTER_OPTIONS: { key: SourceFilter; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "pdfs", label: "PDFs" },
  { key: "files", label: "Docs" },
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
        return truncate(content.objectives?.[0] ?? content.objective ?? "Activity report");
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
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("context");
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabIndicatorX = useRef(new Animated.Value(0)).current;

  const [contextUrl, setContextUrl] = useState("");
  const [showAddContextMethod, setShowAddContextMethod] = useState(false);
  const [showAddContext, setShowAddContext] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isAddingContext, setIsAddingContext] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("images");

  const [observationText, setObservationText] = useState("");
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [isAddingObservation, setIsAddingObservation] = useState(false);
  const [notePhoto, setNotePhoto] = useState<{ uri: string; name: string; mimeType: string } | null>(null);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [openObservation, setOpenObservation] = useState<Observation | null>(null);
  const [generationFilter, setGenerationFilter] = useState<GenerationOutputType | "all">("all");
  const [dateFilterPreset, setDateFilterPreset] = useState<DateFilterPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustomRangeModal, setShowCustomRangeModal] = useState(false);
  const [draftCustomFrom, setDraftCustomFrom] = useState("");
  const [draftCustomTo, setDraftCustomTo] = useState("");
  const [showTypeFilterModal, setShowTypeFilterModal] = useState(false);
  const [showDateFilterModal, setShowDateFilterModal] = useState(false);

  const [openSource, setOpenSource] = useState<ContextSource | null>(null);
  const [sourceDraft, setSourceDraft] = useState("");
  const [isEditingSourceText, setIsEditingSourceText] = useState(false);
  const [isSavingSource, setIsSavingSource] = useState(false);
  const [isRetryingSource, setIsRetryingSource] = useState(false);
  useAiGenerating(isRetryingSource);
  const [deletingSourceIds, setDeletingSourceIds] = useState<Set<string>>(new Set());
  const sourceSwipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [watchingVideo, setWatchingVideo] = useState<SavedVideo | null>(null);
  const [deletingVideoIds, setDeletingVideoIds] = useState<Set<string>>(new Set());
  const videoSwipeRefs = useRef<Map<string, Swipeable>>(new Map());

  function selectTab(tab: DetailTab) {
    if (tab === activeTab) return;
    const tabIndex = DETAIL_TABS.indexOf(tab);
    if (tabBarWidth > 0) {
      Animated.timing(tabIndicatorX, {
        toValue: (tabBarWidth / DETAIL_TABS.length) * tabIndex,
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
      const [t, videos] = await Promise.all([api.getTopic(accessToken, topicId), api.listSavedVideos(accessToken, topicId)]);
      setTopic(t);
      setSavedVideos(videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topic");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, topicId]);

  function confirmDeleteVideo(video: SavedVideo) {
    if (!accessToken) return;
    Alert.alert("Remove this video?", "It will no longer show under Reference videos for this topic.", [
      { text: "Cancel", style: "cancel", onPress: () => videoSwipeRefs.current.get(video.id)?.close() },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setDeletingVideoIds((prev) => new Set(prev).add(video.id));
          setError(null);
          try {
            await api.deleteSavedVideo(accessToken, topicId, video.id);
            videoSwipeRefs.current.delete(video.id);
            setSavedVideos((prev) => prev.filter((v) => v.id !== video.id));
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove video");
            videoSwipeRefs.current.get(video.id)?.close();
          } finally {
            setDeletingVideoIds((prev) => {
              const next = new Set(prev);
              next.delete(video.id);
              return next;
            });
          }
        },
      },
    ]);
  }

  function renderVideoRow(v: SavedVideo) {
    const busy = deletingVideoIds.has(v.id);
    return (
      <Swipeable
        key={v.id}
        ref={(r) => {
          if (r) videoSwipeRefs.current.set(v.id, r);
          else videoSwipeRefs.current.delete(v.id);
        }}
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={(_progress, dragX) => (
          <Pressable style={[styles.swipeDeleteAction, { backgroundColor: colors.danger }]} onPress={() => confirmDeleteVideo(v)} accessibilityRole="button" accessibilityLabel="Remove video">
            <Animated.View style={{ transform: [{ translateX: dragX.interpolate({ inputRange: [-80, 0], outputRange: [0, 56], extrapolate: "clamp" }) }] }}>
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="trash-outline" size={20} color="#FFFFFF" />}
            </Animated.View>
          </Pressable>
        )}
      >
        <Pressable
          style={({ pressed }) => [styles.videoRow, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow, pressed && { opacity: pressedOpacity }]}
          onPress={() => setWatchingVideo(v)}
          accessibilityRole="button"
          accessibilityLabel={`Watch ${v.title}`}
        >
          <View>
            <Image source={{ uri: v.thumbnailUrl }} style={[styles.videoRowThumb, { backgroundColor: colors.surfaceRaised }]} resizeMode="cover" />
            <View style={styles.videoRowPlayBadge}>
              <Ionicons name="play" size={12} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.sourceListCopy}>
            <Text style={[styles.sourceName, { color: colors.textPrimary, marginTop: 0 }]} numberOfLines={2}>{v.title}</Text>
            <Text style={[styles.sourceListSnippet, { color: colors.textMuted, marginLeft: 0, marginTop: 2 }]} numberOfLines={1}>
              {v.channelTitle}{v.duration ? ` · ${v.duration}` : ""}
            </Text>
          </View>
        </Pressable>
      </Swipeable>
    );
  }

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
      WebBrowser.openBrowserAsync(source.sourceUrl);
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

  function confirmDeleteSource(source: ContextSource) {
    if (!accessToken) return;
    Alert.alert("Delete this source?", "It will be removed from this topic and won't be usable in any future generation.", [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => sourceSwipeRefs.current.get(source.id)?.close(),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingSourceIds((prev) => new Set(prev).add(source.id));
          setError(null);
          try {
            await api.deleteTopicContext(accessToken, topicId, source.id);
            if (openSource?.id === source.id) setOpenSource(null);
            sourceSwipeRefs.current.delete(source.id);
            load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete source");
            sourceSwipeRefs.current.get(source.id)?.close();
          } finally {
            setDeletingSourceIds((prev) => {
              const next = new Set(prev);
              next.delete(source.id);
              return next;
            });
          }
        },
      },
    ]);
  }

  async function addObservation() {
    if (!accessToken || !observationText.trim()) return;
    setIsAddingObservation(true);
    setError(null);
    try {
      await api.addTopicObservation(accessToken, topicId, observationText.trim(), notePhoto ?? undefined);
      setObservationText("");
      setNotePhoto(null);
      setShowAddObservation(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add observation");
    } finally {
      setIsAddingObservation(false);
    }
  }

  async function pickNotePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to take a photo");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setNotePhoto({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
    }
  }

  async function pickNoteGalleryPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to choose a photo");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setNotePhoto({ uri: asset.uri, name: asset.fileName ?? "photo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
    }
  }

  function selectDateFilterPreset(preset: DateFilterPreset) {
    setShowDateFilterModal(false);
    if (preset === "custom") {
      setDraftCustomFrom(customFrom);
      setDraftCustomTo(customTo);
      setShowCustomRangeModal(true);
      return;
    }
    setDateFilterPreset(preset);
  }

  function selectGenerationTypeFilter(key: GenerationOutputType | "all") {
    setGenerationFilter(key);
    setShowTypeFilterModal(false);
  }

  function applyCustomRange() {
    if (!draftCustomFrom || !draftCustomTo) return;
    setCustomFrom(draftCustomFrom);
    setCustomTo(draftCustomTo);
    setDateFilterPreset("custom");
    setShowCustomRangeModal(false);
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
    if (sourceFilter === "pdfs") return source.sourceType === "pdf";
    if (sourceFilter === "files") return source.sourceType === "docx" || source.sourceType === "pptx";
    return source.sourceType === "url" || source.sourceType === "youtube" || source.sourceType === "idream_k12";
  });

  const activeDateRange = getDateRangeForPreset(dateFilterPreset, customFrom, customTo);
  const dateFilteredGenerations = activeDateRange
    ? topic.generations.filter((g) => {
        const generatedAt = new Date(g.generatedAt);
        return generatedAt >= activeDateRange.start && generatedAt < activeDateRange.end;
      })
    : topic.generations;
  const displayedGenerationGroups = groupGenerationsByOutputType(
    generationFilter === "all" ? dateFilteredGenerations : dateFilteredGenerations.filter((g) => g.outputType === generationFilter)
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
          { backgroundColor: colors.surface, borderWidth: 0 },
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
      <Swipeable
        key={c.id}
        ref={(r) => {
          if (r) sourceSwipeRefs.current.set(c.id, r);
          else sourceSwipeRefs.current.delete(c.id);
        }}
        overshootRight={false}
        rightThreshold={40}
        renderRightActions={(_progress, dragX) => (
          <Pressable
            style={[styles.swipeDeleteAction, { backgroundColor: colors.danger }]}
            onPress={() => confirmDeleteSource(c)}
            accessibilityRole="button"
            accessibilityLabel="Delete source"
          >
            <Animated.View style={{ transform: [{ translateX: dragX.interpolate({ inputRange: [-80, 0], outputRange: [0, 56], extrapolate: "clamp" }) }] }}>
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            </Animated.View>
          </Pressable>
        )}
      >
        <Pressable
          style={({ pressed }) => [
            styles.sourceListRow,
            { backgroundColor: colors.surface, borderWidth: 0 },
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
      </Swipeable>
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
            <Text style={styles.topicHeroTitle} numberOfLines={2}>{capitalizeFirst(topic.name)}</Text>
            <Text style={styles.topicHeroMeta} numberOfLines={1}>{capitalizeFirst(topic.subject)}</Text>
            <View style={styles.topicHeroStats}>
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.contextSources.length}</Text><Text style={styles.topicHeroStatLabel}>Sources</Text></View>
              <View style={styles.topicHeroStatDivider} />
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.generations.length}</Text><Text style={styles.topicHeroStatLabel}>Created</Text></View>
              <View style={styles.topicHeroStatDivider} />
              <View style={styles.topicHeroStat}><Text style={styles.topicHeroStatValue}>{topic.observations.length}</Text><Text style={styles.topicHeroStatLabel}>Notes</Text></View>
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
          {DETAIL_TABS.map((tab) => {
            const active = activeTab === tab;
            const count =
              tab === "context"
                ? topic.contextSources.length
                : tab === "generations"
                  ? topic.generations.length
                  : tab === "assignments"
                    ? topic.assignments.length
                    : topic.observations.length;
            return (
              <Pressable key={tab} style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && { opacity: pressedOpacity }]} onPress={() => selectTab(tab)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <View style={styles.tabIconRow}>
                  <View style={[styles.tabIcon, active && { backgroundColor: colors.accentSoft }]}><Ionicons name={DETAIL_TAB_ICONS[tab]} size={14} color={active ? colors.accent : colors.textMuted} /></View>
                  {count > 0 ? <View style={[styles.tabCountDot, { backgroundColor: active ? colors.accent : colors.textMuted }]} /> : null}
                </View>
                <Text style={[styles.tabText, { color: active ? colors.accent : colors.textMuted }]} numberOfLines={1}>
                  {DETAIL_TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
          {tabBarWidth > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.tabActiveIndicator, { width: tabBarWidth / DETAIL_TABS.length, transform: [{ translateX: tabIndicatorX }] }]}>
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
                onPress={() => setShowAddContextMethod(true)}
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

            {savedVideos.length > 0 ? (
              <View style={{ marginTop: 22 }}>
                <View style={styles.workbenchLead}>
                  <View style={styles.workbenchCopy}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Reference videos</Text>
                  </View>
                  <Pressable
                    onPress={() => navigation.navigate("ContextResearch", { topicId })}
                    style={({ pressed }) => [styles.workbenchAction, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="search" size={14} color={colors.accent} />
                    <Text style={[styles.workbenchActionText, { color: colors.accent }]}>Find more</Text>
                  </Pressable>
                </View>
                <View style={styles.sourceList}>{savedVideos.map(renderVideoRow)}</View>
              </View>
            ) : null}
          </View>
        ) : null}

        {activeTab === "generations" ? (
          <View>
            <View style={styles.workbenchLead}>
              <View style={styles.workbenchCopy}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Learning Material</Text>
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
                <View style={[styles.filterBar, styles.filterDropdownRow, { borderBottomColor: colors.border }]}>
                  <Pressable
                    style={({ pressed }) => [styles.filterDropdownBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => setShowTypeFilterModal(true)}
                    accessibilityRole="button"
                  >
                    <Ionicons name={generationFilter === "all" ? "albums-outline" : OUTPUT_TYPE_ICONS[generationFilter]} size={14} color={colors.textMuted} />
                    <Text style={[styles.filterDropdownText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {GENERATION_FILTER_OPTIONS.find((f) => f.key === generationFilter)?.label}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.filterDropdownBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => setShowDateFilterModal(true)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.filterDropdownText, { color: colors.textPrimary }]} numberOfLines={1}>
                      {dateFilterPreset === "custom" && customFrom && customTo
                        ? `${formatDateShort(customFrom)} – ${formatDateShort(customTo)}`
                        : DATE_FILTER_PRESET_LABELS[dateFilterPreset]}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
                {displayedGenerationGroups.length === 0 ? (
                  <EmptyWorkbench icon="filter-outline" title="No matches" detail="Try a different type or date range." colors={colors} />
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
                          { backgroundColor: colors.surface, borderWidth: 0 },
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
                              {formatDateShort(g.generatedAt)}
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

        {activeTab === "assignments" ? (
          <View>
            <View style={styles.workbenchLead}>
              <View style={styles.workbenchCopy}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Assignments</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.workbenchAction, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("AssignmentAiSetup", { topicId })} accessibilityRole="button">
                <Ionicons name="add" size={16} color={colors.accent} />
                <Text style={[styles.workbenchActionText, { color: colors.accent }]}>Create</Text>
              </Pressable>
            </View>
            {topic.assignments.length === 0 ? (
              <EmptyWorkbench icon="document-text-outline" title="No assignments yet" detail="Create one from this topic." colors={colors} />
            ) : (
              <View style={styles.sourceList}>
                {topic.assignments.map((a) => {
                  const statusColor = a.status === "published" ? colors.accent : colors.textMuted;
                  return (
                    <Pressable
                      key={a.id}
                      style={({ pressed }) => [
                        styles.sourceListRow,
                        { backgroundColor: colors.surface, borderWidth: 0 },
                        cardShadow,
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => navigation.navigate("AssignmentDetail", { assignmentId: a.id })}
                      accessibilityRole="button"
                    >
                      <View style={[styles.sourceListIcon, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name="document-text-outline" size={16} color={colors.accent} />
                      </View>
                      <View style={styles.sourceListCopy}>
                        <Text style={[styles.sourceName, { color: colors.textPrimary, marginTop: 0 }]} numberOfLines={1}>{a.title}</Text>
                        <View style={styles.sourceListMetaRow}>
                          <Text style={[styles.sourceListTypeText, { color: colors.accent }]}>{a.questions.length} question{a.questions.length === 1 ? "" : "s"}</Text>
                          <Text style={[styles.sourceListSnippet, { color: colors.textMuted }]}>· {formatDateShort(a.createdAt)}</Text>
                        </View>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: colors.surfaceRaised }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>{ASSIGNMENT_STATUS_LABELS[a.status]}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
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
                    {o.photoUrl ? (
                      <View style={styles.stickyNotePhotoBadge}>
                        <Ionicons name="camera" size={11} color="#FFFFFF" />
                      </View>
                    ) : null}
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

      <SheetModal
        visible={showAddContextMethod}
        onClose={() => setShowAddContextMethod(false)}
        closeLabel="Close add context"
      >
        <View style={styles.modalHeader}>
          <View><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add context</Text><Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>How do you want to build up this topic's material?</Text></View>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowAddContextMethod(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
        </View>
        <View style={styles.contextMethodList}>
          <Pressable
            style={({ pressed }) => [styles.contextMethodRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setShowAddContextMethod(false);
              navigation.navigate("ContextResearch", { topicId });
            }}
            accessibilityRole="button"
          >
            <View style={[styles.contextMethodIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="sparkles-outline" size={19} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contextMethodTitle, { color: colors.textPrimary }]}>AI Research</Text>
              <Text style={[styles.contextMethodDetail, { color: colors.textMuted }]}>Find PDFs, articles and videos from the web to review and approve.</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.contextMethodRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setShowAddContextMethod(false);
              navigation.navigate("ImportContext", { topicId });
            }}
            accessibilityRole="button"
          >
            <View style={[styles.contextMethodIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="copy-outline" size={19} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contextMethodTitle, { color: colors.textPrimary }]}>Import from another class</Text>
              <Text style={[styles.contextMethodDetail, { color: colors.textMuted }]}>Reuse sources you already uploaded for a different section.</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.contextMethodRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setShowAddContextMethod(false);
              setShowUrlInput(false);
              setShowAddContext(true);
            }}
            accessibilityRole="button"
          >
            <View style={[styles.contextMethodIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="cloud-upload-outline" size={19} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contextMethodTitle, { color: colors.textPrimary }]}>Upload your own</Text>
              <Text style={[styles.contextMethodDetail, { color: colors.textMuted }]}>Camera, gallery, file, or a web link.</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </Pressable>
        </View>
      </SheetModal>

      <SheetModal
        visible={showAddContext}
        onClose={() => setShowAddContext(false)}
        closeLabel="Close add source"
        maxHeightRatio={0.88}
      >
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
      </SheetModal>

      <SheetModal
        visible={showTypeFilterModal}
        onClose={() => setShowTypeFilterModal(false)}
        closeLabel="Close type filter"
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Filter by type</Text>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowTypeFilterModal(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
        </View>
        <View style={styles.filterOptionList}>
          {GENERATION_FILTER_OPTIONS.map((filter) => {
            const active = generationFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                style={({ pressed }) => [styles.filterOptionRow, pressed && { opacity: pressedOpacity }]}
                onPress={() => selectGenerationTypeFilter(filter.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterOptionText, { color: active ? colors.accent : colors.textPrimary, fontWeight: active ? "800" : "500" }]}>{filter.label}</Text>
                {active ? <Ionicons name="checkmark-circle" size={19} color={colors.accent} /> : <View style={[styles.filterOptionUncheckedCircle, { borderColor: colors.border }]} />}
              </Pressable>
            );
          })}
        </View>
      </SheetModal>

      <SheetModal
        visible={showDateFilterModal}
        onClose={() => setShowDateFilterModal(false)}
        closeLabel="Close date filter"
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Filter by date</Text>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowDateFilterModal(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
        </View>
        <View style={styles.filterOptionList}>
          {DATE_FILTER_PRESETS.map((preset) => {
            const active = dateFilterPreset === preset;
            const label =
              preset === "custom" && customFrom && customTo
                ? `Custom: ${formatDateShort(customFrom)} – ${formatDateShort(customTo)}`
                : DATE_FILTER_PRESET_LABELS[preset];
            return (
              <Pressable
                key={preset}
                style={({ pressed }) => [styles.filterOptionRow, pressed && { opacity: pressedOpacity }]}
                onPress={() => selectDateFilterPreset(preset)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterOptionText, { color: active ? colors.accent : colors.textPrimary, fontWeight: active ? "800" : "500" }]}>{label}</Text>
                {preset === "custom" ? (
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                ) : active ? (
                  <Ionicons name="checkmark-circle" size={19} color={colors.accent} />
                ) : (
                  <View style={[styles.filterOptionUncheckedCircle, { borderColor: colors.border }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      </SheetModal>

      <SheetModal
        visible={showCustomRangeModal}
        onClose={() => setShowCustomRangeModal(false)}
        closeLabel="Close custom date range"
        maxHeightRatio={0.88}
      >
        <View style={styles.modalHeader}>
          <View><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Custom date range</Text><Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Show generations created within these dates.</Text></View>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowCustomRangeModal(false)} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>From</Text>
        <DatePicker value={draftCustomFrom} onChange={setDraftCustomFrom} placeholder="Start date" />
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 12 }]}>To</Text>
        <DatePicker value={draftCustomTo} onChange={setDraftCustomTo} placeholder="End date" minimumDate={draftCustomFrom ? parseISODate(draftCustomFrom) : undefined} />
        <Pressable
          style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, marginTop: 16 }, (!draftCustomFrom || !draftCustomTo || pressed) && { opacity: pressedOpacity }]}
          onPress={applyCustomRange}
          disabled={!draftCustomFrom || !draftCustomTo}
          accessibilityRole="button"
        >
          <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Apply</Text>
        </Pressable>
      </SheetModal>

      <SheetModal
        visible={showAddObservation}
        onClose={() => { setShowAddObservation(false); setNotePhoto(null); }}
        closeLabel="Close new note"
        maxHeightRatio={0.88}
      >
        <View style={styles.modalHeader}>
          <View><Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add teaching note</Text><Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Capture what happened while it is fresh.</Text></View>
          <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => { setShowAddObservation(false); setNotePhoto(null); }} accessibilityRole="button"><Ionicons name="close" size={20} color={colors.textPrimary} /></Pressable>
        </View>
        <TextInput style={[styles.input, styles.multilineInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={observationText} onChangeText={setObservationText} placeholder="What happened in class?" placeholderTextColor={colors.textMuted} multiline autoFocus />
        {notePhoto ? (
          <View style={styles.notePhotoPreviewWrap}>
            <Image source={{ uri: notePhoto.uri }} style={styles.notePhotoPreview} resizeMode="cover" />
            <Pressable style={styles.notePhotoRemove} onPress={() => setNotePhoto(null)} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8}>
              <Ionicons name="close-circle" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <View style={styles.notePhotoActions}>
            <Pressable style={({ pressed }) => [styles.notePhotoAction, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={pickNotePhoto} accessibilityRole="button">
              <Ionicons name="camera-outline" size={16} color={colors.accent} />
              <Text style={[styles.notePhotoActionText, { color: colors.accent }]}>Take photo</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.notePhotoAction, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={pickNoteGalleryPhoto} accessibilityRole="button">
              <Ionicons name="image-outline" size={16} color={colors.accent} />
              <Text style={[styles.notePhotoActionText, { color: colors.accent }]}>Choose photo</Text>
            </Pressable>
          </View>
        )}
        <Pressable style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (isAddingObservation || !observationText.trim() || pressed) && { opacity: pressedOpacity }]} onPress={addObservation} disabled={isAddingObservation || !observationText.trim()} accessibilityRole="button">
          {isAddingObservation ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save note</Text>}
        </Pressable>
      </SheetModal>

      <Modal visible={lightboxUrl !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUrl(null)}>
          {lightboxUrl ? <Image source={{ uri: lightboxUrl }} style={styles.lightboxImage} resizeMode="contain" /> : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUrl(null)} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>

      <VideoPlayerModal videoId={watchingVideo?.videoId ?? null} title={watchingVideo?.title ?? ""} onClose={() => setWatchingVideo(null)} />

      <SheetModal
        visible={openObservation !== null}
        onClose={() => setOpenObservation(null)}
        closeLabel="Close note"
        maxHeightRatio={0.88}
      >
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
          {openObservation?.photoUrl ? (
            <Pressable onPress={() => setLightboxUrl(openObservation.photoUrl!)} accessibilityRole="button" accessibilityLabel="View note photo">
              <Image source={{ uri: openObservation.photoUrl }} style={styles.noteDetailPhoto} resizeMode="cover" />
            </Pressable>
          ) : null}
        </ScrollView>
      </SheetModal>

      <SheetModal
        visible={openSource !== null}
        onClose={() => setOpenSource(null)}
        closeLabel="Close source"
        maxHeightRatio={0.88}
      >
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
                  // Two native <Modal>s visible at once is unreliable
                  // (especially on Android) - close this one before
                  // opening the lightbox instead of stacking them.
                  const imageUrl = api.contextSourceFileUrl(topicId, openSource.id, accessToken);
                  setOpenSource(null);
                  setLightboxUrl(imageUrl);
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
          {openSource ? (
            <Pressable
              style={({ pressed }) => [styles.sourceGhostButton, { borderColor: colors.danger }, (deletingSourceIds.has(openSource.id) || pressed) && { opacity: pressedOpacity }]}
              onPress={() => confirmDeleteSource(openSource)}
              disabled={deletingSourceIds.has(openSource.id)}
              accessibilityRole="button"
            >
              {deletingSourceIds.has(openSource.id) ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.sourceGhostButtonText, { color: colors.danger }]}>Delete</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.sourceTextHeaderRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0 }]}>
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
                style={({ pressed }) => [styles.sourceGhostButton, { borderColor: colors.border, flexGrow: 0 }, pressed && { opacity: pressedOpacity }]}
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
      </SheetModal>
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
  const { cardShadow } = useTheme();
  return (
    <View style={[styles.emptyWorkbench, { backgroundColor: colors.surface }, cardShadow]}>
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
  // flexGrow so buttons share each row evenly - a button that wraps onto its
  // own line fills it instead of hanging off to one side.
  sourceGhostButton: { flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 38, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14 },
  sourceGhostButtonText: { fontSize: 12, fontWeight: "700" },
  sourceTextInput: { height: 200, marginTop: 6 },
  // Its own section, divided from the source actions above, so the Edit pill
  // never reads as part of that button row.
  sourceTextHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, marginBottom: 4, minHeight: 30 },
  editTextButton: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, borderRadius: 15, paddingHorizontal: 12 },
  editTextButtonText: { fontSize: 11, fontWeight: "800" },
  sourceTextView: { maxHeight: 220, minHeight: 90, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 6 },
  sourceTextViewBody: { fontSize: 13, lineHeight: 20, fontWeight: "500" },
  sourceEditActionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  sourceSaveButton: { flex: 1, marginTop: 0 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 16 },
  tab: { position: "relative", flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 2, flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 3 },
  tabActive: { marginTop: -1 },
  tabIconRow: { position: "relative", alignItems: "center", justifyContent: "center" },
  tabIcon: { width: 22, height: 22, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  // Overlaid on the icon corner (not inline) so every tab's icon stays centred.
  tabCountDot: { position: "absolute", top: -1, right: -3, width: 6, height: 6, borderRadius: 3 },
  tabText: { alignSelf: "stretch", textAlign: "center", fontSize: 10, lineHeight: 12, fontWeight: "800" },
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
  emptyWorkbench: { minHeight: 150, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 20, alignItems: "center", justifyContent: "center" },
  emptyWorkbenchIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  emptyWorkbenchTitle: { marginTop: 10, fontSize: 15, fontWeight: "800" },
  emptyWorkbenchDetail: { maxWidth: 260, marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center" },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, height: 48, fontSize: 14 },
  multilineInput: { height: 120, textAlignVertical: "top", marginTop: 18 },
  notePhotoActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  notePhotoAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 12, height: 42 },
  notePhotoActionText: { fontSize: 12, fontWeight: "700" },
  notePhotoPreviewWrap: { marginTop: 12, position: "relative" },
  notePhotoPreview: { width: "100%", height: 150, borderRadius: 12 },
  notePhotoRemove: { position: "absolute", top: 8, right: 8 },
  noteDetailPhoto: { marginTop: 14, width: "100%", height: 180, borderRadius: 14 },
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
  stickyNotePhotoBadge: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.28)", alignItems: "center", justifyContent: "center" },
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
  filterDropdownRow: { flexDirection: "row", gap: 8 },
  filterDropdownBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  filterDropdownText: { flex: 1, fontSize: 12, fontWeight: "700" },
  filterOptionList: { marginTop: 18, marginBottom: 6 },
  filterOptionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 48 },
  filterOptionText: { fontSize: 15, flex: 1 },
  filterOptionUncheckedCircle: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5 },
  contextMethodList: { marginTop: 18, marginBottom: 6, gap: 10 },
  contextMethodRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 15, padding: 13 },
  contextMethodIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contextMethodTitle: { fontSize: 14, fontWeight: "800" },
  contextMethodDetail: { fontSize: 12, lineHeight: 16, marginTop: 2, fontWeight: "500" },
  sourceCard: { width: "48%", minHeight: 142, borderWidth: 1, borderRadius: 13, padding: 12, justifyContent: "flex-start" },
  sourceImageCard: { height: 230 },
  sourceCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  typeTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  typeTagText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.2 },
  sourceList: { gap: 8 },
  sourceListRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, minHeight: 56 },
  swipeDeleteAction: { width: 72, alignItems: "center", justifyContent: "center", borderRadius: 13, marginLeft: 8 },
  sourceListIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sourceListCopy: { flex: 1 },
  sourceListMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  sourceListTypeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.2 },
  sourceListSnippet: { fontSize: 11, marginLeft: 4, flexShrink: 1, fontWeight: "500" },
  sourceName: { marginTop: 9, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  videoRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 10, minHeight: 56 },
  videoRowThumb: { width: 72, height: 48, borderRadius: 8 },
  videoRowPlayBadge: { position: "absolute", right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" },
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
