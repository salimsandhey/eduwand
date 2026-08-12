import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, FlatList } from "react-native";
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
  BottomTabScreenProps<EnrolmentTabParamList, "Pipeline">,
  NativeStackScreenProps<RootStackParamList>
>;

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

  const activeLeads = enquiries.filter((e) => e.status === activeStage);

  const getStageCount = (stage: EnquiryStatus) => {
    return enquiries.filter((e) => e.status === stage).length;
  };

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Title Header Block */}
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Pipeline Board</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {enquiries.length} total lead{enquiries.length === 1 ? "" : "s"} across all stages
        </Text>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {/* Horizontal Sticky Tab Bar */}
      <View style={styles.tabBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {stages.map((stage) => {
            const active = activeStage === stage.key;
            const count = getStageCount(stage.key);
            const statusColor = getStatusColor(stage.key, mode);
            return (
              <Pressable
                key={stage.key}
                onPress={() => setActiveStage(stage.key)}
                style={({ pressed }) => [
                  styles.tabItem,
                  active && { borderBottomColor: colors.accent },
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, { color: active ? colors.accent : colors.textSecondary }]}>
                  {stage.label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    { backgroundColor: active ? colors.accent + "15" : colors.surfaceRaised },
                  ]}
                >
                  <Text style={[styles.countText, { color: active ? colors.accent : colors.textMuted }]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Full-width List of Leads */}
      <FlatList
        data={activeLeads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No leads currently in the "{stages.find((s) => s.key === activeStage)?.label ?? activeStage}" stage
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const initials = item.contactName
            ? item.contactName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            : "?";
          return (
            <Pressable
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
              onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: item.id })}
              accessibilityRole="button"
            >
              <View style={styles.cardContent}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "12", borderColor: colors.border }]}>
                  <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                </View>
                <View style={styles.cardDetails}>
                  <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.contactName}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                      {item.contactPhone} · {item.source}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
  titleSection: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  tabBarWrapper: { marginTop: 16, borderBottomWidth: 1, borderBottomColor: "#EAECE9" },
  tabBar: { paddingHorizontal: 16, gap: 16 },
  tabItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    gap: 6,
    height: 42,
  },
  tabText: { fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 10, fontWeight: "700" },
  listContainer: { padding: 16, gap: 12, flexGrow: 1 },
  emptyContainer: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  emptyText: { fontSize: 13, fontWeight: "500", textAlign: "center" },
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 14,
  },
  cardContent: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "800" },
  cardDetails: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  cardMeta: { fontSize: 12 },
  error: { textAlign: "center", padding: 8 },
});
