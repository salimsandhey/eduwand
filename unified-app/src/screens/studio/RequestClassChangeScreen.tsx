import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, ClassSection } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

// Submits a class change request for individual-account teachers - "add"
// requests one more class beyond the limit (nothing existing touched);
// "replace" archives an existing class (its students/topics/assignments
// stay intact, it just stops counting toward the limit) and creates a new
// one. The 6-month cooldown is enforced server-side; this screen surfaces
// whatever the server says rather than computing a countdown itself. See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "RequestClassChange">;
type ChangeType = "add" | "replace";

export function RequestClassChangeScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [currentClasses, setCurrentClasses] = useState<ClassSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [changeType, setChangeType] = useState<ChangeType>("add");
  const [targetClassSectionId, setTargetClassSectionId] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const sections = await api.listClassSections(accessToken);
      setCurrentClasses(sections);
      setTargetClassSectionId(sections[0]?.id ?? null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canSave = className.trim() && sectionName.trim() && (changeType === "add" || !!targetClassSectionId);

  async function submit() {
    if (!accessToken || !user?.schoolId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      await api.requestClassChange(accessToken, user.schoolId, {
        changeType,
        targetClassSectionId: changeType === "replace" ? targetClassSectionId ?? undefined : undefined,
        requestedClassName: className.trim(),
        requestedSectionName: sectionName.trim(),
        note: note.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
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
          <Text style={[styles.title, { color: colors.textPrimary }]}>Request class change</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : submitted ? (
          <View style={styles.centered}>
            <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
            <Text style={[styles.submittedTitle, { color: colors.textPrimary }]}>Request submitted</Text>
            <Text style={[styles.submittedText, { color: colors.textMuted }]}>
              An admin will review this request. You'll be able to request another change 6 months after it's approved.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>What do you need?</Text>
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => setChangeType("add")}
                style={[styles.typeChip, { backgroundColor: changeType === "add" ? colors.accent : colors.surfaceAccent }]}
              >
                <Text style={{ color: changeType === "add" ? colors.accentOn : colors.textPrimary, fontWeight: "700" }}>Add a class</Text>
              </Pressable>
              <Pressable
                onPress={() => setChangeType("replace")}
                style={[styles.typeChip, { backgroundColor: changeType === "replace" ? colors.accent : colors.surfaceAccent }]}
              >
                <Text style={{ color: changeType === "replace" ? colors.accentOn : colors.textPrimary, fontWeight: "700" }}>Replace a class</Text>
              </Pressable>
            </View>

            {changeType === "replace" ? (
              <>
                <Text style={[styles.label, { color: colors.textPrimary }]}>Class to replace</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  Its students and history stay intact - it's archived, not deleted.
                </Text>
                <View style={styles.typeRow}>
                  {currentClasses.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setTargetClassSectionId(c.id)}
                      style={[styles.typeChip, { backgroundColor: targetClassSectionId === c.id ? colors.accent : colors.surfaceAccent }]}
                    >
                      <Text style={{ color: targetClassSectionId === c.id ? colors.accentOn : colors.textPrimary, fontWeight: "700" }}>
                        {capitalizeFirst(c.className)} {capitalizeFirst(c.sectionName)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.label, { color: colors.textPrimary }]}>New class name</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. Grade 6"
              placeholderTextColor={colors.textMuted}
              value={className}
              onChangeText={setClassName}
            />

            <Text style={[styles.label, { color: colors.textPrimary }]}>Section</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. A"
              placeholderTextColor={colors.textMuted}
              value={sectionName}
              onChangeText={setSectionName}
            />

            <Text style={[styles.label, { color: colors.textPrimary }]}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Why are you making this change?"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={!canSave || isSaving}
              style={[styles.saveButton, { backgroundColor: colors.accent }, (!canSave || isSaving) && { opacity: 0.5 }]}
              accessibilityRole="button"
            >
              {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Submit request</Text>}
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
  loader: {
    marginTop: 40,
  },
  centered: {
    marginTop: 60,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  submittedTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
  },
  submittedText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    ...softCardShadow,
    marginTop: 20,
    borderRadius: 16,
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: {
    marginTop: 14,
    fontSize: 13,
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
