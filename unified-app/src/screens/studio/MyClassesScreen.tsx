import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, ClassSection } from "../../api/client";

type Props = CompositeScreenProps<BottomTabScreenProps<TeacherTabParamList, "Studio">, NativeStackScreenProps<RootStackParamList>>;

// Entry point for Lesson Studio (client build doc, workflow step 1: "teacher
// logs in and select/filter the class"). Shows only the classes school admin
// has assigned this teacher to (backend/src/routes/class-sections.ts scopes
// GET /class-sections by teacherAssignments when the caller is a teacher).
// Tapping a class drills into TopicListScreen, scoped to that class section.
export function MyClassesScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.titleSection}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Lesson Studio</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Select a class to continue</Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : classSections.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            No classes assigned yet — ask your school admin to assign you to a class.
          </Text>
        ) : (
          classSections.map((cs) => (
            <Pressable
              key={cs.id}
              style={({ pressed }) => [styles.classRow, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow, pressed && { opacity: pressedOpacity }]}
              onPress={() =>
                navigation.navigate("TopicList", { classSectionId: cs.id, className: cs.className, sectionName: cs.sectionName })
              }
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.className, { color: colors.textPrimary }]}>
                  {cs.className} {cs.sectionName}
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
  error: { textAlign: "center", marginBottom: 12 },
  meta: { fontSize: 13, marginTop: 4 },
  classRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  className: { fontSize: 16, fontWeight: "700" },
});
