import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, PresentationOutlineEntry } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "PresentationOutlineReview">;

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").toUpperCase();
}

// Step 8: "Generation runs in two passes. The first returns only the outline
// - slide roles with titles and 1 line explanation - which appears in
// seconds. The teacher cuts or reorders before the second pass fills the
// content." This screen is that review step - purely textual, before the
// deck itself is rendered.
export function PresentationOutlineReviewScreen({ route, navigation }: Props) {
  const { generationId } = route.params;
  const { accessToken } = useAuth();
  const { colors, pressedOpacity, cardShadow } = useTheme();

  const [loading, setLoading] = useState(true);
  const [outline, setOutline] = useState<PresentationOutlineEntry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  useAiGenerating(isConfirming);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getGeneration(accessToken, generationId)
      .then((gen) => setOutline(gen.outline ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the outline"))
      .finally(() => setLoading(false));
  }, [accessToken, generationId]);

  function removeSlide(index: number) {
    if (outline.length <= 1) return;
    setOutline((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function moveSlide(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= outline.length) return;
    setOutline((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  async function confirm() {
    if (!accessToken) return;
    setIsConfirming(true);
    setError(null);
    try {
      if (dirty) {
        await api.updatePresentationOutline(accessToken, generationId, outline);
      }
      await api.confirmPresentationOutline(accessToken, generationId);
      navigation.replace("GenerationReview", { generationId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the deck");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Review the outline</Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Cut or reorder before it's fully written.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.list}>
            {outline.map((entry, index) => (
              <View key={`${entry.role}-${index}`} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={styles.rowMain}>
                  <Text style={[styles.roleTag, { color: colors.accent, backgroundColor: colors.accentSoft }]}>{roleLabel(entry.role)}</Text>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={2}>{entry.title}</Text>
                  <Text style={[styles.rowOneLiner, { color: colors.textMuted }]} numberOfLines={2}>{entry.oneLiner}</Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable
                    onPress={() => moveSlide(index, -1)}
                    disabled={index === 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Move slide up"
                  >
                    <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.border : colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveSlide(index, 1)}
                    disabled={index === outline.length - 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Move slide down"
                  >
                    <Ionicons name="chevron-down" size={18} color={index === outline.length - 1 ? colors.border : colors.textMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeSlide(index)}
                    disabled={outline.length <= 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove slide"
                  >
                    <Ionicons name="trash-outline" size={18} color={outline.length <= 1 ? colors.border : colors.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.confirmButton, { backgroundColor: colors.accent }, (isConfirming || loading || pressed) && { opacity: pressedOpacity }]}
            onPress={confirm}
            disabled={isConfirming || loading}
            accessibilityRole="button"
          >
            <Text style={[styles.confirmText, { color: colors.accentOn }]}>Looks good - write the deck</Text>
            <Ionicons name="arrow-forward" size={19} color={colors.accentOn} />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1, marginLeft: 14 },
  topTitle: { fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  topSubtitle: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: "500" },
  loadingBox: { marginTop: 60, alignItems: "center" },
  list: { marginTop: 20, gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  rowMain: { flex: 1 },
  roleTag: { alignSelf: "flex-start", fontSize: 9, fontWeight: "800", letterSpacing: 0.4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rowTitle: { marginTop: 6, fontSize: 14, fontWeight: "800" },
  rowOneLiner: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  rowActions: { alignItems: "center", gap: 10, paddingTop: 2 },
  error: { textAlign: "center", marginTop: 16, fontSize: 13 },
  footer: { marginTop: 26 },
  confirmButton: { height: 55, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  confirmText: { fontSize: 15, fontWeight: "800" },
});
