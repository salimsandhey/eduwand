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
import { EnrolmentTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { Dropdown } from "../../components/Dropdown";
import { TypewriterText } from "../../components/TypewriterText";
import { getStatusColor } from "../../theme/statusColors";
import { brandPalette, softCardShadow } from "../../theme/tokens";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";
import { api, AcademicYear, Enquiry, EnquiryStatus, PipelineStage } from "../../api/client";
import { resolveEnquiryImageSource } from "../../theme/avatars";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";

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

type SortKey = "updated" | "created" | "name";
const SORT_ORDER: SortKey[] = ["updated", "created", "name"];
const SORT_LABEL: Record<SortKey, string> = { updated: "Updated", created: "Created", name: "Name" };

function StatCell({
  icon,
  tint,
  value,
  label,
  percent,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: number;
  label: string;
  percent: number;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.statCell, { backgroundColor: tint + "12", borderColor: tint + "26" }]}>
      <View style={styles.statCellTopRow}>
        <View style={[styles.statIconChip, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={14} color="#FFFFFF" />
        </View>
        <Text style={[styles.statPercentText, { color: tint }]} numberOfLines={1}>
          {percent}%
        </Text>
      </View>
      <Text
        style={[styles.statValue, { color: colors.textPrimary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.statProgressTrack, { backgroundColor: tint + "1F" }]}>
        <View style={[styles.statProgressFill, { width: `${percent}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const STUB_WIDTH = 98;

function AnimatedCard({
  item,
  index,
  onPress,
  colors,
  cardShadow,
  pressedOpacity,
  mode,
  photoUrl,
  stages,
}: {
  item: Enquiry;
  index: number;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  mode: "light" | "dark";
  photoUrl: string | null;
  stages: PipelineStage[];
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
      toValue: 0.98,
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
  const stageIndex = stages.findIndex((stage) => stage.key === item.status);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface, borderWidth: 0 },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
      >
        <View style={[styles.cardStub, { backgroundColor: statusColor.bg }]}>
          <View
            style={[
              styles.cardAvatar,
              {
                backgroundColor: colors.surface,
                // A few statuses (e.g. "enrolled") pair a dark bg with white text — if that
                // white were used as the ring color here it would vanish against the equally
                // white avatar fill, so fall back to a guaranteed-visible neutral in that case.
                borderColor: statusColor.text === colors.surface ? colors.textPrimary : statusColor.text,
              },
            ]}
          >
            <Image source={avatarSource} style={styles.cardAvatarImage} resizeMode="contain" />
          </View>
          {/* bg+text are always used as the pre-validated pair from statusColors.ts — never
              mix statusColor.text with an unrelated neutral background, or a status whose pair
              is inverted (dark bg / white text, e.g. "enrolled") renders invisible text. */}
          <View style={[styles.cardStatusPill, { backgroundColor: statusColor.bg, borderColor: colors.surface }]}>
            <Text style={[styles.cardStatusPillText, { color: statusColor.text }]} numberOfLines={1}>
              {formatSource(item.status)}
            </Text>
          </View>
          {stages.length > 0 ? (
            <View style={styles.cardStageDots}>
              {stages.map((stage, i) => (
                <View
                  key={stage.key}
                  style={[
                    styles.cardStageDot,
                    {
                      backgroundColor: i <= stageIndex ? statusColor.text : colors.surface,
                      opacity: i <= stageIndex ? 1 : 0.5,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}

          <View style={[styles.cardNotch, styles.cardNotchTop, { backgroundColor: colors.background }]} />
          <View style={[styles.cardNotch, styles.cardNotchBottom, { backgroundColor: colors.background }]} />
          <View style={[styles.cardSeam, { borderLeftColor: colors.border }]} />
        </View>

        <View style={styles.cardMain}>
          <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.cardSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.contactPhone}
          </Text>

          <View style={styles.cardChipRow}>
            <View style={[styles.cardChip, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="color-wand-outline" size={12} color={colors.accent} />
              <Text style={[styles.cardChipText, { color: colors.accent }]} numberOfLines={1}>
                {formatSource(item.source)}
              </Text>
            </View>
            <View style={[styles.cardChip, { backgroundColor: colors.backgroundMuted }]}>
              <Ionicons name="school-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.cardChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.gradeInterest || "No grade yet"}
              </Text>
            </View>
          </View>

          <View style={styles.cardBottomRow}>
            <View style={styles.cardInfoItem}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.cardInfoText, { color: colors.textMuted }]}>
                Updated {formatDateLabel(item.updatedAt)}
              </Text>
            </View>
            <View style={[styles.chevronWrap, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="arrow-forward" size={15} color={colors.accent} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function EnquiryListScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance(18);
  const { stages } = usePipelineStages();
  const handleTabBarScroll = useTabBarScrollHandler();
  const statusFilters: (EnquiryStatus | "all")[] = ["all", ...stages.map((stage) => stage.key)];
  const labelFor = (key: EnquiryStatus | "all") =>
    key === "all" ? "All Leads" : stages.find((stage) => stage.key === key)?.label ?? key;

  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | "all">("all");
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const fabScale = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.listEnquiries(accessToken, {
        status: statusFilter === "all" ? undefined : statusFilter,
        academicYearId,
      });
      setEnquiries(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enquiries");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, academicYearId, statusFilter]);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listAcademicYears(accessToken)
      .then((years) => {
        setAcademicYears(years);
        setAcademicYearId((current) => current ?? years.find((year) => year.isCurrent)?.id ?? years[0]?.id);
      })
      .catch(() => {
      });
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = !query
      ? enquiries
      : enquiries.filter(
          (enquiry) =>
            enquiry.contactName.toLowerCase().includes(query) ||
            (enquiry.studentName ?? "").toLowerCase().includes(query) ||
            enquiry.contactPhone.includes(query) ||
            enquiry.source.toLowerCase().includes(query)
        );

    return [...matches].sort((a, b) => {
      if (sortBy === "name") return (a.studentName || a.contactName).localeCompare(b.studentName || b.contactName);
      const key = sortBy === "created" ? "createdAt" : "updatedAt";
      return new Date(b[key]).getTime() - new Date(a[key]).getTime();
    });
  }, [enquiries, search, sortBy]);

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

  const statPercents = useMemo(
    () => ({
      fresh: stats.total ? Math.round((stats.fresh / stats.total) * 100) : 0,
      converted: stats.total ? Math.round((stats.converted / stats.total) * 100) : 0,
    }),
    [stats]
  );

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

  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuAnim = useRef(new Animated.Value(0)).current;

  const toggleQuickMenu = () => {
    const opening = !quickMenuOpen;
    setQuickMenuOpen(opening);
    Animated.spring(quickMenuAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: true,
      tension: 190,
      friction: 16,
    }).start();
  };

  const closeQuickMenu = () => {
    if (!quickMenuOpen) return;
    setQuickMenuOpen(false);
    Animated.spring(quickMenuAnim, { toValue: 0, useNativeDriver: true, tension: 190, friction: 16 }).start();
  };

  const quickMenuScaleY = quickMenuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const quickMenuTranslateY = quickMenuAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const quickMenuOpacity = quickMenuAnim;
  const quickMenuToggleRotate = quickMenuAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <TypewriterText text="Enquiries" style={[styles.pageTitle, { color: colors.textPrimary }]} cursorColor={colors.primaryBrand} />
              <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
                Manage every enquiry and keep leads moving.
              </Text>
            </View>

            {/* Enrolment overview hero card — commented out per request
            <View style={[styles.statHero, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <View style={styles.statHeroTopRow}>
                <Text style={[styles.statHeroEyebrow, { color: colors.textMuted }]}>Enrolment overview</Text>
              </View>

              <View style={styles.statHeroRow}>
                <StatCell icon="people-outline" tint="#7359D9" value={stats.total} label="Total" percent={100} colors={colors} />
                <StatCell icon="person-outline" tint="#2FA678" value={stats.fresh} label="Fresh" percent={statPercents.fresh} colors={colors} />
                <StatCell
                  icon="trending-up-outline"
                  tint="#E5A72D"
                  value={stats.converted}
                  label="Converted"
                  percent={statPercents.converted}
                  colors={colors}
                />
              </View>
            </View>
            */}

            <View
              style={[
                styles.searchCard,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: searchFocused ? colors.accent : colors.border,
                },
              ]}
            >
              <Ionicons name="search-outline" size={18} color={searchFocused ? colors.accent : colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search enquiries..."
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
              <Image source={decorativeAssets.searchMascotThinking} style={styles.searchMascot} resizeMode="contain" />
            </View>

            <View style={styles.filtersRow}>
              {academicYears.length > 0 ? (
                <View style={styles.filterCol}>
                  <Dropdown
                    title="Academic year"
                    triggerIcon="calendar-outline"
                    hue={brandPalette.deepPlum}
                    triggerLabel={academicYears.find((year) => year.id === academicYearId)?.label ?? "Select year"}
                    selectedKey={academicYearId ?? ""}
                    onSelect={(key) => setAcademicYearId(key)}
                    options={academicYears.map((year) => ({
                      key: year.id,
                      label: year.label,
                      meta: year.isCurrent ? "Current" : undefined,
                    }))}
                  />
                </View>
              ) : null}

              <View style={styles.filterCol}>
                <Dropdown
                  title="Filter by status"
                  triggerIcon="funnel-outline"
                  hue={statusFilter === "all" ? brandPalette.coral : getStatusColor(statusFilter, mode).text}
                  triggerLabel={labelFor(statusFilter)}
                  selectedKey={statusFilter}
                  onSelect={(key) => setStatusFilter(key as EnquiryStatus | "all")}
                  active={statusFilter !== "all"}
                  options={statusFilters.map((key) => ({
                    key,
                    label: labelFor(key),
                    meta: String(getFilterCount(key)),
                  }))}
                />
              </View>
            </View>

            <View style={styles.listHeaderRow}>
              <Text style={[styles.listCount, { color: colors.textPrimary }]}>
                {filtered.length} {filtered.length === 1 ? "enquiry" : "enquiries"}
              </Text>
              <Dropdown
                variant="plain"
                title="Sort by"
                hue={brandPalette.teal}
                triggerLabel={`Sort by: ${SORT_LABEL[sortBy]}`}
                selectedKey={sortBy}
                onSelect={(key) => setSortBy(key as SortKey)}
                active={sortBy !== "updated"}
                options={SORT_ORDER.map((key) => ({ key, label: SORT_LABEL[key] }))}
              />
            </View>

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image source={decorativeAssets.idCard} style={styles.emptyGraphic} resizeMode="contain" />
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
            stages={stages}
          />
        )}
      />

      <Animated.View
        pointerEvents={quickMenuOpen ? "auto" : "none"}
        style={[
          styles.quickMenuPanel,
          { backgroundColor: colors.surface, borderWidth: 0 },
          cardShadow,
          {
            opacity: quickMenuOpacity,
            transform: [{ translateY: quickMenuTranslateY }, { scaleY: quickMenuScaleY }],
          },
        ]}
      >
        <Pressable
          onPress={() => {
            closeQuickMenu();
            navigation.navigate("BulkUpload");
          }}
          style={({ pressed }) => [styles.quickMenuRow, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Bulk upload enquiries"
        >
          <View style={[styles.quickMenuIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="cloud-upload-outline" size={17} color={colors.accent} />
          </View>
          <Text style={[styles.quickMenuLabel, { color: colors.textPrimary }]}>Bulk Upload</Text>
        </Pressable>

        <View style={[styles.quickMenuDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={() => {
            closeQuickMenu();
            navigation.navigate("NewEnquiryForm");
          }}
          style={({ pressed }) => [styles.quickMenuRow, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Add new enquiry"
        >
          <View style={[styles.quickMenuIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="add" size={17} color={colors.accent} />
          </View>
          <Text style={[styles.quickMenuLabel, { color: colors.textPrimary }]}>New Enquiry</Text>
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.primaryFabWrap, { transform: [{ scale: fabScale }] }]}>
        <Pressable
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          onPress={toggleQuickMenu}
          style={[styles.primaryFab, { backgroundColor: colors.accent }, cardShadow]}
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          accessibilityState={{ expanded: quickMenuOpen }}
        >
          <Animated.View style={{ transform: [{ rotate: quickMenuToggleRotate }] }}>
            <Ionicons name="add" size={26} color={colors.accentOn} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 150,
    gap: 14,
  },
  header: {
    marginBottom: 4,
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
  statHero: {
    ...softCardShadow,
    marginTop: 16,
    borderRadius: 26,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 14,
    gap: 14,
  },
  statHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statHeroEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statHeroRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 5,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  statCellTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statIconChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statPercentText: {
    flexShrink: 1,
    marginLeft: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  statValue: {
    marginTop: 2,
    alignSelf: "flex-start",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  statLabel: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
  },
  statProgressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  statProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  searchCard: {
    ...softCardShadow,
    marginTop: 16,
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingRight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  // Peeks up over the search bar's top-right corner, echoing the floating AI
  // assist mascot that sits above the tab bar - absolutely positioned so it
  // doesn't affect the row's own flex layout.
  searchMascot: {
    position: "absolute",
    right: 6,
    // top: -42,
    top: 8,
    width: 44,
    height: 44,
  },
  listHeaderRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listCount: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  filtersRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  filterCol: {
    flex: 1,
  },
  error: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    ...softCardShadow,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 24,
    overflow: "hidden",
  },
  cardStub: {
    width: STUB_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  cardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardAvatarImage: {
    width: 42,
    height: 42,
  },
  cardStatusPill: {
    maxWidth: STUB_WIDTH - 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  cardStatusPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  cardStageDots: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    maxWidth: STUB_WIDTH - 28,
  },
  cardStageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cardNotch: {
    position: "absolute",
    left: STUB_WIDTH - 7,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  cardNotchTop: {
    top: -7,
  },
  cardNotchBottom: {
    bottom: -7,
  },
  cardSeam: {
    position: "absolute",
    left: STUB_WIDTH,
    top: 14,
    bottom: 14,
    width: 0,
    borderLeftWidth: 1.5,
    borderStyle: "dashed",
  },
  cardMain: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  cardSubtext: {
    fontSize: 13,
    fontWeight: "500",
  },
  cardChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  cardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  cardChipText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  cardInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardInfoText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    ...softCardShadow,
    marginTop: 18,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyGraphic: { width: 84, height: 84, marginBottom: 10 },
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
  quickMenuPanel: {
    position: "absolute",
    right: 20,
    bottom: 218,
    width: 176,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 6,
    transformOrigin: "bottom",
  },
  quickMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickMenuIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  quickMenuLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  quickMenuDivider: {
    height: 1,
    marginHorizontal: 12,
  },
});
