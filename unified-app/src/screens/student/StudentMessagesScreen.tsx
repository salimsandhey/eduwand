import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator, Image, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { api, CommunicationMessage, StudentMessagingContext, StudentMessagingTeacher } from "../../api/client";
import { Screen } from "../../components/Screen";
import { useRealtimeMessages } from "../../hooks/useRealtimeMessages";
import { useKeyboardOverlap } from "../../hooks/useKeyboardOverlap";
import { useTabBarTop } from "../../navigation/useTabBarClearance";
import { avatarSourceFor, TEACHER_DEFAULT_AVATAR } from "../../theme/avatars";
import { capitalizeFirst } from "../../utils/text";

type Tab = "teacher" | "class";

// Consecutive bubbles from the same sender closer together than this read as
// one group: tight spacing, and only the last one carries a timestamp.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const STARTER_PROMPTS = [
  "I have a doubt about my homework",
  "Could you explain today's topic again?",
  "I'll be absent tomorrow",
];

function byTime(a: CommunicationMessage, b: CommunicationMessage) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function firstName(fullName: string) {
  return capitalizeFirst(fullName.trim().split(/\s+/)[0] ?? "");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function senderKey(m: CommunicationMessage) {
  return m.channel === "student_to_teacher" ? "me" : m.senderUserId ?? "teacher";
}

interface Row {
  message: CommunicationMessage;
  showDay: boolean;
  // First/last bubble of a run from the same sender.
  groupStart: boolean;
  groupEnd: boolean;
}

function buildRows(messages: CommunicationMessage[]): Row[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameDayAsPrev = !!prev && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
    const joinsPrev =
      sameDayAsPrev && senderKey(prev) === senderKey(m) && byTime(prev, m) > -GROUP_WINDOW_MS;
    const joinsNext =
      !!next &&
      new Date(next.createdAt).toDateString() === new Date(m.createdAt).toDateString() &&
      senderKey(next) === senderKey(m) &&
      byTime(m, next) > -GROUP_WINDOW_MS;
    return { message: m, showDay: !sameDayAsPrev, groupStart: !joinsPrev, groupEnd: !joinsNext };
  });
}

function TeacherAvatar({ teacher, size }: { teacher: StudentMessagingTeacher | undefined; size: number }) {
  const { colors } = useTheme();
  const { accessToken } = useAuth();
  const source =
    teacher?.hasPhoto && accessToken
      ? { uri: api.studentTeacherPhotoUrl(accessToken, teacher.id) }
      : avatarSourceFor(teacher?.avatarKey, "teacher") ?? TEACHER_DEFAULT_AVATAR;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: colors.backgroundMuted }}>
      <Image source={source} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
    </View>
  );
}

