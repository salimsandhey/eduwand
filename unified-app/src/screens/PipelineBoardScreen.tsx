import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
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

const STAGES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];

type Props = CompositeScreenProps<
  BottomTabScreenProps<EnrolmentTabParamList, "Pipeline">,
  NativeStackScreenProps<RootStackParamList>
>;

export function PipelineBoardScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
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
          {enquiries.length} total lead{enquiries.length === 1 ? "" : "s"} across stages
        </Text>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <ScrollView
        horizontal
        contentContainerStyle={styles.board}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={266}
        snapToAlignment="start"
      >
        {STAGES.map((stage) => {
          const items = enquiries.filter((e) => e.status === stage);
          const statusColor = getStatusColor(stage, mode);
          return (
            <View key={stage} style={styles.column}>
              {/* Header Panel */}
              <View style={[styles.columnHeader, { backgroundColor: statusColor.bg + "25", borderColor: statusColor.bg }]}>
                <View style={[styles.columnDot, { backgroundColor: statusColor.text }]} />
                <Text style={[styles.columnTitle, { color: statusColor.text }]}>{stage}</Text>
                <View style={[styles.columnCountBadge, { backgroundColor: statusColor.text + "20" }]}>
                  <Text style={[styles.columnCount, { color: statusColor.text }]}>{items.length}</Text>
                </View>
              </View>

              <ScrollView style={styles.columnList} showsVerticalScrollIndicator={false}>
                {items.map((e) => {
                  const initials = e.contactName
                    ? e.contactName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)
                    : "?";
                  return (
                    <Pressable
                      key={e.id}
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
                      onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: e.id })}
                      accessibilityRole="button"
                    >
                      <View style={styles.cardContent}>
                        <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "12", borderColor: colors.border }]}>
                          <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
                        </View>
                        <View style={styles.cardDetails}>
                          <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {e.contactName}
                          </Text>
                          <View style={styles.metaRow}>
                            <Ionicons name="call-outline" size={10} color={colors.textMuted} />
                            <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                              {e.contactPhone}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
                {items.length === 0 ? (
                  <View style={[styles.emptyColumnContainer, { borderColor: colors.border }]}>
                    <Text style={[styles.emptyColumnText, { color: colors.textMuted }]}>No Leads</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center" },
  titleSection: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: "500" },
  board: { padding: 16 },
  column: { width: 250, marginRight: 16 },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  columnDot: { width: 6, height: 6, borderRadius: 3 },
  columnTitle: { fontWeight: "800", textTransform: "capitalize", fontSize: 13, flex: 1, letterSpacing: 0.2 },
  columnCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  columnCount: { fontWeight: "700", fontSize: 11 },
  columnList: { maxHeight: 520 },
  card: {
    borderWidth: 1,
    borderLeftWidth: 3.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardContent: { flexDirection: "row", gap: 10, alignItems: "center" },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 11, fontWeight: "800" },
  cardDetails: { flex: 1 },
  cardName: { fontSize: 13, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  cardMeta: { fontSize: 11 },
  emptyColumnContainer: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  emptyColumnText: { fontSize: 12, fontWeight: "500" },
  error: { textAlign: "center", padding: 8 },
});
