import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
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

function TaskRow({
  task,
  colors,
  onSend,
  onComplete,
  onReschedule,
}: {
  task: FollowUpTask;
  colors: ThemeColors;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.taskEnquiry, { color: colors.textPrimary }]}>{task.enquiry?.contactName ?? "Enquiry"}</Text>
      <Text style={[styles.taskMeta, { color: colors.textMuted }]}>
        {task.channel} · due {new Date(task.dueAt).toLocaleDateString()}
      </Text>

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
            style={[styles.smallButton, { backgroundColor: colors.accent }]}
            onPress={() => {
              if (newDate) onReschedule(task.id, newDate);
              setRescheduling(false);
              setNewDate("");
            }}
          >
            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <Pressable style={[styles.smallButton, { backgroundColor: colors.accent }]} onPress={() => onSend(task.id)}>
            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Send now</Text>
          </Pressable>
          <Pressable style={[styles.smallButtonOutline, { borderColor: colors.border }]} onPress={() => setRescheduling(true)}>
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Reschedule</Text>
          </Pressable>
          <Pressable style={[styles.smallButtonOutline, { borderColor: colors.border }]} onPress={() => onComplete(task.id)}>
            <Text style={[styles.smallButtonOutlineText, { color: colors.textPrimary }]}>Mark complete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function FollowUpTaskListScreen() {
  const { accessToken } = useAuth();
  const { colors } = useTheme();
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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      {(["Overdue", "Due today", "Upcoming"] as const).map((label, idx) => {
        const group = [groups.overdue, groups.dueToday, groups.upcoming][idx];
        return (
          <View key={label}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{label} ({group.length})</Text>
            {group.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing here</Text>
            ) : (
              group.map((t) => (
                <TaskRow key={t.id} task={t} colors={colors} onSend={send} onComplete={complete} onReschedule={reschedule} />
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  empty: {},
  taskCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  taskEnquiry: { fontWeight: "700" },
  taskMeta: { marginTop: 2, textTransform: "capitalize", fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  rescheduleRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  rescheduleInput: { borderWidth: 1, borderRadius: 6, padding: 8, flex: 1 },
  smallButton: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  smallButtonText: { fontWeight: "700", fontSize: 13 },
  smallButtonOutline: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  smallButtonOutlineText: { fontWeight: "700", fontSize: 13 },
  error: { textAlign: "center", marginBottom: 8 },
});