export function StudentMessagesScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [context, setContext] = useState<StudentMessagingContext | null>(null);
  const [tab, setTab] = useState<Tab>("teacher");
  const [unreadClass, setUnreadClass] = useState(false);
  const [draft, setDraft] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // The floating tab bar hides while the keyboard is up (FloatingTabBar
  // honours tabBarHideOnKeyboard), so the composer rests above the bar when
  // the keyboard is closed and directly above the keyboard - by exactly the
  // measured amount it covers - when it's open.
  const tabBarTop = useTabBarTop(10);
  const keyboard = useKeyboardOverlap();
  const bottomGap = keyboard.keyboardVisible ? keyboard.overlap : tabBarTop;
  // While typing, the keyboard takes about half the screen: the page title
  // and tabs step aside so the conversation keeps the room, and only the
  // compact "who you're talking to" strip stays.
  const typing = keyboard.keyboardVisible && tab === "teacher";

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [list, ctx] = await Promise.all([
        api.listStudentCommunications(accessToken),
        // The screen still works without names, so a failure here isn't fatal.
        api.getStudentMessagingContext(accessToken).catch(() => null),
      ]);
      setMessages([...list].sort(byTime));
      if (ctx) setContext(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // A message can arrive twice (send response + socket push) - merge by id.
  const addMessage = useCallback((incoming: CommunicationMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming].sort(byTime)));
  }, []);

  useRealtimeMessages((m) => {
    addMessage(m);
    if (m.channel === "teacher_to_class" && tab !== "class") setUnreadClass(true);
  }, load);

  const teachersById = useMemo(() => new Map((context?.teachers ?? []).map((t) => [t.id, t])), [context]);
  const classTeachers = useMemo(() => (context?.teachers ?? []).filter((t) => t.isClassTeacher), [context]);
  const soloTeacher = classTeachers.length === 1 ? classTeachers[0] : undefined;
  const classLabel = context ? `${capitalizeFirst(context.className)} ${capitalizeFirst(context.sectionName)}` : null;
  const addressee = soloTeacher ? firstName(soloTeacher.fullName) : "your teacher";

  // The server sends both kinds in one list; split them so announcements
  // never interleave with the private conversation.
  const teacherThread = useMemo(() => messages.filter((m) => m.channel !== "teacher_to_class"), [messages]);
  const classFeed = useMemo(() => messages.filter((m) => m.channel === "teacher_to_class"), [messages]);
  // Inverted list: newest at index 0 stays pinned to the bottom on its own.
  const rows = useMemo(() => buildRows(tab === "teacher" ? teacherThread : classFeed).reverse(), [tab, teacherThread, classFeed]);
  // Only worth naming the sender on a bubble when more than one teacher writes here.
  const showSenderNames = new Set(teacherThread.filter((m) => m.senderUserId).map((m) => m.senderUserId)).size > 1;

  function selectTab(next: Tab) {
    setTab(next);
    if (next === "class") setUnreadClass(false);
  }

  function applyStarter(text: string) {
    setDraft(text);
    inputRef.current?.focus();
  }

  async function send() {
    const body = draft.trim();
    if (!accessToken || !body || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      addMessage(await api.sendStudentCommunication(accessToken, body));
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  const canSend = draft.trim().length > 0 && !isSending;

  function teacherName(m: CommunicationMessage) {
    const t = m.senderUserId ? teachersById.get(m.senderUserId) : undefined;
    return t ? capitalizeFirst(t.fullName) : "Your teacher";
  }

  function renderDay(iso: string) {
    return <Text style={[styles.dayLabel, { color: colors.textMuted }]}>{formatDay(iso)}</Text>;
  }

  function renderBubble({ message: m, showDay, groupStart, groupEnd }: Row) {
    const mine = m.channel === "student_to_teacher";
    const sender = m.senderUserId ? teachersById.get(m.senderUserId) : undefined;
    return (
      <View>
        {showDay ? renderDay(m.createdAt) : null}
        <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null, { marginTop: groupStart ? 12 : 3 }]}>
          {!mine ? (
            // Avatar sits beside the last bubble of a run; earlier ones keep its space.
            <View style={styles.bubbleAvatarSlot}>{groupEnd ? <TeacherAvatar teacher={sender} size={28} /> : null}</View>
          ) : null}
          <View style={[styles.bubbleColumn, mine && { alignItems: "flex-end" }]}>
            {!mine && showSenderNames && groupStart ? (
              <Text style={[styles.senderName, { color: colors.textMuted }]}>{teacherName(m)}</Text>
            ) : null}
            <View
              style={[
                styles.bubble,
                mine
                  ? { backgroundColor: colors.accent, borderBottomRightRadius: groupEnd ? 6 : 18, borderTopRightRadius: groupStart ? 18 : 6 }
                  : { backgroundColor: colors.backgroundMuted, borderBottomLeftRadius: groupEnd ? 6 : 18, borderTopLeftRadius: groupStart ? 18 : 6 },
              ]}
            >
              <Text style={[styles.bubbleText, { color: mine ? colors.accentOn : colors.textPrimary }]}>{m.body}</Text>
            </View>
            {groupEnd ? <Text style={[styles.bubbleTime, { color: colors.textMuted }]}>{formatTime(m.createdAt)}</Text> : null}
          </View>
        </View>
      </View>
    );
  }

  function renderAnnouncement({ message: m, showDay }: Row) {
    const sender = m.senderUserId ? teachersById.get(m.senderUserId) : undefined;
    return (
      <View>
        {showDay ? renderDay(m.createdAt) : null}
        <View style={[styles.announcement, { backgroundColor: colors.surface, borderLeftColor: colors.accent }, cardShadow]}>
          <View style={styles.announcementHead}>
            <TeacherAvatar teacher={sender} size={26} />
            <Text style={[styles.announcementSender, { color: colors.textPrimary }]} numberOfLines={1}>
              {teacherName(m)}
            </Text>
            <Text style={[styles.announcementTime, { color: colors.textMuted }]}>{formatTime(m.createdAt)}</Text>
          </View>
          <Text style={[styles.announcementBody, { color: colors.textSecondary }]}>{m.body}</Text>
        </View>
      </View>
    );
  }

  function renderEmpty() {
    if (tab === "class") {
      return (
        <ScrollView style={styles.emptyScroll} contentContainerStyle={styles.emptyContent} showsVerticalScrollIndicator={false}>
          <Ionicons name="megaphone-outline" size={30} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No class updates yet</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Announcements your teachers send to {classLabel ?? "your class"} will show up here.
          </Text>
        </ScrollView>
      );
    }
    // Scrolls inside the space it's given - centred when there's room, and
    // when the keyboard shrinks that space it scrolls instead of spilling
    // over the header above. While typing, only the quick starts remain,
    // sitting right above the composer.
    return (
      <ScrollView
        style={styles.emptyScroll}
        contentContainerStyle={[styles.emptyContent, typing && styles.emptyContentTyping]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!typing ? (
          <>
            <TeacherAvatar teacher={soloTeacher} size={64} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Say hello to {addressee}</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Ask a question or let {soloTeacher ? "them" : "your teacher"} know something. Only your teacher can see these messages.
            </Text>
          </>
        ) : (
          <Text style={[styles.startersLabel, { color: colors.textMuted }]}>Quick starts</Text>
        )}
        <View style={[styles.starters, typing && { marginTop: 6 }]}>
          {STARTER_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt}
              onPress={() => applyStarter(prompt)}
              style={({ pressed }) => [styles.starter, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel={`Start with: ${prompt}`}
            >
              <Text style={[styles.starterText, { color: colors.textSecondary }]}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen>
      {!typing ? (
        <>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
            {classLabel ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{classLabel}</Text> : null}
          </View>

          <View style={[styles.tabRow, { backgroundColor: colors.backgroundMuted }]}>
            {(["teacher", "class"] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => selectTab(t)}
                  style={({ pressed }) => [styles.tab, active && [{ backgroundColor: colors.surface }, cardShadow], pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabText, { color: active ? colors.textPrimary : colors.textMuted }]}>
                    {t === "teacher" ? (soloTeacher ? firstName(soloTeacher.fullName) : "My teacher") : "Class updates"}
                  </Text>
                  {t === "class" && unreadClass ? <View style={[styles.unreadDot, { backgroundColor: colors.danger }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {tab === "teacher" && classTeachers.length > 0 ? (
        <View style={[styles.contact, typing && styles.contactTyping, { borderBottomColor: colors.border }]}>
          <View style={styles.contactAvatars}>
            {classTeachers.slice(0, 3).map((t, i) => (
              <View key={t.id} style={[styles.contactAvatar, i > 0 && styles.contactAvatarStacked, { borderColor: colors.background }]}>
                <TeacherAvatar teacher={t} size={38} />
              </View>
            ))}
          </View>
          <View style={styles.contactCopy}>
            <Text style={[styles.contactName, { color: colors.textPrimary }]} numberOfLines={1}>
              {classTeachers.map((t) => (soloTeacher ? capitalizeFirst(t.fullName) : firstName(t.fullName))).join(", ")}
            </Text>
            <Text style={[styles.contactRole, { color: colors.textMuted }]} numberOfLines={1}>
              {soloTeacher ? "Your teacher" : "Your teachers"}
              {classLabel ? ` · ${classLabel}` : ""}
            </Text>
          </View>
        </View>
      ) : null}

      <View ref={keyboard.ref} onLayout={keyboard.onLayout} collapsable={false} style={[styles.body, { paddingBottom: bottomGap }]}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          renderEmpty()
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(r) => r.message.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (tab === "teacher" ? renderBubble(item) : renderAnnouncement(item))}
          />
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {tab === "teacher" ? (
          <View style={styles.composer}>
            <View
              style={[
                styles.inputShell,
                { backgroundColor: colors.surface, borderColor: inputFocused ? colors.accent : colors.border },
              ]}
            >
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.textPrimary }]}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={`Message ${addressee}…`}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: canSend ? colors.accent : colors.backgroundMuted },
                  pressed && canSend && { opacity: pressedOpacity },
                ]}
                onPress={send}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {isSending ? (
                  <ActivityIndicator color={colors.accentOn} size="small" />
                ) : (
                  <Ionicons name="arrow-up" size={18} color={canSend ? colors.accentOn : colors.textMuted} />
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: "500", marginTop: 2 },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: 14, gap: 4 },
  tab: { flex: 1, flexDirection: "row", gap: 6, borderRadius: 10, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 13, fontWeight: "700" },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  contact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactAvatars: { flexDirection: "row" },
  contactAvatar: { borderWidth: 2, borderRadius: 21 },
  contactAvatarStacked: { marginLeft: -12 },
  contactCopy: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: "700" },
  contactRole: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  contactTyping: { marginTop: 8 },
  // Clip, so nothing inside can ever draw over the header while it shrinks.
  body: { flex: 1, overflow: "hidden" },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexGrow: 1 },
  dayLabel: { alignSelf: "center", fontSize: 11, fontWeight: "600", marginTop: 18, marginBottom: 2 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleAvatarSlot: { width: 28 },
  bubbleColumn: { maxWidth: "78%", alignItems: "flex-start" },
  senderName: { fontSize: 11, fontWeight: "600", marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontSize: 14.5, lineHeight: 20 },
  bubbleTime: { fontSize: 10.5, marginTop: 4, marginHorizontal: 4 },
  announcement: { borderRadius: 14, borderLeftWidth: 3, padding: 14, marginTop: 12 },
  announcementHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  announcementSender: { flex: 1, fontSize: 13, fontWeight: "700" },
  announcementTime: { fontSize: 11 },
  announcementBody: { fontSize: 14, lineHeight: 20 },
  emptyScroll: { flex: 1 },
  emptyContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 20, gap: 8 },
  emptyContentTyping: { justifyContent: "flex-end", alignItems: "stretch", paddingHorizontal: 16, paddingBottom: 6 },
  startersLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  emptyTitle: { fontSize: 17, fontWeight: "800", marginTop: 6, textAlign: "center" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  starters: { alignSelf: "stretch", gap: 8, marginTop: 14 },
  starter: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  starterText: { fontSize: 13, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 12, marginBottom: 6 },
  composer: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  inputShell: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, minHeight: 36, maxHeight: 110, fontSize: 14.5, paddingTop: 8, paddingBottom: 8 },
  sendButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginLeft: 8 },
});
