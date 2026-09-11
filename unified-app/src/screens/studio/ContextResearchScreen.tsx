import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ContextResearchJob, ResearchCandidate, ResearchCandidateType } from "../../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "ContextResearch">;

const POLL_MS = 3000;

const STAGE_LABELS: Record<ContextResearchJob["stage"], string> = {
  searching: "Searching the web…",
  reviewing: "Reviewing what it found…",
  done: "Done",
};

const CANDIDATE_TYPE_ICONS: Record<ResearchCandidateType, keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text-outline",
  video: "logo-youtube",
  presentation: "easel-outline",
  article: "newspaper-outline",
};

const CANDIDATE_TYPE_LABELS: Record<ResearchCandidateType, string> = {
  pdf: "PDF",
  video: "Video",
  presentation: "Slides",
  article: "Article",
};

export function ContextResearchScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [job, setJob] = useState<ContextResearchJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function start() {
    if (!accessToken) return;
    setError(null);
    setJob(null);
    stopPolling();
    try {
      const created = await api.startContextResearch(accessToken, topicId);
      setJob(created);
      pollRef.current = setInterval(async () => {
        try {
          const latest = await api.getContextResearchJob(accessToken, topicId, created.id);
          setJob(latest);
          if (latest.status !== "running") stopPolling();
        } catch (err) {
          stopPolling();
          setError(err instanceof Error ? err.message : "Failed to check research progress");
        }
      }, POLL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start research");
    }
  }

  useEffect(() => {
    start();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, topicId]);

  async function approve(candidate: ResearchCandidate) {
    if (!accessToken || !job) return;
    setBusyCandidateId(candidate.id);
    setError(null);
    try {
      const updated = await api.approveContextResearchCandidate(accessToken, topicId, job.id, candidate.id);
      setJob(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setBusyCandidateId(null);
    }
  }

  async function dismiss(candidate: ResearchCandidate) {
    if (!accessToken || !job) return;
    setBusyCandidateId(candidate.id);
    setError(null);
    try {
      const updated = await api.dismissContextResearchCandidate(accessToken, topicId, job.id, candidate.id);
      setJob(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove candidate");
    } finally {
      setBusyCandidateId(null);
    }
  }

  const approvedCount = job?.candidates.filter((c) => c.status === "approved").length ?? 0;

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
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>AI Research</Text>
          <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {approvedCount > 0 ? `${approvedCount} source${approvedCount === 1 ? "" : "s"} added` : "Finds sources from across the web"}
          </Text>
        </View>
      </View>

      {error && !job ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 10 }]}>{error}</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, marginTop: 16 }, pressed && { opacity: pressedOpacity }]} onPress={start} accessibilityRole="button">
            <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Try again</Text>
          </Pressable>
        </View>
      ) : !job || job.status === "running" ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 16 }]}>{STAGE_LABELS[job?.stage ?? "searching"]}</Text>
          <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>This can take a couple of minutes.</Text>
        </View>
      ) : job.status === "failed" ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 10 }]}>{job.errorMessage ?? "Research failed"}</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, marginTop: 16 }, pressed && { opacity: pressedOpacity }]} onPress={start} accessibilityRole="button">
            <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Try again</Text>
          </Pressable>
        </View>
      ) : job.candidates.filter((c) => c.status !== "dismissed").length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 10 }]}>Nothing left to review</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
          {job.candidates
            .filter((c) => c.status !== "dismissed")
            .map((candidate) => {
              const busy = busyCandidateId === candidate.id;
              const approved = candidate.status === "approved";
              return (
                <View key={candidate.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.typeTag, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={CANDIDATE_TYPE_ICONS[candidate.type]} size={12} color={colors.accent} />
                      <Text style={[styles.typeTagText, { color: colors.accent }]}>{CANDIDATE_TYPE_LABELS[candidate.type]}</Text>
                    </View>
                    {approved ? (
                      <View style={[styles.addedBadge, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name="checkmark" size={12} color={colors.accent} />
                        <Text style={[styles.addedBadgeText, { color: colors.accent }]}>Added</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{candidate.title}</Text>
                  {candidate.snippet ? (
                    <Text style={[styles.cardSnippet, { color: colors.textMuted }]} numberOfLines={3}>{candidate.snippet}</Text>
                  ) : null}
                  <Pressable onPress={() => Linking.openURL(candidate.url)} accessibilityRole="button" style={styles.sourceLink}>
                    <Ionicons name="open-outline" size={13} color={colors.accent} />
                    <Text style={[styles.sourceLinkText, { color: colors.accent }]} numberOfLines={1}>{candidate.url}</Text>
                  </Pressable>

                  {!approved ? (
                    <View style={styles.cardActions}>
                      <Pressable
                        style={({ pressed }) => [styles.ghostButton, { borderColor: colors.border }, (busy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => dismiss(candidate)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.ghostButtonText, { color: colors.textSecondary }]}>Dismiss</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.approveButton, { backgroundColor: colors.accent }, (busy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => approve(candidate)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {busy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.approveButtonText, { color: colors.accentOn }]}>Add to topic</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
        </ScrollView>
      )}

      {job && job.status !== "running" ? (
        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.goBack()} accessibilityRole="button">
            <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  stateText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  stateSubtext: { fontSize: 12, marginTop: 4, textAlign: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topCopy: { flex: 1 },
  topTitle: { fontSize: 19, fontWeight: "800" },
  topSubtitle: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  typeTagText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.2 },
  addedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  addedBadgeText: { fontSize: 10, fontWeight: "800" },
  cardTitle: { fontSize: 15, fontWeight: "800", marginTop: 10 },
  cardSnippet: { fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "500" },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  sourceLinkText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  ghostButton: { flex: 1, height: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { fontSize: 13, fontWeight: "700" },
  approveButton: { flex: 1, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  approveButtonText: { fontSize: 13, fontWeight: "800" },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  primaryButton: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
});
