import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  ImageSourcePropType,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { EnrolmentTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { PageHeader } from "../../components/PageHeader";
import { getStatusColor } from "../../theme/statusColors";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { api, Enquiry, EnquiryStatus } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

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

export function PipelineBoardScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [activeStage, setActiveStage] = useState<EnquiryStatus>("new");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!stages.find((stage) => stage.key === activeStage)) {
      setActiveStage(stages[0].key);
    }
  }, [activeStage, stages]);

  const stageCounts = useMemo(() => {
    return stages.reduce<Record<string, number>>((acc, stage) => {
      acc[stage.key] = enquiries.filter((enquiry) => enquiry.status === stage.key).length;
      return acc;
    }, {});
  }, [enquiries, stages]);

  const totalLeads = enquiries.length;
  const activeLeads = enquiries.filter((enquiry) => enquiry.status === activeStage);
  const selectedStage = stages.find((stage) => stage.key === activeStage);
  const convertedStage = stages.find((stage) => stage.isConverted);
  const convertedCount = convertedStage ? stageCounts[convertedStage.key] ?? 0 : 0;
  const lostStage = stages.find((stage) => stage.isTerminal && !stage.isConverted);
  const lostCount = lostStage ? stageCounts[lostStage.key] ?? 0 : 0;
  const hottestStage =
    stages
      .map((stage) => ({ stage, count: stageCounts[stage.key] ?? 0 }))
      .sort((a, b) => b.count - a.count)[0]?.stage ?? stages[0];

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={activeLeads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <PageHeader
              eyebrow="Pipeline"
              title="Admissions movement"
              subtitle={hottestStage ? `${hottestStage.label} is the busiest stage` : "Track lead movement by stage"}
              icon="git-network-outline"
              metrics={[
                { label: "Total", value: totalLeads },
                { label: "Converted", value: convertedCount, tone: "accent" },
                { label: "Lost", value: lostCount, tone: lostCount > 0 ? "danger" : "default" },
              ]}
            />

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pipeline health</Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="flame-outline" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {hottestStage ? hottestStage.label : "N/A"}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Busiest stage</Text>
              </View>

              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                  {selectedStage ? stageCounts[selectedStage.key] ?? 0 : 0}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Selected stage</Text>
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stage board</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stageRail}
            >
              {stages.map((stage, index) => {
                const active = stage.key === activeStage;
                const count = stageCounts[stage.key] ?? 0;
                const statusColor = getStatusColor(stage.key, mode);
                const isConverted = stage.isConverted;
                const isTerminal = stage.isTerminal && !stage.isConverted;

                return (
                  <View key={stage.key} style={styles.stageRailItem}>
                    <Pressable
                      onPress={() => setActiveStage(stage.key)}
                      style={({ pressed }) => [
                        styles.stageCard,
                        {
                          backgroundColor: active ? colors.accent : colors.surface,
                          borderColor: active ? colors.accent : colors.border,
                        },
                        cardShadow,
                        pressed && { opacity: pressedOpacity },
                      ]}
                    >
                      <View style={styles.stageTopRow}>
                        <View
                          style={[
                            styles.stageIndexBadge,
                            {
                              backgroundColor: active ? "rgba(255,255,255,0.16)" : colors.surfaceRaised,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.stageIndexText,
                              { color: active ? colors.accentOn : colors.textSecondary },
                            ]}
                          >
                            {index + 1}
                          </Text>
                        </View>
                        {isConverted ? (
                          <Ionicons name="checkmark-circle" size={18} color={active ? colors.accentOn : colors.accent} />
                        ) : isTerminal ? (
                          <Ionicons name="close-circle-outline" size={18} color={active ? colors.accentOn : colors.textMuted} />
                        ) : (
                          <Ionicons name="ellipse-outline" size={18} color={active ? colors.accentOn : statusColor.text} />
                        )}
                      </View>

                      <Text style={[styles.stageCardTitle, { color: active ? colors.accentOn : colors.textPrimary }]}>
                        {stage.label}
                      </Text>
                      <Text style={[styles.stageCardCount, { color: active ? colors.accentOn : colors.textPrimary }]}>
                        {count}
                      </Text>
                      <View style={styles.stageCardBottomRow}>
                        {isConverted ? (
                          <View style={[styles.stageChip, { backgroundColor: active ? "rgba(255,255,255,0.16)" : colors.accentSoft }]}>
                            <Text style={[styles.stageChipText, { color: active ? colors.accentOn : colors.accent }]}>Won</Text>
                          </View>
                        ) : isTerminal ? (
                          <View style={[styles.stageChip, { backgroundColor: active ? "rgba(255,255,255,0.16)" : colors.surfaceRaised }]}>
                            <Text style={[styles.stageChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>Closed</Text>
                          </View>
                        ) : (
                          <View style={[styles.stageChip, { backgroundColor: active ? "rgba(255,255,255,0.16)" : colors.surfaceRaised }]}>
                            <Text style={[styles.stageChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>Live</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.focusCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.focusHeader}>
                <View>
                  <Text style={[styles.focusTitle, { color: colors.textPrimary }]}>
                    {selectedStage?.label ?? formatStageKey(activeStage)}
                  </Text>
                </View>
                <View style={styles.focusRight}>
                  <View style={[styles.focusBadge, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.focusBadgeText, { color: colors.accent }]}>
                      {stageCounts[activeStage] ?? 0}
                    </Text>
                  </View>
                  <View style={[styles.focusStatusChip, { backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[styles.focusStatusChipText, { color: colors.textSecondary }]}>
                      {activeLeads.length === 0 ? "Clear" : activeLeads.length > 5 ? "Hot" : "Active"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Image source={decorativeAssets.stackedCards} style={styles.emptyGraphic} resizeMode="contain" />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No leads in this stage</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              The selected stage is currently clear. Pick another stage or add new movement into the funnel.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const avatarSource = getAvatarSource(item.id);
          const statusColor = getStatusColor(item.status, mode);

          return (
            <Pressable
              style={({ pressed }) => [
                styles.leadCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.leadTopRow}>
                <View style={[styles.avatarWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
                  <Image source={avatarSource} style={styles.avatarImage} resizeMode="contain" />
                </View>
                <View style={styles.leadMain}>
                  <Text style={[styles.leadName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.contactName}
                  </Text>
                  <Text style={[styles.leadMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {formatSource(item.source)}
                  </Text>
                </View>
                <View style={[styles.stageBadge, { backgroundColor: statusColor.bg }]}>
                  <Text style={[styles.stageBadgeText, { color: statusColor.text }]}>{item.status}</Text>
                </View>
              </View>

              <View style={styles.leadBottomRow}>
                <View style={styles.leadDetailBlock}>
                  <Text style={[styles.leadDetailLabel, { color: colors.textMuted }]}>Grade</Text>
                  <Text style={[styles.leadDetailValue, { color: colors.textPrimary }]}>
                    {item.gradeInterest || "Not added"}
                  </Text>
                </View>
                <View style={styles.leadDetailBlock}>
                  <Text style={[styles.leadDetailLabel, { color: colors.textMuted }]}>Phone</Text>
                  <Text style={[styles.leadDetailValue, { color: colors.textPrimary }]}>{item.contactPhone}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center" },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 132,
    gap: 14,
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  sectionWrap: {
    marginTop: 18,
    marginBottom: 4,
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
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  stageRail: {
    paddingBottom: 8,
    paddingTop: 4,
    paddingRight: 12,
    gap: 12,
  },
  stageRailItem: {
    width: 104,
  },
  stageCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    minHeight: 104,
  },
  stageTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stageIndexBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stageIndexText: {
    fontSize: 10,
    fontWeight: "800",
  },
  stageCardTitle: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  stageCardCount: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  stageCardBottomRow: {
    marginTop: 8,
  },
  stageChip: {
    alignSelf: "flex-start",
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  stageChipText: {
    fontSize: 10,
    fontWeight: "800",
  },
  focusCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
  },
  focusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  focusRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  focusBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  focusBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  focusStatusChip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  focusStatusChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  emptyContainer: {
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 8,
  },
  emptyGraphic: {
    width: 92,
    height: 92,
    opacity: 0.9,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  leadCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 14,
  },
  leadTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 36,
    height: 36,
  },
  leadMain: {
    flex: 1,
  },
  leadName: {
    fontSize: 15,
    fontWeight: "800",
  },
  leadMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  stageBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stageBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  leadBottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 18,
  },
  leadDetailBlock: {
    gap: 4,
    flex: 1,
  },
  leadDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  leadDetailValue: {
    fontSize: 14,
    fontWeight: "700",
  },
});
