import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { ThemeColors, typography } from "../../theme/tokens";
import { api, ContentPage } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "LegalDocument">;

// Same shape as GenerationReviewScreen's markdown styling, reused so this
// screen and the AI-generated lesson content read consistently.
function buildMarkdownStyles(colors: ThemeColors) {
  const heading = { color: colors.textPrimary, fontFamily: typography.bold };
  return {
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    heading1: { ...heading, fontSize: 22, marginTop: 4, marginBottom: 10 },
    heading2: { ...heading, fontSize: 18, marginTop: 18, marginBottom: 8 },
    heading3: { ...heading, fontSize: 15, marginTop: 14, marginBottom: 6 },
    strong: { fontFamily: typography.semiBold, color: colors.textPrimary },
    em: { fontStyle: "italic" as const },
    paragraph: { marginTop: 0, marginBottom: 10 },
    bullet_list: { marginBottom: 10 },
    ordered_list: { marginBottom: 10 },
    list_item: { marginBottom: 4 },
    bullet_list_icon: { color: colors.accent },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 14 },
    link: { color: colors.accent },
    table: { borderColor: colors.border, borderWidth: 1, borderRadius: 6, marginBottom: 10 },
    thead: { backgroundColor: colors.surfaceRaised },
    th: { color: colors.textPrimary, fontFamily: typography.semiBold, padding: 6 },
    tr: { borderColor: colors.border, borderBottomWidth: 1 },
    td: { color: colors.textSecondary, padding: 6 },
  };
}

const markdownRules = { markdownit: MarkdownIt({ typographer: false }) };

export function LegalDocumentScreen({ route }: Props) {
  const { contentKey } = route.params;
  const { colors } = useTheme();
  const [page, setPage] = useState<ContentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .getContentPage(contentKey)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this page");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentKey, retryTick]);

  const markdownStyles = buildMarkdownStyles(colors);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error || !page ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error ?? "This page isn't available right now."}</Text>
            <Pressable onPress={() => setRetryTick((n) => n + 1)} accessibilityRole="button" accessibilityLabel="Retry">
              <Text style={[styles.retryText, { color: colors.accent }]}>Tap to retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.updatedText, { color: colors.textMuted }]}>
              Last updated {new Date(page.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </Text>
            <Markdown style={markdownStyles} markdownit={markdownRules.markdownit}>
              {page.bodyMarkdown}
            </Markdown>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  loader: { marginTop: 60 },
  errorBox: { alignItems: "center", gap: 10, marginTop: 60, paddingHorizontal: 20 },
  errorText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
  retryText: { fontSize: 13, fontWeight: "700" },
  updatedText: { fontSize: 11, fontWeight: "600", marginBottom: 14 },
});
