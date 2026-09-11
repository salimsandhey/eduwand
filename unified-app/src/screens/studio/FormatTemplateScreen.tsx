import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";

// Custom formatting instructions the AI follows when generating lesson
// content - same feature admin-dashboard's Templates tab already exposes
// for institutional schools, reusing the exact same endpoint
// (authorizeForSchool already permits a teacher on their own individual
// school). See Docs/superpowers/plans/2026-09-09-individual-teacher-
// onboarding-and-credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "FormatTemplate">;

export function FormatTemplateScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [templateBody, setTemplateBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !user?.schoolId) return;
    setIsLoading(true);
    try {
      const templates = await api.getFormatTemplates(accessToken, user.schoolId);
      setTemplateBody(templates.generation?.templateBody ?? "");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user?.schoolId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!accessToken || !user?.schoolId || !templateBody.trim()) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.saveFormatTemplate(accessToken, user.schoolId, "generation", templateBody.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save format template");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Lesson format</Text>
          </View>

          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Optional instructions the AI follows every time it generates a lesson plan for you - tone, structure, section
            headings, anything you want consistently applied. Leave blank to use the default format.
          </Text>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
          ) : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder={"e.g. Always include a 5-minute warm-up activity and end with 3 recap questions."}
                placeholderTextColor={colors.textMuted}
                value={templateBody}
                onChangeText={setTemplateBody}
                multiline
                textAlignVertical="top"
              />

              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              {saved ? <Text style={[styles.success, { color: colors.accent }]}>Saved</Text> : null}

              <Pressable
                onPress={save}
                disabled={isSaving || !templateBody.trim()}
                style={[styles.saveButton, { backgroundColor: colors.accent }, (isSaving || !templateBody.trim()) && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save format</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 160,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
  },
  success: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "700",
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
