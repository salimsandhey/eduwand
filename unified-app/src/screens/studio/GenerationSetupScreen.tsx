import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, GenerationOutputType, TopicDetail } from "../../api/client";
import { OUTPUT_TYPE_LABELS, OUTPUT_TYPE_CAPTIONS, OUTPUT_TYPE_ICONS } from "./generation/outputTypeMeta";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationSetup">;
// This screen's own card order (kept as designed) - labels/captions/icons
// still come from the shared map so they stay in sync with every other screen.
const SETUP_OUTPUT_ORDER: GenerationOutputType[] = ["lesson_plan", "presentation", "flashcards", "custom_activity_report"];
const OUTPUT_TYPES: { key: GenerationOutputType; label: string; caption: string; icon: keyof typeof Ionicons.glyphMap }[] =
  SETUP_OUTPUT_ORDER.map((key) => ({ key, label: OUTPUT_TYPE_LABELS[key], caption: OUTPUT_TYPE_CAPTIONS[key], icon: OUTPUT_TYPE_ICONS[key] }));
const LEARNING_GOALS = ["Understand the concept", "Explain the process", "Apply the concept"];
const LANGUAGES = ["English", "Hindi"];
const CLASS_COUNTS = [1, 2, 3, 5];
const DURATIONS = [30, 45, 60, 90];

