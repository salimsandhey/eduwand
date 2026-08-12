import { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  ViewStyle,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { getStatusColor } from "../theme/statusColors";
import { api, Enquiry } from "../api/client";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

interface Stats {
  newEnquiries: number;
  followUps: number;
  visitsToday: number;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
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
  return past.toLocaleDateString();
}

export function HomeScreen() {
  const { user, accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  const isEnrolmentRole = user ? ENROLMENT_ROLES.includes(user.role) : false;
  const isTeacher = user?.role === "teacher";

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentEnquiries, setRecentEnquiries] = useState<Enquiry[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

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
      setStats({
        newEnquiries: (newRes.meta?.totalCount as number) ?? newRes.data?.length ?? 0,
        followUps: followUps.length,
        visitsToday: (visitRes.meta?.totalCount as number) ?? visitRes.data?.length ?? 0,
      });

      // Get top 3 sorted by createdAt descending
      const sorted = [...(allEnquiriesRes.data ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRecentEnquiries(sorted.slice(0, 3));
    } catch {
      setStats(null);
      setRecentEnquiries([]);
    } finally {
      setIsLoadingStats(false);
    }
  }, [accessToken, isEnrolmentRole]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  if (!user) return null;

  // Extract initials
  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* Deep Green Gradient Banner Header */}
        <LinearGradient
          colors={["#0A4D27", "#145D33", "#1B6D3D"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientHeader}
        >
          {/* Top Profile & Bell Row */}
          <View style={styles.topHeaderRow}>
            <View style={styles.profileSection}>
              <View style={[styles.avatarCircle, { backgroundColor: "rgba(255, 255, 255, 0.2)" }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.nameSection}>
                <Text style={styles.greetingText}>{greeting()},</Text>
                <Text style={styles.nameText}>{user.fullName} 👋</Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.bellButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Ionicons name="notifications-outline" size={20} color="#000000" />
              <View style={styles.bellDot} />
            </Pressable>
          </View>

          {/* Slogan & Book Graphic Container */}
          <View style={styles.sloganContainer}>
            <View style={styles.sloganTextContainer}>
              <Text style={styles.sloganTitle}>Ready to grow today's admissions?</Text>
              <Text style={styles.sloganSubtitle}>
                Manage enquiries, follow ups and convert more students.
              </Text>
            </View>
            <View style={styles.bookIllustration}>
              <Ionicons name="school" size={48} color="rgba(255, 255, 255, 0.45)" style={styles.schoolIcon} />
              <Ionicons name="ribbon-outline" size={24} color="rgba(255, 255, 255, 0.35)" style={styles.ribbonIcon} />
            </View>
          </View>
        </LinearGradient>

        {/* Overlapping Summary Card */}
        {isEnrolmentRole ? (
          <View style={[styles.overlapCard, cardShadow]}>
            <View style={styles.overlapLeft}>
              <Text style={styles.overlapValue}>{stats?.newEnquiries ?? 18}</Text>
              <Text style={styles.overlapLabel}>New Enquiries</Text>
              <Text style={styles.overlapTrend}>▲ +12% from yesterday</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("NewEnquiryForm")}
              style={({ pressed }) => [
                styles.quickAddBtn,
                { backgroundColor: colors.accent },
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.quickAddText, { color: colors.accentOn }]}>Quick Add Enquiry +</Text>
            </Pressable>
          </View>
        ) : null}

        {isEnrolmentRole ? (
          <View style={styles.mainContent}>
            
            {/* Today's Overview Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Overview</Text>
              <Pressable onPress={() => navigation.navigate("Enquiries")} style={styles.viewDetailsLink}>
                <Text style={[styles.viewDetailsText, { color: colors.textMuted }]}>View Details</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
              </Pressable>
            </View>

            {isLoadingStats && !stats ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
            ) : (
              <View style={styles.statsRow}>
                <StatTile
                  icon="person-add-outline"
                  label="New Enquiries"
                  value={stats?.newEnquiries ?? 0}
                  colors={colors}
                  shadow={cardShadow}
                />
                <StatTile
                  icon="time-outline"
                  label="Follow Ups"
                  value={stats?.followUps ?? 0}
                  colors={colors}
                  shadow={cardShadow}
                />
                <StatTile
                  icon="calendar-outline"
                  label="Visits Today"
                  value={stats?.visitsToday ?? 0}
                  colors={colors}
                  shadow={cardShadow}
                />
              </View>
            )}

            {/* Task Warning Banner */}
            {stats && stats.followUps > 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.taskBanner,
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => navigation.navigate("Tasks")}
                accessibilityRole="button"
              >
                <View style={styles.taskBannerLeft}>
                  <View style={styles.alarmIconBg}>
                    <Ionicons name="alarm-outline" size={20} color="#BF7A0A" />
                  </View>
                  <View style={styles.taskBannerTextContainer}>
                    <Text style={styles.taskBannerTitle}>Stay on top of your pipeline!</Text>
                    <Text style={styles.taskBannerSub}>You have {stats.followUps} tasks due today.</Text>
                  </View>
                </View>
                <View style={styles.reviewTasksBtn}>
                  <Text style={styles.reviewTasksText}>Review Tasks</Text>
                  <Ionicons name="chevron-forward" size={10} color="#664608" />
                </View>
              </Pressable>
            ) : null}

            {/* Quick Actions Grid */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
              <Text style={[styles.subtitleHelper, { color: colors.textMuted }]}>Everything you need in one place</Text>
            </View>
            
            <View style={styles.actionGrid}>
              <ActionCard
                icon="person-add-outline"
                label="Enquiries"
                sublabel="View & manage all enquiries"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Enquiries")}
              />
              <ActionCard
                icon="git-network-outline"
                label="Pipeline Board"
                sublabel="Track your admissions pipeline"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Pipeline")}
              />
              <ActionCard
                icon="time-outline"
                label="Follow Up Tasks"
                sublabel="Never miss a follow up"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Tasks")}
              />
              <ActionCard
                icon="download-outline"
                label="CSV Export"
                sublabel="Download data & reports"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("More", { screen: "CsvExport" })}
              />
            </View>

            {/* Recent Activity List */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Activity</Text>
              <Pressable onPress={() => navigation.navigate("Enquiries")} style={styles.viewDetailsLink}>
                <Text style={[styles.viewDetailsText, { color: colors.textMuted }]}>View All</Text>
                <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={[styles.recentActivityList, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              {recentEnquiries.map((e, index) => {
                const statusColor = getStatusColor(e.status, mode);
                return (
                  <ActivityRow
                    key={e.id}
                    icon="person-add-outline"
                    title="New enquiry from "
                    boldTitle={e.contactName}
                    time={formatRelativeTime(e.createdAt)}
                    tagText={e.status}
                    tagColor={statusColor.text}
                    colors={colors}
                    isMiddle={index === 1}
                  />
                );
              })}
              {recentEnquiries.length === 0 ? (
                <Text style={[styles.emptyActivityText, { color: colors.textMuted }]}>No recent activities</Text>
              ) : null}
            </View>

          </View>
        ) : isTeacher ? (
          <View style={styles.mainContent}>
            <View style={styles.actionGrid}>
              <ActionCard
                icon="book-outline"
                label="Lesson Studio"
                sublabel="Plan & generate lessons"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Studio")}
              />
              <ActionCard
                icon="document-text-outline"
                label="Assignment Lab"
                sublabel="Create & grade assignments"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Assignment")}
              />
              <ActionCard
                icon="bar-chart-outline"
                label="Analytics"
                sublabel="View class insights"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Analytics")}
              />
            </View>
          </View>
        ) : (
          <Text style={[styles.teacherSummary, { color: colors.textMuted }]}>No screens configured.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatTile({
  icon,
  label,
  value,
  colors,
  shadow,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: any;
}) {
  return (
    <View
      style={[
        styles.statTile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: colors.accent,
        },
        shadow,
      ]}
    >
      <View style={[styles.statIconContainer, { backgroundColor: colors.accent + "12" }]}>
        <Ionicons name={icon} size={15} color={colors.accent} />
      </View>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>
        {String(value).padStart(2, "0")}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function ActionCard({
  icon,
  label,
  sublabel,
  colors,
  shadow,
  pressedOpacity,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: any;
  pressedOpacity: number;
  onPress: () => void;
}) {
  const actionScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(actionScale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(actionScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  return (
    <Animated.View style={[styles.actionWrapper, { transform: [{ scale: actionScale }] }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          shadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
      >
        <View style={styles.actionCardHeader}>
          <View style={[styles.actionIconBg, { backgroundColor: colors.accent + "12" }]}>
            <Ionicons name={icon} size={16} color={colors.accent} />
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
        <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.actionSub, { color: colors.textMuted }]}>{sublabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

function ActivityRow({
  icon,
  title,
  boldTitle,
  time,
  tagText,
  tagColor,
  colors,
  isMiddle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  boldTitle: string;
  time: string;
  tagText: string;
  tagColor: string;
  colors: ReturnType<typeof useTheme>["colors"];
  isMiddle?: boolean;
}) {
  return (
    <View style={[styles.activityRow, isMiddle && { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border }]}>
      <View style={[styles.activityIconContainer, { backgroundColor: tagColor + "12" }]}>
        <Ionicons name={icon} size={15} color={tagColor} />
      </View>
      <View style={styles.activityMain}>
        <Text style={[styles.activityText, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
          <Text style={{ fontWeight: "700" }}>{boldTitle}</Text>
        </Text>
        <Text style={[styles.activityTime, { color: colors.textMuted }]}>{time}</Text>
      </View>
      <View style={[styles.activityBadge, { backgroundColor: tagColor + "15" }]}>
        <Text style={[styles.activityBadgeText, { color: tagColor }]}>{tagText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#F7F8F7", paddingBottom: 32 },
  gradientHeader: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 48,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  nameSection: { justifyContent: "center" },
  greetingText: { fontSize: 12, color: "#D1EEDC", fontWeight: "500" },
  nameText: { fontSize: 16, color: "#FFFFFF", fontWeight: "700" },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#17C964",
  },
  sloganContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sloganTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  sloganTitle: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "800",
    lineHeight: 25,
  },
  sloganSubtitle: {
    fontSize: 12,
    color: "#E2F6EA",
    marginTop: 6,
    lineHeight: 16,
    opacity: 0.85,
  },
  bookIllustration: {
    width: 72,
    height: 72,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  schoolIcon: {
    position: "absolute",
  },
  ribbonIcon: {
    position: "absolute",
    bottom: 2,
    right: 2,
  },
  overlapCard: {
    marginHorizontal: 16,
    marginTop: -24,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#EAECE9",
  },
  overlapLeft: {
    flex: 1,
  },
  overlapValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#131A15",
  },
  overlapLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B564D",
    marginTop: 2,
  },
  overlapTrend: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1F9D55",
    marginTop: 4,
  },
  quickAddBtn: {
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  quickAddText: {
    fontSize: 11,
    fontWeight: "700",
  },
  mainContent: {
    paddingHorizontal: 16,
    marginTop: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  viewDetailsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewDetailsText: {
    fontSize: 11,
    fontWeight: "700",
  },
  subtitleHelper: {
    fontSize: 11,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
  },
  statIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  taskBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FDF4E7",
    borderWidth: 1,
    borderColor: "#FBE3BF",
    borderRadius: 14,
    padding: 12,
    marginTop: 16,
  },
  taskBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  alarmIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FCECD5",
    alignItems: "center",
    justifyContent: "center",
  },
  taskBannerTextContainer: {
    flex: 1,
  },
  taskBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#664608",
  },
  taskBannerSub: {
    fontSize: 11,
    color: "#8C6A2E",
    marginTop: 1,
    fontWeight: "600",
  },
  reviewTasksBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 28,
    gap: 2,
    borderWidth: 1,
    borderColor: "#FBE3BF",
  },
  reviewTasksText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#664608",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  actionWrapper: {
    width: "48%",
    marginBottom: 10,
  },
  actionCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 112,
  },
  actionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  actionIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  actionSub: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    lineHeight: 13,
  },
  recentActivityList: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  activityIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  activityMain: {
    flex: 1,
  },
  activityText: {
    fontSize: 11,
    fontWeight: "500",
  },
  activityTime: {
    fontSize: 10,
    marginTop: 2,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activityBadgeText: {
    fontSize: 9,
    fontWeight: "800",
  },
  emptyActivityText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 13,
    fontWeight: "500",
  },
  teacherSummary: {
    fontSize: 13,
    marginTop: 20,
    lineHeight: 19,
    textAlign: "center",
  },
});
