import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, RefreshControl } from "react-native";
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
import { api, Enquiry, EnquiryStatus } from "../api/client";

const STATUS_FILTERS: (EnquiryStatus | "all")[] = [
  "all",
  "new",
  "contacted",
  "visit",
  "application",
  "admitted",
  "enrolled",
  "lost",
];

type Props = CompositeScreenProps<
  BottomTabScreenProps<EnrolmentTabParamList, "Enquiries">,
  NativeStackScreenProps<RootStackParamList>
>;

export function EnquiryListScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search name or phone"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Pressable
          style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("NewEnquiryForm")}
          accessibilityRole="button"
        >
          <Text style={[styles.addButtonText, { color: colors.accentOn }]}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={(s) => s}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = statusFilter === item;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => setStatusFilter(item)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{item}</Text>
            </Pressable>
          );
        }}
      />

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

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
        renderItem={({ item }) => {
          const statusColor = getStatusColor(item.status, mode);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
                cardShadow,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.contactName}</Text>
                <Text style={[styles.statusBadge, { color: statusColor.text, backgroundColor: statusColor.bg }]}>{item.status}</Text>
              </View>
              <View style={styles.cardMetaRow}>
                <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{item.contactPhone} · {item.source}</Text>
              </View>
              {item.gradeInterest ? (
                <View style={styles.cardMetaRow}>
                  <Ionicons name="school-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{item.gradeInterest}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", padding: 12, gap: 8 },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  addButton: { borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", minHeight: 44 },
  addButtonText: { fontWeight: "700" },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    minHeight: 32,
    justifyContent: "center",
  },
  chipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "600" },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 16, fontWeight: "700" },
  statusBadge: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  cardMeta: { fontSize: 13 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 10 },
  empty: { textAlign: "center" },
  error: { textAlign: "center", marginBottom: 8 },
});
