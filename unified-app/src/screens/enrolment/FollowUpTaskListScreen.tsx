import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, FollowUpTask } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type QueueFilter = "today" | "overdue" | "upcoming" | "all";
type Tone = "overdue" | "today" | "upcoming";

const DAY_MS = 24 * 60 * 60 * 1000;

function getQueueBuckets(tasks: FollowUpTask[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + DAY_MS);
  const pending = tasks.filter((task) => task.status === "pending");

  const overdue = pending.filter((task) => new Date(task.dueAt) < startOfToday);
  const today = pending.filter((task) => {
    const due = new Date(task.dueAt);
    return due >= startOfToday && due < startOfTomorrow;
  });
  const upcoming = pending.filter((task) => new Date(task.dueAt) >= startOfTomorrow);

  return { pending, overdue, today, upcoming };
}

function getEnquiryHistory(tasks: FollowUpTask[]) {
  const map: Record<string, { sentCount: number; lastSentAt: string | null }> = {};
  for (const task of tasks) {
    if (task.status !== "sent" || !task.sentAt) continue;
    const entry = map[task.enquiryId] ?? { sentCount: 0, lastSentAt: null };
    entry.sentCount += 1;
    if (!entry.lastSentAt || new Date(task.sentAt) > new Date(entry.lastSentAt)) {
      entry.lastSentAt = task.sentAt;
    }
    map[task.enquiryId] = entry;
  }
  return map;
}

function formatDueDate(value: string) {
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "No date";
  return due.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function overdueLabel(value: string) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(value);
  const startDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((startToday - startDue) / DAY_MS);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due yesterday";
  if (days < 7) return `Due ${days} days ago`;
  return `Due ${formatDueDate(value)}`;
}

