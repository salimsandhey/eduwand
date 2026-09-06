import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Image,
  ImageSourcePropType,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ThemeColors } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { getStatusColor } from "../../theme/statusColors";
import {
  api,
  Enquiry,
  FollowUpTask,
  TeacherDashboardSummary,
  TeacherDashboardActivityItem,
  EnrolmentTrend,
} from "../../api/client";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { resolveUserImageSource } from "../../theme/avatars";
import { capitalizeFirst } from "../../utils/text";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

function TypingName({ text, color, style }: { text: string; color: string; style: object }) {
  const [visibleChars, setVisibleChars] = useState(0);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setVisibleChars(0);
    if (!text) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startDelay = setTimeout(() => {
      interval = setInterval(() => {
        setVisibleChars((current) => {
          if (current >= text.length) {
            if (interval) clearInterval(interval);
            return current;
          }
          return current + 1;
        });
      }, 90);
    }, 250);
    return () => {
      clearTimeout(startDelay);
      if (interval) clearInterval(interval);
    };
  }, [text]);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [cursorOpacity]);

  const done = visibleChars >= text.length;

  return (
    <Text style={style}>
      <Text style={{ color }}>{text.slice(0, visibleChars)}</Text>
      {!done ? (
        <Animated.Text style={{ color, opacity: cursorOpacity }}>|</Animated.Text>
      ) : null}
    </Text>
  );
}

const TEACHER_SUMMARY_CARD_CONFIG = [
  { key: "lessons", title: "Lessons", accent: "#5B3FD6", icon: "book-outline" as const, graphic: decorativeAssets.teacherLessonCat },
  { key: "assignments", title: "Assignments", accent: "#F46B5B", icon: "clipboard-outline" as const, graphic: decorativeAssets.teacherAssignment },
] as const;

function getActivityTypeConfig(type: TeacherDashboardActivityItem["type"], colors: ThemeColors) {
  const map: Record<TeacherDashboardActivityItem["type"], { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
    generation: { icon: "document-text-outline", color: colors.accent, bg: colors.accentSoft },
    observation: { icon: "chatbox-ellipses-outline", color: colors.accent, bg: colors.accentSoft },
    assignment_published: { icon: "clipboard-outline", color: colors.warning, bg: colors.accentSoft },
  };
  return map[type] ?? { icon: "document-text-outline", color: colors.accent, bg: colors.accentSoft };
}

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

