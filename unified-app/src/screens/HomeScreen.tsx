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
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { api } from "../api/client";

// admin/leadership no longer reach this screen at all - AppNavigator routes them to
// NoAccessScreen instead. Kept as an explicit allowlist (not "everyone but teacher")
// so this stays correct if a new role is ever added.
const ENROLMENT_ROLES = ["front_desk", "counsellor"];

interface Stats {
  newEnquiries: number;
  followUps: number;
  visitsToday: number;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  const isEnrolmentRole = user ? ENROLMENT_ROLES.includes(user.role) : false;
  const isTeacher = user?.role === "teacher";

  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const loadStats = useCallback(async () => {
    if (!accessToken || !isEnrolmentRole) return;
    setIsLoadingStats(true);
    try {
      const [newRes, followUps, visitRes] = await Promise.all([
        api.listEnquiries(accessToken, { status: "new" }),
        api.listFollowUpTasks(accessToken, { status: "pending" }),
        api.listEnquiries(accessToken, { status: "visit" }),
      ]);
      setStats({
        newEnquiries: (newRes.meta?.totalCount as number) ?? newRes.data?.length ?? 0,
        followUps: followUps.length,
        visitsToday: (visitRes.meta?.totalCount as number) ?? visitRes.data?.length ?? 0,
      });
    } catch {
      setStats(null);
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
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header/Greeting Section */}
        <View style={styles.headerRow}>
          <View style={styles.profileSection}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "15", borderColor: colors.border }]}>
              <Text style={[styles.avatarText, { color: colors.textPrimary }]}>{initials}</Text>
            </View>
            <View style={styles.nameSection}>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting()},</Text>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{user.fullName}</Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{user.role}</Text>
              </View>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.bellButton, pressed && { opacity: pressedOpacity }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
            <View style={[styles.bellDot, { backgroundColor: colors.danger }]} />
          </Pressable>
        </View>

        {isEnrolmentRole ? (
          <>
            <View style={styles.tileGrid}>
              <HomeTile
                icon="mail-outline"
                label="Enquiries"
                sublabel="View all enquiries"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Enquiries")}
              />
              <HomeTile
                icon="git-network-outline"
                label="Pipeline Board"
                sublabel="Track your pipeline"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Pipeline")}
              />
              <HomeTile
                icon="checkbox-outline"
                label="Follow Up Tasks"
                sublabel="Manage follow-ups"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Tasks")}
              />
              <HomeTile
                icon="download-outline"
                label="CSV Export"
                sublabel="Export admissions"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("More", { screen: "CsvExport" })}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Overview</Text>
            {isLoadingStats && !stats ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
            ) : (
              <View style={styles.statsRow}>
                <StatTile label="New Enquiries" value={stats?.newEnquiries ?? 0} colors={colors} shadow={cardShadow} />
                <StatTile label="Follow Ups" value={stats?.followUps ?? 0} colors={colors} shadow={cardShadow} />
                <StatTile label="Visits Today" value={stats?.visitsToday ?? 0} colors={colors} shadow={cardShadow} />
              </View>
            )}

            {stats && stats.followUps > 0 ? (
              <Pressable
                style={({ pressed }) => [
                  styles.banner,
                  { backgroundColor: colors.warning + "15", borderColor: colors.warning },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => navigation.navigate("Tasks")}
                accessibilityRole="button"
              >
                <View style={[styles.bannerIconContainer, { backgroundColor: colors.warning }]}>
                  <Ionicons name="alarm-outline" size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>Stay on top of your pipeline!</Text>
                  <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
                    You have {stats.followUps} task{stats.followUps === 1 ? "" : "s"} due today
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </>
        ) : isTeacher ? (
          <>
            <View style={styles.tileGrid}>
              <HomeTile
                icon="book-outline"
                label="Lesson Studio"
                sublabel="Coming soon"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Studio")}
              />
              <HomeTile
                icon="document-text-outline"
                label="Assignment Lab"
                sublabel="Coming soon"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Assignment")}
              />
              <HomeTile
                icon="bar-chart-outline"
                label="Analytics"
                sublabel="Coming soon"
                colors={colors}
                shadow={cardShadow}
                pressedOpacity={pressedOpacity}
                onPress={() => navigation.navigate("Analytics")}
              />
            </View>
            <Text style={[styles.summary, { color: colors.textMuted }]}>
              The AI Module (Lesson Studio, Assignment Lab, Analytics) hasn't been built yet.
            </Text>
          </>
        ) : (
          <Text style={[styles.summary, { color: colors.textMuted }]}>No screens are configured for this role yet.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function HomeTile({
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
  shadow: ViewStyle;
  pressedOpacity: number;
  onPress: () => void;
}) {
  const tileScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(tileScale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(tileScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 6,
    }).start();
  };

  return (
    <Animated.View style={[styles.tileWrapper, { transform: [{ scale: tileScale }] }]}>
      <Pressable
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: colors.surface, borderColor: colors.border },
          shadow,
          pressed && { opacity: pressedOpacity },
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.tileIcon, { backgroundColor: colors.accent + "15" }]}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        <Text style={[styles.tileLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.tileSublabel, { color: colors.textMuted }]}>{sublabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

function StatTile({
  label,
  value,
  colors,
  shadow,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: ViewStyle;
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
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>
        {String(value).padStart(2, "0")}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  profileSection: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "800" },
  nameSection: { justifyContent: "center" },
  greeting: { fontSize: 13, fontWeight: "500" },
  name: { fontSize: 18, fontWeight: "800", marginTop: 1 },
  roleBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bellDot: {
    position: "absolute",
    top: 10,
    right: 11,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tileWrapper: { width: "47%" },
  tile: { width: "100%", borderWidth: 1, borderRadius: 16, padding: 14 },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  tileLabel: { fontSize: 14, fontWeight: "700" },
  tileSublabel: { fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800", marginTop: 28, marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statTile: { flex: 1, borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 12, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 4, textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 22,
  },
  bannerIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 13, fontWeight: "700" },
  bannerText: { fontSize: 12, marginTop: 2 },
  summary: { fontSize: 13, marginTop: 20, lineHeight: 19 },
});
