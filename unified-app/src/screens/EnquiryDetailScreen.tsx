import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Share } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { DatePicker } from "../components/DatePicker";
import { ConfirmModal } from "../components/ConfirmModal";
import { getStatusColor } from "../theme/statusColors";
import {
  api,
  EnquiryDetail,
  EnquiryStatus,
  PossibleDuplicate,
  MessageTemplate,
  MessageChannel,
  FollowUpTask,
  ActivityItem,
  ActivityType,
} from "../api/client";

const STATUSES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled", "lost"];

const ACTIVITY_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  stage_change: "swap-horizontal-outline",
  note_added: "document-text-outline",
  task_created: "alarm-outline",
  task_sent: "paper-plane-outline",
};

function activityLabel(item: ActivityItem): string {
  switch (item.type) {
    case "stage_change":
      return `Moved to ${item.payload.toStatus}`;
    case "note_added":
      return `Note added${item.actorName ? ` by ${item.actorName}` : ""}`;
    case "task_created":
      return `Follow-up task created (${item.payload.channel})${item.actorName ? ` · ${item.actorName}` : ""}`;
    case "task_sent":
      return `Follow-up sent via ${item.payload.channel}`;
    default:
      return "Activity";
  }
}

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
  const [lostReasonFocused, setLostReasonFocused] = useState(false);

  const [pendingStageChange, setPendingStageChange] = useState<EnquiryStatus | null>(null);

  const [noteBody, setNoteBody] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);

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

  async function applyStatusChange(status: EnquiryStatus) {
    if (!accessToken) return;
    try {
      await api.updateEnquiry(accessToken, enquiryId, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    }
  }

  function changeStatus(status: EnquiryStatus) {
    if (!enquiry || status === enquiry.status) return;
    if (status === "lost") {
      if (!enquiry.lostReason) {
        setShowLostReasonFor(true);
      } else {
        applyStatusChange(status);
      }
      return;
    }
    const isOneStepForward = STATUSES.indexOf(status) === STATUSES.indexOf(enquiry.status) + 1;
    if (isOneStepForward) {
      applyStatusChange(status);
    } else {
      setPendingStageChange(status);
    }
  }

  async function addNote() {
    if (!accessToken || !noteBody.trim()) return;
    setIsAddingNote(true);
    try {
      await api.addEnquiryNote(accessToken, enquiryId, noteBody.trim());
      setNoteBody("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setIsAddingNote(false);
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
        dueAt: new Date(`${taskDueAt}T00:00:00`).toISOString(),
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

  const handleShare = async () => {
    if (!enquiry) return;
    try {
      await Share.share({
        message: `Lead Details:\nName: ${enquiry.contactName}\nPhone: ${enquiry.contactPhone}\nEmail: ${enquiry.contactEmail || "N/A"}\nSource: ${enquiry.source}\nStatus: ${enquiry.status}`,
      });
    } catch (err) {
      // Ignored
    }
  };

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

  // Initials
  const initials = enquiry.contactName
    ? enquiry.contactName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <Screen edges={["bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Profile Card Redesign */}
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.profileSection}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "15", borderColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
            </View>
            <View style={styles.headerDetails}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{enquiry.contactName}</Text>
              <Text style={[styles.sourceTag, { color: colors.textSecondary, backgroundColor: colors.surfaceRaised }]}>
                Source: {enquiry.source}
              </Text>
            </View>
          </View>

          {/* Quick Action Buttons Row */}
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="call-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Call</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="mail-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Email</Text>
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.actionButton, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <View style={[styles.actionIconContainer, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="share-outline" size={18} color={colors.accent} />
              </View>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Share</Text>
            </Pressable>
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

        {/* Horizontal Stage Selector Redesign */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Lead Stage</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageScroll}>
          {STATUSES.map((s) => {
            const active = enquiry.status === s;
            const statusColor = getStatusColor(s, mode);
            return (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  styles.stageChip,
                  active
                    ? { backgroundColor: statusColor.bg, borderColor: statusColor.text }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => changeStatus(s)}
                accessibilityRole="button"
              >
                {active && <Ionicons name="checkmark-circle" size={14} color={statusColor.text} style={{ marginRight: 4 }} />}
                <Text style={[styles.stageChipText, { color: active ? statusColor.text : colors.textSecondary }]}>{s}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {showLostReasonFor ? (
          <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: lostReasonFocused ? colors.accent : colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Reason for lost</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={lostReasonInput}
              onChangeText={setLostReasonInput}
              placeholderTextColor={colors.textMuted}
              onFocus={() => setLostReasonFocused(true)}
              onBlur={() => setLostReasonFocused(false)}
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

        {/* Lead Details Info Panel */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Details</Text>
        <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.detailRowItem}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Phone Number</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{enquiry.contactPhone}</Text>
          </View>
          {enquiry.contactEmail ? (
            <View style={[styles.detailRowItem, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Email Address</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{enquiry.contactEmail}</Text>
            </View>
          ) : null}
          {enquiry.gradeInterest ? (
            <View style={[styles.detailRowItem, { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Grade of Interest</Text>
              <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{enquiry.gradeInterest}</Text>
            </View>
          ) : null}
        </View>

        {/* Timeline Style Activity History */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Activity Timeline</Text>
        <View style={styles.timelineContainer}>
          <View style={[styles.timelineVerticalLine, { backgroundColor: colors.border }]} />
          {enquiry.activity.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No activity yet</Text>
          ) : (
            enquiry.activity.map((item) => (
              <View key={item.id} style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: colors.accent }]}>
                  <Ionicons name={ACTIVITY_ICON[item.type]} size={9} color={colors.accentOn} />
                </View>
                <View style={styles.timelineContentBlock}>
                  <Text style={[styles.timelineStatusText, { color: colors.textPrimary }]}>{activityLabel(item)}</Text>
                  <Text style={[styles.timelineTimeText, { color: colors.textMuted }]}>
                    {new Date(item.occurredAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Notes Container */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>
        <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: noteFocused ? colors.accent : colors.border }]}>
          <TextInput
            style={[styles.input, styles.notesInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={noteBody}
            onChangeText={setNoteBody}
            placeholder="Add a note about this lead..."
            placeholderTextColor={colors.textMuted}
            multiline
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
          />
          <Pressable
            style={({ pressed }) => [
              styles.smallButton,
              { backgroundColor: colors.accent, alignSelf: "flex-end", marginTop: 8 },
              (pressed || isAddingNote || !noteBody.trim()) && { opacity: pressedOpacity },
            ]}
            onPress={addNote}
            disabled={isAddingNote || !noteBody.trim()}
            accessibilityRole="button"
          >
            <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isAddingNote ? "Adding..." : "Add note"}</Text>
          </Pressable>
        </View>

        {enquiry.notes.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted }]}>No notes yet</Text>
        ) : (
          enquiry.notes.map((n) => (
            <View key={n.id} style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.noteHeaderRow}>
                <Text style={[styles.noteAuthor, { color: colors.textPrimary }]}>{n.author?.fullName ?? "System"}</Text>
                <Text style={[styles.timelineTimeText, { color: colors.textMuted }]}>{new Date(n.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={[styles.notesText, { color: colors.textPrimary }]}>{n.body}</Text>
            </View>
          ))
        )}

        {/* Follow up tasks section */}
        <View style={styles.followUpHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 0 }]}>Follow Up Tasks</Text>
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
                      styles.stageChip,
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
                    <Text style={[styles.stageChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{c}</Text>
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
                        styles.stageChip,
                        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => setTaskTemplateId(t.id)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.stageChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Due date</Text>
            <DatePicker value={taskDueAt} onChange={setTaskDueAt} placeholder="Select due date" minimumDate={new Date()} />
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
          <Text style={[styles.meta, { color: colors.textMuted }]}>No follow up tasks scheduled</Text>
        ) : (
          tasks.map((t) => (
            <View key={t.id} style={[styles.taskRow, { borderBottomColor: colors.border }]}>
              <View style={styles.taskInfoContainer}>
                <Ionicons name={t.channel === "sms" ? "chatbox-outline" : "mail-outline"} size={14} color={colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={[styles.taskMetaText, { color: colors.textPrimary }]}>
                  {t.channel} · due {new Date(t.dueAt).toLocaleDateString()}
                </Text>
              </View>
              {t.status === "pending" ? (
                <Pressable
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  onPress={() => sendTask(t.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Send now</Text>
                </Pressable>
              ) : (
                <Text style={[styles.taskStatusTag, { color: colors.textMuted }]}>{t.status}</Text>
              )}
            </View>
          ))
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>

      <ConfirmModal
        visible={pendingStageChange !== null}
        title="Change lead stage"
        message={
          pendingStageChange
            ? `This moves the lead ${
                STATUSES.indexOf(pendingStageChange) < STATUSES.indexOf(enquiry.status) ? "backward" : "forward, skipping a stage"
              }, from "${enquiry.status}" to "${pendingStageChange}". Continue?`
            : ""
        }
        confirmLabel="Change stage"
        onConfirm={() => {
          if (pendingStageChange) applyStatusChange(pendingStageChange);
          setPendingStageChange(null);
        }}
        onCancel={() => setPendingStageChange(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { justifyContent: "center", alignItems: "center" },
  headerCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  profileSection: { flexDirection: "row", gap: 16, alignItems: "center" },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "800" },
  headerDetails: { flex: 1 },
  name: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  sourceTag: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  meta: { fontSize: 13 },
  actionsRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  actionButton: { alignItems: "center", gap: 4 },
  actionIconContainer: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 12, fontWeight: "600" },
  sectionTitle: { fontSize: 14, fontWeight: "800", marginTop: 22, marginBottom: 10, letterSpacing: 0.3, textTransform: "uppercase" },
  stageScroll: { paddingBottom: 6 },
  stageChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    height: 32,
  },
  stageChipText: { textTransform: "capitalize", fontSize: 12, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  detailsCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  detailRowItem: { paddingVertical: 12 },
  detailLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.2 },
  detailValue: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  timelineContainer: { position: "relative", paddingLeft: 20, marginVertical: 6 },
  timelineVerticalLine: { position: "absolute", left: 8, top: 8, bottom: 8, width: 2 },
  timelineRow: { flexDirection: "row", gap: 12, marginBottom: 16, alignItems: "flex-start" },
  timelineDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  noteHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  noteAuthor: { fontSize: 13, fontWeight: "700" },
  timelineContentBlock: { flex: 1 },
  timelineStatusText: { fontSize: 13, fontWeight: "700" },
  timelineTimeText: { fontSize: 11, marginTop: 2 },
  notesCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  notesText: { fontSize: 14, lineHeight: 20 },
  duplicateBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  duplicateTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  duplicateTitle: { fontWeight: "700" },
  duplicateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  duplicateItem: {},
  admissionButton: { flexDirection: "row", gap: 8, borderRadius: 10, padding: 14, alignItems: "center", justifyContent: "center", marginTop: 16, minHeight: 48 },
  admissionButtonText: { fontWeight: "700", fontSize: 15 },
  inlineForm: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12, marginTop: 8 },
  label: { marginTop: 4, marginBottom: 6, fontSize: 12, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, height: 44 },
  notesInput: { height: 80, textAlignVertical: "top" },
  smallButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: "center", alignItems: "center" },
  smallButtonText: { fontWeight: "700", fontSize: 12 },
  followUpHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22 },
  link: { fontWeight: "700" },
  taskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1 },
  taskInfoContainer: { flexDirection: "row", alignItems: "center", flex: 1 },
  taskMetaText: { fontSize: 13, fontWeight: "600" },
  taskStatusTag: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  error: { marginTop: 12, textAlign: "center" },
});
