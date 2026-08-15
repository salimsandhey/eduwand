import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api, Generation } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "GenerationReview">;

// Edit-then-persist: the edited version, not the original AI output, is what
// saves and flows into the attainment report - client doc acceptance
// criterion 3. Distribution is a stub until the Communication Hub has a real
// delivery channel (Docs/Dev/AI_Module_Rebuild_Plan.md Phase 4 note).
export function GenerationReviewScreen({ route }: Props) {
  const { generationId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const g = await api.getGeneration(accessToken, generationId);
      setGeneration(g);
      setDraft(g.editedOutput ?? g.aiOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load generation");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, generationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!accessToken || !draft.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.editGeneration(accessToken, generationId, draft.trim());
      setGeneration(updated);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function retry() {
    if (!accessToken) return;
    setIsRetrying(true);
    setError(null);
    try {
      const updated = await api.retryGeneration(accessToken, generationId);
      setGeneration(updated);
      setDraft(updated.editedOutput ?? updated.aiOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  }

  if (isLoading && !generation) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }
  if (!generation) {
    return (
      <Screen style={styles.centered}>
        <Text style={{ color: colors.danger }}>{error ?? "Generation not found"}</Text>
      </Screen>
    );
  }

  if (generation.generationStatus === "failed") {
    return (
      <Screen style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
        <Text style={[styles.failedText, { color: colors.textPrimary }]}>Generation failed</Text>
        <Text style={[styles.meta, { color: colors.textMuted, textAlign: "center", marginBottom: 16 }]}>
          Your inputs were preserved. Try again below.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.accent }, (isRetrying || pressed) && { opacity: pressedOpacity }]}
          onPress={retry}
          disabled={isRetrying}
          accessibilityRole="button"
        >
          {isRetrying ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.retryButtonText, { color: colors.accentOn }]}>Retry</Text>}
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Review and edit</Text>
          <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>
            What you save here is what shares and flows into the attainment report - not the original AI output.
          </Text>
          <TextInput
            style={[styles.editor, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={draft}
            onChangeText={setDraft}
            multiline
            textAlignVertical="top"
          />

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          {savedNotice ? <Text style={[styles.saved, { color: colors.accent }]}>Saved</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent }, (isSaving || !draft.trim() || pressed) && { opacity: pressedOpacity }]}
            onPress={save}
            disabled={isSaving || !draft.trim()}
            accessibilityRole="button"
          >
            {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  label: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 12 },
  editor: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 320, fontSize: 13, lineHeight: 19 },
  error: { textAlign: "center", marginTop: 12 },
  saved: { textAlign: "center", marginTop: 12, fontWeight: "700" },
  saveButton: { borderRadius: 10, height: 46, alignItems: "center", justifyContent: "center", marginTop: 14 },
  saveButtonText: { fontSize: 14, fontWeight: "700" },
  failedText: { fontSize: 16, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  retryButton: { borderRadius: 10, height: 46, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },
  retryButtonText: { fontSize: 14, fontWeight: "700" },
});
