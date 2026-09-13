import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api } from "../../api/client";

// Fixed palette for the presentation "School format" brand colors - matches
// the swatch picker already built for Presentation color schemes in
// GenerationSetupScreen.tsx, kept simple rather than a free-form picker.
const BRAND_COLOR_PALETTE = ["#4C4CE0", "#E4574F", "#2FAE66", "#4A5568", "#D9822B", "#0EA5B7", "#9333EA", "#1F2937"];

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

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pickedLogo, setPickedLogo] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [secondaryColor, setSecondaryColor] = useState<string | null>(null);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSaved, setBrandingSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !user?.schoolId) return;
    setIsLoading(true);
    try {
      const [templates, branding] = await Promise.all([
        api.getFormatTemplates(accessToken, user.schoolId).catch(() => null),
        api.getSchoolBranding(accessToken, user.schoolId).catch(() => null),
      ]);
      setTemplateBody(templates?.generation?.templateBody ?? "");
      setLogoUrl(branding?.logoUrl ?? null);
      setPrimaryColor(branding?.primaryColor ?? null);
      setSecondaryColor(branding?.secondaryColor ?? null);
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

  async function pickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setBrandingError("Photo library permission is required to choose a logo");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.9 });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setPickedLogo({ uri: asset.uri, name: asset.fileName ?? "logo.jpg", mimeType: asset.mimeType ?? "image/jpeg" });
      setBrandingSaved(false);
    }
  }

  async function saveBranding() {
    if (!accessToken || !user?.schoolId) return;
    setIsSavingBranding(true);
    setBrandingError(null);
    setBrandingSaved(false);
    try {
      const updated = await api.saveSchoolBranding(accessToken, user.schoolId, {
        logo: pickedLogo ?? undefined,
        primaryColor: primaryColor ?? undefined,
        secondaryColor: secondaryColor ?? undefined,
      });
      setLogoUrl(updated.logoUrl);
      setPrimaryColor(updated.primaryColor);
      setSecondaryColor(updated.secondaryColor);
      setPickedLogo(null);
      setBrandingSaved(true);
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setIsSavingBranding(false);
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

          {isLoading ? null : (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.brandingTitle, { color: colors.textPrimary }]}>School branding</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted, marginTop: 6 }]}>
                Used by the Presentation "School format" style - your logo and brand colors appear on every slide.
              </Text>

              <Pressable onPress={pickLogo} style={({ pressed }) => [styles.logoPicker, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}>
                {pickedLogo || logoUrl ? (
                  <Image source={{ uri: pickedLogo?.uri ?? logoUrl! }} style={styles.logoPreview} resizeMode="contain" />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                    <Text style={[styles.logoPlaceholderText, { color: colors.textMuted }]}>Tap to add a logo</Text>
                  </View>
                )}
              </Pressable>

              <Text style={[styles.swatchLabel, { color: colors.textPrimary }]}>Primary color</Text>
              <View style={styles.colorSwatchRow}>
                {BRAND_COLOR_PALETTE.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { setPrimaryColor(c); setBrandingSaved(false); }}
                    style={({ pressed }) => [styles.colorSwatch, { backgroundColor: c, borderColor: primaryColor === c ? colors.textPrimary : "transparent" }, pressed && { opacity: pressedOpacity }]}
                  >
                    {primaryColor === c ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.swatchLabel, { color: colors.textPrimary }]}>Secondary color</Text>
              <View style={styles.colorSwatchRow}>
                {BRAND_COLOR_PALETTE.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { setSecondaryColor(c); setBrandingSaved(false); }}
                    style={({ pressed }) => [styles.colorSwatch, { backgroundColor: c, borderColor: secondaryColor === c ? colors.textPrimary : "transparent" }, pressed && { opacity: pressedOpacity }]}
                  >
                    {secondaryColor === c ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </Pressable>
                ))}
              </View>

              {brandingError ? <Text style={[styles.error, { color: colors.danger }]}>{brandingError}</Text> : null}
              {brandingSaved ? <Text style={[styles.success, { color: colors.accent }]}>Saved</Text> : null}

              <Pressable
                onPress={saveBranding}
                disabled={isSavingBranding}
                style={[styles.saveButton, { backgroundColor: colors.accent }, isSavingBranding && { opacity: 0.5 }]}
                accessibilityRole="button"
              >
                {isSavingBranding ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save branding</Text>}
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
  brandingTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  logoPicker: {
    marginTop: 16,
    height: 90,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoPreview: {
    width: "100%",
    height: "100%",
  },
  logoPlaceholder: {
    alignItems: "center",
    gap: 6,
  },
  logoPlaceholderText: {
    fontSize: 12,
    fontWeight: "600",
  },
  swatchLabel: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: "700",
  },
  colorSwatchRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
