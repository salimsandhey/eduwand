import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";

const ENROLMENT_ROLES = ["front_desk", "counsellor", "admin", "leadership"];

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
  const { user } = useAuth();
  const { colors } = useTheme();
  // Shared between the enrolment and teacher tab navigators, whose sibling tab names
  // differ - kept loosely typed here rather than a brittle union of both param lists.
  const navigation = useNavigation<any>();

  const isEnrolmentRole = user ? ENROLMENT_ROLES.includes(user.role) : false;
  const isTeacher = user?.role === "teacher";

  const { accessToken } = useAuth();
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

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting()},</Text>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{user.fullName}</Text>
          <View style={[styles.roleBadge, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.roleBadgeText, { color: colors.accent }]}>{user.role}</Text>
          </View>
        </View>
        <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
      </View>

      {isEnrolmentRole ? (
        <>
          <View style={styles.tileGrid}>
            <HomeTile
              icon="mail-outline"
              label="Enquiries"
              sublabel="View all enquiries"
              colors={colors}
              onPress={() => navigation.navigate("Enquiries")}
            />
            <HomeTile
              icon="git-network-outline"
              label="Pipeline Board"
              sublabel="Track your pipeline"
              colors={colors}
              onPress={() => navigation.navigate("Pipeline")}
            />
            <HomeTile
              icon="checkbox-outline"
              label="Follow Up Tasks"
              sublabel="Manage follow-ups"
              colors={colors}
              onPress={() => navigation.navigate("Tasks")}
            />
            <HomeTile
              icon="download-outline"
              label="CSV Export"
              sublabel="Export admissions"
              colors={colors}
              onPress={() => navigation.navigate("More", { screen: "CsvExport" })}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Overview</Text>
          {isLoadingStats && !stats ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
          ) : (
            <View style={styles.statsRow}>
              <StatTile label="New Enquiries" value={stats?.newEnquiries ?? 0} colors={colors} />
              <StatTile label="Follow Ups" value={stats?.followUps ?? 0} colors={colors} />
              <StatTile label="Visits Today" value={stats?.visitsToday ?? 0} colors={colors} />
            </View>
          )}

          {stats && stats.followUps > 0 ? (
            <View style={[styles.banner, { backgroundColor: colors.accent }]}>
              <Ionicons name="alarm-outline" size={20} color={colors.accentOn} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerTitle, { color: colors.accentOn }]}>Stay on top of your pipeline!</Text>
                <Text style={[styles.bannerText, { color: colors.accentOn }]}>
                  You have {stats.followUps} task{stats.followUps === 1 ? "" : "s"} due today
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.accentOn} />
            </View>
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
              onPress={() => navigation.navigate("Studio")}
            />
            <HomeTile
              icon="document-text-outline"
              label="Assignment Lab"
              sublabel="Coming soon"
              colors={colors}
              onPress={() => navigation.navigate("Assignment")}
            />
            <HomeTile
              icon="bar-chart-outline"
              label="Analytics"
              sublabel="Coming soon"
              colors={colors}
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
  );
}

function HomeTile({
  icon,
  label,
  sublabel,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={[styles.tileIcon, { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.tileSublabel, { color: colors.textMuted }]}>{sublabel}</Text>
    </Pressable>
  );
}

function StatTile({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{String(value).padStart(2, "0")}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  greeting: { fontSize: 14 },
  name: { fontSize: 20, fontWeight: "700", marginTop: 2 },
  roleBadge: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  roleBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47%", borderWidth: 1, borderRadius: 14, padding: 14 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  tileLabel: { fontSize: 14, fontWeight: "700" },
  tileSublabel: { fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 28, marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 10 },
  statTile: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 4, textAlign: "center" },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 16, marginTop: 20 },
  bannerTitle: { fontSize: 13, fontWeight: "700" },
  bannerText: { fontSize: 12, marginTop: 2 },
  summary: { fontSize: 13, marginTop: 20, lineHeight: 19 },
});
