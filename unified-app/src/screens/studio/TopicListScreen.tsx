import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, Topic } from "../../api/client";

const BOARDS = ["CBSE", "ICSE", "IB"];

type Props = NativeStackScreenProps<RootStackParamList, "TopicList">;

// Second step of Lesson Studio, after MyClassesScreen (Docs/Client/EduWand_AI_Module
// build doc, workflow step 1: "select/filter the class"). Scoped to the class
// section chosen on the previous screen - a teacher picks or creates a Topic
// here; everything else (context, generations, observations) hangs off that
// Topic from TopicDetailScreen onward.
export function TopicListScreen({ navigation, route }: Props) {
  const { classSectionId, className, sectionName } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewTopic, setShowNewTopic] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const topicList = await api.listTopics(accessToken, { classSectionId });
      setTopics(topicList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topics");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, classSectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function createTopic() {
    if (!accessToken || !name.trim() || !subject.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const topic = await api.createTopic(accessToken, { classSectionId, subject: subject.trim(), name: name.trim(), board });
      setShowNewTopic(false);
      setName("");
      setSubject("");
      navigation.navigate("TopicDetail", { topicId: topic.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {className} {sectionName}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Pick a topic to continue, or start a new one</Text>
        </View>

        {showNewTopic ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Topic name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Photosynthesis"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Subject</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Science"
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

            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                { backgroundColor: colors.accent },
                (isCreating || !name.trim() || !subject.trim() || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={createTopic}
              disabled={isCreating || !name.trim() || !subject.trim()}
              accessibilityRole="button"
            >
              {isCreating ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.createButtonText, { color: colors.accentOn }]}>Start topic</Text>}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.newTopicButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={() => setShowNewTopic(true)}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.accentOn} />
            <Text style={[styles.newTopicButtonText, { color: colors.accentOn }]}>New topic</Text>
          </Pressable>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your topics</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : topics.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>No topics yet - start one above.</Text>
        ) : (
          topics.map((t) => (
            <Pressable
              key={t.id}
              style={({ pressed }) => [styles.topicRow, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.navigate("TopicDetail", { topicId: t.id })}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.topicName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]} numberOfLines={1}>
                  {t.subject} · {t.board} · {new Date(t.updatedAt).toLocaleDateString()}
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
  content: { padding: 16, paddingBottom: 132 },
  titleSection: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: radius.sm, padding: 10, height: 44, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  createButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  createButtonText: { fontSize: 14, fontWeight: "700" },
  newTopicButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, height: 46, marginBottom: 16 },
  newTopicButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  meta: { fontSize: 12, marginBottom: 8 },
  topicRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  topicName: { fontSize: 14, fontWeight: "700" },
});
