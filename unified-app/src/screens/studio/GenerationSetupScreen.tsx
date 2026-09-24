import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image, Modal } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { ColorPickerModal } from "../../components/ColorPickerModal";
import { api, GenerationOutputType, TopicDetail, ContextSource, GenerationSourceSelection, PresentationTemplate, ActivityGroupSize } from "../../api/client";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_CAPTIONS, OUTPUT_TYPE_ICONS } from "./generation/outputTypeMeta";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationSetup">;
// This screen's own card order (kept as designed) - labels/captions/icons
// still come from the shared map so they stay in sync with every other screen.
const SETUP_OUTPUT_ORDER: GenerationOutputType[] = ["lesson_plan", "presentation", "flashcards", "custom_activity_report"];
const OUTPUT_TYPES: { key: GenerationOutputType; label: string; caption: string; icon: keyof typeof Ionicons.glyphMap }[] =
  SETUP_OUTPUT_ORDER.map((key) => ({ key, label: OUTPUT_TYPE_LABELS[key], caption: OUTPUT_TYPE_CAPTIONS[key], icon: OUTPUT_TYPE_ICONS[key] }));
// A lesson plan already covers every goal bucket, so the section is disabled
// (not hidden - keeps the layout stable) when it's the selected output.
const LEARNING_GOALS = ["Understand the concept", "Explain the process", "Apply the concept", "Evaluate"];
const LANGUAGES = ["English", "Hindi"];
const CLASS_COUNTS = [1, 2, 3, 5];
const DURATIONS = [30, 45, 60, 90];
const PAGE_RANGE_THRESHOLD = 10;
// Most PDF pages one generation can show as-is (matches the backend cap), and
// how many are pre-selected when a PDF is first switched on.
const EMBED_PAGE_CAP = 20;
const EMBED_DEFAULT_PAGES = 10;

type SourceListFilter = "all" | "pdfs" | "images" | "docs" | "links";
const SOURCE_LIST_FILTERS: { key: SourceListFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pdfs", label: "PDFs" },
  { key: "images", label: "Images" },
  { key: "docs", label: "Docs" },
  { key: "links", label: "Links" },
];
function matchesSourceFilter(source: ContextSource, filter: SourceListFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pdfs") return source.sourceType === "pdf";
  if (filter === "images") return source.sourceType === "image";
  if (filter === "docs") return source.sourceType === "docx" || source.sourceType === "pptx";
  return source.sourceType === "url" || source.sourceType === "youtube" || source.sourceType === "idream_k12";
}

// "School format" and "More visual" are no longer selectable styles -
// branding applies by default to every deck (see the branding color block
// below), and presentations no longer use stock photos, so these two are
// pure content-density choices now.
const PRESENTATION_TEMPLATES: { key: PresentationTemplate; label: string; caption: string }[] = [
  { key: "detailed", label: "Detailed", caption: "Text-heavy, full explanations" },
  { key: "instructional", label: "Instructional", caption: "Step-by-step process" },
];

// Client feedback: activity report outputs were "random" because the model
// had no idea how many students would do each activity together, or what's
// physically in the room - these two inputs constrain that directly. Mirrors
// backend/src/lib/ai.ts's ActivityGroupSize/ACTIVITY_RESOURCE_OPTIONS (kept
// in sync manually, same pattern as the other small duplicated tables in
// this codebase - the mobile app can't import the backend file).
const ACTIVITY_GROUP_SIZES: { key: ActivityGroupSize; label: string; caption: string }[] = [
  { key: "individual", label: "Per student", caption: "Each student works alone" },
  { key: "small_group", label: "Small groups", caption: "2-4 students per group" },
  { key: "large_group", label: "Large groups", caption: "A few big teams" },
];
// Deliberately broad (per the client's ask to spend more time on this), not
// just the 4 examples they gave - each is a one-tap yes/no, not free text.
const ACTIVITY_RESOURCES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "board", label: "Whiteboard / blackboard", icon: "easel-outline" },
  { key: "projector", label: "Projector or smart TV", icon: "tv-outline" },
  { key: "printer", label: "Printer (for handouts)", icon: "print-outline" },
  { key: "stationery", label: "Stationery (pens, chart paper)", icon: "pencil-outline" },
  { key: "computers", label: "Computers or tablets", icon: "laptop-outline" },
  { key: "internet", label: "Internet access", icon: "wifi-outline" },
  { key: "art_supplies", label: "Art & craft supplies", icon: "color-palette-outline" },
  { key: "open_space", label: "Open floor space", icon: "expand-outline" },
  { key: "lab_equipment", label: "Science lab equipment", icon: "flask-outline" },
  { key: "audio", label: "Speakers / audio", icon: "volume-high-outline" },
];
// The six Bloom's Taxonomy stages, shown as "Learning Stage" (same concept,
// renamed label - never show "Bloom's Level" in the product). Mirrors
// backend/src/lib/ai.ts's LEARNING_STAGE_OPTIONS (kept in sync manually,
// same pattern as the other small duplicated tables above).
const LEARNING_STAGES = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
// Same fixed palette used for school-wide branding in FormatTemplateScreen.tsx -
// reused here so a per-generation color tweak picks from the same set. Kept
// to 6 (not more) so the row - 6 presets + the custom-picker swatch - fits
// one line at phone width (each swatch is flex-sized, see colorSwatch below).
const BRAND_COLOR_PALETTE = ["#4C4CE0", "#E4574F", "#2FAE66", "#D9822B", "#0EA5B7", "#1F2937"];
const DEFAULT_PRIMARY_COLOR = "#2B2F36";
const DEFAULT_SECONDARY_COLOR = "#9FB4C7";

