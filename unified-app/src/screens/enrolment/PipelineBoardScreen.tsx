import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageSourcePropType,
  Alert,
  Animated,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { EnrolmentTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { getStatusColor } from "../../theme/statusColors";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { api, Enquiry, EnquiryStatus } from "../../api/client";

type Props = CompositeScreenProps<
  BottomTabScreenProps<EnrolmentTabParamList, "Pipeline">,
  NativeStackScreenProps<RootStackParamList>
>;

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

function getAvatarSource(seed: string) {
  const hash = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_SOURCES[hash % AVATAR_SOURCES.length];
}

function formatSource(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStageKey(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function timeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function stageIconFor(key: string): keyof typeof Ionicons.glyphMap {
  if (key.includes("visit")) return "calendar-outline";
  if (key.includes("application")) return "document-text-outline";
  if (key.includes("admit") || key.includes("enrol")) return "checkmark-circle-outline";
  if (key.includes("lost")) return "close-circle-outline";
  if (key.includes("contact")) return "call-outline";
  return "person-outline";
}

function StatCell({
  icon,
  tint,
  value,
  label,
  percent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: number;
  label: string;
  percent: number;
}) {
  return (
    <View style={[styles.statCell, { backgroundColor: tint }]}>
      <View style={styles.statCellTopRow}>
        <View style={styles.statIconChip}>
          <Ionicons name={icon} size={13} color={tint} />
        </View>
        <Text style={styles.statPercentText} numberOfLines={1}>
          {percent}%
        </Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.statProgressTrack}>
        <View style={[styles.statProgressFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

function LeadCard({
  item,
  colors,
  cardShadow,
  pressedOpacity,
  onPress,
}: {
  item: Enquiry;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.leadCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        cardShadow,
        pressed && { opacity: pressedOpacity },
      ]}
      accessibilityRole="button"
    >
      <View style={styles.leadTop}>
        <View style={[styles.leadAvatar, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
          <Image source={getAvatarSource(item.id)} style={styles.leadAvatarImage} resizeMode="contain" />
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
      <Text style={[styles.leadName, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.studentName || item.contactName}
      </Text>
      <Text style={[styles.leadMeta, { color: colors.textMuted }]} numberOfLines={1}>
        {item.gradeInterest || "Grade not set"}
      </Text>
      <Text style={styles.leadSource} numberOfLines={1}>
        <Text style={{ color: colors.textMuted }}>Source: </Text>
        <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{formatSource(item.source)}</Text>
      </Text>
      <View style={[styles.leadTimePill, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="time-outline" size={12} color={colors.accent} />
        <Text style={[styles.leadTimeText, { color: colors.accent }]}>{timeAgo(item.updatedAt)}</Text>
      </View>
    </Pressable>
  );
}

export function PipelineBoardScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [activeStage, setActiveStage] = useState<EnquiryStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const liveDotPulse = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(1)).current;

  const handleFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.94, useNativeDriver: true }).start();
  };

  const handleFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }).start();
  };

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(liveDotPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveDotPulse]);
  const liveDotOpacity = liveDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listEnquiries(accessToken);
      setEnquiries(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!stages.length) return;
    if (activeStage !== "all" && !stages.find((stage) => stage.key === activeStage)) {
      setActiveStage("all");
    }
  }, [activeStage, stages]);

  const stageCounts = useMemo(() => {
    return stages.reduce<Record<string, number>>((acc, stage) => {
      acc[stage.key] = enquiries.filter((enquiry) => enquiry.status === stage.key).length;
      return acc;
    }, {});
  }, [enquiries, stages]);

  const leadsByStage = useMemo(() => {
    return stages.reduce<Record<string, Enquiry[]>>((acc, stage) => {
      acc[stage.key] = enquiries
        .filter((enquiry) => enquiry.status === stage.key)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return acc;
    }, {});
  }, [enquiries, stages]);

  const totalLeads = enquiries.length;
  const newCount = stages[0] ? stageCounts[stages[0].key] ?? 0 : 0;
  const visitCount = enquiries.filter((enquiry) => enquiry.status.includes("visit")).length;
  const convertedStage = stages.find((stage) => stage.isConverted);
  const convertedCount = convertedStage ? stageCounts[convertedStage.key] ?? 0 : 0;

  const statPercents = useMemo(
    () => ({
      new: totalLeads ? Math.round((newCount / totalLeads) * 100) : 0,
      visits: totalLeads ? Math.round((visitCount / totalLeads) * 100) : 0,
      converted: totalLeads ? Math.round((convertedCount / totalLeads) * 100) : 0,
    }),
    [totalLeads, newCount, visitCount, convertedCount]
  );

  const filters: (EnquiryStatus | "all")[] = ["all", ...stages.map((stage) => stage.key)];
  const labelFor = (key: EnquiryStatus | "all") =>
    key === "all" ? "All stages" : stages.find((stage) => stage.key === key)?.label ?? formatStageKey(key);
  const filterCount = (key: EnquiryStatus | "all") =>
    key === "all" ? totalLeads : stageCounts[key] ?? 0;

  const visibleStages = activeStage === "all" ? stages : stages.filter((stage) => stage.key === activeStage);

  const showFunnelInfo = () =>
    Alert.alert(
      "Admissions funnel",
      "Detailed funnel analytics are available to your school admin in the EduWand web dashboard."
    );

  if (isLoading && enquiries.length === 0) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Pipeline</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
              Track every lead across the admission journey
            </Text>
          </View>
        </View>

        <LinearGradient
          colors={[colors.accent, colors.accentDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statHero}
        >
          <View style={styles.statHeroGlow} pointerEvents="none" />
          <View style={styles.statHeroGlowSecondary} pointerEvents="none" />

          <View style={styles.statHeroTopRow}>
            <Text style={styles.statHeroEyebrow}>Pipeline overview</Text>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity }]} />
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
          </View>

          <View style={styles.statHeroRow}>
            <StatCell icon="people-outline" tint="#7359D9" value={totalLeads} label="Total leads" percent={100} />
            <StatCell icon="trending-up-outline" tint="#3E8ED9" value={newCount} label="New" percent={statPercents.new} />
            <StatCell icon="calendar-outline" tint="#E5A72D" value={visitCount} label="Visits" percent={statPercents.visits} />
            <StatCell icon="ribbon-outline" tint="#2FA678" value={convertedCount} label="Converted" percent={statPercents.converted} />
          </View>
        </LinearGradient>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((key) => {
            const active = key === activeStage;
            return (
              <Pressable
                key={key}
                onPress={() => setActiveStage(key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                  pressed && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.filterChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                  {labelFor(key)}
                </Text>
                <View
                  style={[
                    styles.filterChipBadge,
                    { backgroundColor: active ? "rgba(255,255,255,0.18)" : colors.backgroundMuted },
                  ]}
                >
                  <Text style={[styles.filterChipBadgeText, { color: active ? colors.accentOn : colors.textMuted }]}>
                    {filterCount(key)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.boardScroll}
          contentContainerStyle={styles.boardContent}
        >
          {visibleStages.map((stage) => {
            const leads = leadsByStage[stage.key] ?? [];
            const ruleColor = getStatusColor(stage.key, mode).text;
            return (
              <View key={stage.key} style={[styles.column, { backgroundColor: colors.backgroundMuted }]}>
                <View style={styles.columnHeader}>
                  <Ionicons name={stageIconFor(stage.key)} size={16} color={colors.textSecondary} />
                  <Text style={[styles.columnTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {stage.label}
                  </Text>
                  <View style={[styles.columnCount, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.columnCountText, { color: colors.accent }]}>{stageCounts[stage.key] ?? 0}</Text>
                  </View>
                </View>
                <View style={[styles.columnRule, { backgroundColor: ruleColor }]} />

                <View style={styles.columnBody}>
                  {leads.length === 0 ? (
                    <Text style={[styles.columnEmpty, { color: colors.textMuted }]}>No leads in this stage yet</Text>
                  ) : (
                    leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        item={lead}
                        colors={colors}
                        cardShadow={cardShadow}
                        pressedOpacity={pressedOpacity}
                        onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: lead.id })}
                      />
                    ))
                  )}

                  <Pressable
                    onPress={() => navigation.navigate("NewEnquiryForm")}
                    style={({ pressed }) => [styles.addLead, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="add" size={16} color={colors.accent} />
                    <Text style={[styles.addLeadText, { color: colors.accent }]}>Add lead</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={showFunnelInfo}
          style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
        >
          <View style={[styles.infoIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="filter-outline" size={18} color={colors.accent} />
          </View>
          <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Admissions funnel</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Track how leads move through each stage of the admissions process.
          </Text>
          <View style={[styles.infoButton, { backgroundColor: colors.surface }]}>
            <Ionicons name="stats-chart-outline" size={15} color={colors.accent} />
            <Text style={[styles.infoButtonText, { color: colors.accent }]}>View funnel report</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.accent} />
          </View>
        </Pressable>

        <View style={[styles.infoCard, { backgroundColor: colors.warning + "22" }]}>
          <View style={[styles.infoIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="bulb-outline" size={18} color={colors.warning} />
          </View>
          <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Drag and drop leads between stages</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Keep your pipeline updated to get accurate reports.
          </Text>
        </View>
      </ScrollView>

      <Animated.View style={[styles.primaryFabWrap, { transform: [{ scale: fabScale }] }]}>
        <Pressable
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          onPress={() => navigation.navigate("NewEnquiryForm")}
          style={[styles.primaryFab, { backgroundColor: colors.accent }, cardShadow]}
          accessibilityRole="button"
          accessibilityLabel="Add lead"
        >
          <Ionicons name="add" size={26} color={colors.accentOn} />
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center" },
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 150,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  primaryFabWrap: {
    position: "absolute",
    right: 20,
    bottom: 146,
  },
  primaryFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  statHero: {
    marginTop: 2,
    borderRadius: 26,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 14,
    overflow: "hidden",
  },
  statHeroGlow: {
    position: "absolute",
    top: -46,
    right: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  statHeroGlowSecondary: {
    position: "absolute",
    bottom: -52,
    left: -32,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  statHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  statHeroEyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#8CE7B8",
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statHeroRow: {
    flexDirection: "row",
    gap: 6,
    zIndex: 2,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statCellTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statIconChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    flexShrink: 0,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  statPercentText: {
    flexShrink: 1,
    marginLeft: 4,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  statValue: {
    marginTop: 1,
    alignSelf: "flex-start",
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  statLabel: {
    alignSelf: "flex-start",
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    fontWeight: "700",
  },
  statProgressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  statProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  filterRow: {
    paddingVertical: 2,
    gap: 10,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  filterChipBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  boardScroll: {
    marginHorizontal: -16,
  },
  boardContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  column: {
    width: 300,
    borderRadius: 22,
    padding: 14,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  columnTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  columnCount: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  columnCountText: {
    fontSize: 11,
    fontWeight: "800",
  },
  columnRule: {
    height: 3,
    borderRadius: 2,
    marginTop: 12,
  },
  columnBody: {
    marginTop: 12,
    gap: 12,
  },
  columnEmpty: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingVertical: 16,
  },
  addLead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  addLeadText: {
    fontSize: 13,
    fontWeight: "800",
  },
  leadCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  leadTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  leadAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  leadAvatarImage: {
    width: 32,
    height: 32,
  },
  leadName: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  leadMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  leadSource: {
    marginTop: 3,
    fontSize: 12,
  },
  leadTimePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 12,
  },
  leadTimeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoCard: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  infoText: {
    fontSize: 12.5,
    fontWeight: "500",
    lineHeight: 18,
  },
  infoButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  infoButtonText: {
    fontSize: 12.5,
    fontWeight: "800",
  },
});
