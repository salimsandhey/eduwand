import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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

// Columns per stage, tap a card to open it. True drag-and-drop between columns would need
// an extra gesture library - out of scope for this pass, so moving stage happens from the
// Enquiry Detail screen's stage tracker instead.
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
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <ScrollView horizontal contentContainerStyle={styles.board} showsHorizontalScrollIndicator={false}>
        {STAGES.map((stage) => {
          const items = enquiries.filter((e) => e.status === stage);
          const statusColor = getStatusColor(stage, mode);
          return (
            <View key={stage} style={styles.column}>
              <View style={[styles.columnHeader, { backgroundColor: statusColor.bg }]}>
                <View style={[styles.columnDot, { backgroundColor: statusColor.text }]} />
                <Text style={[styles.columnTitle, { color: statusColor.text }]}>{stage}</Text>
                <Text style={[styles.columnCount, { color: statusColor.text }]}>{items.length}</Text>
              </View>
              <ScrollView style={styles.columnList} showsVerticalScrollIndicator={false}>
                {items.map((e) => (
                  <Pressable
                    key={e.id}
                    style={({ pressed }) => [
                      styles.card,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      cardShadow,
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: e.id })}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.cardName, { color: colors.textPrimary }]}>{e.contactName}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{e.contactPhone}</Text>
                  </Pressable>
                ))}
                {items.length === 0 ? (
                  <Text style={[styles.emptyColumn, { color: colors.textMuted }]}>Empty</Text>
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
  board: { padding: 12 },
  column: { width: 220, marginRight: 12 },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  columnDot: { width: 6, height: 6, borderRadius: 3 },
  columnTitle: { fontWeight: "700", textTransform: "capitalize", fontSize: 13, flex: 1 },
  columnCount: { fontWeight: "700", fontSize: 12 },
  columnList: { maxHeight: 600 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  cardName: { fontWeight: "700" },
  cardMeta: { marginTop: 2, fontSize: 12 },
  emptyColumn: { fontSize: 12, textAlign: "center", paddingVertical: 12 },
  error: { textAlign: "center", padding: 8 },
});
