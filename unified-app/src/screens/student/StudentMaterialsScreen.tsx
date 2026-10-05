import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, Pressable } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { parseGenerationContent } from "../studio/generation/content";
import { OUTPUT_TYPE_ICONS, OUTPUT_TYPE_LABELS } from "../studio/generation/outputTypeMeta";
import type { GenerationOutputType } from "../../api/client";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, StudentMaterial, StudentVideo } from "../../api/client";
import { VideoPlayerModal } from "../../components/VideoPlayerModal";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

function summaryFor(item: StudentMaterial): string | null {
  const parsed = parseGenerationContent(item.outputType, item.content);
  if (parsed?.type === "flashcards") return `${parsed.cards.length} cards`;
  if (parsed?.type === "presentation") return `${parsed.slides.length} slides`;
  return null;
}

export function StudentMaterialsScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const [materials, setMaterials] = useState<StudentMaterial[]>([]);
  const [videos, setVideos] = useState<StudentVideo[]>([]);
  const [watchingVideoId, setWatchingVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [materialRows, videoRows] = await Promise.all([api.listStudentMaterials(accessToken), api.listStudentVideos(accessToken).catch(() => [])]);
      setMaterials(materialRows);
      setVideos(videoRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load materials");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Materials</Text>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={materials}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarClearance }]}
          onScroll={handleTabBarScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            videos.length > 0 ? (
              <View style={styles.videoSection}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Videos from your teacher</Text>
                {videos.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => setWatchingVideoId(v.videoId)}
                    style={({ pressed }) => [styles.videoCard, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Watch ${v.title}`}
                  >
                    <Image source={{ uri: v.thumbnailUrl }} style={styles.videoThumb} resizeMode="cover" />
                    <View style={styles.videoCopy}>
                      <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{v.title}</Text>
                      <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {capitalizeFirst(v.topic.name)} · {v.channelTitle}
                      </Text>
                    </View>
                    <Ionicons name="play-circle" size={26} color={colors.accent} />
                  </Pressable>
                ))}
                <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>Lesson materials</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Image source={decorativeAssets.book} style={styles.emptyGraphic} resizeMode="contain" />
              <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing shared yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("StudentMaterialDetail", { material: item })}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderWidth: 0, borderLeftColor: colors.accent },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.topic.name}`}
            >
              <View style={styles.cardRow}>
                <View style={[styles.typeTile, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={OUTPUT_TYPE_ICONS[item.outputType as GenerationOutputType] ?? "document-text-outline"} size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{capitalizeFirst(item.topic.name)}</Text>
                  <View style={styles.chipRow}>
                    <View style={[styles.chip, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.chipText, { color: colors.accent }]}>{OUTPUT_TYPE_LABELS[item.outputType as GenerationOutputType] ?? item.outputType}</Text>
                    </View>
                    <View style={[styles.chip, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{capitalizeFirst(item.topic.subject)}</Text>
                    </View>
                  </View>
                  {summaryFor(item) ? (
                    <View style={styles.summaryRow}>
                      <Ionicons name="layers-outline" size={13} color={colors.textMuted} />
                      <Text style={[styles.body, { color: colors.textSecondary }]}>{summaryFor(item)}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.openButton, { backgroundColor: colors.accent }]}>
                  <Ionicons name="chevron-forward" size={16} color={colors.accentOn} />
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      <VideoPlayerModal videoId={watchingVideoId} title={videos.find((v) => v.videoId === watchingVideoId)?.title ?? ""} onClose={() => setWatchingVideoId(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  error: { textAlign: "center", marginTop: 12 },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyGraphic: { width: 86, height: 86 },
  empty: { textAlign: "center" },
  card: { borderRadius: 18, padding: 14, borderWidth: 0 },
  typeTile: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 11, fontWeight: "700" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  body: { fontSize: 12, lineHeight: 17 },
  openButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  videoSection: { gap: 12, marginBottom: 4 },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  videoCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 10 },
  videoThumb: { width: 96, height: 56, borderRadius: 10, backgroundColor: "#00000012" },
  videoCopy: { flex: 1 },
});
