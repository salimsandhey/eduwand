import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Assessment } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AssessmentReady">;

// The step between "AI generated the quiz" and "the class is actually
// running" - previously missing entirely, so a teacher landed straight in a
// question-capture screen with no idea a live "present on a screen" mode
// existed. This is where that choice is made, explicitly, every time.
export function AssessmentReadyScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setAssessment(await api.getAssessment(accessToken, assessmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quick check");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, assessmentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (isLoading && !assessment) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!assessment) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Quick check not found"}</Text>
      </Screen>
    );
  }

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
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Quick check ready</Text>
      </View>

      <View style={styles.content}>
        <View style={[styles.summaryCard, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.textPrimary }]} numberOfLines={2}>{assessment.title}</Text>
            <Text style={[styles.summarySubtitle, { color: colors.textSecondary }]}>
              {assessment.questions.length} question{assessment.questions.length === 1 ? "" : "s"} ready to run
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>How do you want to run it?</Text>

        <Pressable
          style={({ pressed }) => [styles.optionCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("PresentLaunch", { assessmentId })}
          accessibilityRole="button"
        >
          <View style={[styles.optionIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="tv-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.optionTitleRow}>
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Present on a screen</Text>
              <View style={[styles.recommendedBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.recommendedBadgeText, { color: colors.accentOn }]}>Recommended</Text>
              </View>
            </View>
            <Text style={[styles.optionCaption, { color: colors.textMuted }]}>
              Project the quiz for the whole class and see live results as students answer.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.optionCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("AssessmentCapture", { assessmentId })}
          accessibilityRole="button"
        >
          <View style={[styles.optionIcon, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Capture answers yourself</Text>
            <Text style={[styles.optionCaption, { color: colors.textMuted }]}>
              No projector needed - tap each student's answer on your own device as they respond.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "800" },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  summaryCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 14 },
  summaryTitle: { fontSize: 15, fontWeight: "800" },
  summarySubtitle: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  sectionLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
  optionCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 14 },
  optionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  optionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  optionTitle: { fontSize: 15, fontWeight: "800" },
  recommendedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  recommendedBadgeText: { fontSize: 10, fontWeight: "800" },
  optionCaption: { fontSize: 12, marginTop: 4, lineHeight: 17, fontWeight: "500" },
  error: { textAlign: "center", fontSize: 13, marginTop: 8 },
});
