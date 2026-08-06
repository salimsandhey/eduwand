import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, ScrollView, ViewStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { ThemeColors } from "../theme/tokens";
import { api, FollowUpTask } from "../api/client";

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
  onSend,
  onComplete,
  onReschedule,
}: {
  task: FollowUpTask;
  colors: ThemeColors;
  shadow: ViewStyle;
  pressedOpacity: number;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const channelIcon = task.channel === "sms" ? "chatbox-outline" : "mail-outline";

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow]}>
      <Text style={[styles.taskEnquiry, { color: colors.textPrimary }]}>{task.enquiry?.contactName ?? "Enquiry"}</Text>
      <View style={styles.taskMetaRow}>
        <Ionicons name={channelIcon} size={13} color={colors.textMuted} />
        <Text style={[styles.taskMeta, { color: colors.textMuted }]}>
          {task.channel} · due {new Date(task.dueAt).toLocaleDateString()}
        </Text>
      </View>

      {rescheduling ? (
        <View style={styles.rescheduleRow}>
          <TextInput
            style={[styles.rescheduleInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            value={newDate}
            onChangeText={setNewDate}
          />
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
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Mark complete</Text>
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {(["Overdue", "Due today", "Upcoming"] as const).map((label, idx) => {
          const group = [groups.overdue, groups.dueToday, groups.upcoming][idx];
          return (
            <View key={label}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name={GROUP_ICONS[label]} size={16} color={colors.textPrimary} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{label} ({group.length})</Text>
              </View>
              {group.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing here</Text>
              ) : (
                group.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    colors={colors}
                    shadow={cardShadow}
                    pressedOpacity={pressedOpacity}
                    onSend={send}
                    onComplete={complete}
                    onReschedule={reschedule}
                  />
                ))
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
  content: { padding: 16, paddingBottom: 40 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  empty: {},
  taskCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  taskEnquiry: { fontWeight: "700" },
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  taskMeta: { textTransform: "capitalize", fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  rescheduleRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  rescheduleInput: { borderWidth: 1, borderRadius: 8, padding: 8, flex: 1, minHeight: 40 },
  smallButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, minHeight: 36, justifyContent: "center" },
  smallButtonText: { fontWeight: "700", fontSize: 13 },
  smallButtonOutline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, minHeight: 36, justifyContent: "center" },
  smallButtonOutlineText: { fontWeight: "700", fontSize: 13 },
  error: { textAlign: "center", marginBottom: 8 },
});
