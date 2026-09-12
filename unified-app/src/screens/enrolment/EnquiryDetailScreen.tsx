import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
  Image,
  Animated,
  Easing,
  ScrollView,
  Modal,
  Linking,
  LayoutAnimation,
  KeyboardAvoidingView,
  Platform,
  UIManager,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { DatePicker } from "../../components/DatePicker";
import { DynamicFormFields } from "../../components/DynamicFormFields";
import { ConfirmModal } from "../../components/ConfirmModal";
import { requiredDocumentCompletion, ChecklistItem, FALLBACK_DOCUMENT_CHECKLIST } from "../../components/DocumentChecklist";
import { getStatusColor } from "../../theme/statusColors";
import { usePipelineStages } from "../../hooks/usePipelineStages";
import { resolveEnquiryImageSource } from "../../theme/avatars";
import {
  api,
  ApiError,
  EnquiryDetail,
  EnquiryStatus,
  PipelineStage,
  PossibleDuplicate,
  MessageTemplate,
  MessageChannel,
  FollowUpTask,
  ActivityItem,
  ActivityType,
  EnquiryDocument,
  FormField,
  InterviewRecord,
} from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

const ACTIVITY_ICON: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  stage_change: "swap-horizontal-outline",
  note_added: "document-text-outline",
  task_created: "alarm-outline",
  task_sent: "paper-plane-outline",
};

// How far (px) before the hero card's bottom edge the compact header starts
// fading in, so it's fully visible by the time the hero scrolls out of view
// instead of popping in abruptly right at the boundary.
const COMPACT_HEADER_FADE_DISTANCE = 40;

type DetailTab = "lead" | "admission";

