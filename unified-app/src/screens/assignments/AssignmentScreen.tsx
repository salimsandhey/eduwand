import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, Assignment } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type Props = CompositeScreenProps<BottomTabScreenProps<TeacherTabParamList, "Assignment">, NativeStackScreenProps<RootStackParamList>>;
type Filter = "all" | "draft" | "published";

export function AssignmentScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true); setError(null);
    try { setAssignments(await api.listAssignments(accessToken)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load assignments"); }
    finally { setIsLoading(false); }
  }, [accessToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const visibleAssignments = useMemo(() => filter === "all" ? assignments : assignments.filter((item) => item.status === filter), [assignments, filter]);

  return <Screen>
    <FlatList
      data={visibleAssignments}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.list, { paddingBottom: tabBarClearance }]}
      showsVerticalScrollIndicator={false}
      onScroll={handleTabBarScroll}
      scrollEventThrottle={16}
      ListHeaderComponent={<>
        <View style={styles.header}><Text style={[styles.title, { color: colors.textPrimary }]}>Assignment Lab</Text><Pressable onPress={() => navigation.navigate("CreateAssignment")} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button"><Ionicons name="add" size={22} color={colors.accentOn} /></Pressable></View>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>Create, manage and review your assignments.</Text>
        <Pressable onPress={() => navigation.navigate("CreateAssignment")} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]} accessibilityRole="button"><LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createHero}><View><Text style={[styles.createTitle, { color: colors.accentOn }]}>Create an assignment</Text><Text style={styles.createSubtitle}>Build questions for your class.</Text><View style={styles.createCta}><Text style={[styles.createCtaText, { color: colors.accent }]}>Create</Text><Ionicons name="arrow-forward" size={16} color={colors.accent} /></View></View><Image source={decorativeAssets.teacherAssignment} style={styles.createHeroImage} resizeMode="contain" /></LinearGradient></Pressable>
        <Pressable onPress={() => navigation.navigate("AssignmentAiMultiSetup")} style={({ pressed }) => [styles.aiGenerateRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
          <View style={[styles.aiGenerateIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="sparkles" size={18} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.aiGenerateTitle, { color: colors.textPrimary }]}>Generate with AI</Text>
            <Text style={[styles.aiGenerateSubtitle, { color: colors.textMuted }]}>One topic, or a mix of several</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
        </Pressable>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your assignments</Text>
        <View style={styles.filters}>{(["all", "draft", "published"] as Filter[]).map((item) => { const active = filter === item; return <Pressable key={item} onPress={() => setFilter(item)} style={({ pressed }) => [styles.filter, { backgroundColor: active ? colors.accent : colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button" accessibilityState={{ selected: active }}><Text style={[styles.filterText, { color: active ? colors.accentOn : colors.textSecondary }]}>{item === "all" ? "All" : item === "draft" ? "Drafts" : "Published"}</Text></Pressable>; })}</View>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </>}
      ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} /> : <View style={styles.emptyState}><Image source={decorativeAssets.book} style={styles.emptyGraphic} resizeMode="contain" /><Text style={[styles.emptyText, { color: colors.textMuted }]}>No {filter === "all" ? "assignments" : `${filter} assignments`} yet.</Text></View>}
      renderItem={({ item }) => <Pressable onPress={() => navigation.navigate("AssignmentDetail", { assignmentId: item.id })} style={({ pressed }) => [styles.assignmentRow, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]} accessibilityRole="button"><View style={[styles.assignmentIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name={item.status === "draft" ? "document-text-outline" : "school-outline"} size={21} color={colors.accent} /></View><View style={styles.assignmentCopy}><Text style={[styles.assignmentTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text><Text style={[styles.assignmentMeta, { color: colors.textMuted }]}>{item.questions.length} question{item.questions.length === 1 ? "" : "s"} · {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text><View style={[styles.statusBadge, { backgroundColor: item.status === "published" ? colors.accentSoft : colors.surfaceRaised }]}><Text style={[styles.statusText, { color: item.status === "published" ? colors.accent : colors.textMuted }]}>{item.status}</Text></View></View><Ionicons name="chevron-forward" size={19} color={colors.textMuted} /></Pressable>}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 132, gap: 12, flexGrow: 1 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 }, addButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, intro: { marginTop: 18, maxWidth: 258, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  createHero: { minHeight: 172, marginTop: 28, borderRadius: 20, padding: 20, overflow: "hidden", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, createTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700", letterSpacing: -0.5 }, createSubtitle: { marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.78)", fontWeight: "500" }, createCta: { marginTop: 20, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", paddingHorizontal: 17, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7 }, createCtaText: { fontSize: 13, fontWeight: "800" }, createHeroImage: { width: 124, height: 124, marginRight: -12 },
  aiGenerateRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, borderRadius: 16, padding: 14 }, aiGenerateIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, aiGenerateTitle: { fontSize: 14, fontWeight: "800" }, aiGenerateSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "500" },
  sectionTitle: { marginTop: 30, fontSize: 23, lineHeight: 29, fontWeight: "500", letterSpacing: -0.4 }, filters: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 8 }, filter: { minHeight: 32, borderRadius: 16, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }, filterText: { fontSize: 12, fontWeight: "700" },
  assignmentRow: { minHeight: 98, borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 }, assignmentIcon: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center" }, assignmentCopy: { flex: 1 }, assignmentTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" }, assignmentMeta: { marginTop: 3, fontSize: 11, fontWeight: "500" }, statusBadge: { alignSelf: "flex-start", marginTop: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }, statusText: { textTransform: "uppercase", fontSize: 9, letterSpacing: 0.5, fontWeight: "800" },
  error: { textAlign: "center", marginVertical: 8 }, emptyState: { alignItems: "center", marginTop: 26, gap: 8 }, emptyGraphic: { width: 78, height: 78 }, emptyText: { fontSize: 13, fontWeight: "500" },
});
