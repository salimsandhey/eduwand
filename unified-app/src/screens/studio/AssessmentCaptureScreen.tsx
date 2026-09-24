import { useCallback, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Assessment, StudentStub } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "AssessmentCapture">;

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

export function AssessmentCaptureScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  // "doubt" = the student pressed "not sure" instead of picking an option.
  const [selections, setSelections] = useState<Record<string, number | "doubt">>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Coming back to an assessment already in progress (e.g. after an
  // accidental back-button press, or via "Resume" from GenerationReviewScreen)
  // should pick up where it left off, not restart at question 1 with nothing
  // selected - only the first load of a mount does this jump.
  const hasResumedRef = useRef(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const a = await api.getAssessment(accessToken, assessmentId);
      setAssessment(a);
      const roster = await api.listStudents(accessToken, a.classSectionId);
      const rosterData = roster.data ?? [];
      setStudents(rosterData);

      if (!hasResumedRef.current) {
        hasResumedRef.current = true;
        const resumeIndex = a.questions.findIndex((q) => {
          const answeredCount = a.responses.filter((r) => r.questionId === q.id).length;
          return answeredCount < rosterData.length;
        });
        const startIndex = resumeIndex === -1 ? Math.max(0, a.questions.length - 1) : resumeIndex;
        setQuestionIndex(startIndex);
        loadSelectionsForQuestion(a, startIndex);
      }
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

  function loadSelectionsForQuestion(a: Assessment, index: number) {
    const question = a.questions[index];
    const map: Record<string, number | "doubt"> = {};
    for (const r of a.responses) {
      if (r.questionId !== question.id) continue;
      map[r.studentStubId] = r.isDoubt ? "doubt" : r.selectedOptionIndex!;
    }
    setSelections(map);
  }

  function selectAnswer(studentStubId: string, optionIndex: number) {
    setSelections((prev) => ({ ...prev, [studentStubId]: optionIndex }));
  }

  function selectDoubt(studentStubId: string) {
    setSelections((prev) => ({ ...prev, [studentStubId]: "doubt" }));
  }

  async function saveAndAdvance() {
    if (!accessToken || !assessment) return;
    const question = assessment.questions[questionIndex];
    const responses = Object.entries(selections).map(([studentStubId, value]) =>
      value === "doubt" ? { studentStubId, isDoubt: true } : { studentStubId, selectedOptionIndex: value }
    );
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.saveAssessmentResponses(accessToken, assessment.id, question.id, responses);
      setAssessment(updated);
      if (questionIndex < assessment.questions.length - 1) {
        const nextIndex = questionIndex + 1;
        setQuestionIndex(nextIndex);
        loadSelectionsForQuestion(updated, nextIndex);
      } else {
        await api.completeAssessment(accessToken, assessment.id);
        navigation.replace("AssessmentInsight", { assessmentId: assessment.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save responses");
    } finally {
      setIsSaving(false);
    }
  }

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

  const question = assessment.questions[questionIndex];
  const isLastQuestion = questionIndex === assessment.questions.length - 1;
  const answeredCount = Object.keys(selections).length;

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
        <View style={styles.topCopy}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>{assessment.title}</Text>
          <Text style={[styles.topSubtitle, { color: colors.textMuted }]}>
            Question {questionIndex + 1} of {assessment.questions.length} · {answeredCount}/{students.length} answered
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.presentButton, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("PresentLaunch", { assessmentId: assessment.id })}
          accessibilityRole="button"
          accessibilityLabel="Present on a screen"
        >
          <Ionicons name="tv-outline" size={16} color={colors.accent} />
          <Text style={[styles.presentButtonText, { color: colors.accent }]}>Present</Text>
        </Pressable>
      </View>

      <View style={[styles.questionCard, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
        <Text style={[styles.questionPrompt, { color: colors.textPrimary }]}>{question.prompt}</Text>
        <View style={styles.optionLegend}>
          {question.options.map((opt, i) => (
            <View key={i} style={styles.optionLegendRow}>
              <View style={[styles.optionLetterBadge, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.optionLetterText, { color: colors.accent }]}>{OPTION_LETTERS[i]}</Text>
              </View>
              <Text style={[styles.optionLegendText, { color: colors.textSecondary }]} numberOfLines={2}>{opt}</Text>
            </View>
          ))}
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.rosterList}>
        {students.map((s) => {
          const selected = selections[s.id];
          return (
            <View key={s.id} style={[styles.studentRow, { backgroundColor: colors.surface }, cardShadow]}>
              <Text style={[styles.studentName, { color: colors.textPrimary }]} numberOfLines={1}>{s.fullName}</Text>
              <View style={styles.optionButtonsRow}>
                {question.options.map((_, i) => {
                  const active = selected === i;
                  return (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [
                        styles.optionButton,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => selectAnswer(s.id, i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.optionButtonText, { color: active ? colors.accentOn : colors.textPrimary }]}>{OPTION_LETTERS[i]}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={({ pressed }) => [
                    styles.doubtButton,
                    { backgroundColor: selected === "doubt" ? colors.warning : colors.surfaceRaised, borderColor: selected === "doubt" ? colors.warning : colors.border },
                    pressed && { opacity: pressedOpacity },
                  ]}
                  onPress={() => selectDoubt(s.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${s.fullName} as not sure`}
                  accessibilityState={{ selected: selected === "doubt" }}
                >
                  <Ionicons name="help" size={16} color={selected === "doubt" ? "#FFFFFF" : colors.textMuted} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.accent }, (isSaving || pressed) && { opacity: pressedOpacity }]}
          onPress={saveAndAdvance}
          disabled={isSaving}
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator color={colors.accentOn} />
          ) : (
            <Text style={[styles.nextButtonText, { color: colors.accentOn }]}>{isLastQuestion ? "Finish" : "Next question"}</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1 },
  topTitle: { fontSize: 17, fontWeight: "800" },
  topSubtitle: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  presentButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  presentButtonText: { fontSize: 12, fontWeight: "800" },
  questionCard: { marginHorizontal: 20, borderWidth: 1, borderRadius: 16, padding: 14 },
  questionPrompt: { fontSize: 15, fontWeight: "700", lineHeight: 21 },
  optionLegend: { marginTop: 10, gap: 6 },
  optionLegendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionLetterBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optionLetterText: { fontSize: 11, fontWeight: "800" },
  optionLegendText: { flex: 1, fontSize: 12, fontWeight: "500" },
  error: { textAlign: "center", marginTop: 8, fontSize: 13, paddingHorizontal: 20 },
  rosterList: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, gap: 8 },
  studentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, minHeight: 54 },
  studentName: { flex: 1, fontSize: 14, fontWeight: "700", marginRight: 8 },
  optionButtonsRow: { flexDirection: "row", gap: 6 },
  optionButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  optionButtonText: { fontSize: 13, fontWeight: "800" },
  doubtButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4 },
  nextButton: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  nextButtonText: { fontSize: 15, fontWeight: "800" },
});
