import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, AssignmentQuestion } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "StudentAssignmentSubmit">;

// Students Dashboard submission flow (client doc section 5). Answers
// typed here persist in component state until Submit is pressed - true
// resumability across an app restart (surviving the browser/app closing,
// per the client doc's acceptance criterion) would need local disk
// persistence, which isn't built here; this covers the in-session case.
export function StudentAssignmentSubmitScreen({ route, navigation }: Props) {
  const { assignmentId, questions, title } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQuestions: AssignmentQuestion[] = questions;

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
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Answer online</Text>
          {parsedQuestions.map((q, i) => (
            <View key={q.id} style={{ marginTop: 10 }}>
              <Text style={[styles.questionText, { color: colors.textSecondary }]}>
                {i + 1}. {q.prompt}
              </Text>
              <TextInput
                style={[styles.answerInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={answers[q.id] ?? ""}
                onChangeText={(text) => {
                  setPhoto(null);
                  setAnswers((prev) => ({ ...prev, [q.id]: text }));
                }}
                placeholder="Your answer"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12, lineHeight: 16 },
  questionText: { fontSize: 13, marginBottom: 6 },
  answerInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 50, fontSize: 13 },
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
