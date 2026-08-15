import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  ImageSourcePropType,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { Screen } from "../components/Screen";
import { PageHeader } from "../components/PageHeader";
import { api, FollowUpTask } from "../api/client";
import { decorativeAssets } from "../theme/decorativeAssets";

type QueueFilter = "today" | "overdue" | "upcoming" | "all";

const AVATAR_SOURCES: ImageSourcePropType[] = [
  require("../../assets/avatars/avatar-01.png"),
  require("../../assets/avatars/avatar-02.png"),
  require("../../assets/avatars/avatar-03.png"),
  require("../../assets/avatars/avatar-04.png"),
  require("../../assets/avatars/avatar-05.png"),
  require("../../assets/avatars/avatar-06.png"),
  require("../../assets/avatars/avatar-07.png"),
  require("../../assets/avatars/avatar-08.png"),
  require("../../assets/avatars/avatar-09.png"),
  require("../../assets/avatars/avatar-10.png"),
];

function getAvatarSource(seed: string) {
  const hash = seed.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_SOURCES[hash % AVATAR_SOURCES.length];
}

function getQueueBuckets(tasks: FollowUpTask[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const pending = tasks.filter((task) => task.status === "pending");

  const overdue = pending.filter((task) => new Date(task.dueAt) < startOfToday);
  const today = pending.filter((task) => {
    const due = new Date(task.dueAt);
    return due >= startOfToday && due < startOfTomorrow;
  });
  const upcoming = pending.filter((task) => new Date(task.dueAt) >= startOfTomorrow);

  return { pending, overdue, today, upcoming };
}

function formatDueDate(value: string) {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "No date";
  return due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function sortByDueDate(tasks: FollowUpTask[]) {
  return [...tasks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

function getUrgency(task: FollowUpTask): QueueFilter {
  const buckets = getQueueBuckets([task]);
  if (buckets.overdue.length) return "overdue";
  if (buckets.today.length) return "today";
  return "upcoming";
}

export function FollowUpTaskListScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("today");
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

  const buckets = useMemo(() => getQueueBuckets(tasks), [tasks]);
  const visibleTasks = useMemo(() => {
    if (activeFilter === "all") return sortByDueDate(buckets.pending);
    return sortByDueDate(buckets[activeFilter]);
  }, [activeFilter, buckets]);

  async function send(id: string) {
    if (!accessToken) return;
    try {
      await api.sendFollowUpTask(accessToken, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    }
  }

  async function complete(id: string) {
    if (!accessToken) return;
    try {
      await api.updateFollowUpTask(accessToken, id, { status: "cancelled" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function reschedule(id: string, dueAt: string) {
    if (!accessToken) return;
    try {
      await api.updateFollowUpTask(accessToken, id, { dueAt: new Date(`${dueAt}T00:00:00`).toISOString() });
      await load();
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

  const filters: { key: QueueFilter; label: string; count: number }[] = [
    { key: "today", label: "Today", count: buckets.today.length },
    { key: "overdue", label: "Overdue", count: buckets.overdue.length },
    { key: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { key: "all", label: "All", count: buckets.pending.length },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          eyebrow="Tasks"
          title="Follow-up queue"
          subtitle={`${buckets.pending.length} pending task${buckets.pending.length === 1 ? "" : "s"} across outreach`}
          icon="checkbox-outline"
          metrics={[
            { label: "Overdue", value: buckets.overdue.length, tone: buckets.overdue.length > 0 ? "danger" : "default" },
            { label: "Today", value: buckets.today.length, tone: "accent" },
            { label: "Upcoming", value: buckets.upcoming.length },
          ]}
        />

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                  pressed && { opacity: pressedOpacity },
                ]}
              >
                <Text style={[styles.filterText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                  {filter.label}
                </Text>
                <View style={[styles.filterCount, { backgroundColor: active ? "rgba(255,255,255,0.18)" : colors.surfaceRaised }]}>
                  <Text style={[styles.filterCountText, { color: active ? colors.accentOn : colors.textMuted }]}>
                    {filter.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.queueHeader}>
          <Text style={[styles.queueTitle, { color: colors.textPrimary }]}>
            {filters.find((filter) => filter.key === activeFilter)?.label} queue
          </Text>
          <Text style={[styles.queueCount, { color: colors.textMuted }]}>
            {visibleTasks.length} task{visibleTasks.length === 1 ? "" : "s"}
          </Text>
        </View>

        {visibleTasks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Image source={decorativeAssets.checkCircle} style={styles.emptyGraphic} resizeMode="contain" />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No follow-ups in this queue right now.
            </Text>
          </View>
        ) : (
          visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              colors={colors}
              shadow={cardShadow}
              pressedOpacity={pressedOpacity}
              onSend={send}
              onComplete={complete}
              onReschedule={reschedule}
              onOpen={() => {
                if (task.enquiry?.id) navigation.navigate("EnquiryDetail", { enquiryId: task.enquiry.id });
              }}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function TaskCard({
  task,
  colors,
  shadow,
  pressedOpacity,
  onSend,
  onComplete,
  onReschedule,
  onOpen,
}: {
  task: FollowUpTask;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
  onOpen: () => void;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const urgency = getUrgency(task);
  const avatarSource = getAvatarSource(task.enquiry?.id ?? task.id);
  const channelIcon = task.channel === "sms" ? "chatbubble-outline" : "mail-outline";
  const urgencyColor = urgency === "overdue" ? colors.danger : urgency === "today" ? colors.accent : colors.textSecondary;

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.taskTop, pressed && { opacity: pressedOpacity }]}>
        <View style={[styles.avatarBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
          <Image source={avatarSource} style={styles.avatarImage} resizeMode="contain" />
        </View>

        <View style={styles.taskMain}>
          <Text style={[styles.taskName, { color: colors.textPrimary }]} numberOfLines={1}>
            {task.enquiry?.contactName ?? "Enquiry"}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.channelBadge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={channelIcon} size={12} color={colors.accent} />
              <Text style={[styles.channelText, { color: colors.accent }]}>{task.channel.toUpperCase()}</Text>
            </View>
            <View style={[styles.dueBadge, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.dueText, { color: urgencyColor }]}>{formatDueDate(task.dueAt)}</Text>
            </View>
          </View>
        </View>

        <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
      </Pressable>

      {task.enquiry?.contactPhone ? (
        <Text style={[styles.phoneText, { color: colors.textMuted }]}>{task.enquiry.contactPhone}</Text>
      ) : null}

      {rescheduling ? (
        <View style={styles.rescheduleRow}>
          <View
            style={[
              styles.rescheduleInputWrap,
              { backgroundColor: colors.surfaceRaised, borderColor: inputFocused ? colors.accent : colors.border },
            ]}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
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
            onPress={() => {
              if (newDate) onReschedule(task.id, newDate);
              setNewDate("");
              setRescheduling(false);
            }}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          >
            <Ionicons name="checkmark" size={16} color={colors.accentOn} />
          </Pressable>
          <Pressable
            onPress={() => {
              setNewDate("");
              setRescheduling(false);
            }}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
              pressed && { opacity: pressedOpacity },
            ]}
          >
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => onSend(task.id)}
            style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          >
            <Ionicons name="paper-plane-outline" size={14} color={colors.accentOn} />
            <Text style={[styles.sendButtonText, { color: colors.accentOn }]}>Send now</Text>
          </Pressable>
          <Pressable
            onPress={() => setRescheduling(true)}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.surfaceRaised },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityLabel="Reschedule task"
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => onComplete(task.id)}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.surfaceRaised },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityLabel="Complete task"
          >
            <Ionicons name="checkmark-done-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingTop: 14, paddingBottom: 40, gap: 14 },
  filterRow: {
    gap: 8,
    paddingRight: 10,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterText: { fontSize: 12, fontWeight: "800" },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  filterCountText: { fontSize: 11, fontWeight: "800" },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueTitle: { fontSize: 20, fontWeight: "800" },
  queueCount: { fontSize: 12, fontWeight: "700" },
  taskCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  taskTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarBox: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 36, height: 36 },
  taskMain: { flex: 1 },
  taskName: { fontSize: 15, fontWeight: "800" },
  metaRow: {
    marginTop: 7,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  channelBadge: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  channelText: { fontSize: 10, fontWeight: "800" },
  dueBadge: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    justifyContent: "center",
  },
  dueText: { fontSize: 11, fontWeight: "800" },
  phoneText: {
    fontSize: 12,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sendButton: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sendButtonText: { fontSize: 12, fontWeight: "800" },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rescheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rescheduleInputWrap: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rescheduleInput: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    paddingVertical: 0,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  emptyGraphic: { width: 78, height: 78, opacity: 0.9 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800" },
  emptyText: { marginTop: 6, fontSize: 13, lineHeight: 20, textAlign: "center" },
  error: { textAlign: "center", fontSize: 13, fontWeight: "600" },
});
