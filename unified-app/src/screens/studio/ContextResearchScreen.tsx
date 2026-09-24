import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useAiGenerating } from "../../context/AiAssistantGlowContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { VideoPlayerModal } from "../../components/VideoPlayerModal";
import { api, ContextResearchJob, ResearchCandidate, ResearchCandidateType } from "../../api/client";

// Kept small - "did I already save this exact video" is all this screen
// needs; the full list with remove/watch lives on the Topic screen.

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
  image: "image-outline",
};

const CANDIDATE_TYPE_LABELS: Record<ResearchCandidateType, string> = {
  pdf: "PDF",
  video: "Video",
  presentation: "Slides",
  article: "Article",
  image: "Image",
};

// Filter chips above the results. "Links" is every web page type (articles,
// slide decks, videos); PDFs and images are real files that get downloaded and
// stored when added.
type TypeFilter = "all" | "links" | "pdfs" | "images" | "videos";
const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "links", label: "Links" },
  { key: "pdfs", label: "PDFs" },
  { key: "images", label: "Images" },
  { key: "videos", label: "Videos" },
];
function matchesFilter(candidate: ResearchCandidate, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pdfs") return candidate.type === "pdf";
  if (filter === "images") return candidate.type === "image";
  if (filter === "videos") return candidate.type === "video";
  return candidate.type !== "pdf" && candidate.type !== "image" && candidate.type !== "video";
}
function addButtonLabel(candidate: ResearchCandidate): string {
  if (candidate.type === "image") return "Add image";
  if (candidate.type === "pdf") return "Add PDF";
  return "Add to topic";
}

