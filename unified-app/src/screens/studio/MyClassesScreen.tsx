import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
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
import { decorativeAssets } from "../../theme/decorativeAssets";

type Props = CompositeScreenProps<BottomTabScreenProps<TeacherTabParamList, "Studio">, NativeStackScreenProps<RootStackParamList>>;

// Purely decorative per-card icon/color cycling - not standing in for any
// real per-class data (a class section has no single "subject" - subject is
// chosen per-topic, since more than one teacher can teach the same class).
const CLASS_CARD_ACCENTS = ["#8B5CF6", "#4F8EF7", "#3DDC97"] as const;
const CLASS_CARD_ICONS = ["sparkles-outline", "flask-outline", "globe-outline"] as const;

interface ClassCardStats {
  studentCount: number;
  topicCount: number;
}

function getClassCardMeta(index: number) {
  return {
    accent: CLASS_CARD_ACCENTS[index % CLASS_CARD_ACCENTS.length],
    icon: CLASS_CARD_ICONS[index % CLASS_CARD_ICONS.length],
  };
}

// Entry point for Lesson Studio (client build doc, workflow step 1: "teacher
// logs in and select/filter the class"). Shows only the classes school admin
// has assigned this teacher to (backend/src/routes/class-sections.ts scopes
// GET /class-sections by teacherAssignments when the caller is a teacher).
// Tapping a class drills into TopicListScreen, scoped to that class section.
export function MyClassesScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classStats, setClassStats] = useState<Record<string, ClassCardStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);

      // A handful of classes per teacher in practice - one parallel call per
      // class for its real student/topic counts, not a fabricated number.
      const statsEntries = await Promise.all(
        sections.map(async (cs) => {
          const [studentsRes, topics] = await Promise.all([
            api.listStudents(accessToken, cs.id),
            api.listTopics(accessToken, { classSectionId: cs.id }),
          ]);
          const studentCount = studentsRes.data?.length ?? 0;
          return [cs.id, { studentCount, topicCount: topics.length }] as const;
        })
      );
      setClassStats(Object.fromEntries(statsEntries));
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [
              styles.circleButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back to home"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>

          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Studio</Text>

          <Pressable
            onPress={() => navigation.navigate("Assignment")}
            style={({ pressed }) => [styles.filledCircleButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Open assignments"
          >
            <Ionicons name="document-text-outline" size={20} color={colors.accentOn} />
          </Pressable>
        </View>

        <View style={styles.heroSection}>
          <View pointerEvents="none" style={styles.heroImageWrap}>
            <Image source={decorativeAssets.studioTeacher} style={styles.heroImage} resizeMode="contain" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>My Classes</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>Choose a class to continue.</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Your Classes ({classSections.length})</Text>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : classSections.length === 0 ? null : (
          classSections.map((cs, index) => {
            const meta = getClassCardMeta(index);
            const stats = classStats[cs.id];
            return (
              <Pressable
                key={cs.id}
                style={({ pressed }) => [
                  styles.classCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  cardShadow,
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() =>
                  navigation.navigate("TopicList", { classSectionId: cs.id, className: cs.className, sectionName: cs.sectionName })
                }
                accessibilityRole="button"
              >
                <View style={[styles.classAccentBar, { backgroundColor: meta.accent }]} />
                <View style={[styles.classIconWrap, { backgroundColor: `${meta.accent}12`, borderColor: `${meta.accent}22` }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.accent} />
                </View>
                <View style={styles.classCopy}>
                  <Text style={[styles.classTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {cs.className.replace("Grade", "Class")} {cs.sectionName}
                  </Text>
                  <View style={styles.classMetaRow}>
                    <View style={styles.studentMetaRow}>
                      <Ionicons name="people" size={13} color={colors.textMuted} />
                      <Text style={[styles.studentMetaText, { color: colors.textMuted }]}>
                        {stats ? `${stats.studentCount} student${stats.studentCount === 1 ? "" : "s"}` : "…"}
                      </Text>
                    </View>
                    <View style={styles.studentMetaRow}>
                      <Ionicons name="book-outline" size={13} color={colors.textMuted} />
                      <Text style={[styles.studentMetaText, { color: colors.textMuted }]}>
                        {stats ? `${stats.topicCount} topic${stats.topicCount === 1 ? "" : "s"}` : "…"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.accent} />
              </Pressable>
            );
          })
        )}

        {!isLoading && classSections.length === 0 ? (
          <View style={[styles.emptyStateCard, { borderColor: colors.border }]}>
            <Image source={decorativeAssets.paperPlane} style={styles.emptyStateGraphic} resizeMode="contain" />
            <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>No classes assigned yet</Text>
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
              Ask your school admin to assign you to a class.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 132,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  filledCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSection: {
    position: "relative",
    marginTop: spacing.sm,
    justifyContent: "flex-end",
    paddingBottom: spacing.lg,
  },
  heroCopy: {
    maxWidth: "62%",
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  heroImageWrap: {
    position: "absolute",
    right: -28,
    top: -58,
    width: 228,
    height: 228,
    zIndex: -1,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  sectionLabel: {
    marginTop: 6,
    marginBottom: spacing.md,
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  classCard: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg + 4,
    paddingRight: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  classAccentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  classIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  classCopy: {
    flex: 1,
  },
  classTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  classMetaRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 5,
  },
  studentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  studentMetaText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyStateCard: {
    marginTop: spacing.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: radius.lg + 12,
    minHeight: 290,
    paddingHorizontal: 28,
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateGraphic: {
    width: 120,
    height: 120,
    marginBottom: spacing.lg,
  },
  emptyStateTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyStateText: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "500",
    textAlign: "center",
  },
});