export function GenerationSetupScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [outputType, setOutputType] = useState<GenerationOutputType>("lesson_plan");
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [classCount, setClassCount] = useState(1);
  const [minutesPerClass, setMinutesPerClass] = useState(45);
  const [customPrompt, setCustomPrompt] = useState("");
  const [learningGoals, setLearningGoals] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const selectedOutput = OUTPUT_TYPES.find((item) => item.key === outputType)!;

  useEffect(() => {
    if (!accessToken) return;
    api.getTopic(accessToken, topicId).then(setTopic).catch(() => {});
  }, [accessToken, topicId]);

  const topicMeta = topic
    ? `${capitalizeFirst(topic.subject)} · ${topic.board} · ${capitalizeFirst(topic.classSection.className)} ${capitalizeFirst(topic.classSection.sectionName)}`
    : null;

  function selectOutput(item: (typeof OUTPUT_TYPES)[number]) {
    setOutputType(item.key);
  }

  function toggleGoal(goal: string) {
    setLearningGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  }

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    const goalPrompt = learningGoals.length ? `Learning goals: ${learningGoals.join("; ")}` : "";
    const combinedPrompt = [customPrompt.trim(), goalPrompt].filter(Boolean).join("\n");
    try {
      const generation = await api.createGeneration(accessToken, topicId, {
        outputType, classCount, minutesPerClass, language, customPrompt: combinedPrompt || undefined,
      });
      navigation.replace("GenerationReview", { generationId: generation.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

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
              {topic ? "Generating for this topic. Add anything specific to include below." : "Loading your topic…"}
            </Text>
          </View>
          <Image source={require("../../../assets/decorative/decor-generation-hero.png")} style={styles.introArtwork} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>

        <View style={[styles.focusCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Anything specific to include? (optional)</Text>
          <TextInput style={[styles.focusInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={customPrompt} onChangeText={setCustomPrompt} placeholder="e.g. include a hands-on group activity, focus on real-world examples..." placeholderTextColor={colors.textMuted} multiline textAlignVertical="top" />
          <View style={styles.settingChips}>
            <SelectChip
              title="Language"
              icon="language-outline"
              value={language}
              options={LANGUAGES}
              optionLabel={(o) => o}
              onSelect={setLanguage}
            />
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
          </View>
        </View>

        <Text style={[styles.goalHeading, { color: colors.textPrimary }]}>Learning goals</Text>
        <View style={styles.goalRow}>{LEARNING_GOALS.map((goal) => { const active = learningGoals.includes(goal); return <Pressable key={goal} style={({ pressed }) => [styles.goalChip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => toggleGoal(goal)} accessibilityRole="button" accessibilityState={{ selected: active }}><Text style={[styles.goalText, { color: active ? colors.accentOn : colors.textSecondary }]}>{goal}</Text></Pressable>; })}</View>

        <View style={styles.buildHeader}><Text style={[styles.buildTitle, { color: colors.textPrimary }]}>Build your lesson</Text><Text style={[styles.buildCaption, { color: colors.textMuted }]}>Choose an output</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outputRail}>
          {OUTPUT_TYPES.map((item) => {
            const active = item.key === outputType;
            return <Pressable key={item.key} style={({ pressed }) => [styles.outputCard, { backgroundColor: colors.surface, borderColor: active ? colors.accent : colors.border }, active && styles.outputCardActive, pressed && { opacity: pressedOpacity }]} onPress={() => selectOutput(item)} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <View style={[styles.outputIcon, { backgroundColor: active ? colors.accentSoft : colors.surfaceRaised }]}><Ionicons name={item.icon} size={21} color={colors.accent} /></View>
              {active ? <View style={[styles.selectedMark, { backgroundColor: colors.accent }]}><Ionicons name="checkmark" size={12} color={colors.accentOn} /></View> : null}
              <Text style={[styles.outputTitle, { color: colors.textPrimary }]}>{item.label}</Text><Text style={[styles.outputCaption, { color: colors.textMuted }]}>{item.caption}</Text>
            </Pressable>;
          })}
        </ScrollView>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]} onPress={generate} disabled={isGenerating} accessibilityRole="button">
            {isGenerating ? <ActivityIndicator color={colors.accentOn} /> : <><Ionicons name={selectedOutput.icon} size={20} color={colors.accentOn} /><Text style={[styles.generateText, { color: colors.accentOn }]}>Create {selectedOutput.label}</Text><Ionicons name="arrow-forward" size={19} color={colors.accentOn} /></>}
          </Pressable>
          <Text style={[styles.footerNote, { color: colors.textMuted }]}>Your lesson will be saved automatically.</Text>
        </View>
      </ScrollView>
    </Screen>
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
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" }, backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" }, topCopy: { flex: 1, marginLeft: 14 }, topTitle: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 }, topSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: "500", maxWidth: 210 },
  introRow: { flexDirection: "row", alignItems: "center", marginTop: 16, minHeight: 132 }, introCopy: { flex: 1, paddingRight: 8 }, introTitle: { fontSize: 24, lineHeight: 30, letterSpacing: -0.7, fontWeight: "800" }, introText: { marginTop: 8, fontSize: 13, lineHeight: 19, fontWeight: "500" }, introArtwork: { width: 132, height: 132 },
  focusCard: { borderWidth: 1, borderRadius: 17, padding: 16 }, inputLabel: { fontSize: 13, fontWeight: "800", marginBottom: 9 }, focusInput: { minHeight: 96, borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 15, lineHeight: 21, fontWeight: "500" }, settingChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }, settingChip: { minHeight: 31, borderWidth: 1, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9 }, settingChipText: { fontSize: 11, fontWeight: "700" },
  goalHeading: { marginTop: 23, fontSize: 15, fontWeight: "800" }, goalRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }, goalChip: { minHeight: 34, borderWidth: 1, borderRadius: radius.pill, justifyContent: "center", paddingHorizontal: 12 }, goalText: { fontSize: 11, fontWeight: "700" },
  buildHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 25 }, buildTitle: { fontSize: 16, fontWeight: "800" }, buildCaption: { fontSize: 11, fontWeight: "600" }, outputRail: { gap: 12, paddingTop: 11, paddingRight: 20 }, outputCard: { width: 148, minHeight: 139, borderWidth: 1, borderRadius: 18, padding: 14 }, outputCardActive: { borderWidth: 2, padding: 13 }, outputIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, selectedMark: { position: "absolute", top: 11, right: 11, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" }, outputTitle: { marginTop: 14, fontSize: 13, lineHeight: 17, fontWeight: "800" }, outputCaption: { marginTop: 3, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  error: { textAlign: "center", marginTop: 16, fontSize: 13 }, footer: { marginTop: 26 }, generateButton: { height: 55, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, generateText: { fontSize: 15, fontWeight: "800" }, footerNote: { textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: "500" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(22, 15, 20, 0.48)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { width: "100%", maxWidth: 340, borderRadius: radius.lg, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  pickerRowText: { fontSize: 15, fontWeight: "600" },
});
