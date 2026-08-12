import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, RefreshControl, Animated } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { EnrolmentTabParamList, RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { getStatusColor } from "../theme/statusColors";
import { usePipelineStages } from "../hooks/usePipelineStages";
import { api, Enquiry, EnquiryStatus } from "../api/client";

type Props = CompositeScreenProps<
  BottomTabScreenProps<EnrolmentTabParamList, "Enquiries">,
  NativeStackScreenProps<RootStackParamList>
>;

// Animated Card wrapper for cascading entrance
function AnimatedCard({
  item,
  index,
  onPress,
  colors,
  cardShadow,
  pressedOpacity,
  mode,
}: {
  item: Enquiry;
  index: number;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: any;
  pressedOpacity: number;
  mode: "light" | "dark";
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: Math.min(index * 50, 300),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 100,
        friction: 8,
        delay: Math.min(index * 50, 300),
        useNativeDriver: true,
      }),
    ]).start();
  }, [item.id]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 150,
      friction: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 150,
      friction: 6,
    }).start();
  };

  const statusColor = getStatusColor(item.status, mode);
  const initials = item.contactName
    ? item.contactName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
      }}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderLeftColor: colors.accent,
          },
          cardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
      >
        <View style={styles.cardContent}>
          <View style={[styles.cardAvatarCircle, { backgroundColor: colors.accent + "12", borderColor: colors.border }]}>
            <Text style={[styles.cardAvatarText, { color: colors.accent }]}>{initials}</Text>
          </View>
          <View style={styles.cardDetails}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                {item.contactName}
              </Text>
              <Text style={[styles.statusBadge, { color: statusColor.text, backgroundColor: statusColor.bg }]}>
                {item.status}
              </Text>
            </View>
            <View style={styles.cardMetaRow}>
              <Ionicons name="call-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {item.contactPhone} · {item.source}
              </Text>
            </View>
            {item.gradeInterest ? (
              <View style={styles.cardMetaRow}>
                <Ionicons name="school-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{item.gradeInterest}</Text>
              </View>
            ) : null}
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
  const statusFilters: (EnquiryStatus | "all")[] = ["all", ...stages.map((s) => s.key)];
  const labelFor = (key: EnquiryStatus | "all") =>
    key === "all" ? "all" : stages.find((s) => s.key === key)?.label ?? key;

  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search focus state
  const [searchFocused, setSearchFocused] = useState(false);

  // FAB scale animation
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
    const q = search.trim().toLowerCase();
    if (!q) return enquiries;
    return enquiries.filter(
      (e) => e.contactName.toLowerCase().includes(q) || e.contactPhone.includes(q)
    );
  }, [enquiries, search]);

  const handleFabPressIn = () => {
    Animated.spring(fabScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handleFabPressOut = () => {
    Animated.spring(fabScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // Pre-calculate count for badge displays
  const getFilterCount = (status: EnquiryStatus | "all") => {
    if (status === "all") return enquiries.length;
    return enquiries.filter((e) => e.status === status).length;
  };

  return (
    <Screen>
      {/* Title Header Section */}
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Enquiries</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {filtered.length} lead{filtered.length === 1 ? "" : "s"} listed
        </Text>
      </View>

      {/* Search Header Row */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: searchFocused ? colors.accent : colors.border,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={searchFocused ? colors.accent : colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search name or phone number"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filters Scrollable Row */}
      <View style={styles.filterWrapper}>
        <FlatList
          horizontal
          data={statusFilters}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => {
            const active = statusFilter === item;
            const count = getFilterCount(item);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => setStatusFilter(item)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                  {labelFor(item)}
                </Text>
                {count > 0 && (
                  <View style={[styles.chipCountBadge, { backgroundColor: active ? colors.accentOn + "30" : colors.surfaceRaised }]}>
                    <Text style={[styles.chipCountText, { color: active ? colors.accentOn : colors.textMuted }]}>
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {/* Leads List */}
      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accent} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.empty, { color: colors.textMuted }]}>No enquiries found</Text>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <AnimatedCard
            item={item}
            index={index}
            colors={colors}
            cardShadow={cardShadow}
            pressedOpacity={pressedOpacity}
            mode={mode}
            onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
          />
        )}
      />

      {/* Floating Action Buttons */}
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
            style={[styles.fab, { backgroundColor: colors.accent }, cardShadow]}
            accessibilityRole="button"
            accessibilityLabel="Add New Enquiry"
          >
            <Ionicons name="add" size={24} color={colors.accentOn} />
          </Pressable>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  searchRow: { padding: 16, paddingBottom: 12 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, height: "100%", fontSize: 14, paddingVertical: 0 },
  filterWrapper: { marginBottom: 4 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    height: 34,
    gap: 6,
  },
  chipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "700" },
  chipCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCountText: { fontSize: 10, fontWeight: "700" },
  list: { padding: 16, gap: 12, flexGrow: 1, paddingBottom: 80 },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  cardContent: { flexDirection: "row", gap: 12, alignItems: "center" },
  cardAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAvatarText: { fontSize: 14, fontWeight: "800" },
  cardDetails: { flex: 1 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardName: { fontSize: 15, fontWeight: "700", flex: 1 },
  statusBadge: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "capitalize",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  cardMeta: { fontSize: 12 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  empty: { textAlign: "center" },
  error: { textAlign: "center", marginBottom: 8 },
  fabColumn: {
    position: "absolute",
    bottom: 24,
    right: 24,
    alignItems: "center",
    gap: 12,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  secondaryFab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
});
