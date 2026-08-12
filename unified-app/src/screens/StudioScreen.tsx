import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, ClassSection, LessonPlan, ResearchReport } from "../api/client";

const BOARDS = ["CBSE", "ICSE", "State"];
const FORMATS = [
  { key: "lesson_plan", label: "Lesson Plan" },
  { key: "learning_material", label: "Learning Material" },
  { key: "research_report", label: "Research Report" },
];

type HistoryItem = { id: string; topic: string; board: string; label: string; content: string; createdAt: string };

export function StudioScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [topic, setTopic] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [format, setFormat] = useState(FORMATS[0].key);
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingHistory(true);
    try {
      const [plans, reports, sections] = await Promise.all([
        api.listLessonPlans(accessToken),
        api.listResearchReports(accessToken),
        api.listClassSections(accessToken),
      ]);
      setClassSections(sections);
      const merged: HistoryItem[] = [
        ...plans.map((p: LessonPlan) => ({
          id: p.id,
          topic: p.topic,
          board: p.board,
          label: p.format === "learning_material" ? "Learning Material" : "Lesson Plan",
          content: p.content,
          createdAt: p.createdAt,
        })),
        ...reports.map((r: ResearchReport) => ({
          id: r.id,
          topic: r.topic,
          board: r.board,
          label: "Research Report",
          content: r.content,
          createdAt: r.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setHistory(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  async function generate() {
    if (!accessToken || !topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      if (format === "research_report") {
        const report = await api.generateResearchReport(accessToken, { topic: topic.trim(), board });
        setResult({ id: report.id, topic: report.topic, board: report.board, label: "Research Report", content: report.content, createdAt: report.createdAt });
      } else {
        const plan = await api.generateLessonPlan(accessToken, {
          topic: topic.trim(),
          board,
          format,
          classSectionId: classSectionId ?? undefined,
        });
        setResult({
          id: plan.id,
          topic: plan.topic,
          board: plan.board,
          label: format === "learning_material" ? "Learning Material" : "Lesson Plan",
          content: plan.content,
          createdAt: plan.createdAt,
        });
      }
      setTopic("");
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Lesson Studio</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Generate lesson plans, learning material, and research reports</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Topic</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={topic}
            onChangeText={setTopic}
            placeholder="e.g. Photosynthesis"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Board</Text>
          <View style={styles.chipRow}>
            {BOARDS.map((b) => {
              const active = board === b;
              return (
                <Pressable
                  key={b}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => setBoard(b)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{b}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Format</Text>
          <View style={styles.chipRow}>
            {FORMATS.map((f) => {
              const active = format === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => setFormat(f.key)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {format !== "research_report" && classSections.length > 0 ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Class (optional)</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: !classSectionId ? colors.accent : colors.surfaceRaised, borderColor: !classSectionId ? colors.accent : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => setClassSectionId(null)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: !classSectionId ? colors.accentOn : colors.textSecondary }]}>Any</Text>
                </Pressable>
                {classSections.map((cs) => {
                  const active = classSectionId === cs.id;
                  return (
                    <Pressable
                      key={cs.id}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => setClassSectionId(cs.id)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                        {cs.className} {cs.sectionName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.generateButton,
              { backgroundColor: colors.accent },
              (isGenerating || !topic.trim() || pressed) && { opacity: pressedOpacity },
            ]}
            onPress={generate}
            disabled={isGenerating || !topic.trim()}
            accessibilityRole="button"
          >
            {isGenerating ? (
              <ActivityIndicator color={colors.accentOn} />
            ) : (
              <View style={styles.buttonInner}>
                <Ionicons name="sparkles-outline" size={18} color={colors.accentOn} />
                <Text style={[styles.generateButtonText, { color: colors.accentOn }]}>Generate</Text>
              </View>
            )}
          </Pressable>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {result ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultLabel, { color: colors.accent, backgroundColor: colors.accent + "15" }]}>{result.label}</Text>
              <Pressable onPress={() => setResult(null)} hitSlop={8}>
                <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{result.topic}</Text>
            <Text selectable style={[styles.resultContent, { color: colors.textSecondary }]}>
              {result.content}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>History</Text>
        {isLoadingHistory ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : history.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>Nothing generated yet</Text>
        ) : (
          history.map((h) => (
            <Pressable
              key={h.id}
              style={({ pressed }) => [styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              onPress={() => setResult(h)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyTopic, { color: colors.textPrimary }]} numberOfLines={1}>
                  {h.topic}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>
                  {h.label} · {h.board} · {new Date(h.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  generateButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultLabel: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  resultTitle: { fontSize: 17, fontWeight: "800", marginTop: 8, marginBottom: 10 },
  resultContent: { fontSize: 13, lineHeight: 20 },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  meta: { fontSize: 12, marginBottom: 8 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  historyTopic: { fontSize: 14, fontWeight: "700" },
});
