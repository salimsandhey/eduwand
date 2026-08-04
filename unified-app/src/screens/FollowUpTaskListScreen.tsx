import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { api, FollowUpTask } from "../api/client";
import { theme } from "../theme";

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
  onSend,
  onComplete,
  onReschedule,
}: {
  task: FollowUpTask;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");

  return (
    <View style={styles.taskCard}>
      <Text style={styles.taskEnquiry}>{task.enquiry?.contactName ?? "Enquiry"}</Text>
      <Text style={styles.taskMeta}>
        {task.channel} · due {new Date(task.dueAt).toLocaleDateString()}
      </Text>

      {rescheduling ? (
        <View style={styles.rescheduleRow}>
          <TextInput
            style={styles.rescheduleInput}
            placeholder="YYYY-MM-DD"
            value={newDate}
            onChangeText={setNewDate}
          />
          <Pressable
            style={styles.smallButton}
            onPress={() => {
              if (newDate) onReschedule(task.id, newDate);
              setRescheduling(false);
              setNewDate("");
            }}
          >
            <Text style={styles.smallButtonText}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <Pressable style={styles.smallButton} onPress={() => onSend(task.id)}>
            <Text style={styles.smallButtonText}>Send now</Text>
          </Pressable>
          <Pressable style={styles.smallButtonOutline} onPress={() => setRescheduling(true)}>
            <Text style={styles.smallButtonOutlineText}>Reschedule</Text>
          </Pressable>
          <Pressable style={styles.smallButtonOutline} onPress={() => onComplete(task.id)}>
            <Text style={styles.smallButtonOutlineText}>Mark complete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function FollowUpTaskListScreen() {
  const { accessToken } = useAuth();
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
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {(["Overdue", "Due today", "Upcoming"] as const).map((label, idx) => {
        const group = [groups.overdue, groups.dueToday, groups.upcoming][idx];
        return (
          <View key={label}>
            <Text style={styles.sectionTitle}>{label} ({group.length})</Text>
            {group.length === 0 ? (
              <Text style={styles.empty}>Nothing here</Text>
            ) : (
              group.map((t) => (
                <TaskRow key={t.id} task={t} onSend={send} onComplete={complete} onReschedule={reschedule} />
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginTop: 20, marginBottom: 8 },
  empty: { color: theme.textMuted },
  taskCard: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  taskEnquiry: { fontWeight: "600", color: theme.text },
  taskMeta: { color: theme.textMuted, marginTop: 2, textTransform: "capitalize" },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  rescheduleRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  rescheduleInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 6, padding: 8, flex: 1, backgroundColor: "#fff" },
  smallButton: { backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  smallButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  smallButtonOutline: { borderWidth: 1, borderColor: theme.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  smallButtonOutlineText: { color: theme.text, fontWeight: "600", fontSize: 13 },
  error: { color: theme.danger, textAlign: "center", marginBottom: 8 },
});