const SOURCE_TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  youtube: "logo-youtube",
  idream_k12: "library-outline",
};

interface PageRange {
  from: number;
  to: number;
}

export function GenerationSetupScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [outputType, setOutputType] = useState<GenerationOutputType>("lesson_plan");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [classCount, setClassCount] = useState(1);
  const [minutesPerClass, setMinutesPerClass] = useState(45);
  const [customPrompt, setCustomPrompt] = useState("");
  const [learningGoals, setLearningGoals] = useState<string[]>([]);
  const [presentationTemplate, setPresentationTemplate] = useState<PresentationTemplate>("detailed");
  const [activityGroupSize, setActivityGroupSize] = useState<ActivityGroupSize>("small_group");
  const [activityResources, setActivityResources] = useState<string[]>([]);
  const [learningStages, setLearningStages] = useState<string[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [pageRanges, setPageRanges] = useState<Record<string, PageRange>>({});
  const [sourceFilter, setSourceFilter] = useState<SourceListFilter>("all");
  // Images / PDF pages shown as-is in the output (not fed to the AI as text).
  const [embedIds, setEmbedIds] = useState<Set<string>>(new Set());
  const [embedRanges, setEmbedRanges] = useState<Record<string, PageRange>>({});
  const [assembleOnlyChoice, setAssembleOnlyChoice] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  useAiGenerating(isGenerating);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [savedBranding, setSavedBranding] = useState<{ logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null } | null>(null);
  // null = use the saved school branding as-is; set once the teacher taps a
  // swatch, to tweak colors for just this one deck without touching the
  // saved branding row.
  const [colorOverride, setColorOverride] = useState<{ primary: string; secondary: string } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<"primary" | "secondary" | null>(null);
  const selectedOutput = OUTPUT_TYPES.find((item) => item.key === outputType)!;
  const goalsDisabled = outputType === "lesson_plan";
  // Mirrors the backend's authorizeForSchool gate on the branding write route
  // (school-format-templates.ts) - only these roles can actually set up
  // branding, so only they get routed to the setup screen when it's missing.
  const canConfigureBranding = user?.role !== "teacher" || user?.accountType === "individual";
  const hasBranding = !!(savedBranding?.logoUrl || savedBranding?.primaryColor);
  const effectivePrimary = colorOverride?.primary ?? savedBranding?.primaryColor ?? DEFAULT_PRIMARY_COLOR;
  const effectiveSecondary = colorOverride?.secondary ?? savedBranding?.secondaryColor ?? DEFAULT_SECONDARY_COLOR;

  useEffect(() => {
    if (!accessToken) return;
    api.getTopic(accessToken, topicId).then(setTopic).catch(() => {});
  }, [accessToken, topicId]);

  // useFocusEffect, not useEffect - this needs to re-check every time the
  // screen regains focus, e.g. coming back from setting up branding on the
  // Lesson format screen. A one-time useEffect left this stuck on whatever
  // it read on first mount, so a freshly-saved branding never took effect
  // without a full app reload.
  useFocusEffect(
    useCallback(() => {
      if (!accessToken || !user?.schoolId) return;
      api
        .getSchoolBranding(accessToken, user.schoolId)
        .then(setSavedBranding)
        .catch(() => {});
    }, [accessToken, user?.schoolId])
  );

  const topicMeta = topic
    ? `${capitalizeFirst(topic.subject)}${user?.board ? ` · ${user.board}` : ""} ·${capitalizeFirst(topic.classSection.className)} ${capitalizeFirst(topic.classSection.sectionName)}`
    : null;

  function selectOutput(item: (typeof OUTPUT_TYPES)[number]) {
    // Presentations no longer configure inline on this screen - the new
    // flow (reason -> classes/slides -> density -> outline review) takes
    // over immediately, same as spec step 4 ("Selects Presentation - Loads
    // the presentation flow"). Every other output type is unchanged.
    if (item.key === "presentation") {
      navigation.navigate("PresentationReason", { topicId });
      return;
    }
    setOutputType(item.key);
  }

  function toggleGoal(goal: string) {
    if (goalsDisabled) return;
    setLearningGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  }

  function toggleActivityResource(key: string) {
    setActivityResources((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleLearningStage(stage: string) {
    setLearningStages((current) => (current.includes(stage) ? current.filter((item) => item !== stage) : [...current, stage]));
  }

  function toggleSource(source: ContextSource) {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(source.id)) {
        next.delete(source.id);
      } else {
        next.add(source.id);
        if (source.sourceType === "pdf" && (source.pageCount ?? 0) > PAGE_RANGE_THRESHOLD && !pageRanges[source.id]) {
          setPageRanges((r) => ({ ...r, [source.id]: { from: 1, to: source.pageCount! } }));
        }
      }
      return next;
    });
  }

  function adjustPageRange(sourceId: string, field: "from" | "to", delta: number, pageCount: number) {
    setPageRanges((prev) => {
      const current = prev[sourceId] ?? { from: 1, to: pageCount };
      const nextValue = Math.min(pageCount, Math.max(1, current[field] + delta));
      const next = { ...current, [field]: nextValue };
      if (next.from > next.to) {
        if (field === "from") next.to = next.from;
        else next.from = next.to;
      }
      return { ...prev, [sourceId]: next };
    });
  }

  function toggleEmbed(source: ContextSource) {
    setEmbedIds((prev) => {
      const next = new Set(prev);
      if (next.has(source.id)) {
        next.delete(source.id);
      } else {
        next.add(source.id);
        if (source.sourceType === "pdf" && !embedRanges[source.id]) {
          setEmbedRanges((r) => ({ ...r, [source.id]: { from: 1, to: Math.min(source.pageCount ?? 1, EMBED_DEFAULT_PAGES) } }));
        }
      }
      return next;
    });
  }

  function adjustEmbedRange(sourceId: string, field: "from" | "to", delta: number, pageCount: number) {
    setEmbedRanges((prev) => {
      const current = prev[sourceId] ?? { from: 1, to: Math.min(pageCount, EMBED_DEFAULT_PAGES) };
      const next = { ...current, [field]: Math.min(pageCount, Math.max(1, current[field] + delta)) };
      if (next.from > next.to) {
        if (field === "from") next.to = next.from;
        else next.from = next.to;
      }
      // Never more than the backend allows in one go.
      if (next.to - next.from + 1 > EMBED_PAGE_CAP) {
        if (field === "from") next.to = next.from + EMBED_PAGE_CAP - 1;
        else next.from = next.to - EMBED_PAGE_CAP + 1;
      }
      return { ...prev, [sourceId]: next };
    });
  }

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    const goalPrompt = !goalsDisabled && learningGoals.length ? `Learning goals: ${learningGoals.join("; ")}` : "";
    const combinedPrompt = [customPrompt.trim(), goalPrompt].filter(Boolean).join("\n");
    const sources: GenerationSourceSelection[] = Array.from(selectedSourceIds).map((id) => {
      const range = pageRanges[id];
      return range ? { contextSourceId: id, pageFrom: range.from, pageTo: range.to } : { contextSourceId: id };
    });
    const embeds: GenerationSourceSelection[] = (topic?.contextSources ?? [])
      .filter((source) => embedIds.has(source.id))
      .map((source) => {
        const range = embedRanges[source.id];
        return source.sourceType === "pdf" && range ? { contextSourceId: source.id, pageFrom: range.from, pageTo: range.to } : { contextSourceId: source.id };
      });
    try {
      const generation = await api.createGeneration(accessToken, topicId, {
        outputType, classCount, minutesPerClass, language, customPrompt: combinedPrompt || undefined, sources,
        ...(embeds.length > 0 ? { embeds, ...(assembleOnly ? { assembleOnly: true } : {}) } : {}),
        ...(outputType === "custom_activity_report" ? { activityGroupSize, activityResources, learningStages } : {}),
      });
      navigation.replace("GenerationReview", { generationId: generation.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const hasSources = (topic?.contextSources.length ?? 0) > 0;
  const blockedByNoSourceSelection = hasSources && selectedSourceIds.size === 0 && embedIds.size === 0;
  // A deck can be built from the chosen images / pages alone - no AI, free.
  const canAssemble = outputType === "presentation" && embedIds.size > 0;
  const assembleOnly = canAssemble && assembleOnlyChoice;
  const shownSources = (topic?.contextSources ?? []).filter((source) => matchesSourceFilter(source, sourceFilter));

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></Pressable>
          <View style={styles.topCopy}>
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Lesson with AI</Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              {topicMeta ?? "Create something great for your next class."}
            </Text>
          </View>
          <Pressable style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("MainTabs", { screen: "Home" })} accessibilityRole="button" accessibilityLabel="Go to home"><Ionicons name="home-outline" size={20} color={colors.textPrimary} /></Pressable>
        </View>

        <View style={styles.introRow}>
          <View style={styles.introCopy}>
            <Text style={[styles.introTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {topic?.name ? capitalizeFirst(topic.name) : "What are we teaching today?"}
            </Text>
            <Text style={[styles.introText, { color: colors.textSecondary }]}>
              {topic ? "Choose what to build, then what it should be grounded in." : "Loading your topic…"}
            </Text>
          </View>
          <Image source={require("../../../assets/decorative/decor-generation-hero.png")} style={styles.introArtwork} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>

        <View style={styles.buildHeader}><Text style={[styles.buildTitle, { color: colors.textPrimary }]}>Build your lesson</Text><Text style={[styles.buildCaption, { color: colors.textMuted }]}>Choose an output</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outputRail}>
          {OUTPUT_TYPES.map((item) => {
            const active = item.key === outputType;
            return <Pressable key={item.key} style={({ pressed }) => [styles.outputCard, { backgroundColor: colors.surface, borderColor: active ? colors.accent : colors.border }, active && styles.outputCardActive, pressed && { opacity: pressedOpacity }]} onPress={() => selectOutput(item)} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <View style={[styles.outputIcon, { backgroundColor: active ? colors.accentSoft : colors.surfaceRaised }]}><Ionicons name={item.icon} size={17} color={colors.accent} /></View>
              {active ? <View style={[styles.selectedMark, { backgroundColor: colors.accent }]}><Ionicons name="checkmark" size={12} color={colors.accentOn} /></View> : null}
              <Text style={[styles.outputTitle, { color: colors.textPrimary }]}>{item.label}</Text><Text style={[styles.outputCaption, { color: colors.textMuted }]}>{item.caption}</Text>
            </Pressable>;
          })}
        </ScrollView>

        {outputType === "custom_activity_report" ? (
          <View style={styles.presentationStyleSection}>
            <Text style={[styles.sectionHeading, { color: colors.textPrimary, marginTop: 0 }]}>Group size</Text>
            <View style={styles.presentationTemplateRow}>
              {ACTIVITY_GROUP_SIZES.map((g) => {
                const active = activityGroupSize === g.key;
                return (
                  <Pressable
                    key={g.key}
                    style={({ pressed }) => [styles.presentationTemplateChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => setActivityGroupSize(g.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.presentationTemplateLabel, { color: active ? colors.accentOn : colors.textPrimary }]}>{g.label}</Text>
                    <Text style={[styles.presentationTemplateCaption, { color: active ? colors.accentOn : colors.textMuted }]}>{g.caption}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>What's in your classroom?</Text>
            <Text style={[styles.resourceHint, { color: colors.textMuted }]}>Activities will only use what you select here - nothing you'd need to source or print.</Text>
            <View style={styles.resourceGrid}>
              {ACTIVITY_RESOURCES.map((r) => {
                const active = activityResources.includes(r.key);
                return (
                  <Pressable
                    key={r.key}
                    style={({ pressed }) => [styles.resourceChip, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => toggleActivityResource(r.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={r.icon} size={14} color={active ? colors.accent : colors.textMuted} />
                    <Text style={[styles.resourceChipText, { color: active ? colors.accent : colors.textSecondary }]}>{r.label}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={14} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Learning stage</Text>
            <Text style={[styles.resourceHint, { color: colors.textMuted }]}>
              Pick one or more to constrain what this activity targets. Leave blank to let the AI choose.
            </Text>
            <View style={styles.resourceGrid}>
              {LEARNING_STAGES.map((stage) => {
                const active = learningStages.includes(stage);
                return (
                  <Pressable
                    key={stage}
                    style={({ pressed }) => [styles.resourceChip, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]}
                    onPress={() => toggleLearningStage(stage)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.resourceChipText, { color: active ? colors.accent : colors.textSecondary }]}>{stage}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={14} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Select sources</Text>
        {!topic ? null : !hasSources ? (
          <View style={[styles.emptySources, { backgroundColor: colors.surface }, cardShadow]}>
            <Ionicons name="layers-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.emptySourcesText, { color: colors.textMuted }]}>
              No context sources on this topic yet. You can still generate, or add sources first from the Context tab.
            </Text>
          </View>
        ) : (
          <View style={styles.sourceList}>
            <View style={styles.sourceFilterRow}>
              {SOURCE_LIST_FILTERS.map((filter) => {
                const active = sourceFilter === filter.key;
                const count = topic.contextSources.filter((s) => matchesSourceFilter(s, filter.key)).length;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setSourceFilter(filter.key)}
                    style={[styles.sourceFilterChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.sourceFilterText, { color: active ? colors.accentOn : colors.textMuted }]}>{filter.label} {count}</Text>
                  </Pressable>
                );
              })}
            </View>
            {shownSources.length === 0 ? <Text style={[styles.sourceHint, { color: colors.textMuted }]}>No sources of this type on the topic.</Text> : null}
            {shownSources.map((source) => {
              const selected = selectedSourceIds.has(source.id);
              const canEmbed = (source.sourceType === "pdf" || source.sourceType === "image") && !!source.fileLocation;
              const embedded = embedIds.has(source.id);
              const embedRange = embedRanges[source.id];
              const label = source.originalFilename ?? source.sourceUrl ?? source.idreamK12ReferenceId ?? source.sourceType;
              const showPageRange = selected && source.sourceType === "pdf" && (source.pageCount ?? 0) > PAGE_RANGE_THRESHOLD;
              const range = pageRanges[source.id];
              return (
                <View key={source.id} style={[styles.sourceRow, { backgroundColor: colors.surface, borderColor: selected ? colors.accent : colors.border }]}>
                  <Pressable style={styles.sourceRowMain} onPress={() => toggleSource(source)} accessibilityRole="button" accessibilityState={{ selected }}>
                    <Ionicons name={SOURCE_TYPE_ICONS[source.sourceType]} size={16} color={colors.accent} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.sourceRowLabel, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
                      {source.sourceType === "pdf" && source.pageCount ? (
                        <Text style={[styles.sourceRowMeta, { color: colors.textMuted }]}>{source.pageCount} pages</Text>
                      ) : null}
                    </View>
                    <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={20} color={selected ? colors.accent : colors.textMuted} />
                  </Pressable>
                  {showPageRange && range ? (
                    <View style={[styles.pageRangeRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.pageRangeLabel, { color: colors.textMuted }]}>Pages</Text>
                      <PageStepper value={range.from} onDecrement={() => adjustPageRange(source.id, "from", -1, source.pageCount!)} onIncrement={() => adjustPageRange(source.id, "from", 1, source.pageCount!)} />
                      <Text style={{ color: colors.textMuted }}>to</Text>
                      <PageStepper value={range.to} onDecrement={() => adjustPageRange(source.id, "to", -1, source.pageCount!)} onIncrement={() => adjustPageRange(source.id, "to", 1, source.pageCount!)} />
                    </View>
                  ) : null}
                  {canEmbed ? (
                    <View style={[styles.pageRangeRow, { borderTopColor: colors.border, flexWrap: "wrap" }]}>
                      <Pressable style={styles.asIsRow} onPress={() => toggleEmbed(source)} accessibilityRole="switch" accessibilityState={{ checked: embedded }}>
                        <Ionicons name={embedded ? "checkbox" : "square-outline"} size={19} color={embedded ? colors.accent : colors.textMuted} />
                        <Text style={[styles.asIsText, { color: colors.textPrimary }]}>
                          {source.sourceType === "pdf" ? "Show these pages as-is in the output" : "Show this image as-is in the output"}
                        </Text>
                      </Pressable>
                      {embedded && source.sourceType === "pdf" && embedRange ? (
                        <View style={styles.asIsPages}>
                          <Text style={[styles.pageRangeLabel, { color: colors.textMuted }]}>Pages</Text>
                          <PageStepper value={embedRange.from} onDecrement={() => adjustEmbedRange(source.id, "from", -1, source.pageCount ?? 1)} onIncrement={() => adjustEmbedRange(source.id, "from", 1, source.pageCount ?? 1)} />
                          <Text style={{ color: colors.textMuted }}>to</Text>
                          <PageStepper value={embedRange.to} onDecrement={() => adjustEmbedRange(source.id, "to", -1, source.pageCount ?? 1)} onIncrement={() => adjustEmbedRange(source.id, "to", 1, source.pageCount ?? 1)} />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {canAssemble ? (
              <Pressable
                style={[styles.assembleCard, { backgroundColor: assembleOnly ? colors.accentSoft : colors.surfaceRaised, borderColor: assembleOnly ? colors.accent : colors.border }]}
                onPress={() => setAssembleOnlyChoice((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: assembleOnly }}
              >
                <Ionicons name={assembleOnly ? "checkbox" : "square-outline"} size={20} color={assembleOnly ? colors.accent : colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.asIsText, { color: colors.textPrimary }]}>Build the deck from these only</Text>
                  <Text style={[styles.sourceHint, { color: colors.textMuted }]}>No AI writing - your images and pages become the slides. Free.</Text>
                </View>
              </Pressable>
            ) : null}
            {blockedByNoSourceSelection ? (
              <Text style={[styles.sourceHint, { color: colors.textMuted }]}>Select at least one source to ground this generation in, or it won't have anything specific to work from.</Text>
            ) : null}
          </View>
        )}

        <View style={[styles.goalSection, goalsDisabled && styles.goalSectionDisabled]} pointerEvents={goalsDisabled ? "none" : "auto"}>
          <View style={styles.goalHeadingRow}>
            <Text style={[styles.goalHeading, { color: colors.textPrimary }]}>Learning goals</Text>
            {goalsDisabled ? <Text style={[styles.goalDisabledNote, { color: colors.textMuted }]}>Covered by a lesson plan</Text> : null}
          </View>
          <View style={styles.goalRow}>{LEARNING_GOALS.map((goal) => { const active = !goalsDisabled && learningGoals.includes(goal); return <Pressable key={goal} style={({ pressed }) => [styles.goalChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => toggleGoal(goal)} accessibilityRole="button" accessibilityState={{ selected: active }}><Text style={[styles.goalText, { color: active ? colors.accentOn : colors.textSecondary }]}>{goal}</Text></Pressable>; })}</View>
        </View>

        <View style={[styles.focusCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          <View style={styles.settingChips}>
            <SelectChip
              title="Language"
              icon="language-outline"
              value={language}
              options={LANGUAGES}
              optionLabel={(o) => o}
              onSelect={setLanguage}
            />
            {/* Flashcards and presentations have no notion of "how many
                classes" or "how long each class is" that actually reaches
                the model as a rule (presentations only get it as two loose
                context lines, no slide-count formula) - showing the pickers
                would just be asking for input that gets silently ignored.
                Only lesson plans (explicit durationMinutes, 5E stage split)
                and custom activity reports ("sized to fit the given
                minutes") genuinely use these numbers. */}
            {outputType !== "flashcards" && outputType !== "presentation" ? (
              <>
                <SelectChip
                  title="Classes covered"
                  icon="people-outline"
                  value={classCount}
                  options={CLASS_COUNTS}
                  optionLabel={(n) => `${n} class${n === 1 ? "" : "es"}`}
                  onSelect={setClassCount}
                />
                <SelectChip
                  title="Minutes per class"
                  icon="time-outline"
                  value={minutesPerClass}
                  options={DURATIONS}
                  optionLabel={(n) => `${n} min`}
                  onSelect={setMinutesPerClass}
                />
              </>
            ) : null}
          </View>
          <Text style={[styles.inputLabel, { color: colors.textPrimary, marginTop: 14 }]}>Anything specific to include? (optional)</Text>
          <TextInput style={[styles.focusInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={customPrompt} onChangeText={setCustomPrompt} placeholder="e.g. include a hands-on group activity, focus on real-world examples..." placeholderTextColor={colors.textMuted} multiline textAlignVertical="top" />
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || blockedByNoSourceSelection || pressed) && { opacity: pressedOpacity }]} onPress={generate} disabled={isGenerating || blockedByNoSourceSelection} accessibilityRole="button">
            {/* No spinner while generating - the AI generating overlay covers the screen. */}
            <Ionicons name={selectedOutput.icon} size={20} color={colors.accentOn} /><Text style={[styles.generateText, { color: colors.accentOn }]}>Create {selectedOutput.label}</Text><Ionicons name="arrow-forward" size={19} color={colors.accentOn} />
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.textMuted }]}>Your lesson will be saved automatically.</Text>
        </View>
      </ScrollView>

      <ColorPickerModal
        visible={colorPickerTarget !== null}
        initialColor={colorPickerTarget === "primary" ? effectivePrimary : effectiveSecondary}
        onClose={() => setColorPickerTarget(null)}
        onSelect={(hex) => {
          setColorOverride({
            primary: colorPickerTarget === "primary" ? hex : effectivePrimary,
            secondary: colorPickerTarget === "secondary" ? hex : effectiveSecondary,
          });
          setColorPickerTarget(null);
        }}
      />
    </Screen>
  );
}

function PageStepper({ value, onDecrement, onIncrement }: { value: number; onDecrement: () => void; onIncrement: () => void }) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <View style={[styles.pageStepper, { borderColor: colors.border }]}>
      <Pressable onPress={onDecrement} hitSlop={8} style={({ pressed }) => pressed && { opacity: pressedOpacity }} accessibilityRole="button" accessibilityLabel="Decrease page">
        <Ionicons name="remove" size={14} color={colors.accent} />
      </Pressable>
      <Text style={[styles.pageStepperValue, { color: colors.textPrimary }]}>{value}</Text>
      <Pressable onPress={onIncrement} hitSlop={8} style={({ pressed }) => pressed && { opacity: pressedOpacity }} accessibilityRole="button" accessibilityLabel="Increase page">
        <Ionicons name="add" size={14} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function SelectChip<T extends string | number>({
  title,
  icon,
  value,
  options,
  optionLabel,
  onSelect,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: T;
  options: readonly T[];
  optionLabel: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.settingChip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <Ionicons name={icon} size={14} color={colors.accent} />
        <Text style={[styles.settingChipText, { color: colors.textPrimary }]}>{optionLabel(value)}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.accent} />
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={`Close ${title} picker`}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>{title}</Text>
            {options.map((option) => {
              const selected = option === value;
              return (
                <Pressable
                  key={String(option)}
                  style={({ pressed }) => [styles.pickerRow, pressed && { opacity: pressedOpacity }]}
                  onPress={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.pickerRowText, { color: selected ? colors.accent : colors.textPrimary }]}>{optionLabel(option)}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" }, backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" }, topCopy: { flex: 1, marginLeft: 14 }, topTitle: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 }, topSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: "500", maxWidth: 210 },
  introRow: { flexDirection: "row", alignItems: "center", marginTop: 16, minHeight: 132 }, introCopy: { flex: 1, paddingRight: 8 }, introTitle: { fontSize: 24, lineHeight: 30, letterSpacing: -0.7, fontWeight: "800" }, introText: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: "500" }, introArtwork: { width: 132, height: 132 },
  buildHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }, buildTitle: { fontSize: 16, fontWeight: "800" }, buildCaption: { fontSize: 11, fontWeight: "600" },
  // Deliberately narrower than "2 cards exactly fill the screen" - a
  // partially-cut-off card peeking in at the edge is what visually signals
  // "this scrolls" to a user; a width that divides the screen evenly hides
  // the scrollability entirely (this rail was 148px wide, which on several
  // phone widths landed near-flush with 2 cards and no visible peek).
  outputRail: { gap: 10, paddingTop: 11, paddingRight: 20 }, outputCard: { width: 112, minHeight: 110, borderWidth: 1, borderRadius: 16, padding: 11 }, outputCardActive: { borderWidth: 2, padding: 10 }, outputIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" }, selectedMark: { position: "absolute", top: 9, right: 9, width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center" }, outputTitle: { marginTop: 10, fontSize: 12, lineHeight: 15, fontWeight: "800" }, outputCaption: { marginTop: 2, fontSize: 9, lineHeight: 12, fontWeight: "600" },
  sectionHeading: { marginTop: 25, fontSize: 15, fontWeight: "800" },
  presentationStyleSection: { marginTop: 25 },
  presentationTemplateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  presentationTemplateChip: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 13, padding: 12 },
  presentationTemplateLabel: { fontSize: 13, fontWeight: "800" },
  presentationTemplateCaption: { fontSize: 11, marginTop: 2, fontWeight: "600" },
  resourceHint: { marginTop: 5, fontSize: 11, lineHeight: 16, fontWeight: "500" },
  resourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  resourceChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11 },
  resourceChipText: { fontSize: 11, fontWeight: "700" },
  brandingColorBlock: { marginTop: 16, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  brandingColorHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandingColorDotsRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  brandingColorDot: { width: 16, height: 16, borderRadius: 8 },
  brandingColorPicker: { marginTop: 14 },
  brandingToggleLabel: { fontSize: 13, fontWeight: "700" },
  brandingEditButton: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  brandingSetupRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, borderWidth: 1, borderStyle: "dashed", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  brandingSetupText: { fontSize: 13, fontWeight: "700" },
  fieldLabelSmall: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  resetColorsLink: { fontSize: 12, fontWeight: "700", marginTop: 12 },
  colorSwatchRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  // flex:1 + aspectRatio:1 (not a fixed px size) - every swatch shares the
  // row's available width equally, so the row always fits one line at any
  // screen width instead of needing to wrap or getting clipped off-screen.
  colorSwatch: { flex: 1, aspectRatio: 1, borderRadius: 999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  customSwatch: { flex: 1, aspectRatio: 1, borderRadius: 999, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  emptySources: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 13, borderRadius: 13 },
  emptySourcesText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  sourceList: { marginTop: 10, gap: 8 },
  sourceRow: { borderWidth: 1, borderRadius: 13 },
  sourceRowMain: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 12, minHeight: 50 },
  sourceRowLabel: { fontSize: 13, fontWeight: "700" },
  sourceRowMeta: { fontSize: 10, marginTop: 1, fontWeight: "600" },
  sourceFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  sourceFilterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  sourceFilterText: { fontSize: 12, fontWeight: "700" },
  asIsRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  asIsText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  asIsPages: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, width: "100%" },
  assembleCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 4 },
  pageRangeRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  pageRangeLabel: { fontSize: 11, fontWeight: "700" },
  pageStepper: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 28 },
  pageStepperValue: { fontSize: 12, fontWeight: "800", minWidth: 18, textAlign: "center" },
  sourceHint: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  goalSection: { marginTop: 23 },
  goalSectionDisabled: { opacity: 0.4 },
  goalHeadingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  goalHeading: { fontSize: 15, fontWeight: "800" }, goalDisabledNote: { fontSize: 10, fontWeight: "600" }, goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }, goalChip: { minHeight: 34, borderWidth: 1, borderRadius: radius.pill, justifyContent: "center", paddingHorizontal: 12 }, goalText: { fontSize: 11, fontWeight: "700" },
  focusCard: { marginTop: 23, borderWidth: 1, borderRadius: 17, padding: 16 }, inputLabel: { fontSize: 13, fontWeight: "800", marginBottom: 9 }, focusInput: { minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 15, lineHeight: 21, fontWeight: "500" }, settingChips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, settingChip: { minHeight: 31, borderWidth: 1, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9 }, settingChipText: { fontSize: 11, fontWeight: "700" },
  error: { textAlign: "center", marginTop: 16, fontSize: 13 }, footer: { marginTop: 26 }, generateButton: { height: 55, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, generateText: { fontSize: 15, fontWeight: "800" }, footerNote: { textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: "500" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(22, 15, 20, 0.48)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { width: "100%", maxWidth: 340, borderRadius: radius.lg, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  pickerRowText: { fontSize: 15, fontWeight: "600" },
});
