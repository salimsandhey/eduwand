import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { getStatusColor } from "../theme/statusColors";
import {
  api,
  EnquiryDetail,
  EnquiryStatus,
  PossibleDuplicate,
  MessageTemplate,
  MessageChannel,
  FollowUpTask,
} from "../api/client";

const STATUSES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];

type Props = NativeStackScreenProps<RootStackParamList, "EnquiryDetail">;

export function EnquiryDetailScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();

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
      <Screen edges={["bottom"]} style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!enquiry) {
    return (
      <Screen edges={["bottom"]} style={styles.centered}>
        <Text style={[styles.error, { color: colors.danger }]}>{error ?? "Enquiry not found"}</Text>
      </Screen>
    );
  }

  const channelTemplates = templates.filter((t) => t.channel === taskChannel);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{enquiry.contactName}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="call-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {enquiry.contactPhone}{enquiry.contactEmail ? ` · ${enquiry.contactEmail}` : ""}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {enquiry.source}{enquiry.gradeInterest ? ` · ${enquiry.gradeInterest}` : ""}
            </Text>
          </View>
        </View>

        {duplicates.length > 0 ? (
          <View style={[styles.duplicateBanner, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
            <View style={styles.duplicateTitleRow}>
              <Ionicons name="warning-outline" size={16} color={colors.warning} />
              <Text style={[styles.duplicateTitle, { color: colors.warning }]}>Possible duplicate</Text>
            </View>
            {duplicates.map((d) => (
              <View key={d.id} style={styles.duplicateRow}>
                <Text style={[styles.duplicateItem, { color: colors.textPrimary }]}>{d.contactName} · {d.status}</Text>
                <Pressable
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => mergeDuplicate(d.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Merge into this</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stage</Text>
        <View style={styles.chipRow}>
          {STATUSES.map((s) => {
            const active = enquiry.status === s;
            const statusColor = getStatusColor(s, mode);
            return (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  styles.chip,
                  active
                    ? { backgroundColor: statusColor.bg, borderColor: statusColor.text }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => changeStatus(s)}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, { color: active ? statusColor.text : colors.textSecondary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </View>

        {showLostReasonFor ? (
          <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Reason for lost</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={lostReasonInput}
              onChangeText={setLostReasonInput}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={confirmLostReason}
              accessibilityRole="button"
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Confirm</Text>
            </Pressable>
          </View>
        ) : null}

        {enquiry.status === "application" || enquiry.status === "admitted" || enquiry.status === "enrolled" ? (
          <Pressable
            style={({ pressed }) => [styles.admissionButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("AdmissionConfirmation", { enquiryId })}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentOn} />
            <Text style={[styles.admissionButtonText, { color: colors.accentOn }]}>Confirm admission</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stage history</Text>
        {enquiry.stageHistory.map((h) => (
          <View key={h.id} style={styles.historyRow}>
            <View style={[styles.historyDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.historyItem, { color: colors.textMuted }]}>
              {h.fromStatus ?? "—"} → {h.toStatus} · {new Date(h.changedAt).toLocaleString()}
            </Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
        <Text style={[styles.notes, { color: colors.textPrimary }]}>{enquiry.notes || "No notes"}</Text>

        <View style={styles.followUpHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Follow up tasks</Text>
          <Pressable
            style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}
            onPress={() => setShowAddTask((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: colors.accent }]}>{showAddTask ? "Cancel" : "+ Add"}</Text>
          </Pressable>
        </View>

        {showAddTask ? (
          <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.chipRow}>
              {(["sms", "email"] as MessageChannel[]).map((c) => {
                const active = taskChannel === c;
                return (
                  <Pressable
                    key={c}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => {
                      setTaskChannel(c);
                      const first = templates.find((t) => t.channel === c);
                      setTaskTemplateId(first ? first.id : null);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            {channelTemplates.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>No {taskChannel} templates yet</Text>
            ) : (
              <View style={styles.chipRow}>
                {channelTemplates.map((t) => {
                  const active = taskTemplateId === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      style={({ pressed }) => [
                        styles.chip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => setTaskTemplateId(t.id)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Due date (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={taskDueAt}
              onChangeText={setTaskDueAt}
              placeholder="2026-08-10"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              onPress={addFollowUpTask}
              accessibilityRole="button"
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Create task</Text>
            </Pressable>
          </View>
        ) : null}

        {tasks.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>No follow up tasks</Text>
        ) : (
          tasks.map((t) => (
            <View key={t.id} style={[styles.taskRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t.channel} · due {new Date(t.dueAt).toLocaleDateString()} · {t.status}
              </Text>
              {t.status === "pending" ? (
                <Pressable
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => sendTask(t.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Send now</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  headerCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  name: { fontSize: 22, fontWeight: "700" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  meta: { fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 32,
    justifyContent: "center",
  },
  chipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "600" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  historyDot: { width: 6, height: 6, borderRadius: 3 },
  historyItem: { fontSize: 13 },
  notes: { fontSize: 14, lineHeight: 20 },
  duplicateBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  duplicateTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  duplicateTitle: { fontWeight: "700" },
  duplicateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  duplicateItem: {},
  admissionButton: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 14, alignItems: "center", justifyContent: "center", marginTop: 16, minHeight: 48 },
  admissionButtonText: { fontWeight: "700", fontSize: 15 },
  inlineForm: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  label: { marginTop: 8, marginBottom: 6, fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 8, padding: 10 },
  smallButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8, alignSelf: "flex-start", minHeight: 36, justifyContent: "center" },
  smallButtonText: { fontWeight: "700", fontSize: 13 },
  followUpHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  link: { fontWeight: "700" },
  taskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  error: { marginTop: 12, textAlign: "center" },
});
