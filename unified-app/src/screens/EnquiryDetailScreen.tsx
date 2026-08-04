import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import {
  api,
  EnquiryDetail,
  EnquiryStatus,
  PossibleDuplicate,
  MessageTemplate,
  MessageChannel,
  FollowUpTask,
} from "../api/client";
import { theme } from "../theme";

const STATUSES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];

type Props = NativeStackScreenProps<RootStackParamList, "EnquiryDetail">;

export function EnquiryDetailScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();

  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lostReasonInput, setLostReasonInput] = useState("");
  const [showLostReasonFor, setShowLostReasonFor] = useState(false);

  const [showAddTask, setShowAddTask] = useState(false);
  const [taskChannel, setTaskChannel] = useState<MessageChannel>("sms");
  const [taskTemplateId, setTaskTemplateId] = useState<string | null>(null);
  const [taskDueAt, setTaskDueAt] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [detailRes, allTasks, allTemplates] = await Promise.all([
        api.getEnquiry(accessToken, enquiryId),
        api.listFollowUpTasks(accessToken),
        api.listMessageTemplates(accessToken),
      ]);
      setEnquiry(detailRes.data);
      setDuplicates((detailRes.meta?.possibleDuplicates as PossibleDuplicate[]) ?? []);
      setTasks(allTasks.filter((t) => t.enquiryId === enquiryId));
      setTemplates(allTemplates);
      if (allTemplates.length > 0) setTaskTemplateId(allTemplates[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enquiry");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, enquiryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function changeStatus(status: EnquiryStatus) {
    if (!accessToken || !enquiry) return;
    if (status === "lost" && !enquiry.lostReason) {
      setShowLostReasonFor(true);
      return;
    }
    try {
      await api.updateEnquiry(accessToken, enquiryId, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    }
  }

  async function confirmLostReason() {
    if (!accessToken || !lostReasonInput.trim()) return;
    try {
      await api.updateEnquiry(accessToken, enquiryId, { status: "lost", lostReason: lostReasonInput.trim() });
      setShowLostReasonFor(false);
      setLostReasonInput("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    }
  }

  async function mergeDuplicate(sourceId: string) {
    if (!accessToken) return;
    try {
      await api.mergeEnquiry(accessToken, enquiryId, sourceId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge");
    }
  }

  async function addFollowUpTask() {
    if (!accessToken || !taskTemplateId || !taskDueAt) return;
    try {
      await api.createFollowUpTask(accessToken, {
        enquiryId,
        channel: taskChannel,
        templateId: taskTemplateId,
        dueAt: new Date(taskDueAt).toISOString(),
      });
      setShowAddTask(false);
      setTaskDueAt("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  async function sendTask(taskId: string) {
    if (!accessToken) return;
    try {
      await api.sendFollowUpTask(accessToken, taskId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  if (isLoading && !enquiry) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!enquiry) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Enquiry not found"}</Text>
      </View>
    );
  }

  const channelTemplates = templates.filter((t) => t.channel === taskChannel);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{enquiry.contactName}</Text>
      <Text style={styles.meta}>{enquiry.contactPhone}{enquiry.contactEmail ? ` · ${enquiry.contactEmail}` : ""}</Text>
      <Text style={styles.meta}>{enquiry.source}{enquiry.gradeInterest ? ` · ${enquiry.gradeInterest}` : ""}</Text>

      {duplicates.length > 0 ? (
        <View style={styles.duplicateBanner}>
          <Text style={styles.duplicateTitle}>Possible duplicate</Text>
          {duplicates.map((d) => (
            <View key={d.id} style={styles.duplicateRow}>
              <Text style={styles.duplicateItem}>{d.contactName} · {d.status}</Text>
              <Pressable style={styles.smallButton} onPress={() => mergeDuplicate(d.id)}>
                <Text style={styles.smallButtonText}>Merge into this</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Stage</Text>
      <View style={styles.chipRow}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, enquiry.status === s && styles.chipActive]}
            onPress={() => changeStatus(s)}
          >
            <Text style={[styles.chipText, enquiry.status === s && styles.chipTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {showLostReasonFor ? (
        <View style={styles.inlineForm}>
          <Text style={styles.label}>Reason for lost</Text>
          <TextInput style={styles.input} value={lostReasonInput} onChangeText={setLostReasonInput} />
          <Pressable style={styles.smallButton} onPress={confirmLostReason}>
            <Text style={styles.smallButtonText}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      {enquiry.status === "application" || enquiry.status === "admitted" || enquiry.status === "enrolled" ? (
        <Pressable
          style={styles.admissionButton}
          onPress={() => navigation.navigate("AdmissionConfirmation", { enquiryId })}
        >
          <Text style={styles.admissionButtonText}>Confirm admission</Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionTitle}>Stage history</Text>
      {enquiry.stageHistory.map((h) => (
        <Text key={h.id} style={styles.historyItem}>
          {h.fromStatus ?? "—"} → {h.toStatus} · {new Date(h.changedAt).toLocaleString()}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Notes</Text>
      <Text style={styles.notes}>{enquiry.notes || "No notes"}</Text>

      <View style={styles.followUpHeader}>
        <Text style={styles.sectionTitle}>Follow up tasks</Text>
        <Pressable onPress={() => setShowAddTask((v) => !v)}>
          <Text style={styles.link}>{showAddTask ? "Cancel" : "+ Add"}</Text>
        </Pressable>
      </View>

      {showAddTask ? (
        <View style={styles.inlineForm}>
          <View style={styles.chipRow}>
            {(["sms", "email"] as MessageChannel[]).map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, taskChannel === c && styles.chipActive]}
                onPress={() => {
                  setTaskChannel(c);
                  const first = templates.find((t) => t.channel === c);
                  setTaskTemplateId(first ? first.id : null);
                }}
              >
                <Text style={[styles.chipText, taskChannel === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          {channelTemplates.length === 0 ? (
            <Text style={styles.meta}>No {taskChannel} templates yet</Text>
          ) : (
            <View style={styles.chipRow}>
              {channelTemplates.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.chip, taskTemplateId === t.id && styles.chipActive]}
                  onPress={() => setTaskTemplateId(t.id)}
                >
                  <Text style={[styles.chipText, taskTemplateId === t.id && styles.chipTextActive]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={taskDueAt} onChangeText={setTaskDueAt} placeholder="2026-08-10" />
          <Pressable style={styles.smallButton} onPress={addFollowUpTask}>
            <Text style={styles.smallButtonText}>Create task</Text>
          </Pressable>
        </View>
      ) : null}

      {tasks.length === 0 ? (
        <Text style={styles.meta}>No follow up tasks</Text>
      ) : (
        tasks.map((t) => (
          <View key={t.id} style={styles.taskRow}>
            <Text style={styles.meta}>
              {t.channel} · due {new Date(t.dueAt).toLocaleDateString()} · {t.status}
            </Text>
            {t.status === "pending" ? (
              <Pressable style={styles.smallButton} onPress={() => sendTask(t.id)}>
                <Text style={styles.smallButtonText}>Send now</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { padding: 16, paddingBottom: 60 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },
  name: { fontSize: 22, fontWeight: "700", color: theme.text },
  meta: { color: theme.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginTop: 20, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.card,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.textMuted, textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  historyItem: { color: theme.textMuted, marginBottom: 4 },
  notes: { color: theme.text },
  duplicateBanner: {
    backgroundColor: "#fff8e6",
    borderColor: theme.warning,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  duplicateTitle: { fontWeight: "700", color: theme.warning, marginBottom: 6 },
  duplicateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  duplicateItem: { color: theme.text },
  admissionButton: { backgroundColor: theme.accent, borderRadius: 8, padding: 12, alignItems: "center", marginTop: 16 },
  admissionButtonText: { color: "#fff", fontWeight: "600" },
  inlineForm: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 12, marginBottom: 12 },
  label: { color: theme.textMuted, marginTop: 8, marginBottom: 6, fontSize: 13 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10, backgroundColor: "#fff" },
  smallButton: { backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, alignSelf: "flex-start" },
  smallButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  followUpHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  link: { color: theme.accent, fontWeight: "600" },
  taskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border },
  error: { color: theme.danger, marginTop: 12, textAlign: "center" },
});
