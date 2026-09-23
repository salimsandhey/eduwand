import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Vibration,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { api, CalendarDay, CalendarPeriod, CalendarTask } from "../api/client";
import { capitalizeFirst } from "../utils/text";
import { softCardShadow } from "../theme/tokens";
import { SheetModal } from "./SheetModal";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const CELL_WIDTH = 42;

/**
 * Safely triggers haptic feedback on supported platforms.
 * Catches any unhandled promise rejections on Android/iOS and gracefully
 * falls back to React Native's built-in Vibration API.
 */
function safeTick() {
  try {
    const promise = Haptics?.selectionAsync?.();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        try {
          Vibration.vibrate(8);
        } catch {}
      });
    }
  } catch {
    try {
      Vibration.vibrate(8);
    } catch {}
  }
}

function weekOf(reference: Date, offsetWeeks: number): Date[] {
  const monday = new Date(reference);
  monday.setDate(
    reference.getDate() + (reference.getDay() === 0 ? -6 : 1 - reference.getDay()) + offsetWeeks * 7
  );
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function sortTasks(tasks: CalendarTask[]): CalendarTask[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.isDone) - Number(b.isDone) ||
      (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99")
  );
}

function classLabel(p: CalendarPeriod) {
  return `${capitalizeFirst(p.className)} ${capitalizeFirst(p.sectionName)}`;
}

