import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, Pressable } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { parseGenerationContent } from "../studio/generation/content";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, StudentMaterial } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setMaterials(await api.listStudentMaterials(accessToken));
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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{capitalizeFirst(item.topic.name)}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                    {OUTPUT_TYPE_LABELS[item.outputType] ?? item.outputType} · {capitalizeFirst(item.topic.subject)}
                  </Text>
                  {summaryFor(item) ? <Text style={[styles.body, { color: colors.textSecondary }]}>{summaryFor(item)}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        />
      )}
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
  card: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  body: { fontSize: 12, marginTop: 8, lineHeight: 17 },
});
