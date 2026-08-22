import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { radius, spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, GenerationOutputType } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationSetup">;

const OUTPUT_TYPES: { key: GenerationOutputType; label: string; caption: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "lesson_plan", label: "Lesson plan", caption: "Teach with a clear flow", icon: "book-outline" },
  { key: "custom_activity_report", label: "Activity", caption: "Create classroom practice", icon: "color-palette-outline" },
  { key: "flashcards", label: "Flashcards", caption: "Quick recall practice", icon: "albums-outline" },
  { key: "presentation", label: "Presentation", caption: "Explain visually", icon: "easel-outline" },
];

const LANGUAGES = ["English", "Hindi"];
const CLASS_COUNTS = [1, 2, 3, 5];
const DURATIONS = [30, 45, 60, 90];

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

  async function generate() {
    if (!accessToken) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generation = await api.createGeneration(accessToken, topicId, { outputType, mode, classCount, minutesPerClass, language, customPrompt: customPrompt.trim() || undefined });
      navigation.replace("GenerationReview", { generationId: generation.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const selectedOutput = OUTPUT_TYPES.find((item) => item.key === outputType)!;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.goBack()} accessibilityRole="button"><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></Pressable>
          <View style={styles.topCopy}><Text style={[styles.topTitle, { color: colors.textPrimary }]}>Lesson with AI</Text><Text style={[styles.topSubtitle, { color: colors.textMuted }]}>Create something for your next class.</Text></View>
          <View style={[styles.aiCircle, { backgroundColor: colors.accent }]}><Ionicons name="sparkles" size={17} color={colors.accentOn} /></View>
        </View>

        <View style={[styles.hero, { backgroundColor: colors.surfaceAccent }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}><Ionicons name="sparkles-outline" size={24} color={colors.accentOn} /></View>
          <View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.textPrimary }]}>What would you like to create?</Text><Text style={[styles.heroText, { color: colors.textMuted }]}>Choose a format and tailor it for your class.</Text></View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Choose an output</Text>
        <View style={styles.outputGrid}>
          {OUTPUT_TYPES.map((item) => {
            const active = item.key === outputType;
            return <Pressable key={item.key} style={({ pressed }) => [styles.outputCard, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]} onPress={() => setOutputType(item.key)} accessibilityRole="button" accessibilityState={{ selected: active }}><View style={[styles.outputIcon, { backgroundColor: active ? colors.accent : colors.surfaceRaised }]}><Ionicons name={item.icon} size={19} color={active ? colors.accentOn : colors.accent} /></View><Text style={[styles.outputTitle, { color: colors.textPrimary }]}>{item.label}</Text><Text style={[styles.outputCaption, { color: colors.textMuted }]}>{item.caption}</Text></Pressable>;
          })}
        </View>

        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lesson settings</Text><Text style={[styles.sectionHelper, { color: colors.textMuted }]}>Adjust the generated result</Text></View>
        <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <SettingRow colors={colors} label="Generation mode" icon="sparkles-outline"><OptionPill active={mode === "generate"} label="Generate" onPress={() => setMode("generate")} /><OptionPill active={mode === "plan"} label="Outline" onPress={() => setMode("plan")} /></SettingRow>
          <SettingRow colors={colors} label="Language" icon="language-outline">{LANGUAGES.map((item) => <OptionPill key={item} active={language === item} label={item} onPress={() => setLanguage(item)} />)}</SettingRow>
          <SettingRow colors={colors} label="Classes covered" icon="people-outline">{CLASS_COUNTS.map((item) => <OptionPill key={item} active={classCount === item} label={String(item)} onPress={() => setClassCount(item)} />)}</SettingRow>
          <SettingRow colors={colors} label="Minutes per class" icon="time-outline">{DURATIONS.map((item) => <OptionPill key={item} active={minutesPerClass === item} label={`${item}m`} onPress={() => setMinutesPerClass(item)} />)}</SettingRow>
        </View>

        <View style={[styles.promptCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.promptHeader}><View style={[styles.promptIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.accent} /></View><View><Text style={[styles.promptTitle, { color: colors.textPrimary }]}>Add a teaching note</Text><Text style={[styles.promptSubtitle, { color: colors.textMuted }]}>Optional instruction for the AI</Text></View></View>
          <TextInput style={[styles.promptInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]} value={customPrompt} onChangeText={setCustomPrompt} placeholder="For example: include a hands-on group activity..." placeholderTextColor={colors.textMuted} multiline textAlignVertical="top" />
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <Pressable style={({ pressed }) => [styles.generateButton, { backgroundColor: colors.accent }, (isGenerating || pressed) && { opacity: pressedOpacity }]} onPress={generate} disabled={isGenerating} accessibilityRole="button">
          {isGenerating ? <ActivityIndicator color={colors.accentOn} /> : <><Ionicons name={selectedOutput.icon} size={20} color={colors.accentOn} /><Text style={[styles.generateText, { color: colors.accentOn }]}>Generate {selectedOutput.label}</Text><Ionicons name="arrow-forward" size={19} color={colors.accentOn} /></>}
        </Pressable>
        <Text style={[styles.footerHint, { color: colors.textMuted }]}>You can review and edit the result before using it.</Text>
      </View>
    </Screen>
  );
}