export function TeacherCalendar({
  openAgendaSignal = 0,
  onDragStateChange,
}: {
  openAgendaSignal?: number;
  onDragStateChange?: (isDragging: boolean) => void;
}) {
  const { accessToken, user } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const navigation = useNavigation<any>();

  const [calendarWidth, setCalendarWidth] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const todayIso = useMemo(() => toIso(now), [now]);
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const [daysByDate, setDaysByDate] = useState<Record<string, CalendarDay>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAgenda, setShowAgenda] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Active slider thumb position & grab scale
  const indicatorX = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const hasInitializedX = useRef(false);

  // Hover index while actively dragging
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastClampedXRef = useRef(0);
  const hoverIndexRef = useRef<number | null>(null);

  const isIndividual = user?.accountType === "individual";
  const weekDates = useMemo(() => weekOf(new Date(), weekOffset), [weekOffset]);

  const activeIndex = useMemo(
    () => weekDates.findIndex((d) => toIso(d) === selectedIso),
    [weekDates, selectedIso]
  );
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const step = useMemo(
    () => (calendarWidth > 0 ? (calendarWidth - CELL_WIDTH) / 6 : 0),
    [calendarWidth]
  );
  const maxTrackX = useMemo(() => 6 * step, [step]);

  // Spring indicator to activeIndex when not dragging
  useEffect(() => {
    if (step <= 0 || activeIndex < 0) return;
    const targetX = activeIndex * step;

    if (!hasInitializedX.current) {
      hasInitializedX.current = true;
      indicatorX.setValue(targetX);
      return;
    }

    if (!isDraggingRef.current) {
      Animated.spring(indicatorX, {
        toValue: targetX,
        tension: 280,
        friction: 24,
        useNativeDriver: true,
      }).start();
    }
  }, [activeIndex, step, indicatorX]);

  const changeWeek = useCallback(
    (delta: number) => {
      const next = delta === 0 ? 0 : weekOffset + delta;
      safeTick();
      const dates = weekOf(new Date(), next);
      setWeekOffset(next);
      const hasToday = dates.some((d) => toIso(d) === todayIso);
      setSelectedIso(hasToday ? todayIso : toIso(dates[0]));
      setShowAdd(false);
      setHoverIndex(null);
    },
    [weekOffset, todayIso]
  );

  // PanResponder to tap & hold current active tab, turning it into a movable slider
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (evt) => {
          if (step <= 0) return;
          const touchX = evt.nativeEvent.locationX;
          const currentActiveX = activeIndexRef.current * step;

          // Check if touch is on or near the active tab thumb
          const isOverActive =
            touchX >= currentActiveX - 10 && touchX <= currentActiveX + CELL_WIDTH + 10;

          if (isOverActive) {
            // Grabbed the active tab! Enter slider drag mode
            isDraggingRef.current = true;
            onDragStateChange?.(true);
            dragStartXRef.current = currentActiveX;
            lastClampedXRef.current = currentActiveX;
            hoverIndexRef.current = activeIndexRef.current;
            setHoverIndex(activeIndexRef.current);

            safeTick();

            Animated.spring(dragScale, {
              toValue: 1.08,
              tension: 320,
              friction: 18,
              useNativeDriver: true,
            }).start();
          } else {
            // Directly tapped another date on the fixed track
            isDraggingRef.current = false;
            const tappedIdx = Math.max(0, Math.min(6, Math.round((touchX - CELL_WIDTH / 2) / step)));
            if (weekDates[tappedIdx]) {
              safeTick();
              setSelectedIso(toIso(weekDates[tappedIdx]));
              setShowAdd(false);
            }
          }
        },
        onPanResponderMove: (_, gestureState) => {
          if (!isDraggingRef.current || step <= 0) return;

          // Calculate current date slot based on finger position
          const currentX = dragStartXRef.current + gestureState.dx;
          const clampedX = Math.max(0, Math.min(maxTrackX, currentX));
          const targetSlot = Math.max(0, Math.min(6, Math.round(clampedX / step)));

          // Move strictly from date to date (no free floating in between)
          if (targetSlot !== hoverIndexRef.current) {
            hoverIndexRef.current = targetSlot;
            lastClampedXRef.current = targetSlot * step;
            safeTick();
            setHoverIndex(targetSlot);

            // Spring directly into the target date slot
            Animated.spring(indicatorX, {
              toValue: targetSlot * step,
              tension: 420,
              friction: 28,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isDraggingRef.current) {
            isDraggingRef.current = false;
            onDragStateChange?.(false);

            Animated.spring(dragScale, {
              toValue: 1,
              tension: 300,
              friction: 20,
              useNativeDriver: true,
            }).start();

            // If it was just a quick tap in place on the active tab, open details
            if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) {
              setHoverIndex(null);
              setShowAgenda(true);
            } else {
              const finalIdx = hoverIndexRef.current ?? activeIndexRef.current;
              const targetIso = toIso(weekDates[finalIdx]);

              Animated.spring(indicatorX, {
                toValue: finalIdx * step,
                tension: 420,
                friction: 28,
                useNativeDriver: true,
              }).start();

              setSelectedIso(targetIso);
              setHoverIndex(null);
              setShowAdd(false);
              safeTick();
            }
          } else {
            // Horizontal swipe detection to navigate weeks
            if (gestureState.dx < -70 && gestureState.vx < -0.3) {
              changeWeek(1);
            } else if (gestureState.dx > 70 && gestureState.vx > 0.3) {
              changeWeek(-1);
            }
          }
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderTerminate: () => {
          if (isDraggingRef.current) {
            isDraggingRef.current = false;
            onDragStateChange?.(false);
            Animated.spring(dragScale, {
              toValue: 1,
              tension: 300,
              friction: 20,
              useNativeDriver: true,
            }).start();
            setHoverIndex(null);
          }
        },
      }),
    [step, maxTrackX, weekDates, indicatorX, dragScale, changeWeek, onDragStateChange]
  );

  // Handle open agenda signal
  useEffect(() => {
    if (openAgendaSignal === 0) return;
    setWeekOffset(0);
    setSelectedIso(todayIso);
    setShowAdd(false);
    setShowAgenda(true);
    setHoverIndex(null);
  }, [openAgendaSignal, todayIso]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getCalendarAgenda(
        accessToken,
        toIso(weekDates[0]),
        toIso(weekDates[6])
      );
      setDaysByDate((current) => ({
        ...current,
        ...Object.fromEntries(res.days.map((d) => [d.date, d])),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your calendar");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, weekDates]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function goToToday() {
    safeTick();
    setWeekOffset(0);
    setSelectedIso(todayIso);
    setShowAdd(false);
    setHoverIndex(null);
  }

  function patchDay(iso: string, update: (day: CalendarDay) => CalendarDay) {
    setDaysByDate((current) => {
      const day = current[iso] ?? { date: iso, periods: [], tasks: [] };
      return { ...current, [iso]: update(day) };
    });
  }

  async function toggleTask(task: CalendarTask) {
    if (!accessToken) return;
    const next = !task.isDone;
    patchDay(selectedIso, (day) => ({
      ...day,
      tasks: sortTasks(day.tasks.map((t) => (t.id === task.id ? { ...t, isDone: next } : t))),
    }));
    try {
      await api.updateCalendarTask(accessToken, task.id, { isDone: next });
    } catch (err) {
      patchDay(selectedIso, (day) => ({
        ...day,
        tasks: sortTasks(day.tasks.map((t) => (t.id === task.id ? { ...t, isDone: task.isDone } : t))),
      }));
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  }

  async function removeTask(task: CalendarTask) {
    if (!accessToken) return;
    patchDay(selectedIso, (day) => ({ ...day, tasks: day.tasks.filter((t) => t.id !== task.id) }));
    try {
      await api.deleteCalendarTask(accessToken, task.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task");
      load();
    }
  }

  async function addTask() {
    const title = newTitle.trim();
    if (!accessToken || !title || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await api.createCalendarTask(accessToken, { title, taskDate: selectedIso });
      patchDay(selectedIso, (day) => ({
        ...day,
        tasks: sortTasks([
          ...day.tasks,
          {
            id: created.id,
            title: created.title,
            notes: created.notes,
            dueTime: created.dueTime,
            isDone: created.isDone,
          },
        ]),
      }));
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedDay: CalendarDay = daysByDate[selectedIso] ?? { date: selectedIso, periods: [], tasks: [] };
  const pendingCount = selectedDay.tasks.filter((t) => !t.isDone).length;
  const selectedDate = weekDates.find((d) => toIso(d) === selectedIso) ?? weekDates[0];
  const isSelectedToday = selectedIso === todayIso;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextPeriodId = isSelectedToday
    ? selectedDay.periods.find((p) => toMinutes(p.startTime) > nowMinutes)?.id
    : undefined;
  const currentPeriod = isSelectedToday
    ? selectedDay.periods.find(
        (p) => nowMinutes >= toMinutes(p.startTime) && nowMinutes < toMinutes(p.endTime)
      )
    : undefined;
  const upNext = currentPeriod ?? selectedDay.periods.find((p) => p.id === nextPeriodId);
  const upNextLine = upNext
    ? currentPeriod
      ? `Now: ${classLabel(upNext)} · ${capitalizeFirst(upNext.subject)}`
      : `Next: ${upNext.startTime} ${classLabel(upNext)} · ${capitalizeFirst(upNext.subject)}`
    : null;

  const activeMonthTitle = selectedDate.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const dayHeading = isSelectedToday
    ? "Today"
    : selectedDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  const summary = [
    `${selectedDay.periods.length} ${selectedDay.periods.length === 1 ? "class" : "classes"}`,
    `${pendingCount} ${pendingCount === 1 ? "task" : "tasks"} pending`,
  ].join(" · ");

  // The date displayed inside the active slider thumb
  const activeDisplayIdx = hoverIndex !== null ? hoverIndex : activeIndex;
  const displayDate = weekDates[activeDisplayIdx >= 0 ? activeDisplayIdx : 0];
  const displayIso = displayDate ? toIso(displayDate) : selectedIso;
  const displayDay = daysByDate[displayIso];
  const displayHasPeriods = (displayDay?.periods.length ?? 0) > 0;
  const displayHasPending = (displayDay?.tasks.some((t) => !t.isDone)) ?? false;

  return (
    <View>
      {/* Clean Header: Month & Year with subtle week chevrons on left, Today button on right */}
      <View style={styles.calendarHeader}>
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => changeWeek(-1)}
            hitSlop={12}
            style={({ pressed }) => [styles.chevronButton, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{activeMonthTitle}</Text>
          <Pressable
            onPress={() => changeWeek(1)}
            hitSlop={12}
            style={({ pressed }) => [styles.chevronButton, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Next week"
          >
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {selectedIso !== todayIso ? (
          <Pressable
            onPress={goToToday}
            hitSlop={8}
            style={({ pressed }) => [
              styles.todayButton,
              { backgroundColor: colors.accentSoft },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
          >
            <Text style={[styles.todayLink, { color: colors.accent }]}>Today</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 7-Days Layout: Fixed Stationary Track with Draggable Active Slider Thumb */}
      <View
        style={styles.trackContainer}
        onLayout={(e: LayoutChangeEvent) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== calendarWidth) {
            setCalendarWidth(w);
          }
        }}
      >
        {calendarWidth > 0 ? (
          <View
            style={[styles.weekRow, { width: calendarWidth }]}
            accessibilityLabel="Week calendar"
            {...panResponder.panHandlers}
          >
            {/* 7 Base day cells along the fixed stationary track */}
            {weekDates.map((date) => {
              const iso = toIso(date);
              const day = daysByDate[iso];
              const isToday = iso === todayIso;
              const hasPeriods = (day?.periods.length ?? 0) > 0;
              const hasPending = (day?.tasks.some((t) => !t.isDone)) ?? false;

              return (
                <View
                  key={iso}
                  pointerEvents="none"
                  style={[
                    styles.dayCell,
                    {
                      width: CELL_WIDTH,
                      backgroundColor: colors.surfaceRaised,
                      borderColor: isToday ? colors.accent : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                    {date.toLocaleDateString("en-IN", { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dayDate, { color: colors.textPrimary }]}>
                    {date.getDate()}
                  </Text>
                  <View style={styles.dotRow}>
                    {hasPeriods ? (
                      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                    ) : null}
                    {hasPending ? (
                      <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                    ) : null}
                  </View>
                </View>
              );
            })}

            {/* Draggable active slider thumb that glides across the fixed track */}
            {displayDate ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activeSliderThumb,
                  {
                    backgroundColor: colors.accent,
                    transform: [
                      { translateX: indicatorX },
                      { scale: dragScale },
                    ],
                  },
                ]}
              >
                <Text style={[styles.dayLabel, { color: colors.accentOn }]}>
                  {displayDate.toLocaleDateString("en-IN", { weekday: "short" })}
                </Text>
                <Text style={[styles.dayDate, { color: colors.accentOn }]}>
                  {displayDate.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {displayHasPeriods ? (
                    <View style={[styles.dot, { backgroundColor: colors.accentOn }]} />
                  ) : null}
                  {displayHasPending ? (
                    <View style={[styles.dot, { backgroundColor: colors.accentOn }]} />
                  ) : null}
                </View>
              </Animated.View>
            ) : null}
          </View>
        ) : (
          <View style={styles.weekRowPlaceholder} />
        )}
      </View>

      {/* Summary Card */}
      <Pressable
        onPress={() => setShowAgenda(true)}
        style={({ pressed }) => [
          styles.summaryCard,
          { backgroundColor: colors.surface },
          softCardShadow,
          pressed && { opacity: pressedOpacity },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${dayHeading}: ${summary}. Open day details`}
      >
        <View style={[styles.summaryIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="calendar" size={18} color={colors.accent} />
        </View>
        <View style={styles.agendaTitleBlock}>
          <Text style={[styles.agendaTitle, { color: colors.textPrimary }]}>{dayHeading}</Text>
          <Text style={[styles.agendaSummary, { color: colors.textMuted }]} numberOfLines={1}>
            {upNextLine ?? summary}
          </Text>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        )}
      </Pressable>

      {/* Agenda Details Bottom Sheet */}
      <SheetModal visible={showAgenda} onClose={() => setShowAgenda(false)} closeLabel="Close day details">
        <View style={styles.agendaHeader}>
          <View style={styles.agendaTitleBlock}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{dayHeading}</Text>
            <Text style={[styles.agendaSummary, { color: colors.textMuted }]}>{summary}</Text>
          </View>
          {isLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          <Pressable
            onPress={() => setShowAgenda(false)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: colors.surfaceRaised },
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

          {selectedDay.periods.length > 0 ? (
            <View style={styles.section}>
              {selectedDay.periods.map((period) => {
                const isNow =
                  isSelectedToday &&
                  nowMinutes >= toMinutes(period.startTime) &&
                  nowMinutes < toMinutes(period.endTime);
                const isOver = isSelectedToday && nowMinutes >= toMinutes(period.endTime);
                const isNext = period.id === nextPeriodId;
                return (
                  <View key={period.id} style={[styles.periodRow, isOver && { opacity: 0.5 }]}>
                    <View
                      style={[
                        styles.periodAccent,
                        { backgroundColor: isNow ? colors.accent : colors.border },
                      ]}
                    />
                    <View style={styles.periodTime}>
                      <Text style={[styles.periodTimeText, { color: colors.textPrimary }]}>
                        {period.startTime}
                      </Text>
                      <Text style={[styles.periodTimeSub, { color: colors.textMuted }]}>
                        {period.endTime}
                      </Text>
                    </View>
                    <View style={styles.periodBody}>
                      <Text style={[styles.periodTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {classLabel(period)} · {capitalizeFirst(period.subject)}
                      </Text>
                      {period.room ? (
                        <Text style={[styles.periodMeta, { color: colors.textMuted }]}>
                          Room {period.room}
                        </Text>
                      ) : null}
                    </View>
                    {isNow || isNext ? (
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: isNow ? colors.accent : colors.accentSoft },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: isNow ? colors.accentOn : colors.accent },
                          ]}
                        >
                          {isNow ? "Now" : "Up next"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes scheduled on this day.
            </Text>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Teacher personal tasks for the day */}
          <View style={styles.section}>
            {selectedDay.tasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <Pressable
                  onPress={() => toggleTask(task)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: task.isDone }}
                  accessibilityLabel={`Mark "${task.title}" as ${task.isDone ? "pending" : "done"}`}
                >
                  <Ionicons
                    name={task.isDone ? "checkbox" : "square-outline"}
                    size={22}
                    color={task.isDone ? colors.accent : colors.textMuted}
                  />
                </Pressable>
                <View style={styles.taskBody}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: task.isDone ? colors.textMuted : colors.textPrimary },
                      task.isDone && styles.taskDone,
                    ]}
                  >
                    {task.title}
                  </Text>
                  {task.dueTime ? (
                    <Text style={[styles.periodMeta, { color: colors.textMuted }]}>
                      Due {task.dueTime}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => removeTask(task)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete task "${task.title}"`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}

            {showAdd ? (
              <View style={styles.addRow}>
                <TextInput
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Task title..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[
                    styles.addInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceRaised,
                    },
                  ]}
                  onSubmitEditing={addTask}
                  returnKeyType="done"
                />
                <Pressable
                  onPress={addTask}
                  disabled={!newTitle.trim() || isSaving}
                  style={({ pressed }) => [
                    styles.addButton,
                    {
                      backgroundColor: colors.accent,
                      opacity: !newTitle.trim() || isSaving ? 0.5 : pressed ? pressedOpacity : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Save task"
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.accentOn} />
                  ) : (
                    <Ionicons name="checkmark" size={20} color={colors.accentOn} />
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.footerRow}>
            <Pressable
              onPress={() => setShowAdd((v) => !v)}
              style={styles.footerAction}
              accessibilityRole="button"
            >
              <Ionicons name={showAdd ? "close" : "add"} size={18} color={colors.accent} />
              <Text style={[styles.footerText, { color: colors.accent }]}>
                {showAdd ? "Cancel" : "Add task"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowAgenda(false);
                navigation.navigate(isIndividual ? "MyClasses" : "Timetable");
              }}
              style={styles.footerAction}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color={colors.accent} />
              <Text style={[styles.footerText, { color: colors.accent }]}>
                {isIndividual ? "Set up timetable" : "My timetable"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chevronButton: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayLink: {
    fontSize: 12,
    fontWeight: "800",
  },
  trackContainer: {
    marginTop: 4,
  },
  weekRowPlaceholder: {
    height: 66,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
    height: 66,
  },
  dayCell: {
    height: 66,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    zIndex: 1,
  },
  activeSliderThumb: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CELL_WIDTH,
    height: 66,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    zIndex: 10,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  dayLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  dayDate: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    height: 6,
    marginTop: 4,
    alignItems: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  summaryCard: {
    marginTop: 14,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  agendaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  agendaTitleBlock: {
    flex: 1,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  agendaSummary: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
  },
  section: {
    marginTop: 10,
    gap: 10,
  },
  divider: {
    height: 1,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 10,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  periodTime: {
    width: 44,
  },
  periodTimeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  periodTimeSub: {
    fontSize: 11,
    fontWeight: "600",
  },
  periodBody: {
    flex: 1,
  },
  periodTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  periodMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  taskBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  taskDone: {
    textDecorationLine: "line-through",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