function getWeekDates(referenceDate: Date): Date[] {
  const monday = new Date(referenceDate);
  const dayOffset = referenceDate.getDay() === 0 ? -6 : 1 - referenceDate.getDay();
  monday.setDate(referenceDate.getDate() + dayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function HomeScreen() {
  const { user, accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const navigation = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();

  const isEnrolmentRole = user ? ENROLMENT_ROLES.includes(user.role) : false;
  const isTeacher = user?.role === "teacher";
  const today = new Date();
  const weekDates = getWeekDates(today);
  const teacherProfileImage = user
    ? resolveUserImageSource({
        id: user.id,
        fullName: user.fullName,
        avatarKey: user.avatarKey,
        hasPhoto: !!user.photoMimeType,
        photoUrl: accessToken ? api.myPhotoUrl(accessToken) : null,
      })
    : null;

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentEnquiries, setRecentEnquiries] = useState<Enquiry[]>([]);
  const [pendingTasks, setPendingTasks] = useState<FollowUpTask[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const [teacherSummary, setTeacherSummary] = useState<TeacherDashboardSummary | null>(null);
  const [isLoadingTeacherSummary, setIsLoadingTeacherSummary] = useState(false);

  const [enrolmentTrend, setEnrolmentTrend] = useState<EnrolmentTrend | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const notificationBellAnimation = useRef(new Animated.Value(0)).current;
  const notificationBadgeScale = useRef(new Animated.Value(1)).current;
  const heroBulbPulse = useRef(new Animated.Value(0)).current;
  const submissionMotion = useRef(new Animated.Value(0)).current;
  const heroCarouselRef = useRef<ScrollView>(null);
  const heroAutoAdvanceResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCount = teacherSummary?.ungradedSubmissionCount ?? 0;
  const heroWidth = Math.max(windowWidth - 32, 0);
  const [activeHeroPage, setActiveHeroPage] = useState(0);
  const [heroAutoAdvancePaused, setHeroAutoAdvancePaused] = useState(false);
  const notificationBellRotation = notificationBellAnimation.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ["0deg", "-12deg", "10deg", "-6deg", "0deg"],
  });
  const heroBulbScale = heroBulbPulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.12] });
  const heroBulbGlowScale = heroBulbPulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.55] });
  const heroBulbGlowOpacity = heroBulbPulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.52] });
  const heroBulbRayOpacity = heroBulbPulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] });
  const submissionGraphicLift = submissionMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -3, 0] });

  const teacherDisplayName = teacherFirstName(user?.fullName);
  const [typedTeacherName, setTypedTeacherName] = useState("");

  useEffect(() => {
    if (!isTeacher) return;
    setTypedTeacherName("");
    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setTypedTeacherName(teacherDisplayName.slice(0, index));
      if (index >= teacherDisplayName.length) {
        clearInterval(interval);
      }
    }, 70);
    return () => clearInterval(interval);
  }, [teacherDisplayName, isTeacher]);

  useEffect(() => {
    if (!isTeacher || notificationCount === 0) return;

    notificationBellAnimation.setValue(0);
    notificationBadgeScale.setValue(0.7);
    Animated.parallel([
      Animated.timing(notificationBellAnimation, { toValue: 1, duration: 460, useNativeDriver: true }),
      Animated.spring(notificationBadgeScale, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }),
    ]).start();
  }, [isTeacher, notificationBadgeScale, notificationBellAnimation, notificationCount]);

  useEffect(() => {
    if (!isTeacher) return;
    heroBulbPulse.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(heroBulbPulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(heroBulbPulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [heroBulbPulse, isTeacher]);

  useEffect(() => {
    if (!isTeacher || activeHeroPage !== 0) {
      submissionMotion.stopAnimation();
      submissionMotion.setValue(0);
      return;
    }

    submissionMotion.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(submissionMotion, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(submissionMotion, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [activeHeroPage, isTeacher, submissionMotion]);

  useEffect(() => {
    if (!isTeacher || heroAutoAdvancePaused || heroWidth === 0) return;
    const timer = setInterval(() => {
      setActiveHeroPage((currentPage) => {
        const nextPage = currentPage === 0 ? 1 : 0;
        heroCarouselRef.current?.scrollTo({ x: nextPage * heroWidth, animated: true });
        return nextPage;
      });
    }, 7000);
    return () => clearInterval(timer);
  }, [heroAutoAdvancePaused, heroWidth, isTeacher]);

  useEffect(() => {
    return () => {
      if (heroAutoAdvanceResumeTimer.current) clearTimeout(heroAutoAdvanceResumeTimer.current);
    };
  }, []);

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
      const [newRes, followUps, visitScheduledRes, visitDoneRes, allEnquiriesRes] = await Promise.all([
        api.listEnquiries(accessToken, { status: "new" }),
        api.listFollowUpTasks(accessToken, { status: "pending" }),
        api.listEnquiries(accessToken, { status: "visit_scheduled" }),
        api.listEnquiries(accessToken, { status: "visit_done" }),
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
        visitsToday:
          ((visitScheduledRes.meta?.totalCount as number) ?? visitScheduledRes.data?.length ?? 0) +
          ((visitDoneRes.meta?.totalCount as number) ?? visitDoneRes.data?.length ?? 0),
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

  const loadEnrolmentAnalytics = useCallback(async () => {
    if (!accessToken || !isEnrolmentRole) return;
    setIsLoadingAnalytics(true);
    try {
      const trend = await api.getEnrolmentTrend(accessToken, 6);
      setEnrolmentTrend(trend);
    } catch {
      setEnrolmentTrend(null);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [accessToken, isEnrolmentRole]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadTeacherSummary();
      loadEnrolmentAnalytics();
    }, [loadStats, loadTeacherSummary, loadEnrolmentAnalytics])
  );

  if (!user) return null;

  return (
    <Screen>
      {isEnrolmentRole ? (
        <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
          <>
            <View style={styles.enrolmentHeader}>
              <View style={styles.heroTopRow}>
                <View style={styles.profileBlock}>
                  <View style={styles.profileTextBlock}>
                    <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{greeting()},</Text>
                    <TypingName text={`${user.fullName}!`} color={colors.primaryBrand} style={styles.heroTitle} />
                    <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}> 
                      Here&apos;s what&apos;s happening at your school today.
                    </Text>
                  </View>
                </View>
                <View style={[styles.headerActions, { backgroundColor: colors.surface }, cardShadow]}>
                  <Pressable
                    onPress={() => navigation.navigate("Notifications")}
                    style={({ pressed }) => [styles.headerBell, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open notifications"
                  >
                    <Ionicons name="notifications-outline" size={20} color={colors.accent} />
                    {(stats?.followUps ?? 0) > 0 ? (
                      <View style={[styles.headerBadge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
                        <Text style={styles.headerBadgeText}>{(stats?.followUps ?? 0) > 9 ? "9+" : stats?.followUps}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate("More")}
                    style={({ pressed }) => [styles.headerAvatar, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel="Open profile menu"
                  >
                    {teacherProfileImage ? (
                      <Image
                        source={teacherProfileImage}
                        style={user.photoMimeType ? styles.headerAvatarPhoto : styles.headerAvatarIllustration}
                        resizeMode={user.photoMimeType ? "cover" : "contain"}
                      />
                    ) : (
                      <Ionicons name="person" size={18} color={colors.accent} />
                    )}
                  </Pressable>
                </View>
              </View>
              <View style={styles.teacherWeekRow} accessibilityLabel="Current week calendar">
                {weekDates.map((date) => {
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <View
                      key={date.toISOString()}
                      style={[
                        styles.teacherWeekDay,
                        { backgroundColor: isToday ? colors.accent : colors.surfaceRaised },
                      ]}
                    >
                      <Text style={[styles.teacherWeekDayLabel, { color: isToday ? colors.accentOn : colors.textMuted }]}>
                        {date.toLocaleDateString("en-IN", { weekday: "short" })}
                      </Text>
                      <Text style={[styles.teacherWeekDate, { color: isToday ? colors.accentOn : colors.textPrimary }]}>{date.getDate()}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.dashboardBody}>
              <EnrolmentAnalyticsSection
                trend={enrolmentTrend}
                isLoading={isLoadingAnalytics}
                colors={colors}
                cardShadow={cardShadow}
              />

              {isLoadingStats && !stats ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
              ) : (
                <View style={styles.kpiGrid}>
                  <KpiCard
                    title="Fresh Enquiries"
                    icon="people-outline"
                    tone="#7359D9"
                    graphic={decorativeAssets.teacherLessonCat}
                    shadow={cardShadow}
                    stat={{ value: stats?.newEnquiries ?? 0, label: "New enquiries" }}
                  />
                  <KpiCard
                    title="Follow up Queue"
                    icon="person-add-outline"
                    tone="#F2675B"
                    graphic={decorativeAssets.teacherAssignment}
                    shadow={cardShadow}
                    stat={{ value: stats?.followUps ?? 0, label: "Open tasks" }}
                  />
                  <KpiCard
                    title="Visit progress"
                    icon="calendar-outline"
                    tone="#E5A72D"
                    graphic={decorativeAssets.classBooks}
                    shadow={cardShadow}
                    stat={{ value: stats?.visitsToday ?? 0, label: "Visits scheduled" }}
                  />
                  <KpiCard
                    title="Conversions"
                    icon="checkmark-done-outline"
                    tone="#2FA678"
                    graphic={decorativeAssets.checkCircle}
                    shadow={cardShadow}
                    stat={{ value: stats?.converted ?? 0, label: "Converted" }}
                  />
                </View>
              )}

              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick actions</Text>
              </View>

              <View style={styles.actionGrid}>
                <ActionCard
                  icon="add"
                  label="New enquiry"
                  hint="Add a lead"
                  tone="#7C005A"
                  colors={colors}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("NewEnquiryForm")}
                />
                <ActionCard
                  icon="notifications-outline"
                  label="Notifications"
                  hint="View updates"
                  tone="#5B3FD6"
                  colors={colors}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("Notifications")}
                />
                <ActionCard
                  icon="help-circle-outline"
                  label="Help & support"
                  hint="Get assistance"
                  tone="#E5A72D"
                  image={decorativeAssets.followUpsCat}
                  colors={colors}
                  pressedOpacity={pressedOpacity}
                  onPress={() => navigation.navigate("HelpSupport")}
                />
              </View>

              <View style={styles.splitSection}>
                <View style={styles.splitColumn}>
                  <View style={styles.sectionRow}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent leads</Text>
                    <Pressable
                      onPress={() => navigation.navigate("Enquiries")}
                      hitSlop={8}
                      style={({ pressed }) => [styles.viewAll, pressed && { opacity: pressedOpacity }]}
                    >
                      <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                    </Pressable>
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
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Next follow-ups</Text>
                    <Pressable
                      onPress={() => navigation.navigate("Tasks")}
                      hitSlop={8}
                      style={({ pressed }) => [styles.viewAll, pressed && { opacity: pressedOpacity }]}
                    >
                      <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                    </Pressable>
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
        </ScrollView>
      ) : isTeacher ? (
        <View style={styles.teacherWrap}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.teacherHomeScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.teacherFixedHeader}>
              <View style={styles.teacherTopRow}>
                <View style={styles.teacherGreetingBlock}>
                  <Text style={[styles.teacherGreeting, { color: colors.textMuted }]}>
                    {greeting()}, <Text style={[styles.teacherGreetingName, { color: colors.accent }]}>{typedTeacherName}</Text>
                  </Text>
                </View>
                <View style={[styles.teacherTopActions, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <Pressable
                    onPress={() => navigation.navigate("CommunicationHub")}
                    style={({ pressed }) => [
                      styles.teacherIconButton,
                      { backgroundColor: colors.surface },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Open communication hub"
                  >
                    <Animated.View style={{ transform: [{ rotate: notificationBellRotation }] }}>
                      <Ionicons name="notifications" size={18} color={colors.accent} />
                    </Animated.View>
                    {notificationCount > 0 ? <Animated.View style={[styles.teacherNotificationDot, { backgroundColor: colors.danger, transform: [{ scale: notificationBadgeScale }] }]}><Text style={styles.teacherNotificationCount}>{notificationCount > 9 ? "9+" : notificationCount}</Text></Animated.View> : null}
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.teacherAvatarRing, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} onPress={() => navigation.navigate("More")} accessibilityRole="button" accessibilityLabel="Open more menu">
                    <View style={[styles.teacherAvatarFrame, { backgroundColor: colors.accentSoft }]}>
                      {teacherProfileImage ? <Image source={teacherProfileImage} style={user?.photoMimeType ? styles.teacherAvatarPhoto : styles.teacherAvatar} resizeMode={user?.photoMimeType ? "cover" : "contain"} /> : null}
                    </View>
                  </Pressable>
                </View>
              </View>
              <View style={styles.teacherWeekRow} accessibilityLabel="Current week calendar">
                {weekDates.map((date) => {
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <View
                      key={date.toISOString()}
                      style={[
                        styles.teacherWeekDay,
                        { backgroundColor: isToday ? colors.accent : colors.surfaceRaised },
                      ]}
                    >
                      <Text style={[styles.teacherWeekDayLabel, { color: isToday ? colors.accentOn : colors.textMuted }]}>
                        {date.toLocaleDateString("en-IN", { weekday: "short" })}
                      </Text>
                      <Text style={[styles.teacherWeekDate, { color: isToday ? colors.accentOn : colors.textPrimary }]}>{date.getDate()}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={styles.teacherHeroCarousel}>
              <ScrollView
                ref={heroCarouselRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScrollBeginDrag={() => {
                  if (heroAutoAdvanceResumeTimer.current) clearTimeout(heroAutoAdvanceResumeTimer.current);
                  setHeroAutoAdvancePaused(true);
                }}
                onMomentumScrollEnd={(event) => {
                  setActiveHeroPage(Math.round(event.nativeEvent.contentOffset.x / heroWidth));
                  heroAutoAdvanceResumeTimer.current = setTimeout(() => setHeroAutoAdvancePaused(false), 4000);
                }}
                scrollEventThrottle={16}
              >
                <LinearGradient
                  colors={["#5C42C6", "#32266F"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.teacherHeroCard, { width: heroWidth - 12, marginRight: 12 }]}
                >
                  <View style={styles.teacherHeroGlow} />
                  <View style={styles.teacherHeroCopy}>
                    <Text style={styles.teacherHeroEyebrow}>ASSIGNMENTS</Text>
                    <Text style={styles.teacherHeroTitle} numberOfLines={2}>
                      {notificationCount > 0 ? `${notificationCount} submission${notificationCount === 1 ? "" : "s"} to review` : "Your assignments are ready"}
                    </Text>
                    <Text style={styles.teacherHeroSubtitle}>
                      {teacherSummary?.publishedAssignmentCount ?? 0} published assignment{(teacherSummary?.publishedAssignmentCount ?? 0) === 1 ? "" : "s"} in progress.
                    </Text>
                    <View style={styles.teacherHeroPanel}>
                      <Pressable
                        onPress={() => navigation.navigate("Assignment")}
                        style={({ pressed }) => [styles.teacherHeroPanelButton, pressed && { opacity: pressedOpacity }]}
                      >
                        <Text style={[styles.teacherHeroPanelButtonText, { color: colors.textPrimary }]}>{notificationCount > 0 ? "Review submissions" : "Open assignments"}</Text>
                        <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
                      </Pressable>
                    </View>
                  </View>
                  <Animated.Image source={decorativeAssets.teacherSubmissionsNoStars} style={[styles.teacherHeroGraphic, { transform: [{ translateY: submissionGraphicLift }] }]} resizeMode="contain" />
                </LinearGradient>

                <LinearGradient
                  colors={[colors.accent, colors.accentDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.teacherHeroCard, { width: heroWidth - 12, marginRight: 12 }]}
                >
                  <View style={styles.teacherHeroGlow} />
                  <View style={styles.teacherHeroBulb} pointerEvents="none">
                    <Animated.View style={[styles.teacherHeroBulbGlow, { opacity: heroBulbGlowOpacity, transform: [{ scale: heroBulbGlowScale }] }]} />
                    <Animated.View style={[styles.teacherHeroBulbRay, styles.teacherHeroBulbRayTop, { opacity: heroBulbRayOpacity }]} />
                    <Animated.View style={[styles.teacherHeroBulbRay, styles.teacherHeroBulbRayLeft, { opacity: heroBulbRayOpacity }]} />
                    <Animated.View style={[styles.teacherHeroBulbRay, styles.teacherHeroBulbRayRight, { opacity: heroBulbRayOpacity }]} />
                    <Animated.View style={{ transform: [{ scale: heroBulbScale }] }}>
                      <Ionicons name="bulb" size={31} color="#FFE26B" />
                    </Animated.View>
                  </View>
                  <View style={styles.teacherHeroCopy}>
                    <Text style={styles.teacherHeroEyebrow}>{teacherSummary?.continueTopic ? "CONTINUE" : "LESSON STUDIO"}</Text>
                    {teacherSummary?.continueTopic ? (
                      <>
                        <Text style={styles.teacherHeroTitle} numberOfLines={2}>{capitalizeFirst(teacherSummary.continueTopic.name)}</Text>
                        <View style={styles.teacherHeroChip}>
                          <Text style={[styles.teacherHeroChipText, { color: colors.textPrimary }]}>{teacherSummary.continueTopic.subject}</Text>
                        </View>
                        <Text style={styles.teacherHeroSubtitle}>Updated {formatRelativeTime(teacherSummary.continueTopic.updatedAt)}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.teacherHeroTitle}>Start your first topic with AI</Text>
                        <Text style={styles.teacherHeroSubtitle}>Create a lesson plan in a few guided steps.</Text>
                      </>
                    )}
                    <View style={styles.teacherHeroPanel}>
                      <Pressable
                        onPress={() => navigation.navigate(teacherSummary?.continueTopic ? "TopicDetail" : "Studio", teacherSummary?.continueTopic ? { topicId: teacherSummary.continueTopic.id } : undefined)}
                        style={({ pressed }) => [styles.teacherHeroPanelButton, pressed && { opacity: pressedOpacity }]}
                      >
                        <Text style={[styles.teacherHeroPanelButtonText, { color: colors.textPrimary }]}>{teacherSummary?.continueTopic ? "Open topic" : "Get started"}</Text>
                        <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
                      </Pressable>
                    </View>
                  </View>
                  <Image source={decorativeAssets.teacherHeroNoBulb} style={styles.teacherHeroGraphic} resizeMode="contain" />
                </LinearGradient>
              </ScrollView>
              <View style={styles.teacherHeroPageDots} accessibilityLabel={`Hero card ${activeHeroPage + 1} of 2`}>
                {[0, 1].map((page) => <View key={page} style={[styles.teacherHeroPageDot, { backgroundColor: page === activeHeroPage ? colors.accent : colors.border }]} />)}
              </View>
            </View>

            <TeacherInsightTicker colors={colors} />

            <View style={styles.teacherSectionHeader}>
              <View>
                <Text style={[styles.teacherSectionTitle, { color: colors.textPrimary }]}>Your plan</Text>
                <Text style={[styles.teacherSectionHint, { color: colors.textMuted }]}>Your lesson and assessment workspace.</Text>
              </View>
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
                      <Text style={styles.teacherSummaryKicker}>{isLessons ? "CONTENT" : "ASSESSMENT"}</Text>
                    </View>
                    <Text style={styles.teacherSummaryTitle}>{card.title}</Text>
                    <View style={styles.teacherSummaryCountRow}>
                      <Text style={styles.teacherSummaryValue}>{value}</Text>
                      <Text style={styles.teacherSummaryCountLabel}>total</Text>
                    </View>
                    <View style={styles.teacherSummaryStatusRow}>
                      <View style={styles.teacherSummaryStatusDot} />
                      <Text style={styles.teacherSummaryMetaLabel}>
                        {metaTopValue} {metaTop.toLowerCase()}{metaBottom ? ` · ${metaBottomValue} ${metaBottom.toLowerCase()}` : ""}
                      </Text>
                    </View>
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
                { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
            >
              <View style={styles.teacherHighlightTopRow}>
                <View style={[styles.teacherHighlightIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="clipboard-outline" size={18} color={colors.accentOn} />
                </View>
                <Text style={[styles.teacherHighlightEyebrow, { color: colors.accent }]}>SUBMISSION REVIEW</Text>
              </View>
              <View style={styles.teacherHighlightBody}>
                <View style={styles.teacherHighlightCopy}>
                  <Text style={[styles.teacherHighlightTitle, { color: colors.textPrimary }]}>
                    {(teacherSummary?.ungradedSubmissionCount ?? 0) > 0 ? "Check submissions" : "All caught up"}
                  </Text>
                  <Text
                    style={[styles.teacherHighlightSubtitle, { color: colors.textMuted }]}
                  >
                    {(teacherSummary?.ungradedSubmissionCount ?? 0) > 0
                      ? `${teacherSummary?.ungradedSubmissionCount} student submission${teacherSummary?.ungradedSubmissionCount === 1 ? " is" : "s are"} ready for review.`
                      : "Every submitted assignment has been reviewed."}
                  </Text>
                </View>
                <View style={styles.teacherHighlightSide}>
                  <View style={styles.teacherHighlightCount}>
                    <Text style={[styles.teacherHighlightCountValue, { color: mode === "dark" ? "#A855F7" : "#7C005A" }]}>
                      {teacherSummary?.ungradedSubmissionCount ?? 0}
                    </Text>
                    <Text style={[styles.teacherHighlightCountLabel, { color: mode === "dark" ? "#A855F7" : "#7C005A" }]}>
                      TO REVIEW
                    </Text>
                  </View>
                  <View style={[styles.teacherHighlightArrow, { backgroundColor: colors.accent }]}>
                    <Ionicons name="arrow-forward" size={18} color={colors.accentOn} />
                  </View>
                </View>
              </View>
            </Pressable>

            <View style={styles.teacherActivityHeading}>
              <View>
                <Text style={[styles.teacherSectionTitle, { color: colors.textPrimary }]}>Recent activity</Text>
                <Text style={[styles.teacherSectionHint, { color: colors.textMuted }]}>Latest updates across your workspace.</Text>
              </View>
            </View>
            <View style={[styles.teacherTimelineCard, { backgroundColor: colors.surface }, cardShadow]}>
              {!teacherSummary || teacherSummary.recentActivity.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {isLoadingTeacherSummary ? "Loading…" : "No recent activity yet."}
                </Text>
              ) : (
                teacherSummary.recentActivity.map((item, index) => {
                  const config = getActivityTypeConfig(item.type, colors);
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
                      <View style={[styles.teacherActivityIcon, { backgroundColor: config.bg }]}>
                        <Ionicons name={config.icon} size={17} color={config.color} />
                      </View>
                      <View style={styles.teacherTimelineMain}>
                        <Text style={[styles.teacherTimelineTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={[styles.teacherTimelineSubtitle, { color: colors.textMuted }]}>{formatRelativeTime(item.timestamp)}</Text>
                      </View>
                      {canOpen ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      ) : (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No dashboard is configured for this role yet.</Text>
      )}
    </Screen>
  );
}

function KpiCard({
  title,
  icon,
  tone,
  graphic,
  shadow,
  stat,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  graphic?: ImageSourcePropType;
  shadow: ReturnType<typeof useTheme>["cardShadow"];
  stat: { value: number; label: string };
}) {
  return (
    <View style={[styles.kpiCard, { backgroundColor: tone }, shadow]}>
      {graphic ? <Image source={graphic} style={styles.kpiGraphic} resizeMode="contain" /> : null}
      <View style={styles.kpiTopRow}>
        <View style={styles.kpiIconWrap}>
          <Ionicons name={icon} size={12} color="#FFFFFF" />
        </View>
        <Text style={styles.kpiTitle} numberOfLines={1}>{title}</Text>
      </View>
      <View style={styles.kpiStatList}>
        <Text style={styles.kpiStatValue}>{String(stat.value).padStart(2, "0")}</Text>
        <Text style={styles.kpiStatLabel}>{stat.label}</Text>
      </View>
    </View>
  );
}

function ActionCard({
  icon,
  label,
  hint,
  tone,
  image,
  colors,
  pressedOpacity,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  tone: string;
  image?: ImageSourcePropType;
  colors: ReturnType<typeof useTheme>["colors"];
  pressedOpacity: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        { backgroundColor: tone + "1F", borderColor: tone + "40" },
        pressed && { opacity: pressedOpacity },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {image ? (
        <Image source={image} style={styles.actionPeek} resizeMode="contain" />
      ) : null}
      <View style={styles.actionTopRow}>
        <View style={[styles.actionIconBg, { backgroundColor: tone }]}>
          <Ionicons name={icon} size={19} color="#FFFFFF" />
        </View>
        <Ionicons name="arrow-forward" size={13} color={tone} style={styles.actionArrow} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.textPrimary }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.actionHint, { color: tone }]} numberOfLines={1}>
        {hint}
      </Text>
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
  const meta = [enquiry.gradeInterest, formatSource(enquiry.source)].filter(Boolean).join(" • ");

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
          {meta || formatRelativeTime(enquiry.createdAt)}
        </Text>
      </View>
      <View style={[styles.rowBadge, { backgroundColor: statusColor.bg }]}>
        <Text style={[styles.rowBadgeText, { color: statusColor.text }]} numberOfLines={1}>
          {capitalizeFirst(enquiry.status.replace(/_/g, " "))}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
  const time = new Date(task.dueAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const subtitle = task.channel === "email" ? "Email" : task.channel === "sms" ? "SMS follow-up" : "Call";
  const actionIcon = task.channel === "email" ? "mail-outline" : "call-outline";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.listRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.taskClock, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="time-outline" size={16} color={colors.accent} />
      </View>
      <Text style={[styles.taskTime, { color: colors.textPrimary }]}>{time}</Text>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.enquiry?.contactName ?? "Lead follow-up"}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.taskAction, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={actionIcon} size={15} color={colors.accent} />
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

function monthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", { month: "short" });
}

function EnrolmentAnalyticsSection({
  trend,
  isLoading,
  colors,
  cardShadow,
}: {
  trend: EnrolmentTrend | null;
  isLoading: boolean;
  colors: ThemeColors;
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
}) {
  return (
    <View style={[styles.analyticsCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
      <Text style={[styles.analyticsCaption, { color: colors.textSecondary }]}>Monthly enquiry trend</Text>
      {isLoading && !trend ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
      ) : (
        <View style={styles.chartArea}>
          <TrendChart trend={trend} colors={colors} />
        </View>
      )}
    </View>
  );
}

function TrendChart({ trend, colors }: { trend: EnrolmentTrend | null; colors: ThemeColors }) {
  const periods = trend?.periods ?? [];
  if (periods.length === 0) {
    return <Text style={[styles.chartEmpty, { color: colors.textMuted }]}>No trend data yet.</Text>;
  }
  const maxValue = Math.max(1, ...periods.flatMap((p) => [p.newEnquiries, p.converted]));
  return (
    <>
      <View style={styles.chartRow}>
        {periods.map((p) => (
          <View key={p.period} style={styles.chartCol}>
            <View style={styles.chartGroupTrack}>
              <View style={[styles.chartTrack, styles.chartTrackNarrow, { backgroundColor: colors.surfaceRaised }]}>
                <View
                  style={[
                    styles.chartFill,
                    { height: `${Math.max(4, (p.newEnquiries / maxValue) * 100)}%`, backgroundColor: "#7359D9" },
                  ]}
                />
              </View>
              <View style={[styles.chartTrack, styles.chartTrackNarrow, { backgroundColor: colors.surfaceRaised }]}>
                <View
                  style={[
                    styles.chartFill,
                    { height: `${Math.max(4, (p.converted / maxValue) * 100)}%`, backgroundColor: "#2FA678" },
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{monthLabel(p.period)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.chartLegendRow}>
        <LegendDot color="#7359D9" label="New" colors={colors} />
        <LegendDot color="#2FA678" label="Converted" colors={colors} />
      </View>
    </>
  );
}

function LegendDot({ color, label, colors }: { color: string; label: string; colors: ThemeColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const TEACHER_TICKER_ITEMS: { label: string; text: string; avatars: number[] }[] = [
  { label: "SUBMISSIONS", text: "10 students just submitted their assignment.", avatars: [0, 1, 2] },
  { label: "ASSIGN A TEST", text: "It's time to assign a new test to your class.", avatars: [3, 4, 5] },
  { label: "LESSON PLANS", text: "3 lesson plans are ready to review this week.", avatars: [5, 6, 7] },
];

function TeacherInsightTicker({ colors }: { colors: ThemeColors }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -14, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        setMessageIndex((current) => (current + 1) % TEACHER_TICKER_ITEMS.length);
        translateY.setValue(14);
        Animated.parallel([
          Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    }, 3200);
    return () => clearInterval(timer);
  }, [opacity, translateY]);

  const currentItem = TEACHER_TICKER_ITEMS[messageIndex];

  return (
    <View style={[styles.tickerWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.tickerAvatarStack}>
        {currentItem.avatars.map((avatarIndex, position) => (
          <Image
            key={position}
            source={AVATAR_SOURCES[avatarIndex]}
            style={[
              styles.tickerAvatar,
              { borderColor: colors.surface, marginLeft: position === 0 ? 0 : -10, zIndex: currentItem.avatars.length - position },
            ]}
          />
        ))}
        <View style={[styles.tickerLiveDot, { backgroundColor: "#3DDC84", borderColor: colors.surface }]} />
      </View>

      <View style={styles.tickerBody}>
        <Text style={[styles.tickerLabel, { color: colors.accent }]} numberOfLines={1}>
          {currentItem.label}
        </Text>
        <View style={styles.tickerTextClip}>
          <Animated.Text
            style={[styles.tickerText, { color: colors.textPrimary, opacity, transform: [{ translateY }] }]}
            numberOfLines={1}
          >
            {currentItem.text}
          </Animated.Text>
        </View>
      </View>
    </View>
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
  enrolmentHeader: { paddingTop: 18 },
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
    fontSize: 15,
    fontWeight: "500",
  },
  heroTitle: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    maxWidth: "95%",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 22,
    padding: 4,
  },
  headerBell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  headerBadgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarPhoto: {
    width: "100%",
    height: "100%",
  },
  headerAvatarIllustration: {
    width: 40,
    height: 40,
    marginTop: 3,
  },
  analyticsCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  analyticsCaption: {
    fontSize: 13,
    fontWeight: "700",
  },
  chartArea: {
    alignItems: "center",
  },
  chartEmpty: {
    fontSize: 13,
    fontWeight: "500",
    paddingVertical: 24,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    alignSelf: "stretch",
    gap: 6,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
  },
  chartValue: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  chartTrack: {
    width: 22,
    height: 96,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  chartTrackNarrow: {
    width: 10,
  },
  chartGroupTrack: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 96,
  },
  chartFill: {
    width: "100%",
    borderRadius: 8,
  },
  chartLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
  },
  chartFootnote: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  chartLegendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  dashboardBody: {
    marginTop: 22,
    gap: 16,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "800",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kpiCard: {
    width: "48%",
    borderRadius: 16,
    padding: 10,
    minHeight: 76,
    overflow: "hidden",
  },
  kpiGraphic: {
    position: "absolute",
    right: -14,
    bottom: -14,
    width: 52,
    height: 52,
    opacity: 0.55,
  },
  kpiTopRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 6,
  },
  kpiIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiTitle: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
  },
  kpiStatList: {
    marginTop: 6,
  },
  kpiStatValue: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  kpiStatLabel: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 1,
    fontSize: 8.5,
    fontWeight: "700",
  },
  actionGrid: {
    flexDirection: "row",
    gap: 10,
  },
  actionCard: {
    flex: 1,
    minHeight: 124,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: "space-between",
    gap: 8,
  },
  actionPeek: {
    position: "absolute",
    top: -41,
    right: 8,
    width: 54,
    height: 54,
    zIndex: 3,
  },
  actionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionArrow: {
    transform: [{ rotate: "-45deg" }],
    opacity: 0.75,
  },
  actionLabel: {
    fontSize: 13.5,
    fontWeight: "800",
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  actionHint: {
    fontSize: 11,
    fontWeight: "800",
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
    gap: 10,
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
  taskClock: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  taskTime: {
    width: 62,
    fontSize: 12,
    fontWeight: "800",
  },
  taskAction: {
    width: 30,
    height: 30,
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
    maxWidth: 116,
  },
  rowBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  teacherWrap: {
    flex: 1,
  },
  teacherFixedHeader: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  teacherHomeScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 132,
    gap: 18,
  },
  teacherTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  teacherGreetingBlock: {
    flex: 1,
  },
  teacherGreeting: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "600",
    letterSpacing: -0.45,
  },
  teacherGreetingName: {
    fontWeight: "800",
  },
  teacherTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 22,
    padding: 3,
  },
  teacherWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  teacherWeekDay: {
    width: 40,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  teacherWeekDayLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  teacherWeekDate: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  teacherIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  teacherNotificationDot: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  teacherNotificationCount: { color: "#FFFFFF", fontSize: 8, fontWeight: "800", lineHeight: 10 },
  teacherAvatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    padding: 2,
    borderWidth: 1,
  },
  teacherAvatarFrame: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  teacherAvatar: {
    width: 42,
    height: 42,
    marginTop: 3,
  },
  teacherAvatarPhoto: { width: "100%", height: "100%" },
  teacherHeroCarousel: {
    gap: 10,
  },
  teacherHeroCard: {
    minHeight: 220,
    borderRadius: 22,
    padding: 18,
    overflow: "hidden",
  },
  teacherHeroGlow: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -55,
    top: -72,
    backgroundColor: "#FFFFFF",
    opacity: 0.12,
  },
  teacherHeroBulb: {
    position: "absolute",
    bottom: 122,
    right: 86,
    width: 36,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  teacherHeroBulbGlow: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F7C948",
  },
  teacherHeroBulbRay: {
    position: "absolute",
    width: 4,
    height: 9,
    borderRadius: 4,
    backgroundColor: "#FFE26B",
  },
  teacherHeroBulbRayTop: {
    top: -6,
  },
  teacherHeroBulbRayLeft: {
    left: -3,
    top: 8,
    transform: [{ rotate: "-48deg" }],
  },
  teacherHeroBulbRayRight: {
    right: -3,
    top: 8,
    transform: [{ rotate: "48deg" }],
  },
  teacherHeroCopy: {
    maxWidth: "64%",
    zIndex: 2,
  },
  teacherHeroEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  teacherHeroTitle: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.55,
  },
  teacherHeroSubtitle: {
    marginTop: 3,
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  teacherHeroChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  teacherHeroChipText: {
    fontSize: 10,
    fontWeight: "700",
  },
  teacherHeroPanel: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 6,
  },
  teacherHeroPanelButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  teacherHeroPanelButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  teacherHeroGraphic: {
    position: "absolute",
    right: -30,
    bottom: -6,
    width: 174,
    height: 174,
    opacity: 0.98,
  },
  teacherHeroPageDots: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 6,
  },
  teacherHeroPageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tickerWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: "#7C005A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  tickerAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    position: "relative",
  },
  tickerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
  },
  tickerLiveDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  tickerBody: {
    flex: 1,
    gap: 3,
  },
  tickerLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  tickerTextClip: {
    height: 18,
    overflow: "hidden",
  },
  tickerText: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  teacherSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  teacherSectionHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  teacherSeeAll: {
    fontSize: 14,
    fontWeight: "800",
    paddingBottom: 1,
  },
  teacherSummaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  teacherSummaryCard: {
    flex: 1,
    minHeight: 184,
    borderRadius: 24,
    padding: 16,
    overflow: "hidden",
  },
  teacherSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teacherSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherSummaryKicker: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  teacherSummaryTitle: {
    marginTop: 16,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  teacherSummaryCountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
  },
  teacherSummaryValue: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
  },
  teacherSummaryCountLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    lineHeight: 18,
    fontWeight: "700",
    paddingBottom: 7,
  },
  teacherSummaryStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  teacherSummaryStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  teacherSummaryMetaLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  teacherSummaryFooter: {
    flex: 1,
    justifyContent: "flex-end",
    marginTop: 8,
  },
  teacherSummaryButton: {
    alignSelf: "flex-start",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  teacherSummaryGraphic: {
    position: "absolute",
    right: -2,
    bottom: 6,
    width: 78,
    height: 78,
    opacity: 0.25,
  },
  teacherHighlightCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    overflow: "hidden",
  },
  teacherHighlightTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teacherHighlightIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  teacherHighlightEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  teacherHighlightBody: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  teacherHighlightCopy: {
    flex: 1,
  },
  teacherHighlightTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  teacherHighlightSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  teacherHighlightSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teacherHighlightCount: {
    alignItems: "center",
    justifyContent: "center",
  },
  teacherHighlightCountValue: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
  },
  teacherHighlightCountLabel: {
    marginTop: 0,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  teacherHighlightArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  teacherTimelineCard: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  teacherActivityHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  teacherActivityLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  teacherActivityLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  teacherActivityLiveText: {
    fontSize: 10,
    fontWeight: "800",
  },
  teacherTimelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  teacherActivityIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  teacherTimelineMain: {
    flex: 1,
  },
  teacherTimelineTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  teacherTimelineSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
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
