import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Assignment } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

type Props = CompositeScreenProps<
  BottomTabScreenProps<TeacherTabParamList, "Assignment">,
  NativeStackScreenProps<RootStackParamList>
>;

export function AssignmentScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setAssignments(await api.listAssignments(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
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
        <Text style={[styles.title, { color: colors.textPrimary }]}>Assignment Lab</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
        </Text>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={assignments}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Image source={decorativeAssets.book} style={styles.emptyGraphic} resizeMode="contain" />
              <Text style={[styles.empty, { color: colors.textMuted }]}>No assignments yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.accent },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => navigation.navigate("AssignmentDetail", { assignmentId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.statusBadge,
                    { color: item.status === "published" ? colors.accent : colors.textMuted, backgroundColor: colors.surfaceRaised },
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <View style={styles.cardMetaRow}>
                <Ionicons name="help-circle-outline" size={13} color={colors.textMuted} />
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                  {item.questions.length} question{item.questions.length === 1 ? "" : "s"}
                  {item.personalisationEnabled ? " · Personalised" : ""}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <View style={styles.fabContainer}>
        <Pressable
          onPress={() => navigation.navigate("CreateAssignment")}
          style={[styles.fab, { backgroundColor: colors.accent }, cardShadow]}
          accessibilityRole="button"
          accessibilityLabel="Create assignment"
        >
          <Ionicons name="add" size={24} color={colors.accentOn} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  error: { textAlign: "center", marginTop: 12 },
  list: { padding: 16, gap: 12, flexGrow: 1, paddingBottom: 132 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyGraphic: { width: 86, height: 86 },
  empty: { textAlign: "center" },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  statusBadge: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  cardMeta: { fontSize: 12 },
  fabContainer: { position: "absolute", bottom: 112, right: 24 },
  fab: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", elevation: 4 },
});