function SettingRow({ colors, label, icon, children }: { colors: any; label: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) { return <View style={styles.settingRow}><View style={styles.settingLabel}><Ionicons name={icon} size={16} color={colors.accent} /><Text style={[styles.settingText, { color: colors.textPrimary }]}>{label}</Text></View><View style={styles.optionRow}>{children}</View></View>; }
function OptionPill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { const { colors, pressedOpacity } = useTheme(); return <Pressable style={({ pressed }) => [styles.optionPill, { backgroundColor: active ? colors.accentSoft : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }, pressed && { opacity: pressedOpacity }]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}><Text style={[styles.optionText, { color: active ? colors.accent : colors.textMuted }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 108 }, topBar: { minHeight: 56, flexDirection: "row", alignItems: "center" }, backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" }, topCopy: { flex: 1, marginLeft: 14 }, topTitle: { fontSize: 21, fontWeight: "800", letterSpacing: -0.5 }, topSubtitle: { marginTop: 1, fontSize: 12, lineHeight: 16, fontWeight: "500" }, aiCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, hero: { flexDirection: "row", alignItems: "center", borderRadius: 20, padding: 20, marginTop: 15, marginBottom: 25 }, heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1, marginLeft: 14 }, heroTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.4 }, heroText: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: "500" }, sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: "800" }, outputGrid: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginTop: 13 }, outputCard: { width: "48%", minHeight: 130, borderWidth: 1, borderRadius: 17, padding: 14 }, outputIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 14 }, outputTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" }, outputCaption: { marginTop: 3, fontSize: 11, lineHeight: 15, fontWeight: "500" }, sectionHeader: { marginTop: 27, marginBottom: 12 }, sectionHelper: { marginTop: 2, fontSize: 12, fontWeight: "500" }, settingsCard: { borderWidth: 1, borderRadius: 19, padding: 16 }, settingRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(117,108,114,0.16)" }, settingLabel: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }, settingText: { fontSize: 13, fontWeight: "700" }, optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, optionPill: { minHeight: 33, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, optionText: { fontSize: 12, fontWeight: "700" }, promptCard: { borderWidth: 1, borderRadius: 19, padding: 16, marginTop: 16 }, promptHeader: { flexDirection: "row", alignItems: "center" }, promptIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, promptTitle: { marginLeft: 10, fontSize: 14, fontWeight: "800" }, promptSubtitle: { marginLeft: 10, marginTop: 2, fontSize: 11, fontWeight: "500" }, promptInput: { minHeight: 94, marginTop: 15, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 19 }, error: { marginTop: 12, textAlign: "center", fontSize: 13 }, footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }, generateButton: { height: 56, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, generateText: { fontSize: 16, fontWeight: "800" }, footerHint: { textAlign: "center", marginTop: 8, fontSize: 11, fontWeight: "500" },
});
