import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Animated, Easing } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../../navigation/types";
import { useKeyboardOverlap } from "../../hooks/useKeyboardOverlap";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentQuestion } from "../../api/client";
import { MatchingQuestion, SequencingQuestion } from "../assignments/MatchAndSequenceQuestions";

const CHOICE_TYPES = new Set(["mcq", "true_false"]);
const STRUCTURED_TYPES = new Set(["match_following", "sequencing"]);

type Props = NativeStackScreenProps<RootStackParamList, "StudentAssignmentSubmit">;

export function StudentAssignmentSubmitScreen({ route, navigation }: Props) {
  const { assignmentId, questions, title } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  // The container sits inside <Screen edges={[..., "bottom"]}>, above the navigation bar.
  const keyboard = useKeyboardOverlap({ bottomInset: useSafeAreaInsets().bottom });

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQuestions: AssignmentQuestion[] = questions;
  // A photo covers handwritten working for free-text questions - it can't
  // capture a multiple-choice pick, a true/false pick, a match, or a tapped
  // order, so don't offer it unless there's at least one free-text question.
  const allowsPhoto = parsedQuestions.some((q) => !q.type || (!CHOICE_TYPES.has(q.type) && !STRUCTURED_TYPES.has(q.type)));

  const answeredCount = parsedQuestions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const totalQuestions = parsedQuestions.length;
  const answeredPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const progressTarget = photo ? 100 : answeredPercent;

  // The bar eases to each new value instead of jumping. Width is a layout
  // prop, so this runs on the JS driver.
  const progress = useRef(new Animated.Value(progressTarget)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: progressTarget, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progressTarget, progress]);
  const progressWidth = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"], extrapolate: "clamp" });

  async function pickPhoto() {
    const result = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function submit() {
    if (!accessToken) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (photo) {
        await api.submitStudentAssignmentPhoto(accessToken, assignmentId, photo);
      } else {
        await api.submitStudentAssignmentOnline(accessToken, { assignmentId, answers });
      }
      setIsDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDone) {
    return (
      <Screen style={styles.centered}>
        <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
        <Text style={[styles.doneTitle, { color: colors.textPrimary }]}>Submitted</Text>
        <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 20 }]}>Your teacher will grade this and release your result.</Text>
        <Pressable
          style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.popToTop()}
          accessibilityRole="button"
        >
          <Text style={[styles.doneButtonText, { color: colors.accentOn }]}>Back to assignments</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Submit assignment</Text>
      </View>

      <View
        ref={keyboard.ref}
        onLayout={keyboard.onLayout}
        collapsable={false}
        style={[styles.container, { paddingBottom: keyboard.keyboardVisible ? keyboard.overlap : 0 }]}
      >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroEyebrow}>ASSIGNMENT</Text>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {title}
          </Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="help-circle-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>
                {totalQuestions} question{totalQuestions === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.heroMetaDivider} />
            <View style={styles.heroMetaItem}>
              <Ionicons name={allowsPhoto ? "camera-outline" : "create-outline"} size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.heroMetaText}>{allowsPhoto ? "Online or photo" : "Answer online"}</Text>
            </View>
          </View>

          <View style={styles.heroProgress}>
            <View style={styles.heroProgressHead}>
              <Text style={styles.heroProgressLabel}>{photo ? "Photo attached" : "Your progress"}</Text>
              <Text style={styles.heroProgressValue}>{photo ? "Covers all questions" : `${answeredCount} of ${totalQuestions} answered`}</Text>
            </View>
            <View style={styles.heroTrack}>
              <Animated.View style={[styles.heroFill, { width: progressWidth }]} />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Answer online</Text>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Answer each question below, then tap Submit.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
          {parsedQuestions.map((q, i) => (
            <View key={q.id} style={[i > 0 && [styles.questionDivider, { borderTopColor: colors.border }]]}>
              <View style={styles.questionHead}>
                <Text style={[styles.questionNumber, { color: colors.accent }]}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={[styles.questionText, { color: colors.textPrimary }]}>{q.prompt}</Text>
              </View>
              {q.type && CHOICE_TYPES.has(q.type) ? (
                <View style={styles.optionList}>
                  {(q.options ?? []).map((option, idx) => {
                    const selected = (answers[q.id] ?? "") === option;
                    return (
                      <Pressable
                        key={idx}
                        style={[
                          styles.optionRow,
                          { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised },
                        ]}
                        onPress={() => {
                          setPhoto(null);
                          setAnswers((prev) => ({ ...prev, [q.id]: option }));
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <View style={[styles.optionDot, { borderColor: selected ? colors.accent : colors.textMuted }]}>
                          {selected ? <View style={[styles.optionDotFill, { backgroundColor: colors.accent }]} /> : null}
                        </View>
                        <Text style={[styles.optionText, { color: colors.textPrimary }]}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : q.type === "match_following" && q.pairs?.length ? (
                <MatchingQuestion
                  pairs={q.pairs}
                  value={answers[q.id] ?? ""}
                  onChange={(value) => {
                    setPhoto(null);
                    setAnswers((prev) => ({ ...prev, [q.id]: value }));
                  }}
                  colors={colors}
                />
              ) : q.type === "sequencing" && q.items?.length ? (
                <SequencingQuestion
                  items={q.items}
                  value={answers[q.id] ?? ""}
                  onChange={(value) => {
                    setPhoto(null);
                    setAnswers((prev) => ({ ...prev, [q.id]: value }));
                  }}
                  colors={colors}
                />
              ) : (
                <TextInput
                  style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                  value={answers[q.id] ?? ""}
                  onChangeText={(text) => {
                    setPhoto(null);
                    setAnswers((prev) => ({ ...prev, [q.id]: text }));
                  }}
                  placeholder={q.type === "very_short" ? "One word or short phrase" : q.type === "fill_blank" ? "Fill in the blank" : "Your answer"}
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              )}
            </View>
          ))}
        </View>

        {allowsPhoto ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Or upload a photo instead</Text>
            <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>
              Use this if a question needs handwritten working - covers the whole assignment in one photo.
            </Text>
            {photo ? (
              <View style={[styles.photoRow, { borderColor: colors.border }]}>
                <Ionicons name="image-outline" size={18} color={colors.accent} />
                <Text style={[styles.meta, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                  {photo.name}
                </Text>
                <Pressable onPress={() => setPhoto(null)} hitSlop={8} accessibilityRole="button">
                  <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.photoButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                onPress={pickPhoto}
                accessibilityRole="button"
              >
                <Ionicons name="camera-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.photoButtonText, { color: colors.textSecondary }]}>Choose photo</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.submitButton, { backgroundColor: colors.accent }, (isSubmitting || pressed) && { opacity: pressedOpacity }]}
          onPress={submit}
          disabled={isSubmitting}
          accessibilityRole="button"
        >
          {isSubmitting ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.submitButtonText, { color: colors.accentOn }]}>Submit</Text>}
        </Pressable>
      </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, fontSize: 20, fontWeight: "800", letterSpacing: -0.45 },

  hero: { borderRadius: 22, padding: 18, overflow: "hidden", marginBottom: 22 },
  heroGlow: { position: "absolute", width: 170, height: 170, borderRadius: 85, right: -50, top: -70, backgroundColor: "#FFFFFF", opacity: 0.12 },
  heroEyebrow: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  heroTitle: { marginTop: 4, color: "#FFFFFF", fontSize: 21, lineHeight: 27, fontWeight: "800", letterSpacing: -0.5 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroMetaText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600" },
  heroMetaDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.35)" },
  heroProgress: { marginTop: 16, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.14)" },
  heroProgressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  heroProgressLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700" },
  heroProgressValue: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  heroTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.25)" },
  heroFill: { height: "100%", borderRadius: 3, backgroundColor: "#FFFFFF" },

  sectionHeader: { marginBottom: 10, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  sectionHint: { marginTop: 2, fontSize: 12, fontWeight: "500" },

  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, lineHeight: 16 },
  questionDivider: { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  questionHead: { flexDirection: "row", gap: 10, marginBottom: 10 },
  questionNumber: { fontSize: 13, fontWeight: "800", lineHeight: 20 },
  questionText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  answerInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 50, fontSize: 13 },
  optionList: { gap: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  optionDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  optionDotFill: { width: 10, height: 10, borderRadius: 5 },
  optionText: { flex: 1, fontSize: 13 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },
  photoButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderStyle: "dashed", borderRadius: 8, height: 44 },
  photoButtonText: { fontSize: 13, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  submitButton: { borderRadius: 10, height: 48, alignItems: "center", justifyContent: "center" },
  submitButtonText: { fontSize: 14, fontWeight: "700" },
  doneTitle: { fontSize: 18, fontWeight: "800", marginTop: 12 },
  doneButton: { borderRadius: 10, height: 46, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  doneButtonText: { fontSize: 14, fontWeight: "700" },
});
