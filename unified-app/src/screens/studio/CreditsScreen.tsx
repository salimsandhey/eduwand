import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, CreditAccountSummary } from "../../api/client";
import { getRelativeDateLabel } from "../../utils/date";

// Balance + ledger history for the signed-in teacher. See Docs/superpowers/
// plans/2026-09-09-individual-teacher-onboarding-and-credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "Credits">;

const REASON_LABELS: Record<string, string> = {
  plan_grant: "Initial grant",
  admin_topup: "Top-up",
  ai_usage: "AI generation",
};

export function CreditsScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [summary, setSummary] = useState<CreditAccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setSummary(await api.getMyCredits(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credits");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Credits</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : (
          <>
            <View style={[styles.balanceCard, { backgroundColor: colors.accent }]}>
              <Text style={styles.balanceLabel}>Current balance</Text>
              <Text style={styles.balanceValue}>{summary?.balance ?? 0}</Text>
            </View>

            {user?.accountType === "individual" ? (
              <>
                <Pressable
                  onPress={() => navigation.navigate("RequestSubjectChange")}
                  style={({ pressed }) => [styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.accent} />
                  <Text style={[styles.linkText, { color: colors.textPrimary }]}>Request a subject change</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate("RequestClassChange")}
                  style={({ pressed }) => [styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Ionicons name="school-outline" size={18} color={colors.accent} />
                  <Text style={[styles.linkText, { color: colors.textPrimary }]}>Request a class change</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              </>
            ) : null}

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>History</Text>
            {(summary?.ledgerEntries ?? []).length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No credit activity yet.</Text>
            ) : (
              <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                {(summary?.ledgerEntries ?? []).map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.historyRow,
                      index < (summary?.ledgerEntries.length ?? 0) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.historyCopy}>
                      <Text style={[styles.historyTitle, { color: colors.textPrimary }]}>{REASON_LABELS[entry.reason] ?? entry.reason}</Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>{getRelativeDateLabel(entry.createdAt)}</Text>
                    </View>
                    <Text style={[styles.historyDelta, { color: entry.delta >= 0 ? colors.accent : colors.danger }]}>
                      {entry.delta >= 0 ? "+" : ""}
                      {entry.delta}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  error: {
    marginTop: 20,
    textAlign: "center",
  },
  balanceCard: {
    marginTop: 20,
    borderRadius: 18,
    padding: 20,
  },
  balanceLabel: {
    color: "#FFFFFF",
    opacity: 0.85,
    fontSize: 13,
    fontWeight: "600",
  },
  balanceValue: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "800",
    marginTop: 4,
  },
  linkRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  emptyText: {
    fontSize: 13,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  historyCopy: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  historyMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  historyDelta: {
    fontSize: 15,
    fontWeight: "800",
  },
});
