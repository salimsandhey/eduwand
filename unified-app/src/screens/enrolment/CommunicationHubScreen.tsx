import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, ClassSection, StudentStub, CommunicationMessage } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "CommunicationHub">;
type Section = "student" | "class" | "weekly";

const TABS: { key: Section; label: string }[] = [
  { key: "student", label: "Students" },
  { key: "class", label: "Classes" },
  { key: "weekly", label: "Weekly updates" },
];

function classLabel(section: { className: string; sectionName: string } | undefined): string {
  if (!section) return "";
  return `${capitalizeFirst(section.className)} ${capitalizeFirst(section.sectionName)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function CommunicationHubScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [section, setSection] = useState<Section>("student");
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<CommunicationMessage[]>([]);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [sections, roster, pending] = await Promise.all([
        api.listClassSections(accessToken),
        api.listStudents(accessToken),
        api.listPendingParentUpdates(accessToken),
      ]);
      setClassSections(sections);
      setStudents(roster.data ?? []);
      setPendingUpdates(pending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter && s.classSectionId !== classFilter) return false;
      return !q || s.fullName.toLowerCase().includes(q);
    });
  }, [students, classFilter, search]);

  async function hold(id: string) {
    if (!accessToken) return;
    setError(null);
    try {
      await api.holdParentUpdate(accessToken, id);
      setPendingUpdates(await api.listPendingParentUpdates(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hold update");
    }
  }

  function renderRow(key: string, avatar: React.ReactNode, title: string, caption: string, onPress: () => void) {
    return (
      <Pressable
        key={key}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
        accessibilityLabel={`Open chat with ${title}`}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>{avatar}</View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.rowCaption, { color: colors.textMuted }]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  function renderStudents() {
    return (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
          {[{ id: null as string | null, label: "All classes" }, ...classSections.map((c) => ({ id: c.id as string | null, label: classLabel(c) }))].map((c) => {
            const active = classFilter === c.id;
            return (
              <Pressable
                key={c.id ?? "all"}
                onPress={() => setClassFilter(c.id)}
                style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceAccent }]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textPrimary }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.pad}>
          <TextInput
            style={[styles.search, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Search students"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.list}>
          {filteredStudents.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No students found.</Text>
          ) : (
            filteredStudents.map((s) => {
              const label = classLabel(classSections.find((c) => c.id === s.classSectionId) ?? s.classSection);
              return renderRow(
                s.id,
                <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(s.fullName)}</Text>,
                capitalizeFirst(s.fullName),
                label,
                () => navigation.navigate("CommunicationChat", { mode: "student", studentId: s.id, studentName: s.fullName, classLabel: label })
              );
            })
          )}
        </View>
      </>
    );
  }

  function renderClasses() {
    return (
      <View style={[styles.list, { marginTop: spacing.md }]}>
        {classSections.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>No classes yet.</Text>
        ) : (
          classSections.map((c) => {
            const count = students.filter((s) => s.classSectionId === c.id).length;
            return renderRow(
              c.id,
              <Ionicons name="people" size={20} color={colors.accent} />,
              classLabel(c),
              `${count} student${count === 1 ? "" : "s"} · Send an announcement`,
              () => navigation.navigate("CommunicationChat", { mode: "class", classSectionId: c.id, classLabel: classLabel(c) })
            );
          })
        )}
      </View>
    );
  }

  function renderWeekly() {
    return (
      <View style={[styles.list, { marginTop: spacing.md }]}>
        <View style={[styles.notice, { backgroundColor: colors.surfaceAccent }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            Weekly parent updates are assembled automatically but not sent yet - the delivery channel (SMS/email) hasn't been confirmed. Hold any you don't want sent.
          </Text>
        </View>
        {pendingUpdates.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>No pending updates.</Text>
        ) : (
          pendingUpdates.map((m) => (
            <View key={m.id} style={[styles.row, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
              <View style={styles.rowText}>
                <Text style={[styles.updateBody, { color: colors.textPrimary }]}>{m.body}</Text>
                <Text style={[styles.rowCaption, { color: colors.textMuted }]}>{new Date(m.createdAt).toLocaleDateString()}</Text>
              </View>
              <Pressable onPress={() => hold(m.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hold this update">
                <Ionicons name="pause-circle-outline" size={24} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {TABS.map((t) => {
          const active = section === t.key;
          return (
            <Pressable
              key={t.key}
              style={({ pressed }) => [styles.tab, active && { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={() => setSection(t.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? colors.accentOn : colors.textSecondary }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {section === "student" ? renderStudents() : section === "class" ? renderClasses() : renderWeekly()}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", flex: 1 },
  tabRow: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: 14, padding: 4, borderRadius: 14, borderWidth: 1, gap: 4 },
  tab: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  tabText: { fontSize: 12, fontWeight: "700" },
  error: { marginHorizontal: spacing.lg, marginTop: 10, fontSize: 13 },
  content: { paddingBottom: 40 },
  filterScroll: { marginTop: 14, flexGrow: 0 },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: "700" },
  pad: { paddingHorizontal: spacing.lg, marginTop: 10 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  list: { paddingHorizontal: spacing.lg, paddingTop: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderRadius: 16, padding: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontWeight: "800" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowCaption: { fontSize: 12, marginTop: 2 },
  updateBody: { fontSize: 13, lineHeight: 19 },
  empty: { textAlign: "center", marginTop: 30, fontSize: 13 },
  notice: { flexDirection: "row", gap: 8, borderRadius: 12, padding: spacing.md, alignItems: "flex-start" },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
