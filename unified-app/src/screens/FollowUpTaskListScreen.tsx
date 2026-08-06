import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, ScrollView, ViewStyle, LayoutAnimation, Platform, UIManager } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/tokens";
import { api, FollowUpTask } from "../api/client";

if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

function groupTasks(tasks: FollowUpTask[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const pending = tasks.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => new Date(t.dueAt) < startOfToday);
  const dueToday = pending.filter((t) => {
    const d = new Date(t.dueAt);
    return d >= startOfToday && d < startOfTomorrow;
  });
  const upcoming = pending.filter((t) => new Date(t.dueAt) >= startOfTomorrow);

  return { overdue, dueToday, upcoming };
}

const GROUP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Overdue: "alert-circle-outline",
  "Due today": "today-outline",
  Upcoming: "time-outline",
};

function TaskRow({
  task,
  colors,
  shadow,
  pressedOpacity,
  leftColor,
  onSend,
  onComplete,
  onReschedule,
}: {
  task: FollowUpTask;
  colors: ThemeColors;
  shadow: ViewStyle;
  pressedOpacity: number;
  leftColor: string;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const channelIcon = task.channel === "sms" ? "chatbox-outline" : "mail-outline";

  const initials = task.enquiry?.contactName
    ? task.enquiry.contactName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: leftColor }, shadow]}>
      <View style={styles.taskCardHeader}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "12", borderColor: colors.border }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
        </View>
        <View style={styles.taskTitleSection}>
          <Text style={[styles.taskEnquiry, { color: colors.textPrimary }]}>{task.enquiry?.contactName ?? "Enquiry"}</Text>
          <View style={styles.taskMetaRow}>
            <Ionicons name={channelIcon} size={12} color={colors.textMuted} style={{ marginRight: 2 }} />
            <Text style={[styles.taskMeta, { color: colors.textMuted }]}>
              {task.channel} · due {new Date(task.dueAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </View>

      {rescheduling ? (
        <View style={styles.rescheduleRow}>
          <View style={[styles.rescheduleInputContainer, { borderColor: inputFocused ? colors.accent : colors.border, backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={[styles.rescheduleInput, { color: colors.textPrimary }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={newDate}
              onChangeText={setNewDate}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              if (newDate) onReschedule(task.id, newDate);
              setRescheduling(false);
              setNewDate("");
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.smallButtonOutline, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setRescheduling(false);
              setNewDate("");
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            onPress={() => onSend(task.id)}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Send now</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.smallButtonOutline, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => setRescheduling(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Reschedule</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.smallButtonOutline, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => onComplete(task.id)}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Complete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function FollowUpTaskListScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accordion collapsed state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    Overdue: false,
    "Due today": false,
    Upcoming: false,
  });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listFollowUpTasks(accessToken);
      setTasks(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => groupTasks(tasks), [tasks]);

  const toggleGroup = (groupLabel: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  };

  async function send(id: string) {
    if (!accessToken) return;
    try {
      await api.sendFollowUpTask(accessToken, id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    }
  }

  async function complete(id: string) {
    if (!accessToken) return;
    try {
      await api.updateFollowUpTask(accessToken, id, { status: "cancelled" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function reschedule(id: string, dueAt: string) {
    if (!accessToken) return;
    try {
      await api.updateFollowUpTask(accessToken, id, { dueAt: new Date(dueAt).toISOString() });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule");
    }
  }

  if (isLoading) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const groupColors: Record<string, string> = {
    Overdue: colors.danger,
    "Due today": colors.warning,
    Upcoming: colors.accent,
  };

  const totalPending = groups.overdue.length + groups.dueToday.length + groups.upcoming.length;

  return (
    <Screen>
      {/* Title Header Block */}
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Follow Up Tasks</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {totalPending} pending task{totalPending === 1 ? "" : "s"} remaining
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {(["Overdue", "Due today", "Upcoming"] as const).map((label, idx) => {
          const group = [groups.overdue, groups.dueToday, groups.upcoming][idx];
          const isCollapsed = collapsedGroups[label];
          return (
            <View key={label} style={styles.sectionContainer}>
              <Pressable
                onPress={() => toggleGroup(label)}
                style={({ pressed }) => [
                  styles.sectionTitleRow,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons name={GROUP_ICONS[label]} size={16} color={groupColors[label]} />
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                    {label} ({group.length})
                  </Text>
                </View>
                <Ionicons
                  name={isCollapsed ? "chevron-down-outline" : "chevron-up-outline"}
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>

              {!isCollapsed && (
                <View style={styles.groupContent}>
                  {group.length === 0 ? (
                    <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
                      <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing here</Text>
                    </View>
                  ) : (
                    group.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        colors={colors}
                        shadow={cardShadow}
                        pressedOpacity={pressedOpacity}
                        leftColor={groupColors[label]}
                        onSend={send}
                        onComplete={complete}
                        onReschedule={reschedule}
                      />
                    ))
                  )}
                </View>
              )}
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
  content: { padding: 16, paddingBottom: 40 },
  sectionContainer: { marginBottom: 16 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
  groupContent: { marginTop: 8 },
  emptyContainer: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { fontSize: 13, fontWeight: "500" },
  taskCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  taskCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "800" },
  taskTitleSection: { flex: 1 },
  taskEnquiry: { fontSize: 14, fontWeight: "700" },
  taskMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  taskMeta: { textTransform: "capitalize", fontSize: 11 },
  actionsRow: { flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" },
  rescheduleRow: { flexDirection: "row", gap: 6, marginTop: 12, alignItems: "center" },
  rescheduleInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    flex: 1,
    height: 36,
  },
  rescheduleInput: { flex: 1, height: "100%", fontSize: 13, paddingVertical: 0 },
  smallButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 34, justifyContent: "center", alignItems: "center" },
  smallButtonText: { fontWeight: "700", fontSize: 11 },
  smallButtonOutline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minHeight: 34, justifyContent: "center", alignItems: "center" },
  smallButtonOutlineText: { fontWeight: "700", fontSize: 11 },
  error: { textAlign: "center", marginBottom: 8 },
});