function sortByDueDate(tasks: FollowUpTask[]) {
  return [...tasks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
];

function TaskTile({
  icon,
  tint,
  value,
  label,
  percent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: number;
  label: string;
  percent: number;
}) {
  return (
    <View style={[styles.statCell, { backgroundColor: tint }]}>
      <View style={styles.statCellTopRow}>
        <View style={styles.statIconChip}>
          <Ionicons name={icon} size={13} color={tint} />
        </View>
        <Text style={styles.statPercentText} numberOfLines={1}>
          {percent}%
        </Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.statProgressTrack}>
        <View style={[styles.statProgressFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

export function FollowUpTaskListScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();
  const handleTabBarScroll = useTabBarScrollHandler();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("today");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const liveDotPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(liveDotPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [liveDotPulse]);
  const liveDotOpacity = liveDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

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
  const enquiryHistory = useMemo(() => getEnquiryHistory(tasks), [tasks]);

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

  if (isLoading && tasks.length === 0) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const overdueCount = buckets.overdue.length;
  const showOverdue = activeFilter === "today" || activeFilter === "overdue" || activeFilter === "all";
  const showToday = activeFilter === "today" || activeFilter === "all";
  const showUpcoming = activeFilter === "today" || activeFilter === "upcoming" || activeFilter === "all";
  const upcomingPreview = activeFilter === "today";

  const getHistoryLabel = (enquiryId: string) => {
    const history = enquiryHistory[enquiryId];
    if (!history || history.sentCount === 0) return "First follow-up attempt";
    const lastLabel = history.lastSentAt ? formatDueDate(history.lastSentAt) : "recently";
    return `Attempt ${history.sentCount + 1} · Last contacted ${lastLabel}`;
  };

  const cardProps = {
    colors,
    shadow: cardShadow,
    pressedOpacity,
    onSend: send,
    onComplete: complete,
    onReschedule: reschedule,
    getHistoryLabel,
  };

  const totalPending = buckets.pending.length;
  const pct = (count: number) => (totalPending ? Math.round((count / totalPending) * 100) : 0);

  const tiles: {
    key: QueueFilter;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    value: number;
    label: string;
    percent: number;
  }[] = [
    { key: "overdue", icon: "alarm-outline", tint: colors.danger, value: buckets.overdue.length, label: "Overdue", percent: pct(buckets.overdue.length) },
    { key: "today", icon: "today-outline", tint: colors.warning, value: buckets.today.length, label: "Today", percent: pct(buckets.today.length) },
    { key: "upcoming", icon: "calendar-outline", tint: "#2FA678", value: buckets.upcoming.length, label: "Upcoming", percent: pct(buckets.upcoming.length) },
    { key: "all", icon: "list-outline", tint: colors.accent, value: buckets.pending.length, label: "All", percent: 100 },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Task</Text>
            <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>Stay on top of every follow-up</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Notifications")}
            style={({ pressed }) => [
              styles.headerBell,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={colors.accent} />
            {overdueCount > 0 ? (
              <View style={[styles.headerBadge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
                <Text style={styles.headerBadgeText}>{overdueCount > 9 ? "9+" : overdueCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={[styles.statHero, { borderColor: colors.accent }]}>
          <View style={styles.statHeroTopRow}>
            <Text style={[styles.statHeroEyebrow, { color: colors.accent }]}>Follow-up overview</Text>
            <View style={[styles.liveBadge, { backgroundColor: colors.accent + "14" }]}>
              <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity }]} />
              <Text style={[styles.liveBadgeText, { color: colors.accent }]}>Live</Text>
            </View>
          </View>

          <View style={styles.statHeroRow}>
            {tiles.map((tile) => (
              <TaskTile
                key={tile.key}
                icon={tile.icon}
                tint={tile.tint}
                value={tile.value}
                label={tile.label}
                percent={tile.percent}
              />
            ))}
          </View>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railScroll} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((filter) => {
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
              </Pressable>
            );
          })}
        </ScrollView>

        {buckets.pending.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Image source={decorativeAssets.checkCircle} style={styles.emptyGraphic} resizeMode="contain" />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No pending follow-ups right now.</Text>
          </View>
        ) : (
          <>
            {showOverdue && (buckets.overdue.length > 0 || activeFilter === "overdue") ? (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: colors.danger }]}>Overdue</Text>
                  {buckets.overdue.length > 0 ? (
                    <View style={[styles.sectionCountBadge, { backgroundColor: colors.danger }]}>
                      <Text style={styles.sectionCountText}>{buckets.overdue.length}</Text>
                    </View>
                  ) : null}
                </View>
                {buckets.overdue.length === 0 ? (
                  <Text style={[styles.miniEmpty, { color: colors.textMuted }]}>No overdue follow-ups.</Text>
                ) : (
                  sortByDueDate(buckets.overdue).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      tone="overdue"
                      {...cardProps}
                      onOpen={() => task.enquiry?.id && navigation.navigate("EnquiryDetail", { enquiryId: task.enquiry.id })}
                    />
                  ))
                )}
              </View>
            ) : null}

            {showToday ? (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today&apos;s follow-ups</Text>
                  {buckets.today.length > 0 ? (
                    <View style={[styles.sectionCountBadge, { backgroundColor: colors.warning }]}>
                      <Text style={styles.sectionCountText}>{buckets.today.length}</Text>
                    </View>
                  ) : null}
                </View>
                {buckets.today.length === 0 ? (
                  <Text style={[styles.miniEmpty, { color: colors.textMuted }]}>Nothing due today.</Text>
                ) : (
                  sortByDueDate(buckets.today).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      tone="today"
                      {...cardProps}
                      onOpen={() => task.enquiry?.id && navigation.navigate("EnquiryDetail", { enquiryId: task.enquiry.id })}
                    />
                  ))
                )}
              </View>
            ) : null}

            {showUpcoming ? (
              <View style={styles.section}>
                <View style={styles.sectionHeadRow}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Upcoming</Text>
                    {buckets.upcoming.length > 0 ? (
                      <View style={[styles.sectionCountBadge, { backgroundColor: "#2FA678" }]}>
                        <Text style={styles.sectionCountText}>{buckets.upcoming.length}</Text>
                      </View>
                    ) : null}
                  </View>
                  {upcomingPreview && buckets.upcoming.length > 2 ? (
                    <Pressable onPress={() => setActiveFilter("upcoming")} hitSlop={8} style={({ pressed }) => [styles.viewAll, pressed && { opacity: pressedOpacity }]}>
                      <Text style={[styles.viewAllText, { color: colors.accent }]}>View all</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                    </Pressable>
                  ) : null}
                </View>
                {buckets.upcoming.length === 0 ? (
                  <Text style={[styles.miniEmpty, { color: colors.textMuted }]}>No upcoming follow-ups.</Text>
                ) : (
                  (upcomingPreview ? sortByDueDate(buckets.upcoming).slice(0, 2) : sortByDueDate(buckets.upcoming)).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      tone="upcoming"
                      {...cardProps}
                      onOpen={() => task.enquiry?.id && navigation.navigate("EnquiryDetail", { enquiryId: task.enquiry.id })}
                    />
                  ))
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function TaskCard({
  task,
  tone,
  colors,
  shadow,
  pressedOpacity,
  onSend,
  onComplete,
  onReschedule,
  onOpen,
  getHistoryLabel,
}: {
  task: FollowUpTask;
  tone: Tone;
  colors: ReturnType<typeof useTheme>["colors"];
  shadow: ReturnType<typeof useTheme>["cardShadow"];
  pressedOpacity: number;
  onSend: (id: string) => void;
  onComplete: (id: string) => void;
  onReschedule: (id: string, dueAt: string) => void;
  onOpen: () => void;
  getHistoryLabel: (enquiryId: string) => string;
}) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const historyLabel = getHistoryLabel(task.enquiryId);
  const isUrgent = tone !== "today";
  const accent = tone === "overdue" ? colors.danger : tone === "upcoming" ? "#2FA678" : colors.accent;
  const channelIcon = task.channel === "sms" ? "chatbubble-ellipses-outline" : "mail-outline";
  const contactValue = task.channel === "sms" ? task.enquiry?.contactPhone : task.enquiry?.contactEmail;
  const subtitle = contactValue ?? (task.channel === "sms" ? "No phone on file" : "No email on file");
  const primaryLabel = task.channel === "sms" ? "Send SMS" : "Send email";
  const primaryIcon = task.channel === "sms" ? "chatbubble-ellipses-outline" : "paper-plane-outline";
  const name = task.enquiry?.contactName ?? "Enquiry";
  const time = new Date(task.dueAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const rescheduleRow = (
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
  );

  const contactRow = (
    <View style={styles.contactRow}>
      <Ionicons name={channelIcon} size={13} color={colors.textMuted} />
      <Text style={[styles.subText, { color: colors.textMuted }]} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );

  const historyRow = (
    <View style={styles.contactRow}>
      <Ionicons name="repeat-outline" size={12} color={colors.textMuted} />
      <Text style={[styles.historyText, { color: colors.textMuted }]} numberOfLines={1}>
        {historyLabel}
      </Text>
    </View>
  );

  if (isUrgent) {
    const pillText = tone === "overdue" ? overdueLabel(task.dueAt) : `Due ${formatDueDate(task.dueAt)}`;
    return (
      <View
        style={[
          styles.urgentCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderLeftColor: accent,
          },
          shadow,
        ]}
      >
        <Pressable onPress={onOpen} style={({ pressed }) => [styles.urgentTop, pressed && { opacity: pressedOpacity }]}>
          <Text style={[styles.urgentName, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.urgentPill}>
            <Ionicons name="time-outline" size={12} color={accent} />
            <Text style={[styles.urgentPillText, { color: accent }]}>{pillText}</Text>
          </View>
        </Pressable>

        {contactRow}
        {historyRow}

        {rescheduling ? (
          rescheduleRow
        ) : (
          <View style={styles.urgentActions}>
            <Pressable
              onPress={() => onSend(task.id)}
              style={({ pressed }) => [styles.urgentPrimary, { backgroundColor: accent }, pressed && { opacity: pressedOpacity }]}
            >
              <Ionicons name="paper-plane-outline" size={14} color="#FFFFFF" />
              <Text style={styles.urgentPrimaryText}>Send now</Text>
            </Pressable>
            <Pressable
              onPress={() => setRescheduling(true)}
              style={({ pressed }) => [
                styles.circleIconBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityLabel="Reschedule task"
            >
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.fullCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: accent }, shadow]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.fullTop, pressed && { opacity: pressedOpacity }]}>
        <Text style={[styles.fullName, { color: colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.fullTime, { color: colors.textSecondary }]}>{time}</Text>
      </Pressable>

      {contactRow}
      {historyRow}

      <View style={[styles.fullDivider, { backgroundColor: colors.border }]} />

      {rescheduling ? (
        rescheduleRow
      ) : (
        <View style={styles.fullActions}>
          <Pressable
            onPress={() => onSend(task.id)}
            style={({ pressed }) => [styles.fullPrimary, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
          >
            <Ionicons name={primaryIcon} size={15} color={colors.accentOn} />
            <Text style={[styles.fullPrimaryText, { color: colors.accentOn }]}>{primaryLabel}</Text>
          </Pressable>
          <Pressable
            onPress={() => setRescheduling(true)}
            style={({ pressed }) => [styles.fullIconBtn, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityLabel="Reschedule task"
          >
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => onComplete(task.id)}
            style={({ pressed }) => [styles.fullIconBtn, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityLabel="Complete task"
          >
            <Ionicons name="checkmark" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingTop: 14, paddingBottom: 150, gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: { flex: 1 },
  pageTitle: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  pageSubtitle: { marginTop: 4, fontSize: 13, fontWeight: "500" },
  headerBell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  headerBadgeText: { color: "#FFFFFF", fontSize: 8, fontWeight: "800", lineHeight: 10 },
  railScroll: { marginHorizontal: -16 },
  statHero: {
    borderRadius: 26,
    borderWidth: 1.5,
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 12,
    gap: 14,
  },
  statHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statHeroEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#8CE7B8",
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statHeroRow: {
    flexDirection: "row",
    gap: 6,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 4,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statCellTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statIconChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    flexShrink: 0,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  statPercentText: {
    flexShrink: 1,
    marginLeft: 4,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  statValue: {
    marginTop: 1,
    alignSelf: "flex-start",
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  statLabel: {
    alignSelf: "flex-start",
    color: "rgba(255,255,255,0.9)",
    fontSize: 10,
    fontWeight: "700",
  },
  statProgressTrack: {
    width: "100%",
    height: 3,
    borderRadius: 2,
    marginTop: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  statProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  filterRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 2 },
  filterChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: { fontSize: 13, fontWeight: "800" },
  section: { gap: 12 },
  sectionHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionCountBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  sectionCountText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAllText: { fontSize: 13, fontWeight: "800" },
  miniEmpty: { fontSize: 13, fontWeight: "500", paddingVertical: 4 },
  subText: { fontSize: 12.5, fontWeight: "600" },
  historyText: { fontSize: 11, fontWeight: "500" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  urgentCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    gap: 8,
  },
  urgentTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  urgentName: { flex: 1, fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  urgentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  urgentPillText: { fontSize: 12, fontWeight: "700" },
  urgentActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  urgentPrimary: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  urgentPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  fullCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    gap: 8,
  },
  fullTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fullName: { flex: 1, fontSize: 15, fontWeight: "700", letterSpacing: -0.2 },
  fullTime: { fontSize: 13, fontWeight: "700" },
  fullDivider: { height: 1, marginTop: 4 },
  fullActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  fullPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fullPrimaryText: { fontSize: 13, fontWeight: "700" },
  fullIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  circleIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
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
    height: 42,
    borderRadius: 12,
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
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