export function ContextResearchScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [job, setJob] = useState<ContextResearchJob | null>(null);
  useAiGenerating(job?.status === "running");
  const [error, setError] = useState<string | null>(null);
  // A Set, not a single id - approving/dismissing one candidate must not
  // block acting on another at the same time.
  const [busyCandidateIds, setBusyCandidateIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Reference videos are watch-only (see backend/src/lib/youtube-search.ts) -
  // this just opens the in-app player, no server call.
  const [watching, setWatching] = useState<ResearchCandidate | null>(null);
  // Which videos are already saved (see backend's SavedVideo) - drives the
  // filled/outline bookmark state per card.
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());
  const [savingVideoIds, setSavingVideoIds] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function pollJob(jobId: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (!accessToken) return;
      try {
        const latest = await api.getContextResearchJob(accessToken, topicId, jobId);
        setJob(latest);
        if (latest.status !== "running") stopPolling();
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : "Failed to check research progress");
      }
    }, POLL_MS);
  }

  // Runs a brand-new search - burns YouTube/Gemini quota, so this only ever
  // fires on an explicit "Search again" tap (or a first-ever visit to this
  // topic, when there's nothing to resume).
  async function startNewSearch() {
    if (!accessToken) return;
    setError(null);
    setJob(null);
    stopPolling();
    try {
      const created = await api.startContextResearch(accessToken, topicId);
      setJob(created);
      pollJob(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start research");
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setIsStarting(true);
    api
      .getLatestContextResearchJob(accessToken, topicId)
      .then((latest) => {
        if (cancelled) return;
        if (!latest) {
          // Nothing has ever been searched for this topic yet - only this
          // first run auto-starts; every run after this is explicit.
          return startNewSearch();
        }
        setJob(latest);
        if (latest.status === "running") pollJob(latest.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load research");
      })
      .finally(() => {
        if (!cancelled) setIsStarting(false);
      });
    api
      .listSavedVideos(accessToken, topicId)
      .then((videos) => setSavedVideoIds(new Set(videos.map((v) => v.videoId))))
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, topicId]);

  async function saveVideo(candidate: ResearchCandidate) {
    if (!accessToken || !candidate.videoId || !candidate.thumbnailUrl) return;
    setSavingVideoIds((prev) => new Set(prev).add(candidate.videoId!));
    setError(null);
    try {
      await api.saveVideo(accessToken, topicId, {
        videoId: candidate.videoId,
        title: candidate.title,
        channelTitle: candidate.channelTitle ?? "",
        thumbnailUrl: candidate.thumbnailUrl,
        duration: candidate.duration,
      });
      setSavedVideoIds((prev) => new Set(prev).add(candidate.videoId!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save video");
    } finally {
      setSavingVideoIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.videoId!);
        return next;
      });
    }
  }

  function setCandidateBusy(candidateId: string, busy: boolean) {
    setBusyCandidateIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }

  async function approve(candidate: ResearchCandidate) {
    if (!accessToken || !job) return;
    setCandidateBusy(candidate.id, true);
    setError(null);
    try {
      const updated = await api.approveContextResearchCandidate(accessToken, topicId, job.id, candidate.id);
      setJob(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setCandidateBusy(candidate.id, false);
    }
  }

  async function dismiss(candidate: ResearchCandidate) {
    if (!accessToken || !job) return;
    setCandidateBusy(candidate.id, true);
    setError(null);
    try {
      const updated = await api.dismissContextResearchCandidate(accessToken, topicId, job.id, candidate.id);
      setJob(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove candidate");
    } finally {
      setCandidateBusy(candidate.id, false);
    }
  }

  const approvedCount = job?.candidates.filter((c) => c.status === "approved").length ?? 0;
  const visibleCandidates = (job?.candidates ?? []).filter((c) => c.status !== "dismissed");
  const shownCandidates = visibleCandidates.filter((c) => matchesFilter(c, typeFilter));

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
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, marginTop: 16 }, pressed && { opacity: pressedOpacity }]} onPress={startNewSearch} accessibilityRole="button">
            <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Try again</Text>
          </Pressable>
        </View>
      ) : isStarting || !job || job.status === "running" ? (
        <View style={styles.centered}>
          {/* Once the job is running the AI generating overlay covers the screen - no spinner behind it. */}
          {job?.status !== "running" ? <ActivityIndicator color={colors.accent} size="large" /> : null}
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 16 }]}>{STAGE_LABELS[job?.stage ?? "searching"]}</Text>
          <Text style={[styles.stateSubtext, { color: colors.textMuted }]}>This can take a couple of minutes.</Text>
        </View>
      ) : job.status === "failed" ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.danger} />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 10 }]}>{job.errorMessage ?? "Research failed"}</Text>
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, marginTop: 16 }, pressed && { opacity: pressedOpacity }]} onPress={startNewSearch} accessibilityRole="button">
            <Text style={[styles.primaryButtonText, { color: colors.accentOn }]}>Try again</Text>
          </Pressable>
        </View>
      ) : visibleCandidates.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.stateText, { color: colors.textPrimary, marginTop: 10 }]}>Nothing left to review</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
          <View style={styles.filterRow}>
            {TYPE_FILTERS.map((filter) => {
              const active = typeFilter === filter.key;
              const count = visibleCandidates.filter((c) => matchesFilter(c, filter.key)).length;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setTypeFilter(filter.key)}
                  style={[styles.filterChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, { color: active ? colors.accentOn : colors.textMuted }]}>{filter.label} {count}</Text>
                </Pressable>
              );
            })}
          </View>
          {shownCandidates.length === 0 ? (
            <Text style={[styles.stateSubtext, { color: colors.textMuted, marginTop: 24 }]}>Nothing of this type was found.</Text>
          ) : null}
          {shownCandidates
            .map((candidate) => {
              const busy = busyCandidateIds.has(candidate.id);
              const approved = candidate.status === "approved";
              return (
                <View key={candidate.id} style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
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
                  {candidate.type === "image" && candidate.thumbnailUrl ? (
                    <Image source={{ uri: candidate.thumbnailUrl }} style={[styles.thumbnail, { backgroundColor: colors.surfaceRaised }]} resizeMode="contain" accessibilityLabel={candidate.title} />
                  ) : null}
                  {candidate.type === "video" && candidate.thumbnailUrl ? (
                    <Pressable onPress={() => setWatching(candidate)} accessibilityRole="button" accessibilityLabel={`Watch ${candidate.title}`}>
                      <Image source={{ uri: candidate.thumbnailUrl }} style={[styles.thumbnail, { backgroundColor: colors.surfaceRaised }]} resizeMode="cover" />
                      <View style={styles.playOverlay}>
                        <Ionicons name="play-circle" size={44} color="#FFFFFF" />
                      </View>
                      {candidate.duration ? (
                        <View style={styles.durationBadge}>
                          <Text style={styles.durationBadgeText}>{candidate.duration}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ) : null}
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{candidate.title}</Text>
                  {candidate.type === "video" ? (
                    <Text style={[styles.cardSnippet, { color: colors.textMuted }]} numberOfLines={1}>{candidate.channelTitle}</Text>
                  ) : candidate.snippet ? (
                    <Text style={[styles.cardSnippet, { color: colors.textMuted }]} numberOfLines={3}>{candidate.snippet}</Text>
                  ) : null}
                  {candidate.type !== "video" ? (
                    <Pressable onPress={() => WebBrowser.openBrowserAsync(candidate.url)} accessibilityRole="button" style={styles.sourceLink}>
                      <Ionicons name="open-outline" size={13} color={colors.accent} />
                      <Text style={[styles.sourceLinkText, { color: colors.accent }]} numberOfLines={1}>{candidate.url}</Text>
                    </Pressable>
                  ) : null}

                  {candidate.type === "video" ? (
                    <View style={styles.cardActions}>
                      <Pressable
                        style={({ pressed }) => [styles.ghostButton, { borderColor: colors.border }, (busy || pressed) && { opacity: pressedOpacity }]}
                        onPress={() => dismiss(candidate)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {busy ? <ActivityIndicator color={colors.textSecondary} size="small" /> : <Text style={[styles.ghostButtonText, { color: colors.textSecondary }]}>Dismiss</Text>}
                      </Pressable>
                      {(() => {
                        const isSaved = !!candidate.videoId && savedVideoIds.has(candidate.videoId);
                        const isSaving = !!candidate.videoId && savingVideoIds.has(candidate.videoId);
                        return (
                          <Pressable
                            style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, (isSaving || pressed) && { opacity: pressedOpacity }]}
                            onPress={() => saveVideo(candidate)}
                            disabled={isSaved || isSaving}
                            accessibilityRole="button"
                            accessibilityLabel={isSaved ? "Saved" : `Save ${candidate.title}`}
                          >
                            {isSaving ? (
                              <ActivityIndicator color={colors.accent} size="small" />
                            ) : (
                              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={colors.accent} />
                            )}
                          </Pressable>
                        );
                      })()}
                      <Pressable
                        style={({ pressed }) => [styles.approveButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                        onPress={() => setWatching(candidate)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="play" size={14} color={colors.accentOn} style={{ marginRight: 6 }} />
                        <Text style={[styles.approveButtonText, { color: colors.accentOn }]}>Watch</Text>
                      </Pressable>
                    </View>
                  ) : !approved ? (
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
                        {busy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.approveButtonText, { color: colors.accentOn }]}>{addButtonLabel(candidate)}</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
        </ScrollView>
      )}

      <VideoPlayerModal videoId={watching?.videoId ?? null} title={watching?.title ?? ""} onClose={() => setWatching(null)} />

      {job && job.status !== "running" ? (
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.footerGhostButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={startNewSearch}
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={[styles.ghostButtonText, { color: colors.textSecondary }]}>Search again</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.accent, flex: 1 }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.goBack()} accessibilityRole="button">
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
  thumbnail: { width: "100%", height: 170, borderRadius: 12, marginTop: 10 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  filterChipText: { fontSize: 12, fontWeight: "700" },
  cardSnippet: { fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "500" },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  sourceLinkText: { fontSize: 11, fontWeight: "600", flexShrink: 1 },
  cardActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  ghostButton: { flex: 1, height: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { fontSize: 13, fontWeight: "700" },
  approveButton: { flex: 1, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  playOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  durationBadge: { position: "absolute", right: 8, bottom: 8, backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  durationBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  approveButtonText: { fontSize: 13, fontWeight: "800" },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  footerGhostButton: { flexDirection: "row", height: 50, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  primaryButton: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
});
