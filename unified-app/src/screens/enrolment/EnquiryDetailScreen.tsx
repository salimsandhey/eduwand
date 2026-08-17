import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Share, Image, Modal, Animated } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { DatePicker } from "../../components/DatePicker";
import { ConfirmModal } from "../../components/ConfirmModal";
import { requiredDocumentCompletion } from "../../components/DocumentChecklist";
import { getStatusColor } from "../../theme/statusColors";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { resolveEnquiryImageSource } from "../../theme/avatars";
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
  EnquiryDocument,
} from "../../api/client";

const ACTIVITY_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  stage_change: "swap-horizontal-outline",
  note_added: "document-text-outline",
  task_created: "alarm-outline",
  task_sent: "paper-plane-outline",
};

type DetailTab = "lead" | "admission";
type LeadSubTab = "timeline" | "tasks";

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

function formatStageLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSource(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function AnimatedFeedCard({ children, index }: { children: ReactNode; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        delay: Math.min(index * 55, 260),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: Math.min(index * 55, 260),
        tension: 105,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function TimelineCard({
  item,
  index,
  isLast,
  colors,
  cardShadow,
}: {
  item: ActivityItem;
  index: number;
  isLast: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
}) {
  return (
    <AnimatedFeedCard index={index}>
      <View style={styles.timelineItem}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineNode, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
            <Ionicons name={ACTIVITY_ICON[item.type]} size={13} color={colors.accentOn} />
          </View>
          {!isLast ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
        </View>
        <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <View style={styles.timelineCardHead}>
            <Text style={[styles.timelineTitle, { color: colors.textPrimary }]}>{activityLabel(item)}</Text>
            <View style={[styles.timelineTypePill, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.timelineTypeText, { color: colors.accent }]}>{formatSource(item.type)}</Text>
            </View>
          </View>
          <Text style={[styles.timelineTime, { color: colors.textMuted }]}>{new Date(item.occurredAt).toLocaleString("en-IN")}</Text>
        </View>
      </View>
    </AnimatedFeedCard>
  );
}

function TaskQueueCard({
  task,
  index,
  onSend,
  colors,
  cardShadow,
  pressedOpacity,
}: {
  task: FollowUpTask;
  index: number;
  onSend: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  cardShadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const isPending = task.status === "pending";
  const isOverdue = isPending && new Date(task.dueAt).getTime() < Date.now();
  const badgeColor = isOverdue ? colors.warning : isPending ? colors.accent : colors.textMuted;
  const iconName = task.channel === "sms" ? "chatbubble-ellipses-outline" : "mail-open-outline";

  const pressIn = () => {
    Animated.spring(pressScale, { toValue: 0.985, tension: 180, friction: 9, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    Animated.spring(pressScale, { toValue: 1, tension: 180, friction: 9, useNativeDriver: true }).start();
  };

  return (
    <AnimatedFeedCard index={index}>
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={({ pressed }) => [
            styles.taskCard,
            { backgroundColor: colors.surface, borderColor: isOverdue ? colors.accentSoftAlt : colors.border },
            cardShadow,
            pressed && { opacity: pressedOpacity },
          ]}
        >
          <View style={[styles.taskIcon, { backgroundColor: isOverdue ? colors.accentSoft : colors.surfaceRaised }]}>
            <Ionicons name={iconName} size={18} color={isOverdue ? colors.accent : colors.textPrimary} />
          </View>
          <View style={styles.taskBody}>
            <View style={styles.taskTitleRow}>
              <Text style={[styles.taskTitle, { color: colors.textPrimary }]}>{task.channel.toUpperCase()} follow-up</Text>
              <View style={[styles.taskBadge, { backgroundColor: isOverdue ? colors.accentSoft : colors.backgroundMuted }]}>
                <Text style={[styles.taskBadgeText, { color: badgeColor }]}>{isOverdue ? "Overdue" : task.status}</Text>
              </View>
            </View>
            <Text style={[styles.taskMeta, { color: isOverdue ? colors.accent : colors.textMuted }]}>
              Due {new Date(task.dueAt).toLocaleDateString("en-IN")}
            </Text>
          </View>
          {isPending ? (
            <Pressable
              onPress={onSend}
              style={({ pressed }) => [styles.taskSendButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
            >
              <Ionicons name="paper-plane-outline" size={13} color={colors.accentOn} />
              <Text style={[styles.taskSendText, { color: colors.accentOn }]}>Send</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Animated.View>
    </AnimatedFeedCard>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, "EnquiryDetail">;

export function EnquiryDetailScreen({ route, navigation }: Props) {
  const { enquiryId } = route.params;
  const { accessToken, user } = useAuth();
  const { colors, mode, cardShadow, pressedOpacity } = useTheme();
  const { stages } = usePipelineStages();
  const stageKeys = stages.map((stage) => stage.key);
  const canErase = user?.role === "admin" || user?.role === "leadership";

  const [activeTab, setActiveTab] = useState<DetailTab>("lead");
  const [leadSubTab, setLeadSubTab] = useState<LeadSubTab>("timeline");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [documents, setDocuments] = useState<EnquiryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lostReasonInput, setLostReasonInput] = useState("");
  const [showLostReasonFor, setShowLostReasonFor] = useState(false);
  const [lostReasonFocused, setLostReasonFocused] = useState(false);

  const [pendingStageChange, setPendingStageChange] = useState<EnquiryStatus | null>(null);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      const [detailRes, enquiryTasks, allTemplates, docs] = await Promise.all([
        api.getEnquiry(accessToken, enquiryId),
        api.listFollowUpTasks(accessToken, { enquiryId }),
        api.listMessageTemplates(accessToken),
        api.listDocuments(accessToken, enquiryId),
      ]);
      setEnquiry(detailRes.data);
      setDuplicates((detailRes.meta?.possibleDuplicates as PossibleDuplicate[]) ?? []);
      setTasks(enquiryTasks);
      setTemplates(allTemplates);
      setDocuments(docs);
      if (allTemplates.length > 0 && !taskTemplateId) {
        setTaskTemplateId(allTemplates[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enquiry");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, enquiryId, taskTemplateId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const hasRealPhoto = !!(enquiry?.photoMimeType && accessToken);
  const avatarSource = useMemo(
    () =>
      resolveEnquiryImageSource({
        id: enquiry?.id ?? enquiryId,
        contactName: enquiry?.contactName ?? "",
        avatarKey: enquiry?.avatarKey,
        photoUrl: hasRealPhoto ? api.enquiryPhotoUrl(accessToken as string, enquiryId) : null,
      }),
    [enquiry?.id, enquiry?.contactName, enquiry?.avatarKey, hasRealPhoto, enquiryId, accessToken]
  );

  const openTasksCount = tasks.filter((t) => t.status === "pending").length;
  const overdueTasksCount = tasks.filter((t) => t.status === "pending" && new Date(t.dueAt).getTime() < Date.now()).length;

  const daysInStage = useMemo(() => {
    if (!enquiry) return 0;
    const lastStageChange = enquiry.activity.find((a) => a.type === "stage_change");
    const since = lastStageChange ? new Date(lastStageChange.occurredAt) : new Date(enquiry.updatedAt);
    return Math.max(0, Math.floor((Date.now() - since.getTime()) / 86400000));
  }, [enquiry]);

  const docCompletion = useMemo(() => requiredDocumentCompletion(documents), [documents]);

  const currentStageIndex = enquiry ? stages.findIndex((stage) => stage.key === enquiry.status) : -1;
  const channelTemplates = templates.filter((template) => template.channel === taskChannel);
  const canConfirmAdmission = !!enquiry && ["application", "admitted", "enrolled"].includes(enquiry.status);

  async function applyStatusChange(status: EnquiryStatus) {
    if (!accessToken) return;
    try {
      await api.updateEnquiry(accessToken, enquiryId, { status });
      await load();
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

    const isOneStepForward = stageKeys.indexOf(status) === stageKeys.indexOf(enquiry.status) + 1;
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
      // Notes are only editable from the Admission tab in this screen, so
      // they're tagged admission_note (backend/src/lib/enquiries.ts categorizes
      // activity by note type: lead_note/system_note -> lead, admission_note -> admission).
      await api.addEnquiryNote(accessToken, enquiryId, noteBody.trim(), "admission_note");
      setNoteBody("");
      await load();
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    }
  }

  async function eraseNow() {
    if (!accessToken) return;
    setIsErasing(true);
    try {
      await api.eraseEnquiry(accessToken, enquiryId);
      setShowEraseConfirm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to erase personal data");
    } finally {
      setIsErasing(false);
    }
  }

  async function deleteNow() {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      await api.deleteEnquiry(accessToken, enquiryId);
      navigation.goBack();
    } catch (err) {
      setShowDeleteConfirm(false);
      setError(err instanceof Error ? err.message : "Failed to delete lead");
    } finally {
      setIsDeleting(false);
    }
  }

  async function mergeDuplicate(sourceId: string) {
    if (!accessToken) return;
    try {
      await api.mergeEnquiry(accessToken, enquiryId, sourceId);
      await load();
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
  }

  async function sendTask(taskId: string) {
    if (!accessToken) return;
    try {
      await api.sendFollowUpTask(accessToken, taskId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  const handleShare = async () => {
    if (!enquiry) return;
    setSheetOpen(false);
    try {
      await Share.share({
        message: `Lead Details:\nName: ${enquiry.contactName}\nPhone: ${enquiry.contactPhone}\nEmail: ${enquiry.contactEmail || "N/A"}\nSource: ${enquiry.source}\nStatus: ${enquiry.status}`,
      });
    } catch {
      // ignored
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

  const currentStatusColor = getStatusColor(enquiry.status, mode);
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : null;
  const nextStage = currentStageIndex >= 0 ? stages[currentStageIndex + 1] : null;
  const nextActionLabel =
    overdueTasksCount > 0
      ? "Clear overdue follow-up"
      : openTasksCount > 0
        ? "Complete pending follow-up"
        : nextStage
          ? `Move to ${nextStage.label}`
          : canConfirmAdmission
            ? "Review admission"
            : "Keep lead warm";

  return (
    <Screen edges={["bottom"]}>
      <View style={[styles.head, { backgroundColor: colors.surface, borderBottomColor: colors.border }, cardShadow]}>
        <View style={styles.headRow}>
          <View style={[styles.avatarWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
            <Image
              source={avatarSource}
              style={[styles.avatar, hasRealPhoto && styles.avatarPhoto]}
              resizeMode={hasRealPhoto ? "cover" : "contain"}
            />
          </View>
          <View style={styles.headIdBlock}>
            <Text style={[styles.headName, { color: colors.textPrimary }]} numberOfLines={1}>
              {enquiry.studentName || enquiry.contactName}
            </Text>
            <Text style={[styles.headSub, { color: colors.textMuted }]} numberOfLines={1}>
              {enquiry.studentName
                ? `${enquiry.guardianRelation ? `${formatSource(enquiry.guardianRelation)} · ` : ""}${enquiry.contactName}`
                : formatSource(enquiry.source)}
            </Text>
            <View style={styles.headMetaRow}>
              <View style={[styles.headMetaChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={11} color={colors.accent} />
                <Text style={[styles.headMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {enquiry.contactPhone}
                </Text>
              </View>
              {overdueTasksCount > 0 ? (
                <View style={[styles.headMetaChip, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                  <Ionicons name="alert-circle-outline" size={11} color={colors.accent} />
                  <Text style={[styles.headMetaText, { color: colors.accent }]}>Overdue</Text>
                </View>
              ) : null}
              {duplicates.length > 0 ? (
                <View style={[styles.headMetaChip, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                  <Ionicons name="git-merge-outline" size={11} color={colors.accent} />
                  <Text style={[styles.headMetaText, { color: colors.accent }]}>Duplicate</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [
              styles.headerAction,
              { backgroundColor: colors.accent, borderColor: colors.accent },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
          >
            <Ionicons name="flash-outline" size={16} color={colors.accentOn} />
          </Pressable>
        </View>

        <View style={styles.headerActionRow}>
          <View style={[styles.statusPill, { backgroundColor: currentStatusColor.bg }]}>
            <Text style={[styles.statusPillText, { color: currentStatusColor.text }]}>{formatStageLabel(enquiry.status)}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("EditEnquiry", { enquiryId })}
            style={({ pressed }) => [
              styles.headerGhostAction,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
          >
            <Ionicons name="create-outline" size={13} color={colors.accent} />
            <Text style={[styles.headerGhostText, { color: colors.textSecondary }]}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.headerGhostAction,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
          >
            <Ionicons name="share-social-outline" size={13} color={colors.accent} />
            <Text style={[styles.headerGhostText, { color: colors.textSecondary }]}>Share</Text>
          </Pressable>
        </View>

        <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {([
            { key: "lead", label: "Lead" },
            { key: "admission", label: "Admission" },
          ] as const).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => [
                  styles.segmentButton,
                  active && { backgroundColor: colors.accent },
                  pressed && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.segmentButtonText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {enquiry.erasedAt ? (
          <View style={[styles.bannerCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <View style={styles.bannerTitleRow}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.bannerTitle, { color: colors.textMuted }]}>Personal data erased</Text>
            </View>
            <Text style={[styles.bannerBody, { color: colors.textMuted }]}>
              This lead&apos;s contact data was erased on {new Date(enquiry.erasedAt).toLocaleDateString("en-IN")} and only operational history remains.
            </Text>
          </View>
        ) : null}

        {duplicates.length > 0 ? (
          <View style={[styles.bannerCard, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
            <View style={styles.bannerTitleRow}>
              <Ionicons name="git-merge-outline" size={15} color={colors.accent} />
              <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>Possible duplicate lead</Text>
            </View>
            {duplicates.map((duplicate) => (
              <View key={duplicate.id} style={styles.duplicateRow}>
                <View style={styles.duplicateInfo}>
                  <Text style={[styles.duplicateName, { color: colors.textPrimary }]}>{duplicate.contactName}</Text>
                  <Text style={[styles.duplicateMeta, { color: colors.textMuted }]}>{formatStageLabel(duplicate.status)}</Text>
                </View>
                <Pressable
                  onPress={() => mergeDuplicate(duplicate.id)}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Merge</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === "lead" ? (
          <>
            <View style={[styles.stageWorkspace, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.stageWorkspaceTop}>
                <View style={styles.stageWorkspaceCopy}>
                  <Text style={[styles.stageKicker, { color: colors.accent }]}>Lead momentum</Text>
                  <Text style={[styles.stageTitle, { color: colors.textPrimary }]}>
                    {currentStage?.label ?? formatStageLabel(enquiry.status)}
                  </Text>
                  <Text style={[styles.stageSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
                    Next best action: {nextActionLabel}
                  </Text>
                </View>
                <View style={[styles.stageStepBadge, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                  <Text style={[styles.stageStepValue, { color: colors.accent }]}>{Math.max(currentStageIndex + 1, 1)}</Text>
                  <Text style={[styles.stageStepLabel, { color: colors.accent }]}>of {stages.length}</Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stagePicker}>
                {stages.map((stage, index) => {
                  const isDone = currentStageIndex >= 0 && index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  return (
                    <Pressable
                      key={stage.key}
                      onPress={() => changeStatus(stage.key)}
                      style={({ pressed }) => [
                        styles.stageChip,
                        {
                          backgroundColor: isCurrent ? colors.accent : colors.surfaceRaised,
                          borderColor: isCurrent || isDone ? colors.accent : colors.border,
                        },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isCurrent }}
                    >
                      <View
                        style={[
                          styles.stageChipDot,
                          {
                            backgroundColor: isDone ? colors.accent : isCurrent ? colors.accentOn : colors.border,
                          },
                        ]}
                      >
                        {isDone ? <Ionicons name="checkmark" size={10} color={colors.accentOn} /> : null}
                      </View>
                      <Text
                        style={[styles.stageChipText, { color: isCurrent ? colors.accentOn : colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {stage.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {showLostReasonFor ? (
              <View style={[styles.inlineForm, { backgroundColor: colors.surfaceRaised, borderColor: lostReasonFocused ? colors.accent : colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Reason for marking this lead as lost</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  value={lostReasonInput}
                  onChangeText={setLostReasonInput}
                  placeholder="Add a short reason"
                  placeholderTextColor={colors.textMuted}
                  onFocus={() => setLostReasonFocused(true)}
                  onBlur={() => setLostReasonFocused(false)}
                />
                <Pressable
                  onPress={confirmLostReason}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, pressed && { opacity: pressedOpacity }]}
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Confirm stage</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.bento}>
              <View style={[styles.tile, styles.tileAccent, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <Text style={[styles.tileValue, { color: colors.accent }]}>{openTasksCount}</Text>
                <Text style={[styles.tileLabel, { color: colors.accent }]}>Tasks open</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.tileValue, { color: overdueTasksCount > 0 ? colors.warning : colors.textPrimary }]}>{overdueTasksCount}</Text>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>Overdue</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{daysInStage}</Text>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>Days in stage</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Details</Text>
              <View style={styles.factsRow}>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="call-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{enquiry.contactPhone}</Text>
                </View>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="mail-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{enquiry.contactEmail || "No email added"}</Text>
                </View>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="school-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{enquiry.gradeInterest || "Grade not set"}</Text>
                </View>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="globe-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{formatSource(enquiry.source)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={[styles.subtoggle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <Pressable
                    onPress={() => setLeadSubTab("timeline")}
                    style={({ pressed }) => [
                      styles.subtoggleButton,
                      leadSubTab === "timeline" && { backgroundColor: colors.surface },
                      pressed && { opacity: pressedOpacity },
                    ]}
                  >
                    <Text style={[styles.subtoggleText, { color: leadSubTab === "timeline" ? colors.textPrimary : colors.textMuted }]}>Timeline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setLeadSubTab("tasks")}
                    style={({ pressed }) => [
                      styles.subtoggleButton,
                      leadSubTab === "tasks" && { backgroundColor: colors.surface },
                      pressed && { opacity: pressedOpacity },
                    ]}
                  >
                    <Text style={[styles.subtoggleText, { color: leadSubTab === "tasks" ? colors.textPrimary : colors.textMuted }]}>
                      Tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
                    </Text>
                  </Pressable>
                </View>
                {leadSubTab === "tasks" ? (
                  <Pressable onPress={() => setShowAddTask((value) => !value)} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
                    <Text style={[styles.sectionLink, { color: colors.accent }]}>{showAddTask ? "Close" : "+ Add"}</Text>
                  </Pressable>
                ) : null}
              </View>

              {leadSubTab === "timeline" ? (
                enquiry.activity.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No activity yet.</Text>
                ) : (
                  <View style={styles.timelineList}>
                    {enquiry.activity.map((item, index) => (
                      <TimelineCard
                        key={item.id}
                        item={item}
                        index={index}
                        isLast={index === enquiry.activity.length - 1}
                        colors={colors}
                        cardShadow={cardShadow}
                      />
                    ))}
                  </View>
                )
              ) : (
                <>
                  {showAddTask ? (
                    <View style={[styles.inlineForm, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                      <View style={styles.filterPillRow}>
                        {(["sms", "email"] as MessageChannel[]).map((channel) => {
                          const active = taskChannel === channel;
                          return (
                            <Pressable
                              key={channel}
                              onPress={() => {
                                setTaskChannel(channel);
                                const first = templates.find((template) => template.channel === channel);
                                setTaskTemplateId(first ? first.id : null);
                              }}
                              style={({ pressed }) => [
                                styles.filterPill,
                                { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                                pressed && { opacity: pressedOpacity },
                              ]}
                            >
                              <Text style={[styles.filterPillText, { color: active ? colors.accentOn : colors.textSecondary }]}>{channel}</Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {channelTemplates.length === 0 ? (
                        <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No {taskChannel} templates available.</Text>
                      ) : (
                        <View style={styles.filterPillRow}>
                          {channelTemplates.map((template) => {
                            const active = taskTemplateId === template.id;
                            return (
                              <Pressable
                                key={template.id}
                                onPress={() => setTaskTemplateId(template.id)}
                                style={({ pressed }) => [
                                  styles.filterPill,
                                  { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                                  pressed && { opacity: pressedOpacity },
                                ]}
                              >
                                <Text style={[styles.filterPillText, { color: active ? colors.accentOn : colors.textSecondary }]}>{template.name}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Due date</Text>
                      <DatePicker value={taskDueAt} onChange={setTaskDueAt} placeholder="Select due date" minimumDate={new Date()} />

                      <Pressable
                        onPress={addFollowUpTask}
                        style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, pressed && { opacity: pressedOpacity }]}
                      >
                        <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Create task</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {tasks.length === 0 ? (
                    <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No follow-up tasks scheduled yet.</Text>
                  ) : (
                    <>
                    <View style={styles.taskList}>
                      {tasks.map((task, index) => (
                        <TaskQueueCard
                          key={task.id}
                          task={task}
                          index={index}
                          onSend={() => sendTask(task.id)}
                          colors={colors}
                          cardShadow={cardShadow}
                          pressedOpacity={pressedOpacity}
                        />
                      ))}
                    </View>
                    {/*
                    tasks.map((task) => {
                      const isOverdue = task.status === "pending" && new Date(task.dueAt).getTime() < Date.now();
                      return (
                        <View key={task.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                          <View style={[styles.bullet, isOverdue ? { backgroundColor: colors.warning + "22" } : { backgroundColor: colors.accentSoft }]}>
                            <Ionicons
                              name={task.channel === "sms" ? "chatbox-outline" : "mail-outline"}
                              size={12}
                              color={isOverdue ? colors.warning : colors.accent}
                            />
                          </View>
                          <View style={styles.listRowText}>
                            <Text style={[styles.listRowTitle, { color: colors.textPrimary }]}>{task.channel.toUpperCase()} follow-up</Text>
                            <Text style={[styles.listRowMeta, { color: isOverdue ? colors.warning : colors.textMuted }]}>
                              {isOverdue ? "Overdue · " : "Due "}
                              {new Date(task.dueAt).toLocaleDateString("en-IN")} · {task.status}
                            </Text>
                          </View>
                          {task.status === "pending" ? (
                            <Pressable
                              onPress={() => sendTask(task.id)}
                              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                            >
                              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Send</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    */}
                    </>
                  )}
                </>
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.bento}>
              <View style={[styles.tile, styles.tileAccent, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <Text style={[styles.tileValue, { color: colors.accent }]}>
                  {enquiry.admissionSummary.confirmed ? "✓" : `${enquiry.admissionSummary.completionPercent}%`}
                </Text>
                <Text style={[styles.tileLabel, { color: colors.accent }]}>{enquiry.admissionSummary.confirmed ? "Confirmed" : "Draft filled"}</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>
                  {docCompletion.done}/{docCompletion.total}
                </Text>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>Documents</Text>
              </View>
              <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <Text style={[styles.tileValue, { color: colors.textPrimary }]}>{formatStageLabel(enquiry.status)}</Text>
                <Text style={[styles.tileLabel, { color: colors.textMuted }]}>Lead stage</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Details</Text>
              <View style={styles.factsRow}>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="school-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{enquiry.gradeInterest || "Grade not set"}</Text>
                </View>
                <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="globe-outline" size={12} color={colors.accent} />
                  <Text style={[styles.factText, { color: colors.textSecondary }]}>{formatSource(enquiry.source)}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.ctaBand, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <View style={styles.ctaBandText}>
                <Text style={[styles.ctaBandTitle, { color: colors.textPrimary }]}>Student conversion flow</Text>
                <Text style={[styles.ctaBandSubtitle, { color: colors.textMuted }]}>
                  {enquiry.admissionSummary.confirmed
                    ? "This lead has already been converted to a student record."
                    : "Move into admission once the lead is qualified and the student details are ready."}
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate("AdmissionConfirmation", { enquiryId })}
                style={({ pressed }) => [
                  styles.ctaButton,
                  { backgroundColor: canConfirmAdmission ? colors.accent : colors.surface, borderColor: canConfirmAdmission ? colors.accent : colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.ctaButtonText, { color: canConfirmAdmission ? colors.accentOn : colors.textSecondary }]}>
                  {enquiry.admissionSummary.confirmed ? "View admission" : canConfirmAdmission ? "Open admission" : "Prep details"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Documents</Text>
              {documents.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No documents attached yet.</Text>
              ) : (
                documents.map((document) => (
                  <View key={document.id} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.bullet, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name="document-text-outline" size={12} color={colors.accent} />
                    </View>
                    <View style={styles.listRowText}>
                      <Text style={[styles.listRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {document.fileName}
                      </Text>
                      <Text style={[styles.listRowMeta, { color: colors.textMuted }]}>
                        Uploaded {new Date(document.uploadedAt).toLocaleDateString("en-IN")}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notes</Text>

              <View style={[styles.inlineForm, { backgroundColor: colors.surfaceRaised, borderColor: noteFocused ? colors.accent : colors.border }]}>
                <TextInput
                  style={[styles.notesInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  value={noteBody}
                  onChangeText={setNoteBody}
                  placeholder="Add an internal note..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  onFocus={() => setNoteFocused(true)}
                  onBlur={() => setNoteFocused(false)}
                />
                <Pressable
                  onPress={addNote}
                  disabled={isAddingNote || !noteBody.trim()}
                  style={({ pressed }) => [
                    styles.smallButton,
                    { backgroundColor: colors.accent, alignSelf: "flex-end" },
                    (pressed || isAddingNote || !noteBody.trim()) && { opacity: pressedOpacity },
                  ]}
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isAddingNote ? "Adding..." : "Add note"}</Text>
                </Pressable>
              </View>

              {enquiry.notes.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No notes added yet.</Text>
              ) : (
                enquiry.notes.map((note) => (
                  <View key={note.id} style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.noteHead}>
                      <Text style={[styles.noteAuthor, { color: colors.textPrimary }]}>{note.author?.fullName ?? "System"}</Text>
                      <Text style={[styles.noteDate, { color: colors.textMuted }]}>{new Date(note.createdAt).toLocaleString("en-IN")}</Text>
                    </View>
                    <Text style={[styles.noteBody, { color: colors.textSecondary }]}>{note.body}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      </ScrollView>

      <Pressable
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={26} color={colors.accentOn} />
      </Pressable>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            <Pressable style={({ pressed }) => [styles.sheetAction, { borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}>
              <View style={[styles.sheetActionIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="call-outline" size={16} color={colors.accent} />
              </View>
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Call {enquiry.contactName}</Text>
            </Pressable>

            <Pressable style={({ pressed }) => [styles.sheetAction, { borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}>
              <View style={[styles.sheetActionIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="mail-outline" size={16} color={colors.accent} />
              </View>
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Email {enquiry.contactName}</Text>
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [styles.sheetAction, { borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            >
              <View style={[styles.sheetActionIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="share-social-outline" size={16} color={colors.accent} />
              </View>
              <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Share lead details</Text>
            </Pressable>

            {!enquiry.erasedAt ? (
              <Pressable
                onPress={() => {
                  setSheetOpen(false);
                  navigation.navigate("EditEnquiry", { enquiryId });
                }}
                style={({ pressed }) => [styles.sheetAction, { borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="create-outline" size={16} color={colors.accent} />
                </View>
                <Text style={[styles.sheetActionText, { color: colors.textPrimary }]}>Edit lead</Text>
              </Pressable>
            ) : null}

            {canErase && !enquiry.erasedAt ? (
              <Pressable
                onPress={() => {
                  setSheetOpen(false);
                  setShowEraseConfirm(true);
                }}
                style={({ pressed }) => [styles.sheetAction, { borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: "#F8ECEC" }]}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </View>
                <Text style={[styles.sheetActionText, { color: colors.danger }]}>Erase personal data</Text>
              </Pressable>
            ) : null}

            {canErase && !enquiry.admissionSummary.confirmed ? (
              <Pressable
                onPress={() => {
                  setSheetOpen(false);
                  setShowDeleteConfirm(true);
                }}
                style={({ pressed }) => [styles.sheetAction, pressed && { opacity: pressedOpacity }]}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: "#F8ECEC" }]}>
                  <Ionicons name="trash-bin-outline" size={16} color={colors.danger} />
                </View>
                <Text style={[styles.sheetActionText, { color: colors.danger }]}>Delete lead</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={pendingStageChange !== null}
        title="Change lead stage"
        message={
          pendingStageChange
            ? `This changes the lead from "${formatStageLabel(enquiry.status)}" to "${formatStageLabel(
                pendingStageChange
              )}". Continue?`
            : ""
        }
        confirmLabel="Change stage"
        onConfirm={() => {
          if (pendingStageChange) applyStatusChange(pendingStageChange);
          setPendingStageChange(null);
        }}
        onCancel={() => setPendingStageChange(null)}
      />

      <ConfirmModal
        visible={showEraseConfirm}
        title="Erase personal data"
        message="This permanently redacts this lead's name, phone, and email, deletes attached documents, and cannot be undone. Continue?"
        confirmLabel={isErasing ? "Erasing..." : "Erase"}
        onConfirm={eraseNow}
        onCancel={() => setShowEraseConfirm(false)}
      />

      <ConfirmModal
        visible={showDeleteConfirm}
        title="Delete lead"
        message="This permanently removes this lead - its notes, tasks, documents, and stage history - from the system. This cannot be undone. Continue?"
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        onConfirm={deleteNow}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 16, paddingBottom: 110, gap: 20 },
  centered: { justifyContent: "center", alignItems: "center" },

  head: {
    borderBottomWidth: 1,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatar: { width: 40, height: 40 },
  avatarPhoto: { width: "100%", height: "100%", borderRadius: 18 },
  headIdBlock: { flex: 1, minWidth: 0 },
  headName: { fontSize: 18, fontWeight: "900", letterSpacing: -0.35 },
  headSub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  headMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  headMetaChip: {
    maxWidth: 140,
    minHeight: 25,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headMetaText: { fontSize: 10.5, fontWeight: "800" },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerActionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusPill: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  headerGhostAction: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerGhostText: { fontSize: 11, fontWeight: "800" },

  segmentedControl: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    flexDirection: "row",
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonText: { fontSize: 12.5, fontWeight: "800" },

  bannerCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  bannerTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  bannerTitle: { fontSize: 13, fontWeight: "800" },
  bannerBody: { fontSize: 12.5, lineHeight: 19 },
  duplicateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  duplicateInfo: { flex: 1 },
  duplicateName: { fontSize: 13, fontWeight: "700" },
  duplicateMeta: { marginTop: 3, fontSize: 12, fontWeight: "500" },

  stageWorkspace: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 14 },
  stageWorkspaceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stageWorkspaceCopy: { flex: 1, minWidth: 0 },
  stageKicker: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  stageTitle: { marginTop: 5, fontSize: 22, fontWeight: "900", letterSpacing: -0.6 },
  stageSubtitle: { marginTop: 5, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  stageStepBadge: {
    width: 58,
    height: 58,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stageStepValue: { fontSize: 20, fontWeight: "900", lineHeight: 23 },
  stageStepLabel: { fontSize: 10.5, fontWeight: "800" },
  stagePicker: { gap: 8, paddingRight: 4 },
  stageChip: {
    minWidth: 104,
    maxWidth: 140,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  stageChipDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stageChipText: { flex: 1, fontSize: 11.5, fontWeight: "800" },

  inlineForm: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  formLabel: { fontSize: 12, fontWeight: "700" },
  formInput: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 12, fontSize: 14 },
  smallButton: { minHeight: 34, borderRadius: 9, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 11.5, fontWeight: "800" },

  bento: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, gap: 2 },
  tileAccent: {},
  tileValue: { fontSize: 18, fontWeight: "800" },
  tileLabel: { fontSize: 10.5, fontWeight: "700" },

  section: { gap: 10 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 13, fontWeight: "800" },
  sectionLink: { fontSize: 12.5, fontWeight: "800" },

  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  factText: { fontSize: 12, fontWeight: "700" },

  subtoggle: { flexDirection: "row", gap: 2, borderWidth: 1, borderRadius: 10, padding: 3 },
  subtoggleButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7 },
  subtoggleText: { fontSize: 11.5, fontWeight: "800" },

  filterPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filterPillText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  emptyHint: { fontSize: 12.5, lineHeight: 19 },

  timelineList: { gap: 0 },
  timelineItem: { flexDirection: "row", gap: 10 },
  timelineRail: { width: 30, alignItems: "center" },
  timelineNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineLine: { width: 2, flex: 1, minHeight: 22 },
  timelineCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    marginBottom: 12,
    gap: 7,
  },
  timelineCardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  timelineTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  timelineTypePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  timelineTypeText: { fontSize: 9.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.35 },
  timelineTime: { fontSize: 11.5, fontWeight: "600" },

  taskList: { gap: 10 },
  taskCard: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  taskIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  taskBody: { flex: 1, minWidth: 0, gap: 5 },
  taskTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskTitle: { flex: 1, fontSize: 13.5, fontWeight: "900", letterSpacing: -0.2 },
  taskMeta: { fontSize: 12, fontWeight: "700" },
  taskBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  taskBadgeText: { fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  taskSendButton: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  taskSendText: { fontSize: 11.5, fontWeight: "900" },

  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  bullet: { width: 26, height: 26, borderRadius: 999, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  listRowText: { flex: 1, minWidth: 0 },
  listRowTitle: { fontSize: 12.5, fontWeight: "700" },
  listRowMeta: { fontSize: 11, fontWeight: "500", marginTop: 2, textTransform: "capitalize" },

  ctaBand: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  ctaBandText: { gap: 5 },
  ctaBandTitle: { fontSize: 14, fontWeight: "800" },
  ctaBandSubtitle: { fontSize: 12.5, lineHeight: 19 },
  ctaButton: { minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ctaButtonText: { fontSize: 13, fontWeight: "800" },

  notesInput: { minHeight: 88, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: "top" },
  noteCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 8, marginTop: 8 },
  noteHead: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  noteAuthor: { fontSize: 12.5, fontWeight: "800", flex: 1 },
  noteDate: { fontSize: 11, fontWeight: "500" },
  noteBody: { fontSize: 12.5, lineHeight: 19 },

  error: { marginTop: 4, textAlign: "center", fontSize: 13, fontWeight: "600" },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  sheetAction: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  sheetActionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sheetActionText: { fontSize: 13.5, fontWeight: "700" },
});
