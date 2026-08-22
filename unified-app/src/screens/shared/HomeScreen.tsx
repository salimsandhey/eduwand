import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  ImageSourcePropType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { getStatusColor } from "../../theme/statusColors";
import { api, Enquiry, FollowUpTask, TeacherDashboardSummary, TeacherDashboardActivityItem } from "../../api/client";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { decorativeAssets } from "../../theme/decorativeAssets";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];
const TEACHER_TABS = ["Home", "Teaching", "Assignment"] as const;

// Visual config only - the numbers/labels shown per card are computed at
// render time from a real TeacherDashboardSummary (GET /dashboard/teacher-summary).
const TEACHER_SUMMARY_CARD_CONFIG = [
  { key: "lessons", title: "Lessons", accent: "#5B3FD6", icon: "book-outline" as const, graphic: decorativeAssets.teacherLessonCat },
  { key: "assignments", title: "Assignments", accent: "#F46B5B", icon: "clipboard-outline" as const, graphic: decorativeAssets.teacherAssignment },
] as const;

const ACTIVITY_TYPE_CONFIG: Record<TeacherDashboardActivityItem["type"], { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  generation: { icon: "document-text-outline", color: "#6A50F2" },
  observation: { icon: "chatbox-ellipses-outline", color: "#37C777" },
  assignment_published: { icon: "clipboard-outline", color: "#F4BC21" },
};

const AVATAR_SOURCES: ImageSourcePropType[] = [
  require("../../../assets/avatars/avatar-01.png"),
  require("../../../assets/avatars/avatar-02.png"),
  require("../../../assets/avatars/avatar-03.png"),
  require("../../../assets/avatars/avatar-04.png"),
  require("../../../assets/avatars/avatar-05.png"),
  require("../../../assets/avatars/avatar-06.png"),
  require("../../../assets/avatars/avatar-07.png"),
  require("../../../assets/avatars/avatar-08.png"),
  require("../../../assets/avatars/avatar-09.png"),
  require("../../../assets/avatars/avatar-10.png"),
];