function activityLabel(item: ActivityItem): string {
  switch (item.type) {
    case "stage_change":
      return `Moved to ${formatStageLabel(String(item.payload.toStatus))}`;
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
        <View style={[styles.timelineCard, { backgroundColor: colors.surface, borderColor: colors.border }, isLast && { marginBottom: 0 }, cardShadow]}>
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

  // The hero card (avatar/name/status/quick actions/tabs) now scrolls with
  // the rest of the body instead of living in a fixed, continuously
  // reanimated header - the old version drove width/height/padding changes
  // straight off scroll position on the JS thread (those layout properties
  // can't use the native driver), which is what caused the visible jank.
  // All that's left is a small compact bar (avatar + name) that fades in
  // once the hero card has scrolled out of view, driven by a single native
  // opacity interpolation.
  const scrollY = useRef(new Animated.Value(0)).current;
  // Real measured height of the hero card, corrected on first layout so the
  // fade-in threshold tracks the actual content instead of a fixed guess.
  const [heroHeight, setHeroHeight] = useState(260);
  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const compactHeaderOpacity = scrollY.interpolate({
    inputRange: [Math.max(heroHeight - COMPACT_HEADER_FADE_DISTANCE, 0), heroHeight],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      setShowCompactHeader((prev) => {
        const next = y >= heroHeight - COMPACT_HEADER_FADE_DISTANCE;
        return prev === next ? prev : next;
      });
    },
  });

  // Used by the compact header's "scroll to top" tap.
  const scrollRef = useRef<ScrollView | null>(null);

  // Opts in to Android's experimental LayoutAnimation support - without
  // this, LayoutAnimation.configureNext below silently no-ops on Android
  // (iOS doesn't need it), so the "More details" toggle would just snap
  // open/closed instantly instead of animating. Same opt-in already used in
  // TopicDetailScreen.tsx.
  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<DetailTab>("lead");
  // "More details" (Logged/Consent/Family/DOB facts, moved into the hero
  // card) and the Timeline, now a popup rather than an inline tab, both
  // toggle with a LayoutAnimation-driven smooth expand/collapse - same
  // pattern already used in TopicDetailScreen.tsx (selectTab there).
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  // Animated independently of each other: the Modal itself uses
  // animationType="none" because its built-in "slide" moves everything
  // inside it (backdrop included) as one unit, which reads as the dark mask
  // sliding in with the sheet instead of sitting still. The backdrop just
  // fades; only the sheet actually translates.
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const timelineBackdropOpacity = useRef(new Animated.Value(0)).current;
  const timelineSheetTranslateY = useRef(new Animated.Value(480)).current;
  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [documents, setDocuments] = useState<EnquiryDocument[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(FALLBACK_DOCUMENT_CHECKLIST);
  const [intakeFields, setIntakeFields] = useState<FormField[]>([]);
  const [intakeResponses, setIntakeResponses] = useState<Record<string, unknown>>({});
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lostReasonInput, setLostReasonInput] = useState("");
  const [showLostReasonFor, setShowLostReasonFor] = useState(false);
  const [lostReasonFocused, setLostReasonFocused] = useState(false);

  // Admission journey tracker: a vertical list of every stage, done ones
  // collapsed with a checkmark, the current one expanded with guidance + the
  // one action that actually applies there, upcoming ones shown but inert -
  // the whole roadmap stays visible (see the stageWorkspace card below).
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  // Set only when a stage move is rejected specifically for missing required
  // admission-form fields (backend: missingRequiredAdmissionFields) - surfaced
  // as its own callout with a direct link to the form, rather than as generic
  // error text, since that's exactly the "fill the admission form first"
  // situation this card needs to explain clearly.
  const [admissionBlockedMessage, setAdmissionBlockedMessage] = useState<string | null>(null);
  const [visitNote, setVisitNote] = useState("");
  const [isSavingVisitNote, setIsSavingVisitNote] = useState(false);
  // Visit date, captured when leaving Contacted and editable again from the
  // collapsed Visit Scheduled row (reschedule) - stored as a note since there
  // is no dedicated schema field for it, so it also shows up on the Timeline.
  const [visitDateInput, setVisitDateInput] = useState("");
  const [isSchedulingVisit, setIsSchedulingVisit] = useState(false);
  // Interview/assessment record, optional, offered inside Visit Done.
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [showInterviewForm, setShowInterviewForm] = useState(false);
  const [interviewDateInput, setInterviewDateInput] = useState("");
  const [interviewScoreInput, setInterviewScoreInput] = useState("");
  const [interviewMaxScoreInput, setInterviewMaxScoreInput] = useState("");
  const [interviewNotesInput, setInterviewNotesInput] = useState("");
  const [isSavingInterview, setIsSavingInterview] = useState(false);
  // Which stage's content is on screen in the one-at-a-time tracker below -
  // Back/Next page this independently of the lead's real stage, so browsing
  // history to review or correct an earlier step never itself moves the
  // lead. Synced back to the live stage whenever the real status actually
  // changes (see the effect below), so the view always lands on the new
  // frontier right after an advance.
  const [viewedStageIndex, setViewedStageIndex] = useState(0);
  // Generic "are you sure" launcher for the couple of stage moves that are
  // allowed but worth a pause on (e.g. advancing with something un-recorded).
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [noteBody, setNoteBody] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Create Task is a popup rather than an inline expanding box - same
  // decoupled backdrop-fade / sheet-slide animation as the Timeline modal
  // (see openTaskModal/closeTaskModal), so the mask never appears to move.
  const [showAddTask, setShowAddTask] = useState(false);
  const taskModalBackdropOpacity = useRef(new Animated.Value(0)).current;
  const taskModalSheetTranslateY = useRef(new Animated.Value(480)).current;
  const [taskChannel, setTaskChannel] = useState<MessageChannel>("sms");
  const [taskTemplateId, setTaskTemplateId] = useState<string | null>(null);
  const [taskDueAt, setTaskDueAt] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [detailRes, enquiryTasks, allTemplates, docs, checklistResult, intakeResult, interviewRecords] = await Promise.all([
        api.getEnquiry(accessToken, enquiryId),
        api.listFollowUpTasks(accessToken, { enquiryId }),
        api.listMessageTemplates(accessToken),
        api.listDocuments(accessToken, enquiryId),
        api.getFormDefinition(accessToken, "document_checklist").catch(() => null),
        api.getFormDefinition(accessToken, "enquiry_intake").catch(() => null),
        api.listInterviews(accessToken, enquiryId).catch(() => []),
      ]);
      setEnquiry(detailRes.data);
      setIntakeResponses(detailRes.data?.formResponses ?? {});
      setDuplicates((detailRes.meta?.possibleDuplicates as PossibleDuplicate[]) ?? []);
      setTasks(enquiryTasks);
      setTemplates(allTemplates);
      setDocuments(docs);
      setInterviews(interviewRecords);
      if (checklistResult && checklistResult.fields.length > 0) {
        setChecklist(checklistResult.fields.map((f) => ({ key: f.key, label: f.label, required: f.isRequired })));
      }
      setIntakeFields(intakeResult?.fields ?? []);
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

  const docCompletion = useMemo(() => requiredDocumentCompletion(documents, checklist), [documents, checklist]);

  const channelTemplates = templates.filter((template) => template.channel === taskChannel);
  const canConfirmAdmission = !!enquiry && ["application", "admitted", "enrolled"].includes(enquiry.status);
  const admissionPct = enquiry?.admissionSummary.completionPercent ?? 0;
  const admissionConfirmed = !!enquiry?.admissionSummary.confirmed;

  // The visible journey excludes "lost" - it's a terminal outcome overlaid on
  // top of the journey, not a step within it (see the isLost branch in the
  // card JSX below).
  const journeyStages = useMemo(() => stages.filter((stage) => !stage.isTerminal), [stages]);
  const currentJourneyIndex = enquiry ? journeyStages.findIndex((stage) => stage.key === enquiry.status) : -1;

  // Snap the view back to the live stage whenever the lead's real status
  // changes (a genuine advance/reopen) - never while the user is just
  // paging through history with Back/Next, since those don't touch
  // enquiry.status at all.
  useEffect(() => {
    if (currentJourneyIndex >= 0) setViewedStageIndex(currentJourneyIndex);
  }, [enquiry?.status, currentJourneyIndex]);

  // Mirrors the backend's canChangeEnquiryStatus (enquiries.ts): only the
  // lead's owner or an admissions-capable role may move its stage. Checked
  // here too so the UI can explain *why* the actions are hidden instead of a
  // new counsellor tapping a button that silently 403s.
  const canEditStage =
    !!enquiry &&
    !!user &&
    (user.id === enquiry.ownerUserId ||
      ["admin", "principal", "front_desk", "leadership", "platform_admin"].includes(user.role));

  function dateStageReached(stageKey: string): string | null {
    if (!enquiry) return null;
    const entries = enquiry.stageHistory.filter((entry) => entry.toStatus === stageKey);
    if (entries.length === 0) return null;
    return new Date(entries[entries.length - 1].changedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  // The visit date lives as a note (see markVisitScheduled/rescheduleVisit),
  // not a dedicated field - this reads the latest one back out so both the
  // current and the collapsed-row view of Visit Scheduled can show it.
  function latestVisitScheduleNote(): string | null {
    if (!enquiry) return null;
    const matches = enquiry.notes
      .filter((n) => n.type === "lead_note" && /visit (scheduled|rescheduled)/i.test(n.body))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches[0]?.body ?? null;
  }

  // The one error this card gives its own callout to: the backend refusing a
  // stage move because a required admission-form field is still empty
  // (missingRequiredAdmissionFields in enquiries.ts) - exactly the "tell them
  // to fill the admission form first" case, driven by the school's real
  // configuration rather than a guessed completion threshold.
  function describeStageError(err: unknown): { message: string; isAdmissionBlocked: boolean } {
    if (err instanceof ApiError && /admission fields are missing/i.test(err.message)) {
      return { message: err.message, isAdmissionBlocked: true };
    }
    if (err instanceof ApiError && err.code === "forbidden") {
      return { message: "Only this lead's owner or an admissions admin can update its stage.", isAdmissionBlocked: false };
    }
    return { message: err instanceof Error ? err.message : "Failed to change status", isAdmissionBlocked: false };
  }

  async function applyStatusChange(status: EnquiryStatus) {
    if (!accessToken || isUpdatingStage) return;
    setIsUpdatingStage(true);
    setAdmissionBlockedMessage(null);
    try {
      await api.updateEnquiry(accessToken, enquiryId, { status });
      await load();
    } catch (err) {
      const { message, isAdmissionBlocked } = describeStageError(err);
      if (isAdmissionBlocked) setAdmissionBlockedMessage(message);
      else setError(message);
    } finally {
      setIsUpdatingStage(false);
    }
  }

  function changeStatus(status: EnquiryStatus) {
    if (!enquiry || status === enquiry.status) return;
    if (status === "lost" && !enquiry.lostReason) {
      setShowLostReasonFor(true);
      return;
    }
    applyStatusChange(status);
  }

  function reopenLead() {
    if (journeyStages.length === 0) return;
    applyStatusChange(journeyStages[0].key);
  }

  function moveStageBack(targetKey: EnquiryStatus) {
    // Once this succeeds, enquiry.status changes for real and the
    // viewedStageIndex-sync effect snaps the view to the new (earlier) live
    // stage on its own - no separate reset needed here.
    applyStatusChange(targetKey);
  }

  function openAdmissionForm() {
    navigation.navigate("AdmissionConfirmation", { enquiryId });
  }

  function openTimelineModal() {
    setShowTimelineModal(true);
    timelineBackdropOpacity.setValue(0);
    timelineSheetTranslateY.setValue(480);
    Animated.parallel([
      Animated.timing(timelineBackdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(timelineSheetTranslateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }

  // Animates out first, then unmounts the Modal - closing it instantly (just
  // flipping showTimelineModal) would cut the exit animation off before it
  // can play.
  function closeTimelineModal() {
    Animated.parallel([
      Animated.timing(timelineBackdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(timelineSheetTranslateY, { toValue: 480, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setShowTimelineModal(false));
  }

  function openTaskModal() {
    setShowAddTask(true);
    taskModalBackdropOpacity.setValue(0);
    taskModalSheetTranslateY.setValue(480);
    Animated.parallel([
      Animated.timing(taskModalBackdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(taskModalSheetTranslateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }

  function closeTaskModal() {
    Animated.parallel([
      Animated.timing(taskModalBackdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(taskModalSheetTranslateY, { toValue: 480, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setShowAddTask(false));
  }

  // "Schedule a follow-up" / "Add a visit reminder" in the admission-journey
  // tracker jump straight to this popup now - as a Modal it always appears
  // regardless of scroll position, so there's no more "find the box further
  // down the page" problem to solve with a scroll-to or a highlight pulse.
  function jumpToFollowUps() {
    openTaskModal();
  }

  // Runs `action` straight away, unless `condition` is true - then it pauses
  // for an explicit "are you sure" first. Used for the couple of moments
  // where proceeding is allowed but something worth a second look is missing
  // (no consent yet, no visit outcome recorded).
  function confirmThen(condition: boolean, title: string, message: string, action: () => void) {
    if (condition) setPendingConfirm({ title, message, onConfirm: action });
    else action();
  }

  async function saveVisitNote() {
    if (!accessToken || !visitNote.trim()) return;
    setIsSavingVisitNote(true);
    try {
      await api.addEnquiryNote(accessToken, enquiryId, visitNote.trim(), "lead_note");
      setVisitNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setIsSavingVisitNote(false);
    }
  }

  function formatVisitDate(dateInput: string): string {
    return new Date(`${dateInput}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  // Leaving Contacted requires a visit date - it's what "Visit scheduled"
  // actually means, so the button stays disabled until one is picked. Stored
  // as a note (no dedicated schema field exists for it) so it also lands on
  // the Timeline and is readable back out via the regex below.
  async function markVisitScheduled() {
    if (!accessToken || !visitDateInput || isUpdatingStage) return;
    setIsUpdatingStage(true);
    setAdmissionBlockedMessage(null);
    try {
      await api.addEnquiryNote(accessToken, enquiryId, `Visit scheduled for ${formatVisitDate(visitDateInput)}.`, "lead_note");
      await api.updateEnquiry(accessToken, enquiryId, { status: "visit_scheduled" });
      setVisitDateInput("");
      await load();
    } catch (err) {
      const { message, isAdmissionBlocked } = describeStageError(err);
      if (isAdmissionBlocked) setAdmissionBlockedMessage(message);
      else setError(message);
    } finally {
      setIsUpdatingStage(false);
    }
  }

  // Reschedule, from the collapsed Visit Scheduled row - the correction this
  // section exists for. Adds a fresh dated note rather than editing the
  // original in place: there's no note-update endpoint, and keeping every
  // date change on the record is arguably better for an admissions audit
  // trail than silently overwriting it.
  async function rescheduleVisit() {
    if (!accessToken || !visitDateInput) return;
    setIsSchedulingVisit(true);
    try {
      await api.addEnquiryNote(accessToken, enquiryId, `Visit rescheduled to ${formatVisitDate(visitDateInput)}.`, "lead_note");
      setVisitDateInput("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule");
    } finally {
      setIsSchedulingVisit(false);
    }
  }

  async function saveInterview() {
    if (!accessToken || !interviewDateInput || !interviewNotesInput.trim()) return;
    setIsSavingInterview(true);
    try {
      await api.createInterview(accessToken, enquiryId, {
        interviewDate: interviewDateInput,
        score: interviewScoreInput.trim() ? Number(interviewScoreInput) : undefined,
        maxScore: interviewMaxScoreInput.trim() ? Number(interviewMaxScoreInput) : undefined,
        notes: interviewNotesInput.trim(),
      });
      setInterviewDateInput("");
      setInterviewScoreInput("");
      setInterviewMaxScoreInput("");
      setInterviewNotesInput("");
      setShowInterviewForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save interview record");
    } finally {
      setIsSavingInterview(false);
    }
  }

  async function addNote() {
    if (!accessToken || !noteBody.trim()) return;
    setIsAddingNote(true);
    try {
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

  async function mergeDuplicate(sourceId: string) {
    if (!accessToken) return;
    try {
      await api.mergeEnquiry(accessToken, enquiryId, sourceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge");
    }
  }

  async function linkDuplicateAsFamily(sourceId: string) {
    if (!accessToken) return;
    try {
      await api.linkEnquiryFamily(accessToken, enquiryId, { sourceEnquiryId: sourceId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link family");
    }
  }

  async function saveIntakeResponses() {
    if (!accessToken) return;
    setIsSavingIntake(true);
    try {
      await api.updateEnquiry(accessToken, enquiryId, { formResponses: intakeResponses });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save intake details");
    } finally {
      setIsSavingIntake(false);
    }
  }

  async function addFollowUpTask() {
    // Was a silent no-op when either was missing - the button just did
    // nothing with no explanation. The button is now disabled instead (see
    // the Create Task box below) so this guard should never actually trigger,
    // but it stays as a safety net rather than letting a race leave it silent.
    if (!accessToken || !taskTemplateId || !taskDueAt || isCreatingTask) return;
    setIsCreatingTask(true);
    setError(null);
    try {
      await api.createFollowUpTask(accessToken, {
        enquiryId,
        channel: taskChannel,
        templateId: taskTemplateId,
        dueAt: new Date(`${taskDueAt}T00:00:00`).toISOString(),
      });
      closeTaskModal();
      setTaskDueAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setIsCreatingTask(false);
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
    try {
      await Share.share({
        message: `Lead Details:\nName: ${enquiry.contactName}\nPhone: ${enquiry.contactPhone}\nEmail: ${enquiry.contactEmail || "N/A"}\nSource: ${formatSource(enquiry.source)}\nStatus: ${formatStageLabel(enquiry.status)}`,
      });
    } catch {
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
  const viewedStage = viewedStageIndex >= 0 ? journeyStages[viewedStageIndex] : null;
  const isViewingLive = viewedStageIndex === currentJourneyIndex;

  // Guidance text + the one action that genuinely applies to a given stage -
  // rendered only inside the current stage's row in the tracker below. Keyed
  // off the stage's key (pipeline stages are per-school configurable, so an
  // unrecognised key falls back to a generic line).
  function renderCurrentStageActions(stage: PipelineStage) {
    if (!enquiry) return null;
    const locked = !canEditStage;
    const busyOrLocked = locked || isUpdatingStage;

    switch (stage.key) {
      case "new":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Confirm the contact details and capture messaging consent, then make first contact.
            </Text>
            {!enquiry.consentCaptured ? (
              <View style={[styles.stepCallout, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <Ionicons name="warning-outline" size={15} color={colors.accent} />
                <Text style={[styles.stepCalloutText, { color: colors.accent }]}>
                  Messaging consent not captured yet — add it before sending any automated follow-up.
                </Text>
              </View>
            ) : null}
            <View style={styles.stepActionsRow}>
              <Pressable
                onPress={() =>
                  confirmThen(
                    !enquiry.consentCaptured,
                    "Consent not captured",
                    "Messaging consent hasn't been recorded for this lead yet. Mark as contacted anyway?",
                    () => applyStatusChange("contacted")
                  )
                }
                disabled={busyOrLocked}
                style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (pressed || busyOrLocked) && { opacity: pressedOpacity }]}
              >
                <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isUpdatingStage ? "Updating…" : "Mark as contacted"}</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate("EditEnquiry", { enquiryId })} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
                <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Edit contact &amp; consent</Text>
              </Pressable>
            </View>
          </>
        );

      case "contacted":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Log every call or message, then set a visit date to move this lead forward.
            </Text>
            <View style={styles.factsRow}>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="alarm-outline" size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>{openTasksCount} open</Text>
              </View>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="alert-circle-outline" size={12} color={overdueTasksCount > 0 ? colors.warning : colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>{overdueTasksCount} overdue</Text>
              </View>
            </View>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Visit date</Text>
            <DatePicker value={visitDateInput} onChange={setVisitDateInput} placeholder="Select a visit date" minimumDate={new Date()} />
            <View style={styles.stepActionsRow}>
              <Pressable
                onPress={markVisitScheduled}
                disabled={busyOrLocked || !visitDateInput}
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: colors.accent },
                  (pressed || busyOrLocked || !visitDateInput) && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isUpdatingStage ? "Updating…" : "Mark visit scheduled"}</Text>
              </Pressable>
              <Pressable onPress={jumpToFollowUps} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
                <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Schedule a follow-up</Text>
              </Pressable>
            </View>
          </>
        );

      case "visit_scheduled": {
        const scheduledNote = latestVisitScheduleNote();
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              {scheduledNote ?? "Confirm the visit date and remind the family before they come in."}
            </Text>
            <View style={styles.stepActionsRow}>
              <Pressable
                onPress={() => applyStatusChange("visit_done")}
                disabled={busyOrLocked}
                style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent }, (pressed || busyOrLocked) && { opacity: pressedOpacity }]}
              >
                <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isUpdatingStage ? "Updating…" : "Mark visit done"}</Text>
              </Pressable>
              <Pressable onPress={jumpToFollowUps} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
                <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Add a visit reminder</Text>
              </Pressable>
            </View>
          </>
        );
      }

      case "visit_done":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Capture how the visit went, then move the lead into Application.
            </Text>
            <TextInput
              style={[styles.stepNoteInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              value={visitNote}
              onChangeText={setVisitNote}
              placeholder="Visit outcome / next step…"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!locked}
            />
            {visitNote.trim() ? (
              <Pressable
                onPress={saveVisitNote}
                disabled={isSavingVisitNote}
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
                  (pressed || isSavingVisitNote) && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.smallButtonText, { color: colors.textPrimary }]}>{isSavingVisitNote ? "Saving…" : "Save visit note"}</Text>
              </Pressable>
            ) : null}
            {renderInterviewSection()}
            {admissionBlockedMessage ? (
              <View style={[styles.stepCallout, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.accent} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={[styles.stepCalloutText, { color: colors.accent }]}>{admissionBlockedMessage}</Text>
                  <Pressable onPress={openAdmissionForm} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
                    <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Open admission form</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Pressable
              onPress={() =>
                confirmThen(
                  !visitNote.trim() && interviews.length === 0,
                  "No visit outcome recorded",
                  "You haven't logged how the visit went yet. Move to Application anyway?",
                  () => applyStatusChange("application")
                )
              }
              disabled={busyOrLocked}
              style={({ pressed }) => [
                styles.smallButton,
                { backgroundColor: colors.accent, alignSelf: "flex-start" },
                (pressed || busyOrLocked) && { opacity: pressedOpacity },
              ]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isUpdatingStage ? "Updating…" : "Move to application"}</Text>
            </Pressable>
          </>
        );

      case "application":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              Fill in the admission form. Once your school&apos;s admission approvals are complete, this lead moves to Admitted automatically.
            </Text>
            <View style={[styles.admissionProgressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.admissionProgressFill, { backgroundColor: colors.accent, width: `${Math.min(100, admissionPct)}%` }]} />
            </View>
            <Text style={[styles.stepMeta, { color: colors.textMuted }]}>{admissionPct}% of the admission form is complete</Text>
            <Pressable
              onPress={openAdmissionForm}
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, pressed && { opacity: pressedOpacity }]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Open admission form</Text>
            </Pressable>
          </>
        );

      case "admitted":
        return admissionConfirmed ? (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Student record created.</Text>
            <Pressable
              onPress={() => applyStatusChange("enrolled")}
              disabled={busyOrLocked}
              style={({ pressed }) => [
                styles.smallButton,
                { backgroundColor: colors.accent, alignSelf: "flex-start" },
                (pressed || busyOrLocked) && { opacity: pressedOpacity },
              ]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isUpdatingStage ? "Updating…" : "Mark enrolled"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Confirm the admission to create the student record.</Text>
            <View style={styles.factsRow}>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="folder-open-outline" size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>
                  {docCompletion.done}/{docCompletion.total} documents
                </Text>
              </View>
            </View>
            <Pressable
              onPress={openAdmissionForm}
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, pressed && { opacity: pressedOpacity }]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Confirm admission</Text>
            </Pressable>
          </>
        );

      case "enrolled":
        return (
          <View style={[styles.stepCallout, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={[styles.stepCalloutText, { color: colors.accent }]}>This lead is fully converted and enrolled.</Text>
          </View>
        );

      default:
        return <Text style={[styles.stepText, { color: colors.textMuted }]}>{stage.label} is the current stage.</Text>;
    }
  }

  // Optional interview/assessment record (schema: InterviewRecord) - lets a
  // school that conducts a formal admission interview log a score alongside
  // the free-text visit note, without forcing every school to fill it in.
  function renderInterviewSection() {
    return (
      <View style={styles.interviewBlock}>
        {interviews.length > 0 ? (
          <View style={styles.interviewList}>
            {interviews.map((record) => (
              <View key={record.id} style={[styles.interviewRow, { borderColor: colors.border }]}>
                <Text style={[styles.interviewRowTitle, { color: colors.textPrimary }]}>
                  {new Date(record.interviewDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {record.score != null ? ` · ${record.score}${record.maxScore != null ? `/${record.maxScore}` : ""}` : ""}
                </Text>
                <Text style={[styles.interviewRowNotes, { color: colors.textMuted }]}>{record.notes}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {showInterviewForm ? (
          <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Interview / assessment date</Text>
            <DatePicker value={interviewDateInput} onChange={setInterviewDateInput} placeholder="Select date" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.formInput, { flex: 1, backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={interviewScoreInput}
                onChangeText={setInterviewScoreInput}
                placeholder="Score"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.formInput, { flex: 1, backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={interviewMaxScoreInput}
                onChangeText={setInterviewMaxScoreInput}
                placeholder="Out of"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>
            <TextInput
              style={[styles.stepNoteInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={interviewNotesInput}
              onChangeText={setInterviewNotesInput}
              placeholder="Observations…"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Pressable
              onPress={saveInterview}
              disabled={isSavingInterview || !interviewDateInput || !interviewNotesInput.trim()}
              style={({ pressed }) => [
                styles.smallButton,
                { backgroundColor: colors.accent, alignSelf: "flex-start" },
                (pressed || isSavingInterview || !interviewDateInput || !interviewNotesInput.trim()) && { opacity: pressedOpacity },
              ]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isSavingInterview ? "Saving…" : "Save interview"}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setShowInterviewForm(true)} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
            <Text style={[styles.inlineLinkText, { color: colors.accent }]}>+ Record interview / assessment</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Shown when a counsellor taps an already-completed row in the tracker -
  // the "go back and fix something" affordance, without a dedicated Back
  // button. Every path here adds a fresh, dated record rather than rewriting
  // history in place (see rescheduleVisit/saveVisitNote), and "move back" is
  // withheld once the lead is Admitted/Enrolled so a stray tap can't unwind a
  // completed admission.
  function renderPastStageEdit(stage: PipelineStage) {
    if (!enquiry) return null;
    const locked = !canEditStage;
    const canMoveBack = canEditStage && !["admitted", "enrolled"].includes(enquiry.status);
    const moveBackLink = canMoveBack ? (
      <Pressable onPress={() => moveStageBack(stage.key)} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
        <Text style={[styles.inlineLinkText, { color: colors.textMuted }]}>Move lead back to {stage.label}</Text>
      </Pressable>
    ) : null;

    switch (stage.key) {
      case "new":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textMuted }]}>
              {enquiry.consentCaptured ? "Messaging consent is on file." : "Messaging consent still hasn't been captured."}
            </Text>
            <Pressable onPress={() => navigation.navigate("EditEnquiry", { enquiryId })} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
              <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Edit contact &amp; consent</Text>
            </Pressable>
            {moveBackLink}
          </>
        );

      case "contacted":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textMuted }]}>
              {openTasksCount} follow-up{openTasksCount === 1 ? "" : "s"} still open.
            </Text>
            <Pressable onPress={jumpToFollowUps} style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}>
              <Text style={[styles.inlineLinkText, { color: colors.accent }]}>Schedule a follow-up</Text>
            </Pressable>
            {moveBackLink}
          </>
        );

      case "visit_scheduled":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textMuted }]}>
              {latestVisitScheduleNote() ?? "No visit date recorded."} Reschedule below if it&apos;s changed.
            </Text>
            <DatePicker value={visitDateInput} onChange={setVisitDateInput} placeholder="New visit date" minimumDate={new Date()} />
            <Pressable
              onPress={rescheduleVisit}
              disabled={locked || !visitDateInput || isSchedulingVisit}
              style={({ pressed }) => [
                styles.smallButton,
                { backgroundColor: colors.accent, alignSelf: "flex-start" },
                (pressed || locked || !visitDateInput || isSchedulingVisit) && { opacity: pressedOpacity },
              ]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isSchedulingVisit ? "Saving…" : "Save new date"}</Text>
            </Pressable>
            {moveBackLink}
          </>
        );

      case "visit_done":
        return (
          <>
            <Text style={[styles.stepText, { color: colors.textMuted }]}>Add an update if anything about the visit needs correcting.</Text>
            <TextInput
              style={[styles.stepNoteInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              value={visitNote}
              onChangeText={setVisitNote}
              placeholder="Add an update…"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!locked}
            />
            {visitNote.trim() ? (
              <Pressable
                onPress={saveVisitNote}
                disabled={isSavingVisitNote}
                style={({ pressed }) => [
                  styles.smallButton,
                  { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" },
                  (pressed || isSavingVisitNote) && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.smallButtonText, { color: colors.textPrimary }]}>{isSavingVisitNote ? "Saving…" : "Save update"}</Text>
              </Pressable>
            ) : null}
            {renderInterviewSection()}
            {moveBackLink}
          </>
        );

      case "application":
        return (
          <>
            <View style={[styles.admissionProgressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.admissionProgressFill, { backgroundColor: colors.accent, width: `${Math.min(100, admissionPct)}%` }]} />
            </View>
            <Text style={[styles.stepMeta, { color: colors.textMuted }]}>{admissionPct}% of the admission form is complete</Text>
            <Pressable
              onPress={openAdmissionForm}
              style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, pressed && { opacity: pressedOpacity }]}
            >
              <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Open admission form</Text>
            </Pressable>
          </>
        );

      default:
        return (
          <Text style={[styles.stepText, { color: colors.textMuted }]}>
            Reached on {dateStageReached(stage.key) ?? "an earlier date"}.
          </Text>
        );
    }
  }

  return (
    <Screen edges={["bottom"]}>
      {/* Wraps the compact bar + the scroll body (not the floating timeline
          button or the two popups below, which don't need it) - without
          this, focusing a field down in "Complete intake details" left the
          keyboard covering it with nothing shifting to compensate. Same
          Screen -> KeyboardAvoidingView -> ScrollView shape already used
          throughout this app (e.g. CreateFirstClassScreen.tsx). */}
      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Compact bar: hidden until the hero card below has scrolled out of
          view, then fades in smoothly (single native-driven opacity fade) -
          pointerEvents is toggled in step so it doesn't intercept touches to
          the scroll content underneath while invisible. */}
      <Animated.View
        pointerEvents={showCompactHeader ? "auto" : "none"}
        style={[
          styles.compactHead,
          { backgroundColor: colors.surface, borderBottomColor: colors.border, opacity: compactHeaderOpacity },
        ]}
      >
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={({ pressed }) => [styles.compactHeadTouchable, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Scroll to top"
        >
          <View style={[styles.compactAvatarWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
            <Image
              source={avatarSource}
              style={[styles.compactAvatar, hasRealPhoto && styles.compactAvatarPhoto]}
              resizeMode={hasRealPhoto ? "cover" : "contain"}
            />
          </View>
          <Text style={[styles.compactHeadName, { color: colors.textPrimary }]} numberOfLines={1}>
            {enquiry.studentName || enquiry.contactName}
          </Text>
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Hero card: now plain scrolling content, no more scroll-driven
            resizing - onLayout measures its real height so the compact bar
            above knows exactly when to fade in. */}
        <View
          style={[styles.head, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}
        >
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
              {enquiry.studentName ? (
                <Text style={[styles.headSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {enquiry.guardianRelation ? `${formatSource(enquiry.guardianRelation)} · ` : ""}
                  {enquiry.contactName}
                </Text>
              ) : null}
              <View style={styles.headMetaRow}>
                <View style={[styles.statusPill, { backgroundColor: currentStatusColor.bg }]}>
                  <Ionicons name="globe-outline" size={11} color={currentStatusColor.text} />
                  <Text style={[styles.statusPillText, { color: currentStatusColor.text }]} numberOfLines={1}>
                    {formatStageLabel(enquiry.status)}
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
          </View>

          <View style={[styles.headerActionRow, { marginTop: 10 }]}>
            <View style={styles.headerActionGroup}>
              <View style={[styles.headerPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => Linking.openURL(`tel:${enquiry.contactPhone.replace(/\s/g, "")}`)}
                  style={({ pressed }) => [styles.headerPillTouchable, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${enquiry.contactPhone}`}
                >
                  <Ionicons name="call-outline" size={14} color={colors.accent} />
                </Pressable>
              </View>
              <View style={[styles.headerPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => navigation.navigate("EditEnquiry", { enquiryId })}
                  style={({ pressed }) => [styles.headerPillTouchable, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit enquiry"
                >
                  <Ionicons name="create-outline" size={14} color={colors.accent} />
                </Pressable>
              </View>
              <View style={[styles.headerPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Pressable
                  onPress={handleShare}
                  style={({ pressed }) => [styles.headerPillTouchable, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                  accessibilityLabel="Share enquiry"
                >
                  <Ionicons name="share-social-outline" size={14} color={colors.accent} />
                </Pressable>
              </View>
            </View>

            {/* Moved off the Lead tab body (Logged/Consent/Family/DOB) into
                the hero card itself, behind a collapsible "More details"
                toggle - this is contact/meta info about the lead, same
                category as the phone/edit/share pills it now shares a line
                with, not something that needs its own permanent section
                further down the page. */}
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMoreDetailsOpen((value) => !value);
              }}
              style={({ pressed }) => [styles.moreDetailsToggle, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              <Text style={[styles.moreDetailsToggleText, { color: colors.accent }]}>More details</Text>
              <Ionicons name={moreDetailsOpen ? "chevron-up" : "chevron-down"} size={13} color={colors.accent} />
            </Pressable>
          </View>

          {moreDetailsOpen ? (
            <View style={[styles.factsRow, { marginTop: 8 }]}>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>
                  Logged {new Date(enquiry.createdAt).toLocaleDateString("en-IN")}
                </Text>
              </View>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={enquiry.consentCaptured ? "shield-checkmark-outline" : "shield-outline"} size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>
                  {enquiry.consentCaptured ? "Consent given" : "Consent pending"}
                </Text>
              </View>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="people-outline" size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>
                  {enquiry.familyId ? "Linked to a family" : "Standalone lead"}
                </Text>
              </View>
              <View style={[styles.fact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="gift-outline" size={12} color={colors.accent} />
                <Text style={[styles.factText, { color: colors.textSecondary }]}>
                  {enquiry.studentDateOfBirth
                    ? `DOB ${new Date(enquiry.studentDateOfBirth).toLocaleDateString("en-IN")}`
                    : "DOB not on file"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, marginTop: 6 }]}>
            {([
              { key: "lead", label: "Lead" },
              { key: "admission", label: "Admission" },
            ] as const).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <View key={tab.key} style={styles.segmentButtonShell}>
                  <Pressable
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
                </View>
              );
            })}
          </View>
        </View>

        {/* Hero card renders edge-to-edge above (own internal padding only,
            matching its old fixed-header look) - everything else keeps the
            padded/gapped body layout the ScrollView used to provide via
            contentContainerStyle before the hero card moved inside it. */}
        <View style={styles.bodyContent}>

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
                <Pressable
                  onPress={() => linkDuplicateAsFamily(duplicate.id)}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 }, pressed && { opacity: pressedOpacity }]}
                >
                  <Text style={[styles.smallButtonText, { color: colors.accent }]}>Link family</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {activeTab === "lead" ? (
          <>
            <View style={[styles.stageWorkspace, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
              <View style={styles.stageWorkspaceCopy}>
                <Text style={[styles.stageKicker, { color: colors.accent }]}>Progress</Text>
                <Text style={[styles.stageSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
                  {enquiry.status === "lost"
                    ? "This lead was marked lost."
                    : viewedStage
                      ? `Step ${viewedStageIndex + 1} of ${journeyStages.length} — ${viewedStage.label}`
                      : formatStageLabel(enquiry.status)}
                </Text>
              </View>

              {/* Compact orientation, not the full roadmap - one dot per
                  stage (filled = reached), the ring marks which one is on
                  screen right now. The single card below only ever shows
                  that one stage's content; Back/Next page between them. */}
              {enquiry.status !== "lost" && journeyStages.length > 0 ? (
                <View style={styles.progressDotsRow}>
                  {journeyStages.map((stage, index) => (
                    <View
                      key={stage.key}
                      style={[
                        styles.progressDot,
                        index === viewedStageIndex && styles.progressDotViewed,
                        {
                          backgroundColor: index <= currentJourneyIndex ? colors.accent : colors.surfaceRaised,
                          borderColor: index === viewedStageIndex ? colors.accent : index <= currentJourneyIndex ? colors.accent : colors.border,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}

              {enquiry.status !== "lost" && !isViewingLive ? (
                <Text style={[styles.viewingHistoryNote, { color: colors.textMuted }]}>
                  Reviewing a completed step - {journeyStages[currentJourneyIndex]?.label} is current.
                </Text>
              ) : null}

              {!canEditStage ? (
                <View style={[styles.stepCallout, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.stepCalloutText, { color: colors.textMuted }]}>
                    Only this lead&apos;s owner or an admissions admin can update its stage.
                  </Text>
                </View>
              ) : null}

              {enquiry.status === "lost" ? (
                <View style={[styles.stepCallout, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, alignItems: "flex-start" }]}>
                  <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={[styles.stepCalloutText, { color: colors.textPrimary }]}>{enquiry.lostReason || "No reason recorded."}</Text>
                    {canEditStage ? (
                      <Pressable
                        onPress={reopenLead}
                        style={({ pressed }) => [
                          styles.smallButton,
                          { backgroundColor: colors.accent, alignSelf: "flex-start" },
                          pressed && { opacity: pressedOpacity },
                        ]}
                      >
                        <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>Reopen lead</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : viewedStage ? (
                <>
                  <View style={[styles.singleStageCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <View style={styles.trackHeadRow}>
                      <Text style={[styles.trackLabelCurrent, { color: colors.textPrimary }]}>{viewedStage.label}</Text>
                      {isViewingLive ? (
                        <View style={[styles.trackCurrentTag, { backgroundColor: colors.accentSoft }]}>
                          <Text style={[styles.trackCurrentTagText, { color: colors.accent }]}>Current</Text>
                        </View>
                      ) : (
                        <View style={[styles.trackCurrentTag, { backgroundColor: colors.surface }]}>
                          <Ionicons name="checkmark" size={11} color={colors.accent} />
                          <Text style={[styles.trackCurrentTagText, { color: colors.accent }]}>Completed</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.trackCurrentBody}>
                      {isViewingLive ? renderCurrentStageActions(viewedStage) : renderPastStageEdit(viewedStage)}
                    </View>
                  </View>

                  <View style={styles.stepFooterNav}>
                    {viewedStageIndex > 0 ? (
                      <Pressable
                        onPress={() => setViewedStageIndex((i) => Math.max(0, i - 1))}
                        style={({ pressed }) => [styles.stepNavGhost, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                      >
                        <Ionicons name="chevron-back" size={15} color={colors.textPrimary} />
                        <Text style={[styles.stepNavGhostText, { color: colors.textPrimary }]}>Back</Text>
                      </Pressable>
                    ) : (
                      <View />
                    )}
                    <View style={{ flex: 1 }} />
                    {!isViewingLive ? (
                      <Pressable
                        onPress={() => setViewedStageIndex((i) => Math.min(currentJourneyIndex, i + 1))}
                        style={({ pressed }) => [styles.stepNavPrimary, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                      >
                        <Text style={[styles.stepNavPrimaryText, { color: colors.accentOn }]}>Next</Text>
                        <Ionicons name="chevron-forward" size={15} color={colors.accentOn} />
                      </Pressable>
                    ) : null}
                  </View>

                  {canEditStage && !journeyStages[currentJourneyIndex]?.isConverted ? (
                    <Pressable onPress={() => changeStatus("lost")} style={({ pressed }) => [styles.markLostLink, pressed && { opacity: pressedOpacity }]}>
                      <Text style={[styles.markLostLinkText, { color: colors.textMuted }]}>Mark this lead as lost</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
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

            {intakeFields.length > 0 ? (
              <View style={[styles.inlineForm, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Complete intake details</Text>
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>Add any details captured after the first conversation.</Text>
                <DynamicFormFields
                  fields={intakeFields}
                  values={intakeResponses}
                  onChange={(key, value) => setIntakeResponses((current) => ({ ...current, [key]: value }))}
                />
                <Pressable
                  onPress={saveIntakeResponses}
                  disabled={isSavingIntake}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.accent, alignSelf: "flex-start" }, (pressed || isSavingIntake) && { opacity: pressedOpacity }]}
                >
                  <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isSavingIntake ? "Saving..." : "Save intake details"}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Follow-up tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
                </Text>
                <Pressable
                  onPress={openTaskModal}
                  style={({ pressed }) => [
                    styles.sectionLinkOutline,
                    { borderColor: colors.accent },
                    pressed && { opacity: pressedOpacity },
                  ]}
                >
                  <Text style={[styles.sectionLink, { color: colors.accent }]}>+ Add</Text>
                </Pressable>
              </View>

              {tasks.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>No follow-up tasks scheduled yet.</Text>
              ) : (
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
              )}
            </View>
          </>
        ) : (
          <>
            <View style={styles.admissionStatsRow}>
              <View style={[styles.admissionStatCard, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                <View style={[styles.admissionStatIconWrap, { backgroundColor: colors.surface }]}>
                  <Ionicons
                    name={enquiry.admissionSummary.confirmed ? "checkmark-circle" : "document-text-outline"}
                    size={15}
                    color={colors.accent}
                  />
                </View>
                <Text style={[styles.admissionStatValue, { color: colors.accent }]} numberOfLines={1}>
                  {enquiry.admissionSummary.confirmed ? "Confirmed" : `${enquiry.admissionSummary.completionPercent}%`}
                </Text>
                <Text style={[styles.admissionStatLabel, { color: colors.accent }]} numberOfLines={1}>
                  {enquiry.admissionSummary.confirmed ? "Admission locked in" : "Draft filled"}
                </Text>
                {!enquiry.admissionSummary.confirmed ? (
                  <View style={[styles.admissionProgressTrack, { backgroundColor: colors.accentSoftAlt }]}>
                    <View
                      style={[
                        styles.admissionProgressFill,
                        { backgroundColor: colors.accent, width: `${Math.min(100, enquiry.admissionSummary.completionPercent)}%` },
                      ]}
                    />
                  </View>
                ) : null}
              </View>

              <View style={[styles.admissionStatCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={[styles.admissionStatIconWrap, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name="folder-open-outline" size={15} color={colors.accent} />
                </View>
                <Text style={[styles.admissionStatValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {docCompletion.done}/{docCompletion.total}
                </Text>
                <Text style={[styles.admissionStatLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  Documents ready
                </Text>
                <View style={[styles.admissionProgressTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.admissionProgressFill,
                      {
                        backgroundColor: colors.accent,
                        width: `${docCompletion.total > 0 ? Math.min(100, (docCompletion.done / docCompletion.total) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={[styles.admissionStatCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
                <View style={[styles.admissionStatIconWrap, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name="flag-outline" size={15} color={colors.accent} />
                </View>
                <View style={[styles.admissionStagePill, { backgroundColor: currentStatusColor.bg }]}>
                  <Text style={[styles.admissionStagePillText, { color: currentStatusColor.text }]} numberOfLines={1}>
                    {formatStageLabel(enquiry.status)}
                  </Text>
                </View>
                <Text style={[styles.admissionStatLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  Lead stage
                </Text>
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
                      <Text style={[styles.noteAuthor, { color: colors.textPrimary }]}>{note.author?.fullName ? capitalizeFirst(note.author.fullName) : "System"}</Text>
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
        </View>
      </Animated.ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel="Continue"
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      {/* Flush against the left edge on purpose (sharp left corners, fully
          rounded right) - reads as a tab sticking out of the screen edge
          rather than a floating pill, so it doesn't compete with the AI
          assist button convention (bottom-right) used elsewhere in the app. */}
      <Pressable
        onPress={openTimelineModal}
        style={({ pressed }) => [styles.timelineFab, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
        accessibilityLabel="View timeline"
      >
        <Ionicons name="time-outline" size={22} color="#FFFFFF" />
      </Pressable>

      {/* animationType="none": the Modal's own slide/fade transitions move
          everything inside it (mask included) as one block, which is what
          made the backdrop look like it was sliding in with the sheet.
          Animating the backdrop's opacity and the sheet's translateY
          separately keeps the mask stationary while only the sheet moves. */}
      <Modal transparent animationType="none" visible={showTimelineModal} onRequestClose={closeTimelineModal}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.modalBackdrop, { opacity: timelineBackdropOpacity }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeTimelineModal}
              accessibilityRole="button"
              accessibilityLabel="Close timeline"
            />
          </Animated.View>
          <Animated.View
            style={[styles.modalSheet, { backgroundColor: colors.surface, transform: [{ translateY: timelineSheetTranslateY }] }]}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Timeline</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Everything that&apos;s happened on this lead.</Text>
              </View>
              <Pressable
                style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
                onPress={closeTimelineModal}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={styles.timelineModalScroll} showsVerticalScrollIndicator={false}>
              {enquiry.activity.length === 0 ? (
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
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal transparent animationType="none" visible={showAddTask} onRequestClose={closeTaskModal}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.modalBackdrop, { opacity: taskModalBackdropOpacity }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={closeTaskModal}
              accessibilityRole="button"
              accessibilityLabel="Close schedule follow-up"
            />
          </Animated.View>
          <Animated.View
            style={[styles.modalSheet, { backgroundColor: colors.surface, transform: [{ translateY: taskModalSheetTranslateY }] }]}
          >
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Schedule a follow-up</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  Logs a reminder to contact the family - pick how, using which message, and by when. It sends automatically
                  on that date, or you can send it early from the task list.
                </Text>
              </View>
              <Pressable style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]} onPress={closeTaskModal} accessibilityRole="button">
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.taskModalScroll} showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Send as</Text>
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
                      <Text style={[styles.filterPillText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                        {channel === "sms" ? "Text message (SMS)" : "Email"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: 14, marginBottom: 6 }]}>Message template</Text>
              {channelTemplates.length === 0 ? (
                <View style={[styles.stepCallout, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoftAlt }]}>
                  <Ionicons name="alert-circle-outline" size={15} color={colors.accent} />
                  <Text style={[styles.stepCalloutText, { color: colors.accent }]}>
                    No {taskChannel === "sms" ? "text message" : "email"} templates exist yet for this school. Ask your admin
                    to add one under Message Templates before you can schedule this way.
                  </Text>
                </View>
              ) : (
                <>
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
                  {taskTemplateId ? (
                    <View style={[styles.templatePreview, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                      <Text style={[styles.templatePreviewLabel, { color: colors.textMuted }]}>
                        What the family will {taskChannel === "sms" ? "read in the text" : "read in the email"}:
                      </Text>
                      <Text style={[styles.templatePreviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                        {templates.find((t) => t.id === taskTemplateId)?.body}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}

              <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: 14, marginBottom: 6 }]}>Send on</Text>
              <DatePicker value={taskDueAt} onChange={setTaskDueAt} placeholder="Select a date" minimumDate={new Date()} />

              <Pressable
                onPress={addFollowUpTask}
                disabled={!taskTemplateId || !taskDueAt || isCreatingTask}
                style={({ pressed }) => [
                  styles.smallButton,
                  styles.taskModalSubmit,
                  { backgroundColor: colors.accent },
                  (pressed || !taskTemplateId || !taskDueAt || isCreatingTask) && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.smallButtonText, { color: colors.accentOn }]}>{isCreatingTask ? "Scheduling…" : "Create task"}</Text>
              </Pressable>
              {!taskTemplateId || !taskDueAt ? (
                <Text style={[styles.taskFormRequirement, { color: colors.textMuted }]}>
                  {!taskTemplateId ? "Pick a message template" : "Pick a date"} to schedule this.
                </Text>
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1 },
  container: { flex: 1 },
  content: { paddingBottom: 110 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  centered: { justifyContent: "center", alignItems: "center" },

  // Compact header bar: fixed at the top, fades in once the hero card below
  // has scrolled past (see compactHeaderOpacity/showCompactHeader). Tapping
  // it scrolls back to top - compactHeadTouchable carries the row layout so
  // the whole bar is one tap target, not just the avatar/name themselves.
  compactHead: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  compactHeadTouchable: { flexDirection: "row", alignItems: "center", gap: 10 },
  compactAvatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  compactAvatar: { width: 22, height: 22 },
  compactAvatarPhoto: { width: "100%", height: "100%", borderRadius: 12 },
  compactHeadName: { fontSize: 15.5, fontWeight: "900", letterSpacing: -0.2, flexShrink: 1 },

  head: {
    borderBottomWidth: 1,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatar: { width: 40, height: 40 },
  avatarPhoto: { width: "100%", height: "100%", borderRadius: 18 },
  headIdBlock: { flex: 1, minWidth: 0 },
  headName: { fontSize: 19, fontWeight: "900", letterSpacing: -0.35 },
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
  headerActionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "nowrap" },
  headerActionGroup: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  statusPill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  headerPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  headerPillText: { fontSize: 10.5, fontWeight: "800", flexShrink: 1 },
  // Fills the headerPill shell (Edit/Share only) - the shell itself carries
  // the box styling (border/radius/bg/padding/minHeight), this is just the
  // row layout for the icon + collapsing text inside it.
  headerPillTouchable: { flexDirection: "row", alignItems: "center", flexShrink: 1 },

  moreDetailsToggle: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0, paddingVertical: 2 },
  moreDetailsToggleText: { fontSize: 12, fontWeight: "800" },

  segmentedControl: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    flexDirection: "row",
    gap: 4,
  },
  segmentButtonShell: { flex: 1, minHeight: 38 },
  segmentButton: {
    flex: 1,
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
  stageWorkspaceCopy: { minWidth: 0 },
  stageKicker: { fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  stageSubtitle: { marginTop: 6, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  // Admission journey tracker: one stage's content on screen at a time
  // (singleStageCard), with a compact dot row above for orientation instead
  // of the full roadmap - each dot is a stage, filled once reached, ringed
  // if it's the one currently on screen.
  progressDotsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  progressDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  progressDotViewed: { width: 11, height: 11, borderRadius: 5.5 },
  viewingHistoryNote: { marginTop: 6, fontSize: 11.5, lineHeight: 16, fontWeight: "600", fontStyle: "italic" },

  singleStageCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  trackHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 26 },
  trackLabelCurrent: { fontSize: 14, fontWeight: "900" },
  trackCurrentTag: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  trackCurrentTagText: { fontSize: 9.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
  trackCurrentBody: { marginTop: 8, gap: 10 },

  stepFooterNav: { flexDirection: "row", alignItems: "center" },
  stepNavGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  stepNavGhostText: { fontSize: 12.5, fontWeight: "800" },
  stepNavPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  stepNavPrimaryText: { fontSize: 12.5, fontWeight: "800" },

  markLostLink: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 10 },
  markLostLinkText: { fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },

  stepText: { fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  stepMeta: { fontSize: 11.5, fontWeight: "700" },
  stepCallout: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 12, padding: 11 },
  stepCalloutText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  stepNoteInput: { minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 11, fontSize: 13.5, textAlignVertical: "top" },
  stepActionsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 },
  inlineLinkText: { fontSize: 12, fontWeight: "800", textDecorationLine: "underline" },

  // Optional interview/assessment record, offered inside Visit Done.
  interviewBlock: { gap: 8 },
  interviewList: { gap: 6 },
  interviewRow: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 2 },
  interviewRowTitle: { fontSize: 11.5, fontWeight: "800" },
  interviewRowNotes: { fontSize: 11.5, lineHeight: 16, fontWeight: "600" },

  inlineForm: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  formLabel: { fontSize: 12, fontWeight: "700" },
  formInput: { borderWidth: 1, borderRadius: 10, minHeight: 42, paddingHorizontal: 12, fontSize: 14 },
  smallButton: { minHeight: 34, borderRadius: 9, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  smallButtonText: { fontSize: 11.5, fontWeight: "800" },

  // Create Task popup: explains what it does and previews the actual
  // message, since "SMS/Email pills + a date, no other context" left a new
  // counsellor with no idea what pressing Create would actually do.
  taskModalScroll: { maxHeight: 420, marginTop: 6 },
  taskModalSubmit: { alignSelf: "flex-start", marginTop: 14 },
  templatePreview: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4, marginTop: 8 },
  templatePreviewLabel: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  templatePreviewText: { fontSize: 12.5, lineHeight: 18, fontWeight: "500", fontStyle: "italic" },
  taskFormRequirement: { fontSize: 11.5, fontWeight: "600", marginTop: 6 },

  bento: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, gap: 2 },
  tileAccent: {},
  tileValue: { fontSize: 18, fontWeight: "800" },
  tileLabel: { fontSize: 10.5, fontWeight: "700" },

  // Admission tab's 3 stat cards - purpose-built per card (progress bar for
  // the two completion metrics, a status pill for the stage) rather than
  // reusing the numeric bento/tile above, which doesn't fit a full stage
  // name or a confirmed/percent value well.
  admissionStatsRow: { flexDirection: "row", gap: 10 },
  admissionStatCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  admissionStatIconWrap: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  admissionStatValue: { fontSize: 14.5, fontWeight: "900", letterSpacing: -0.2 },
  admissionStatLabel: { fontSize: 10, fontWeight: "700" },
  admissionProgressTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  admissionProgressFill: { height: 4, borderRadius: 2 },
  admissionStagePill: { alignSelf: "flex-start", maxWidth: "100%", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  admissionStagePillText: { fontSize: 10.5, fontWeight: "800" },

  section: { gap: 10 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 13, fontWeight: "800" },
  sectionLink: { fontSize: 12.5, fontWeight: "800" },
  sectionLinkOutline: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  factsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  factText: { fontSize: 12, fontWeight: "700" },

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

  // Flush against the screen's left edge - sharp on that side, a full pill
  // on the other three corners - so it reads as a tab rather than a FAB.
  timelineFab: {
    position: "absolute",
    left: 0,
    bottom: 90,
    height: 42,
    minWidth: 42,
    paddingLeft: 12,
    paddingRight: 10,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 21,
    borderBottomRightRadius: 21,
  },

  // Timeline popup - same bottom-sheet shape as the modals in TopicDetailScreen.tsx.
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(22, 15, 20, 0.5)" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 12 },
  modalHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  modalTitle: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  modalSubtitle: { marginTop: 3, maxWidth: 270, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  // Fixed px, not a percentage: modalSheet has no explicit height of its own
  // (it hugs its content, anchored to the bottom by modalRoot), so a
  // percentage maxHeight here had nothing definite to resolve against and
  // fell back to the full screen height - reserving that much scroll space
  // even for a two-item timeline, which read as dead space below the list.
  timelineModalScroll: { maxHeight: 420, marginTop: 10 },
});
