import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, TopicDetail } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "TopicDetail">;

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
  explanatory_video: "Explanatory Video",
};

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

  const [contextUrl, setContextUrl] = useState("");
  const [showAddContext, setShowAddContext] = useState(false);
  const [isAddingContext, setIsAddingContext] = useState(false);

  const [observationText, setObservationText] = useState("");
  const [showAddObservation, setShowAddObservation] = useState(false);
  const [isAddingObservation, setIsAddingObservation] = useState(false);

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

  async function addContext() {
    if (!accessToken || !contextUrl.trim()) return;
    setIsAddingContext(true);
    setError(null);
    try {
      await api.addTopicContextUrl(accessToken, topicId, { sourceType: "url", sourceUrl: contextUrl.trim() });
      setContextUrl("");
      setShowAddContext(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add context");
    } finally {
      setIsAddingContext(false);
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {/* Context sources */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Context</Text>
            <Pressable onPress={() => setShowAddContext((v) => !v)} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.accent }]}>{showAddContext ? "Cancel" : "+ Add URL"}</Text>
            </Pressable>
          </View>
          <Text style={[styles.meta, { color: colors.textMuted, marginTop: 2 }]}>
            iDream K12 content library is not connected yet - add a URL, or bring your own file when upload support lands.
          </Text>
          {showAddContext ? (
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
                onPress={addContext}
                disabled={isAddingContext || !contextUrl.trim()}
                accessibilityRole="button"
              >
                {isAddingContext ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Add</Text>}
              </Pressable>
            </View>
          ) : null}
          {topic.contextSources.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8 }]}>No context added yet.</Text>
          ) : (
            topic.contextSources.map((c) => (
              <View key={c.id} style={[styles.listRow, { borderColor: colors.border }]}>
                <Ionicons name="link-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.meta, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {c.sourceUrl ?? c.fileLocation ?? c.idreamK12ReferenceId ?? c.sourceType}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Generations */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Generations</Text>
          {topic.generations.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted, marginTop: 8 }]}>Nothing generated for this topic yet.</Text>
          ) : (
            topic.generations.map((g) => (
              <Pressable
                key={g.id}
                style={({ pressed }) => [styles.listRow, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                onPress={() => navigation.navigate("GenerationReview", { generationId: g.id })}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.meta, { color: colors.textPrimary, fontWeight: "700" }]}>{OUTPUT_TYPE_LABELS[g.outputType] ?? g.outputType}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>
                    {g.generationStatus === "failed" ? "Failed - tap to retry" : new Date(g.generatedAt).toLocaleDateString()}
                    {g.editedOutput ? " · edited" : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>

        {/* Observations */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
              <View key={o.id} style={[styles.listRow, { borderColor: colors.border, alignItems: "flex-start" }]}>
                <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{o.body}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted, fontSize: 10 }]}>{new Date(o.recordedAt).toLocaleDateString()}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  meta: { fontSize: 12 },
  generateButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, height: 46, marginBottom: 10 },
  generateButtonText: { fontSize: 14, fontWeight: "700" },
  linkRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  secondaryLink: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, height: 40 },
  secondaryLinkText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  link: { fontWeight: "700", fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44, fontSize: 14 },
  multilineInput: { height: 80, textAlignVertical: "top" },
  smallButton: { borderRadius: 8, height: 40, alignItems: "center", justifyContent: "center", marginTop: 8 },
  smallButtonText: { fontSize: 13, fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
});
