import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, StudentMaterial } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

// Students Dashboard, materials view (client doc section 5). See
// student-portal.ts's /student/materials note: "distributed" isn't a real
// gate yet, so this shows every succeeded generation for the student's class.
export function StudentMaterialsScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow } = useTheme();
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
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Image source={decorativeAssets.book} style={styles.emptyGraphic} resizeMode="contain" />
              <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing shared yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.accent }, cardShadow]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.topic.name}</Text>
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                {OUTPUT_TYPE_LABELS[item.outputType] ?? item.outputType} · {item.topic.subject}
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={4}>
                {item.content}
              </Text>
            </View>
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
  list: { padding: 16, gap: 12, flexGrow: 1, paddingBottom: 132 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyGraphic: { width: 86, height: 86 },
  empty: { textAlign: "center" },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  body: { fontSize: 12, marginTop: 8, lineHeight: 17 },
});
