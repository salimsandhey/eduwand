import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { capitalizeFirst } from "../../utils/text";
import { parseGenerationContent } from "../studio/generation/content";
import { LessonPlanView } from "../studio/generation/LessonPlanView";
import { CustomActivityView } from "../studio/generation/CustomActivityView";
import { FlashcardsView } from "../studio/generation/FlashcardsView";
import { PresentationView } from "../studio/generation/PresentationView";

type Props = NativeStackScreenProps<RootStackParamList, "StudentMaterialDetail">;

export const MATERIAL_TYPE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

const noop = () => {};

// Read-only view of something a teacher shared. Reuses the teacher's
// renderers with editing off, so a student sees the same layout.
export function StudentMaterialDetailScreen({ route, navigation }: Props) {
  const { material } = route.params;
  const { colors, pressedOpacity } = useTheme();
  const content = useMemo(() => parseGenerationContent(material.outputType, material.content), [material]);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.topBarCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {capitalizeFirst(material.topic.name)}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {MATERIAL_TYPE_LABELS[material.outputType] ?? material.outputType} · {capitalizeFirst(material.topic.subject)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {content?.type === "lesson_plan" ? (
          <LessonPlanView content={content} editable={false} onChange={noop} sources={[]} topicId={material.topic.id} />
        ) : content?.type === "custom_activity_report" ? (
          <CustomActivityView content={content} editable={false} onChange={noop} />
        ) : content?.type === "flashcards" ? (
          <FlashcardsView content={content} editable={false} onChange={noop} />
        ) : content?.type === "presentation" ? (
          <PresentationView content={content} editable={false} onChange={noop} />
        ) : (
          <Text style={[styles.plain, { color: colors.textSecondary }]}>{material.content}</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarCopy: { flex: 1 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { fontSize: 12, marginTop: 1 },
  content: { padding: 16, paddingBottom: 32 },
  plain: { fontSize: 14, lineHeight: 21 },
});
