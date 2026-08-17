import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ClassSection, Topic } from "../../api/client";

const BOARDS = ["CBSE", "ICSE", "IB"];

type Props = CompositeScreenProps<BottomTabScreenProps<TeacherTabParamList, "Studio">, NativeStackScreenProps<RootStackParamList>>;

// Entry point for Lesson Studio (Docs/Dev/AI_Module_Rebuild_Plan.md Phase 1/2)
// - replaces the old direct-generate StudioScreen. A teacher picks or creates
// a Topic here first; everything else (context, generations, observations)
// hangs off that Topic from TopicDetailScreen onward.
export function TopicListScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewTopic, setShowNewTopic] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [sections, topicList] = await Promise.all([api.listClassSections(accessToken), api.listTopics(accessToken)]);
      setClassSections(sections);
      setTopics(topicList);
      if (!classSectionId && sections.length > 0) setClassSectionId(sections[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topics");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function createTopic() {
    if (!accessToken || !name.trim() || !subject.trim() || !classSectionId) return;
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Lesson Studio</Text>
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

            {classSections.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Class</Text>
                <View style={styles.chipRow}>
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
                styles.createButton,
                { backgroundColor: colors.accent },
                (isCreating || !name.trim() || !subject.trim() || !classSectionId || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={createTopic}
              disabled={isCreating || !name.trim() || !subject.trim() || !classSectionId}
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
              style={({ pressed }) => [styles.topicRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.navigate("TopicDetail", { topicId: t.id })}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.topicName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 0 }]}>
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
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  createButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 18 },
  createButtonText: { fontSize: 14, fontWeight: "700" },
  newTopicButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, height: 46, marginBottom: 16 },
  newTopicButtonText: { fontSize: 14, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 10, letterSpacing: 0.2, textTransform: "uppercase" },
  meta: { fontSize: 12, marginBottom: 8 },
  topicRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  topicName: { fontSize: 14, fontWeight: "700" },
});
