import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { EnrolmentTabParamList, RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
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
  const { colors } = useTheme();
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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <ScrollView horizontal contentContainerStyle={styles.board}>
        {STAGES.map((stage) => {
          const items = enquiries.filter((e) => e.status === stage);
          return (
            <View key={stage} style={styles.column}>
              <Text style={[styles.columnTitle, { color: colors.textPrimary }]}>{stage} ({items.length})</Text>
              <ScrollView style={styles.columnList}>
                {items.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => navigation.navigate("EnquiryDetail", { enquiryId: e.id })}
                  >
                    <Text style={[styles.cardName, { color: colors.textPrimary }]}>{e.contactName}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textMuted }]}>{e.contactPhone}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  board: { padding: 12 },
  column: { width: 220, marginRight: 12 },
  columnTitle: { fontWeight: "700", textTransform: "capitalize", marginBottom: 8 },
  columnList: { maxHeight: 600 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  cardName: { fontWeight: "700" },
  cardMeta: { marginTop: 2, fontSize: 12 },
  error: { textAlign: "center", padding: 8 },
});
