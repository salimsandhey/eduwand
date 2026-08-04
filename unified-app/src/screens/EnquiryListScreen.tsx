import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { api, Enquiry, EnquiryStatus } from "../api/client";
import { theme } from "../theme";

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

type Props = NativeStackScreenProps<RootStackParamList, "EnquiryList">;

export function EnquiryListScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.search}
          placeholder="Search name or phone"
          value={search}
          onChangeText={setSearch}
        />
        <Pressable style={styles.addButton} onPress={() => navigation.navigate("NewEnquiryForm")}>
          <Text style={styles.addButtonText}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={(s) => s}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, statusFilter === item && styles.chipActive]}
            onPress={() => setStatusFilter(item)}
          >
            <Text style={[styles.chipText, statusFilter === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No enquiries found</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{item.contactName}</Text>
              <Text style={styles.statusBadge}>{item.status}</Text>
            </View>
            <Text style={styles.cardMeta}>{item.contactPhone} · {item.source}</Text>
            {item.gradeInterest ? <Text style={styles.cardMeta}>{item.gradeInterest}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", padding: 12, gap: 8 },
  search: {
    flex: 1,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addButton: { backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "600" },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: theme.card,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.textMuted, textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  list: { padding: 12, gap: 10 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 16, fontWeight: "600", color: theme.text },
  statusBadge: {
    fontSize: 12,
    textTransform: "capitalize",
    color: theme.accentDark,
    backgroundColor: "#e6f4ea",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  cardMeta: { color: theme.textMuted, marginTop: 4 },
  empty: { textAlign: "center", color: theme.textMuted, marginTop: 40 },
  error: { color: theme.danger, textAlign: "center", marginBottom: 8 },
});
