import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  RefreshControl,
  Animated,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { EnrolmentTabParamList, RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { PageHeader } from "../components/PageHeader";
import { getStatusColor } from "../theme/statusColors";
import { usePipelineStages } from "../hooks/usePipelineStages";
import { api, Enquiry, EnquiryStatus } from "../api/client";
import { resolveEnquiryImageSource } from "../theme/avatars";

type Props = CompositeScreenProps<
  BottomTabScreenProps<EnrolmentTabParamList, "Enquiries">,
  NativeStackScreenProps<RootStackParamList>
>;

function formatSource(source: string) {
  return source.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently updated";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function AnimatedCard({
  item,
  index,
  onPress,
  colors,
  cardShadow,
  pressedOpacity,
  mode,
  photoUrl,
}: {
  item: Enquiry;
  index: number;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  mode: "light" | "dark";
  photoUrl: string | null;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay: Math.min(index * 45, 240),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        delay: Math.min(index * 45, 240),
        tension: 95,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, index, item.id, slideAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.985,
      tension: 180,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 180,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const statusColor = getStatusColor(item.status, mode);
  const avatarSource = resolveEnquiryImageSource({
    id: item.id,
    contactName: item.contactName,
    avatarKey: item.avatarKey,
    photoUrl: item.photoMimeType ? photoUrl : null,
  });
  const displayName = item.studentName || item.contactName;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
      >
        <View style={styles.cardTopRow}>
          <View style={styles.cardIdentity}>
            <View style={[styles.cardAvatar, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
              <Image source={avatarSource} style={styles.cardAvatarImage} resizeMode="contain" />
            </View>
            <View style={styles.cardIdentityText}>
              <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[styles.cardSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.contactPhone}
              </Text>
            </View>
          </View>
          <Text style={[styles.statusBadge, { color: statusColor.text, backgroundColor: statusColor.bg }]}>
            {item.status}
          </Text>
        </View>

        <View style={[styles.cardInfoBand, { backgroundColor: colors.backgroundMuted }]}>
          <View style={styles.cardInfoItem}>
            <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
            <Text style={[styles.cardInfoText, { color: colors.textSecondary }]}>{formatSource(item.source)}</Text>
          </View>
          <View style={styles.cardInfoItem}>
            <Ionicons name="time-outline" size={14} color={colors.accent} />
            <Text style={[styles.cardInfoText, { color: colors.textSecondary }]}>Updated {formatDateLabel(item.updatedAt)}</Text>
          </View>
        </View>

        <View style={styles.cardBottomRow}>
          <View style={styles.cardGradeWrap}>
            <Text style={[styles.cardMetaLabel, { color: colors.textMuted }]}>Grade interest</Text>
            <Text style={[styles.cardMetaValue, { color: colors.textPrimary }]}>
              {item.gradeInterest || "Not added yet"}
            </Text>
          </View>
          <View style={[styles.chevronWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function EnquiryListScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const statusFilters: (EnquiryStatus | "all")[] = ["all", ...stages.map((stage) => stage.key)];
  const labelFor = (key: EnquiryStatus | "all") =>
    key === "all" ? "All Leads" : stages.find((stage) => stage.key === key)?.label ?? key;

  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const fabScale = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listEnquiries(accessToken, {
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setEnquiries(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enquiries");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return enquiries;
    return enquiries.filter(
      (enquiry) =>
        enquiry.contactName.toLowerCase().includes(query) ||
        (enquiry.studentName ?? "").toLowerCase().includes(query) ||
        enquiry.contactPhone.includes(query) ||
        enquiry.source.toLowerCase().includes(query)
    );
  }, [enquiries, search]);

  const stats = useMemo(() => {
    const convertedStage = stages.find((stage) => stage.isConverted);
    const freshStage = stages[0];
    const lostStage = stages.find((stage) => stage.isTerminal && !stage.isConverted);

    const total = enquiries.length;
    const fresh = freshStage ? enquiries.filter((entry) => entry.status === freshStage.key).length : total;
    const converted = convertedStage ? enquiries.filter((entry) => entry.status === convertedStage.key).length : 0;
    const needsAttention = lostStage ? enquiries.filter((entry) => entry.status === lostStage.key).length : 0;

    return { total, fresh, converted, needsAttention };
  }, [enquiries, stages]);

  const activeFilterLabel = statusFilter === "all" ? "All stages" : labelFor(statusFilter);

  const getFilterCount = (status: EnquiryStatus | "all") => {
    if (status === "all") return enquiries.length;
    return enquiries.filter((entry) => entry.status === status).length;
  };

  const handleFabPressIn = () => {
    Animated.spring(fabScale, {
      toValue: 0.94,
      useNativeDriver: true,
    }).start();
  };

  const handleFabPressOut = () => {
    Animated.spring(fabScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <PageHeader
              eyebrow="Enrolment"
              title="Lead desk"
              subtitle={`${filtered.length} visible lead${filtered.length === 1 ? "" : "s"} in ${activeFilterLabel.toLowerCase()}`}
              icon="mail-open-outline"
              metrics={[
                { label: "Total", value: stats.total },
                { label: "Fresh", value: stats.fresh, tone: "accent" },
                { label: "Converted", value: stats.converted },
              ]}
            />

            <View style={styles.searchWrap}>
              <View
                style={[
                  styles.searchCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: searchFocused ? colors.accent : colors.border,
                  },
                  cardShadow,
                ]}
              >
                <Ionicons name="search-outline" size={18} color={searchFocused ? colors.accent : colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Search by name, phone or source"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lead list</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                  {filtered.length} contact{filtered.length === 1 ? "" : "s"} ready for action
                </Text>
              </View>
            </View>

            <FlatList
              horizontal
              data={statusFilters}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.filterRow}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = item === statusFilter;
                const count = getFilterCount(item);
                return (
                  <Pressable
                    onPress={() => setStatusFilter(item)}
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
                      {labelFor(item)}
                    </Text>
                    <View
                      style={[
                        styles.filterChipBadge,
                        { backgroundColor: active ? "rgba(255,255,255,0.18)" : colors.backgroundMuted },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipBadgeText,
                          { color: active ? colors.accentOn : colors.textMuted },
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="mail-open-outline" size={24} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No enquiries found</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Try another filter or add a fresh lead to start building the pipeline.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <AnimatedCard
            item={item}
            index={index}
            onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
            colors={colors}
            cardShadow={cardShadow}
            pressedOpacity={pressedOpacity}
            mode={mode}
            photoUrl={accessToken ? api.enquiryPhotoUrl(accessToken, item.id) : null}
          />
        )}
      />

      <View style={styles.fabColumn}>
        <Pressable
          onPress={() => navigation.navigate("BulkUpload")}
          style={[styles.secondaryFab, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}
          accessibilityRole="button"
          accessibilityLabel="Bulk upload enquiries"
        >
          <Ionicons name="cloud-upload-outline" size={20} color={colors.accent} />
        </Pressable>
        <Animated.View style={{ transform: [{ scale: fabScale }] }}>
          <Pressable
            onPressIn={handleFabPressIn}
            onPressOut={handleFabPressOut}
            onPress={() => navigation.navigate("NewEnquiryForm")}
            style={[styles.primaryFab, { backgroundColor: colors.accent }, cardShadow]}
            accessibilityRole="button"
            accessibilityLabel="Add new enquiry"
          >
            <Ionicons name="add" size={24} color={colors.accentOn} />
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 110,
    gap: 14,
  },
  searchWrap: {
    marginTop: 18,
  },
  searchCard: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
  },
  filterRow: {
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
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
  error: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardAvatarImage: {
    width: 42,
    height: 42,
  },
  cardIdentityText: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  cardSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
    overflow: "hidden",
  },
  cardInfoBand: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  cardInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardInfoText: {
    fontSize: 13,
    fontWeight: "600",
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  cardGradeWrap: {
    flex: 1,
  },
  cardMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardMetaValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    marginTop: 18,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  fabColumn: {
    position: "absolute",
    right: 22,
    bottom: 26,
    alignItems: "center",
    gap: 12,
  },
  primaryFab: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryFab: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
