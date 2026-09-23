import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, CommunicationMessage } from "../../api/client";
import { useRealtimeMessages } from "../../hooks/useRealtimeMessages";
import { useKeyboardOverlap } from "../../hooks/useKeyboardOverlap";
import { useTabBarTop } from "../../navigation/useTabBarClearance";

type Tab = "teacher" | "class";

function byTime(a: CommunicationMessage, b: CommunicationMessage) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

export function StudentMessagesScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [tab, setTab] = useState<Tab>("teacher");
  const [unreadClass, setUnreadClass] = useState(false);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follows the device's real bottom inset (gesture bar / 3-button nav / home indicator).
  const tabBarClearance = useTabBarTop(12);
  // Lift the composer by however much of this container the keyboard really
  // covers (measured). The floating tab bar hides behind the keyboard, so its
  // clearance only applies while the keyboard is closed.
  const keyboard = useKeyboardOverlap();
  const bottomGap = keyboard.keyboardVisible ? keyboard.overlap : tabBarClearance;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setMessages([...(await api.listStudentCommunications(accessToken))].sort(byTime));
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

  // The server sends both kinds in one list; split them so announcements
  // never interleave with the private conversation.
  const teacherThread = useMemo(() => messages.filter((m) => m.channel !== "teacher_to_class"), [messages]);
  const classFeed = useMemo(() => messages.filter((m) => m.channel === "teacher_to_class"), [messages]);
  // Inverted list: newest at index 0 stays pinned to the bottom on its own.
  const data = useMemo(() => [...(tab === "teacher" ? teacherThread : classFeed)].reverse(), [tab, teacherThread, classFeed]);

  function selectTab(next: Tab) {
    setTab(next);
    if (next === "class") setUnreadClass(false);
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

  return (
    <Screen>
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {(["teacher", "class"] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => selectTab(t)}
              style={({ pressed }) => [styles.tab, active && { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? colors.accentOn : colors.textSecondary }]}>{t === "teacher" ? "My teacher" : "Class updates"}</Text>
              {t === "class" && unreadClass ? <View style={[styles.unreadDot, { backgroundColor: colors.danger }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View ref={keyboard.ref} onLayout={keyboard.onLayout} collapsable={false} style={[styles.container, { paddingBottom: bottomGap }]}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : data.length === 0 ? (
          <View style={styles.container}>
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {tab === "teacher" ? "No messages yet - say hello to your teacher." : "No announcements from your teacher yet."}
            </Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={data}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item: m }) => {
              const mine = m.channel === "student_to_teacher";
              if (tab === "class") {
                return (
                  <View style={[styles.announcement, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                    <View style={styles.announcementHead}>
                      <Ionicons name="megaphone-outline" size={14} color={colors.accent} />
                      <Text style={[styles.announcementLabel, { color: colors.accent }]}>Announcement</Text>
                      <Text style={[styles.messageMeta, { color: colors.textMuted, marginTop: 0, marginLeft: "auto" }]}>{formatStamp(m.createdAt)}</Text>
                    </View>
                    <Text style={[styles.messageText, { color: colors.textPrimary }]}>{m.body}</Text>
                  </View>
                );
              }
              return (
                <View
                  style={[
                    styles.messageBubble,
                    mine
                      ? { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 4 }
                      : { alignSelf: "flex-start", backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4 },
                  ]}
                >
                  <Text style={[styles.messageText, { color: mine ? colors.accentOn : colors.textPrimary }]}>{m.body}</Text>
                  <Text style={[styles.messageMeta, { color: mine ? colors.accentOn : colors.textMuted, opacity: mine ? 0.75 : 1 }]}>{formatStamp(m.createdAt)}</Text>
                </View>
              );
            }}
          />
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {tab === "teacher" ? (
          <View
            style={[
              styles.composer,
              { backgroundColor: colors.surface, borderWidth: 0 },
              cardShadow,
            ]}
          >
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message your teacher..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.accent }, (!canSend || pressed) && { opacity: canSend ? pressedOpacity : 0.5 }]}
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {isSending ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Ionicons name="send" size={18} color={colors.accentOn} />}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 10, padding: 4, borderRadius: 14, borderWidth: 1, gap: 4 },
  tab: { flex: 1, flexDirection: "row", gap: 6, borderRadius: 10, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 12, fontWeight: "700" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 20, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 40 },
  error: { textAlign: "center", marginBottom: 8 },
  messageBubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, maxWidth: "80%" },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageMeta: { fontSize: 10, marginTop: 3, alignSelf: "flex-end" },
  announcement: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  announcementHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  announcementLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  composer: { flexDirection: "row", gap: 8, alignItems: "flex-end", borderTopWidth: 1, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, maxHeight: 100, fontSize: 14 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
