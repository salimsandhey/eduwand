import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Topic, TopicDetail, ContextSource } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "ImportContext">;

const SOURCE_TYPE_ICONS: Record<ContextSource["sourceType"], keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  docx: "document-text-outline",
  pptx: "easel-outline",
  image: "image-outline",
  url: "link-outline",
  youtube: "logo-youtube",
  idream_k12: "library-outline",
};

export function ImportContextScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [currentTopic, setCurrentTopic] = useState<TopicDetail | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceTopic, setSourceTopic] = useState<TopicDetail | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const topic = await api.getTopic(accessToken, topicId);
        setCurrentTopic(topic);
        const all = await api.listTopics(accessToken, { subject: topic.subject });
        setTopics(all.filter((t) => t.id !== topicId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load topics");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, topicId]);

  async function openSourceTopic(topic: Topic) {
    if (!accessToken) return;
    setIsLoadingSource(true);
    setError(null);
    try {
      const detail = await api.getTopic(accessToken, topic.id);
      setSourceTopic(detail);
      setSelectedIds(detail.contextSources.map((s) => s.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topic");
    } finally {
      setIsLoadingSource(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function importSelected() {
    if (!accessToken || !sourceTopic || selectedIds.length === 0) return;
    setIsImporting(true);
    setError(null);
    try {
      await api.importTopicContext(accessToken, topicId, { sourceTopicId: sourceTopic.id, contextSourceIds: selectedIds });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  const backAction = sourceTopic ? () => setSourceTopic(null) : () => navigation.goBack();

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={backAction}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Import context</Text>
          <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {sourceTopic ? `From "${capitalizeFirst(sourceTopic.name)}"` : "Reuse sources from another topic you taught"}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : !sourceTopic ? (
        <ScrollView contentContainerStyle={styles.content}>
          {topics.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="copy-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No other topics yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Once you've built context on another topic, you can copy it in here.
              </Text>
            </View>
          ) : (
            topics.map((topic) => (
              <Pressable
                key={topic.id}
                style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
                onPress={() => openSourceTopic(topic)}
                disabled={isLoadingSource}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{capitalizeFirst(topic.name)}</Text>
                  <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                    {capitalizeFirst(topic.subject)} · {topic.board}
                    {topic.classSection ? ` · ${capitalizeFirst(topic.classSection.className)} ${capitalizeFirst(topic.classSection.sectionName)}` : ""}
                  </Text>
                </View>
                {isLoadingSource ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {sourceTopic.contextSources.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="layers-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No sources on this topic</Text>
              </View>
            ) : (
              sourceTopic.contextSources.map((source) => {
                const selected = selectedIds.includes(source.id);
                const label = source.originalFilename ?? source.sourceUrl ?? source.idreamK12ReferenceId ?? source.sourceType;
                return (
                  <Pressable
                    key={source.id}
                    style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
                    onPress={() => toggleSelected(source.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons name={SOURCE_TYPE_ICONS[source.sourceType]} size={17} color={colors.accent} />
                    <Text style={[styles.rowTitle, { color: colors.textPrimary, marginLeft: 10, flex: 1 }]} numberOfLines={1}>{label}</Text>
                    <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={20} color={selected ? colors.accent : colors.textMuted} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
          {sourceTopic.contextSources.length > 0 ? (
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: colors.accent },
                  (isImporting || selectedIds.length === 0 || pressed) && { opacity: pressedOpacity },
                ]}
                onPress={importSelected}
                disabled={isImporting || selectedIds.length === 0}
                accessibilityRole="button"
              >
                {isImporting ? (
                  <ActivityIndicator color={colors.accentOn} />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>
                    Import {selectedIds.length} source{selectedIds.length === 1 ? "" : "s"}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1 },
  topTitle: { fontSize: 19, fontWeight: "800" },
  topSubtitle: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, minHeight: 54 },
  rowTitle: { fontSize: 14, fontWeight: "700" },
  rowSubtitle: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptyText: { fontSize: 13, textAlign: "center", maxWidth: 260, lineHeight: 18 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  primaryButton: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
});