interface Stats {
  totalLeads: number;
  newEnquiries: number;
  followUps: number;
  visitsToday: number;
  converted: number;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return past.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatSource(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAvatarSource(seed: string) {
  const hash = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_SOURCES[hash % AVATAR_SOURCES.length];
}

function teacherFirstName(fullName?: string) {
  if (!fullName) return "Teacher";
  return fullName.trim().split(/\s+/)[0] ?? "Teacher";
}

export function HomeScreen() {
  const { user, accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const navigation = useNavigation<any>();

  const isEnrolmentRole = user ? ENROLMENT_ROLES.includes(user.role) : false;
  const isTeacher = user?.role === "teacher";

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentEnquiries, setRecentEnquiries] = useState<Enquiry[]>([]);
  const [pendingTasks, setPendingTasks] = useState<FollowUpTask[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [teacherSummary, setTeacherSummary] = useState<TeacherDashboardSummary | null>(null);
  const [isLoadingTeacherSummary, setIsLoadingTeacherSummary] = useState(false);

  const loadTeacherSummary = useCallback(async () => {
    if (!accessToken || !isTeacher) return;
    setIsLoadingTeacherSummary(true);
    try {
      const summary = await api.getTeacherDashboardSummary(accessToken);
      setTeacherSummary(summary);
    } catch {
      setTeacherSummary(null);
    } finally {
      setIsLoadingTeacherSummary(false);
    }
  }, [accessToken, isTeacher]);

  const loadStats = useCallback(async () => {
    if (!accessToken || !isEnrolmentRole) return;
    setIsLoadingStats(true);
    try {
      const [newRes, followUps, visitRes, allEnquiriesRes] = await Promise.all([
        api.listEnquiries(accessToken, { status: "new" }),
        api.listFollowUpTasks(accessToken, { status: "pending" }),
        api.listEnquiries(accessToken, { status: "visit" }),
        api.listEnquiries(accessToken),
      ]);

      const allEnquiries = allEnquiriesRes.data ?? [];
      const convertedStage = stages.find((stage) => stage.isConverted);
      const convertedCount = convertedStage
        ? allEnquiries.filter((enquiry) => enquiry.status === convertedStage.key).length
        : 0;

      setStats({
        totalLeads: (allEnquiriesRes.meta?.totalCount as number) ?? allEnquiries.length,
        newEnquiries: (newRes.meta?.totalCount as number) ?? newRes.data?.length ?? 0,
        followUps: followUps.length,
        visitsToday: (visitRes.meta?.totalCount as number) ?? visitRes.data?.length ?? 0,
        converted: convertedCount,
      });

      const sorted = [...allEnquiries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const sortedTasks = [...followUps].sort(
        (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      );

      setRecentEnquiries(sorted.slice(0, 4));
      setPendingTasks(sortedTasks.slice(0, 3));
    } catch {
      setStats(null);
      setRecentEnquiries([]);
      setPendingTasks([]);
    } finally {
      setIsLoadingStats(false);
    }
  }, [accessToken, isEnrolmentRole, stages]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadTeacherSummary();
    }, [loadStats, loadTeacherSummary])
  );

  if (!user) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
        {isEnrolmentRole ? (
          <>
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.profileBlock}>
                  <View style={styles.profileTextBlock}>
                    <Text style={[styles.eyebrow, { color: "rgba(255,255,255,0.78)" }]}>{greeting()}</Text>
                    <Text style={[styles.heroTitle, { color: "#FFFFFF" }]}>{user.fullName}</Text>
                    <Text style={[styles.heroSubtitle, { color: "rgba(255,255,255,0.84)" }]}>
                      Admissions command center for today&apos;s lead movement, follow-ups, and conversions.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => navigation.navigate("Notifications")}
                  style={({ pressed }) => [styles.heroBell, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open notifications"
                >
                  <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </LinearGradient>

            <View style={styles.dashboardBody}>
              <View style={[styles.focusCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={styles.heroFocusText}>
                  <Text style={[styles.focusLabel, { color: colors.accent }]}>Today&apos;s focus</Text>
                  <Text style={[styles.focusValue, { color: colors.textPrimary }]}>{stats?.newEnquiries ?? 0} fresh leads</Text>
                  <Text style={[styles.focusMeta, { color: colors.textMuted }]}>
                    {stats?.followUps ?? 0} pending follow-up{stats?.followUps === 1 ? "" : "s"}
                  </Text>
                </View>
                <View style={[styles.focusGraphicWrap, { backgroundColor: colors.accentSoft }]}>
                  <Image source={decorativeAssets.checkCircle} style={styles.focusGraphic} resizeMode="contain" />
                </View>
              </View>

              <View style={styles.sectionRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today&apos;s view</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>A fast read of pipeline pressure and conversions.</Text>
                </View>
              </View>

              {isLoadingStats && !stats ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
              ) : (
                <View style={styles.kpiGrid}>
                  <KpiCard
                    title="Fresh enquiries"
                    value={stats?.newEnquiries ?? 0}
                    hint="New leads waiting to be worked"
                    icon="person-add-outline"
                    colors={colors}
                    shadow={cardShadow}
                  />
                  <KpiCard
                    title="Follow-up queue"
                    value={stats?.followUps ?? 0}
                    hint="Tasks still pending today"
                    icon="time-outline"
                    colors={colors}
                    shadow={cardShadow}
                  />
                  <KpiCard
                    title="Visits stage"
                    value={stats?.visitsToday ?? 0}
                    hint="Leads currently at visit"
                    icon="calendar-outline"
                    colors={colors}
                    shadow={cardShadow}
                  />
                  <KpiCard
                    title="Conversions"
                    value={stats?.converted ?? 0}
                    hint="Leads in converted stage"
                    icon="checkmark-done-outline"
                    colors={colors}
                    shadow={cardShadow}
                  />
                </View>
              )}

              {stats && stats.followUps > 0 ? (
                <Pressable
                  onPress={() => navigation.navigate("Tasks")}
                  style={({ pressed }) => [
                    styles.alertCard,
                    { backgroundColor: colors.surface, borderColor: colors.accent },
                    cardShadow,
                    pressed && { opacity: pressedOpacity },
                  ]}
                >
                  <View style={styles.alertLeft}>
                    <View style={[styles.alertIconWrap, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name="flash-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.alertTextBlock}>
                      <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>Follow-ups need attention</Text>
                      <Text style={[styles.alertSubtitle, { color: colors.textMuted }]}>
                        {stats.followUps} pending task{stats.followUps === 1 ? "" : "s"} can affect today&apos;s conversion flow.
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.accent} />
                </Pressable>
              ) : null}

              <View style={styles.sectionRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick desk actions</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Jump into the screens that matter most.</Text>
                </View>
              </View>

              <View style={styles.actionGrid}>
                <ActionCard
                  icon="mail-open-outline"
                  label="Enquiries"
                  sublabel="Browse, filter and work all incoming leads"
                  colors={colors}
                  shadow={cardShadow}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("Enquiries")}
                />
                <ActionCard
                  icon="git-network-outline"
                  label="Pipeline"
                  sublabel="See every stage and move leads faster"
                  colors={colors}
                  shadow={cardShadow}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("Pipeline")}
                />
                <ActionCard
                  icon="checkbox-outline"
                  label="Follow-ups"
                  sublabel="Review pending tasks and clear blockers"
                  colors={colors}
                  shadow={cardShadow}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("Tasks")}
                />
                <ActionCard
                  icon="download-outline"
                  label="CSV Export"
                  sublabel="Download operational data and logs"
                  colors={colors}
                  shadow={cardShadow}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("More", { screen: "CsvExport" })}
                />
              </View>

              <View style={styles.splitSection}>
                <View style={styles.splitColumn}>
                  <View style={styles.sectionRow}>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent leads</Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>The newest activity entering the desk.</Text>
                    </View>
                  </View>

                  <View style={[styles.panelCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                    {recentEnquiries.length === 0 ? (
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>No recent enquiries yet.</Text>
                    ) : (
                      recentEnquiries.map((enquiry, index) => (
                        <RecentLeadRow
                          key={enquiry.id}
                          enquiry={enquiry}
                          colors={colors}
                          mode={mode}
                          isLast={index === recentEnquiries.length - 1}
                          onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: enquiry.id })}
                        />
                      ))
                    )}
                  </View>
                </View>

                <View style={styles.splitColumn}>
                  <View style={styles.sectionRow}>
                    <View>
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Next follow-ups</Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>A simple queue of the most urgent pending outreach.</Text>
                    </View>
                  </View>

                  <View style={[styles.panelCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                    {pendingTasks.length === 0 ? (
                      <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending tasks right now.</Text>
                    ) : (
                      pendingTasks.map((task, index) => (
                        <TaskPreviewRow
                          key={task.id}
                          task={task}
                          colors={colors}
                          isLast={index === pendingTasks.length - 1}
                          onPress={() => navigation.navigate("Tasks")}
                        />
                      ))
                    )}
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : isTeacher ? (
          <View style={styles.teacherWrap}>
            <View style={styles.teacherTopRow}>
              <View style={styles.teacherGreetingBlock}>
                <Text style={[styles.teacherGreeting, { color: colors.textMuted }]}>{greeting()},</Text>
                <Text style={[styles.teacherName, { color: colors.textPrimary }]}>{teacherFirstName(user.fullName)}!</Text>
                <Text style={[styles.teacherIntro, { color: colors.textMuted }]}>
                  Here&apos;s what&apos;s happening at your school today.
                </Text>
              </View>
              <View style={styles.teacherTopActions}>
                <Pressable
                  onPress={() => navigation.navigate("CommunicationHub")}
                  style={({ pressed }) => [
                    styles.teacherIconButton,
                    { backgroundColor: colors.surface },
                    cardShadow,
                    pressed && { opacity: pressedOpacity },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open communication hub"
                >
                  <Ionicons name="notifications" size={18} color={colors.accent} />
                </Pressable>
                <View style={[styles.teacherAvatarFrame, { backgroundColor: "#EFE5FF" }]}>
                  <Image
                    source={require("../../../assets/avatars/hero-profile-illustration.png")}
                    style={styles.teacherAvatar}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>

            <View style={styles.teacherTabRow}>
              {TEACHER_TABS.map((tab, index) => {
                const isActive = index === 0;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => {
                      if (tab === "Teaching") navigation.navigate("Studio");
                      if (tab === "Assignment") navigation.navigate("Assignment");
                    }}
                    style={({ pressed }) => [
                      styles.teacherTabPill,
                      {
                        backgroundColor: isActive ? colors.accent : colors.surface,
                      },
                      cardShadow,
                      pressed && { opacity: pressedOpacity },
                    ]}
                  >
                    <Text style={[styles.teacherTabText, { color: isActive ? "#FFFFFF" : colors.textSecondary }]}>
                      {tab}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.teacherHeroCard, cardShadow]}
            >
              <View style={styles.teacherHeroCopy}>
                <View style={styles.teacherHeroTag}>
                  <Ionicons name="star" size={12} color="#FFFFFF" />
                  <Text style={styles.teacherHeroTagText}>Today&apos;s teaching focus</Text>
                </View>
                {teacherSummary?.continueTopic ? (
                  <>
                    <Text style={styles.teacherHeroTitle}>Continue &quot;{teacherSummary.continueTopic.name}&quot;</Text>
                    <View style={styles.teacherHeroChip}>
                      <Text style={[styles.teacherHeroChipText, { color: colors.textPrimary }]}>{teacherSummary.continueTopic.subject}</Text>
                    </View>
                    <Pressable
                      onPress={() => navigation.navigate("TopicDetail", { topicId: teacherSummary.continueTopic!.id })}
                      style={({ pressed }) => [styles.teacherHeroButton, pressed && { opacity: pressedOpacity }]}
                    >
                      <Text style={[styles.teacherHeroButtonText, { color: colors.textPrimary }]}>Continue</Text>
                      <Ionicons name="arrow-forward" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.teacherHeroTitle}>Start your first topic with AI</Text>
                    <Pressable
                      onPress={() => navigation.navigate("Studio")}
                      style={({ pressed }) => [styles.teacherHeroButton, pressed && { opacity: pressedOpacity }]}
                    >
                      <Text style={[styles.teacherHeroButtonText, { color: colors.textPrimary }]}>Get started</Text>
                      <Ionicons name="arrow-forward" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </>
                )}
              </View>
              <Image source={decorativeAssets.teacherHero} style={styles.teacherHeroGraphic} resizeMode="contain" />
            </LinearGradient>

            <View style={styles.teacherSectionHeader}>
              <Text style={[styles.teacherSectionTitle, { color: colors.textPrimary }]}>Your plan</Text>
              <Pressable onPress={() => navigation.navigate("Analytics")}>
                <Text style={[styles.teacherSeeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            </View>

            <View style={styles.teacherSummaryRow}>
              {TEACHER_SUMMARY_CARD_CONFIG.map((card) => {
                const isLessons = card.key === "lessons";
                const value = isLessons ? teacherSummary?.topicCount ?? 0 : teacherSummary?.assignmentCount ?? 0;
                const metaTop = isLessons ? "Updated this week" : "Draft";
                const metaTopValue = isLessons ? teacherSummary?.topicsUpdatedThisWeek ?? 0 : teacherSummary?.draftAssignmentCount ?? 0;
                const metaBottom = isLessons ? null : "Published";
                const metaBottomValue = isLessons ? null : teacherSummary?.publishedAssignmentCount ?? 0;
                return (
                  <Pressable
                    key={card.key}
                    onPress={() => navigation.navigate(isLessons ? "Studio" : "Assignment")}
                    style={({ pressed }) => [
                      styles.teacherSummaryCard,
                      { backgroundColor: card.accent },
                      cardShadow,
                      pressed && { opacity: pressedOpacity },
                    ]}
                  >
                    <View style={styles.teacherSummaryHeader}>
                      <View style={styles.teacherSummaryIcon}>
                        <Ionicons name={card.icon} size={16} color="#FFFFFF" />
                      </View>
                      <Ionicons name="bookmark-outline" size={16} color="#FFFFFF" />
                    </View>
                    <Text style={styles.teacherSummaryTitle}>{card.title}</Text>
                    <Text style={styles.teacherSummaryValue}>{value}</Text>
                    <Text style={styles.teacherSummaryMetaLabel}>{metaTop}</Text>
                    <Text style={styles.teacherSummaryMetaValue}>{metaTopValue}</Text>
                    {metaBottom ? (
                      <>
                        <Text style={styles.teacherSummaryMetaLabel}>{metaBottom}</Text>
                        <Text style={styles.teacherSummaryMetaValue}>{metaBottomValue}</Text>
                      </>
                    ) : null}
                    <View style={styles.teacherSummaryFooter}>
                      <View style={styles.teacherSummaryButton}>
                        <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                      </View>
                    </View>
                    <Image source={card.graphic} style={styles.teacherSummaryGraphic} resizeMode="contain" />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => navigation.navigate("Assignment")}
              style={({ pressed }) => [
                styles.teacherHighlightCard,
                { backgroundColor: colors.warning },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
            >
              <View style={styles.teacherHighlightTopRow}>
                <View style={[styles.teacherHighlightBadge, { backgroundColor: "rgba(124,0,90,0.12)" }]}>
                  <Text style={[styles.teacherHighlightBadgeText, { color: colors.accent }]}>
                    {(teacherSummary?.ungradedSubmissionCount ?? 0) > 0 ? "Review" : "Up to date"}
                  </Text>
                </View>
              </View>
              <View style={styles.teacherHighlightBody}>
                <View style={styles.teacherHighlightCopy}>
                  <Text style={styles.teacherHighlightTitle}>
                    {(teacherSummary?.ungradedSubmissionCount ?? 0) > 0 ? "Check submissions" : "All caught up"}
                  </Text>
                  <View style={styles.teacherHighlightFooter}>
                    <View style={styles.teacherHighlightAvatars}>
                      <View style={[styles.teacherMiniAvatar, { backgroundColor: colors.accent }]}>
                        <Text style={styles.teacherMiniAvatarText}>{teacherSummary?.ungradedSubmissionCount ?? 0}</Text>
                      </View>
                      <View style={[styles.teacherMiniAvatar, styles.teacherMiniAvatarAlt]}>
                        <Ionicons name="people" size={14} color={colors.accentDark} />
                      </View>
                    </View>
                    <View style={styles.teacherHighlightArrow}>
                      <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                    </View>
                  </View>
                </View>
                <Image source={decorativeAssets.teacherSubmissions} style={styles.teacherHighlightGraphic} resizeMode="contain" />
              </View>
            </Pressable>

            <Text style={[styles.teacherSectionTitle, { color: colors.textPrimary }]}>Recent activity</Text>
            <View style={[styles.teacherTimelineCard, { backgroundColor: colors.surface }, cardShadow]}>
              {!teacherSummary || teacherSummary.recentActivity.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {isLoadingTeacherSummary ? "Loading…" : "No recent activity yet."}
                </Text>
              ) : (
                teacherSummary.recentActivity.map((item, index) => {
                  const config = ACTIVITY_TYPE_CONFIG[item.type];
                  const canOpen = item.type === "assignment_published" || Boolean(item.topicId);
                  return (
                    <Pressable
                      key={`${item.type}-${item.id}`}
                      style={({ pressed }) => [styles.teacherTimelineRow, canOpen && pressed && { opacity: pressedOpacity }]}
                      disabled={!canOpen}
                      onPress={() => {
                        if (item.type === "assignment_published") {
                          navigation.navigate("AssignmentDetail", { assignmentId: item.id });
                        } else if (item.topicId) {
                          navigation.navigate("TopicDetail", { topicId: item.topicId });
                        }
                      }}
                    >
                      <View style={styles.teacherTimelineTrack}>
                        <View style={[styles.teacherTimelineDot, { backgroundColor: config.color }]} />
                        {index < teacherSummary.recentActivity.length - 1 ? (
                          <View style={[styles.teacherTimelineLine, { backgroundColor: "#ECEAF4" }]} />
                        ) : null}
                      </View>
                      <View style={styles.teacherTimelineMain}>
                        <Text style={[styles.teacherTimelineTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={[styles.teacherTimelineSubtitle, { color: colors.textMuted }]}>{formatRelativeTime(item.timestamp)}</Text>
                      </View>
                      <Ionicons name={config.icon} size={20} color={config.color} />
                    </Pressable>
                  );
                })
              )}
            </View>
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No dashboard is configured for this role yet.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  graphic,
  colors,
  shadow,
}: {
  title: string;
  value: number;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  graphic?: ImageSourcePropType;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: ReturnType<typeof useTheme>["cardShadow"];
}) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow]}>
      {graphic ? <Image source={graphic} style={styles.kpiGraphic} resizeMode="contain" /> : null}
      <View style={styles.kpiTopRow}>
        <View style={[styles.kpiIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon} size={17} color={colors.accent} />
        </View>
        <Text style={[styles.kpiValue, { color: colors.textPrimary }]}>{String(value).padStart(2, "0")}</Text>
      </View>
      <Text style={[styles.kpiTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.kpiHint, { color: colors.textMuted }]}>{hint}</Text>
    </View>
  );
}

function ActionCard({
  icon,
  label,
  sublabel,
  graphic,
  colors,
  shadow,
  pressedOpacity,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  graphic?: ImageSourcePropType;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        shadow,
        pressed && { opacity: pressedOpacity },
      ]}
      accessibilityRole="button"
    >
      {graphic ? <Image source={graphic} style={styles.actionGraphic} resizeMode="contain" /> : null}
      <View style={styles.actionCardHeader}>
        <View style={[styles.actionIconBg, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.actionSub, { color: colors.textMuted }]}>{sublabel}</Text>
    </Pressable>
  );
}

function RecentLeadRow({
  enquiry,
  colors,
  mode,
  isLast,
  onPress,
}: {
  enquiry: Enquiry;
  colors: ReturnType<typeof useTheme>["colors"];
  mode: "light" | "dark";
  isLast: boolean;
  onPress: () => void;
}) {
  const avatarSource = getAvatarSource(enquiry.id);
  const statusColor = getStatusColor(enquiry.status, mode);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.listRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.rowAvatarWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
        <Image source={avatarSource} style={styles.rowAvatar} resizeMode="contain" />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {enquiry.contactName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {formatSource(enquiry.source)} · {formatRelativeTime(enquiry.createdAt)}
        </Text>
      </View>
      <View style={[styles.rowBadge, { backgroundColor: statusColor.bg }]}>
        <Text style={[styles.rowBadgeText, { color: statusColor.text }]}>{enquiry.status}</Text>
      </View>
    </Pressable>
  );
}

function TaskPreviewRow({
  task,
  colors,
  isLast,
  onPress,
}: {
  task: FollowUpTask;
  colors: ReturnType<typeof useTheme>["colors"];
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.listRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.taskPreviewIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={task.channel === "sms" ? "chatbubble-outline" : "mail-outline"} size={16} color={colors.accent} />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.enquiry?.contactName ?? "Lead follow-up"}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {task.channel.toUpperCase()} · due {new Date(task.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 132,
  },
  heroCard: {
    borderRadius: 24,
    padding: 16,
    gap: 0,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },
  profileBlock: {
    flex: 1,
  },
  profileTextBlock: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    marginTop: 4,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    maxWidth: "95%",
  },
  heroBell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroFocusText: {
    flex: 1,
  },
  focusCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  focusGraphicWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  focusGraphic: {
    width: 46,
    height: 46,
  },
  focusLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  focusValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  focusMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  dashboardBody: {
    marginTop: 14,
    gap: 16,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  kpiCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    minHeight: 128,
    overflow: "hidden",
  },
  kpiGraphic: {
    position: "absolute",
    right: 8,
    bottom: 6,
    width: 54,
    height: 54,
    opacity: 0.1,
  },
  kpiTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  kpiTitle: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: "800",
  },
  kpiHint: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
  },
  alertCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  alertLeft: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flex: 1,
  },
  alertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTextBlock: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  alertSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    minHeight: 132,
    overflow: "hidden",
  },
  actionGraphic: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 54,
    height: 54,
    opacity: 0.1,
  },
  actionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  actionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  actionSub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  splitSection: {
    gap: 16,
  },
  splitColumn: {
    gap: 10,
  },
  panelCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rowAvatar: {
    width: 34,
    height: 34,
  },
  taskPreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },
  rowBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  teacherWrap: {
    paddingTop: 8,
    gap: 18,
  },
  teacherTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  teacherGreetingBlock: {
    flex: 1,
    paddingTop: 10,
  },
  teacherGreeting: {
    fontSize: 15,
    lineHeight: 21,
  },
  teacherName: {
    marginTop: 2,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  teacherIntro: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: "92%",
  },
  teacherTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teacherIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  teacherAvatarFrame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  teacherAvatar: {
    width: 38,
    height: 38,
  },
  teacherTabRow: {
    flexDirection: "row",
    gap: 10,
  },
  teacherTabPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  teacherTabText: {
    fontSize: 15,
    fontWeight: "700",
  },
  teacherHeroCard: {
    minHeight: 266,
    borderRadius: 28,
    padding: 22,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  teacherHeroCopy: {
    maxWidth: "62%",
    gap: 12,
  },
  teacherHeroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teacherHeroTagText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  teacherHeroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  teacherHeroChip: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  teacherHeroChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  teacherHeroButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    minWidth: 168,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  teacherHeroButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  teacherHeroGraphic: {
    position: "absolute",
    right: 2,
    bottom: 8,
    width: 160,
    height: 160,
    opacity: 0.95,
  },
  teacherSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teacherSeeAll: {
    fontSize: 14,
    fontWeight: "600",
  },
  teacherSummaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  teacherSummaryCard: {
    flex: 1,
    minHeight: 234,
    borderRadius: 26,
    padding: 14,
    overflow: "hidden",
  },
  teacherSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teacherSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherSummaryTitle: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  teacherSummaryValue: {
    marginTop: 2,
    color: "#FFFFFF",
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
  },
  teacherSummaryMetaLabel: {
    marginTop: 6,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "500",
  },
  teacherSummaryMetaValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  teacherSummaryFooter: {
    marginTop: 16,
  },
  teacherSummaryButton: {
    alignSelf: "flex-start",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherSummaryGraphic: {
    position: "absolute",
    right: 8,
    bottom: 12,
    width: 68,
    height: 68,
    opacity: 0.92,
  },
  teacherHighlightCard: {
    borderRadius: 24,
    padding: 16,
    overflow: "hidden",
  },
  teacherHighlightTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teacherHighlightBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  teacherHighlightBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  teacherHighlightBody: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  teacherHighlightCopy: {
    flex: 1,
  },
  teacherHighlightTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  teacherHighlightFooter: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teacherHighlightAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  teacherMiniAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)",
  },
  teacherMiniAvatarAlt: {
    marginLeft: -8,
    backgroundColor: "#F9D7EA",
  },
  teacherMiniAvatarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  teacherHighlightArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherHighlightGraphic: {
    width: 88,
    height: 88,
  },
  teacherTimelineCard: {
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  teacherTimelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  teacherTimelineTrack: {
    width: 12,
    alignItems: "center",
  },
  teacherTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  teacherTimelineLine: {
    width: 2,
    flex: 1,
    minHeight: 48,
    marginTop: 4,
    borderRadius: 1,
  },
  teacherTimelineMain: {
    flex: 1,
  },
  teacherTimelineTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
  },
  teacherTimelineSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  teacherSectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  emptyText: {
    paddingVertical: 18,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
  },
});
