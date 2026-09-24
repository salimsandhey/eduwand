import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOverlap } from "../../hooks/useKeyboardOverlap";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { StudentAvatar } from "../../components/StudentAvatar";
import { api, CommunicationMessage } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";
import { useRealtimeMessages } from "../../hooks/useRealtimeMessages";

type Props = NativeStackScreenProps<RootStackParamList, "CommunicationChat">;

const AVATAR_SIZE = 40;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function CommunicationChatScreen({ navigation, route }: Props) {
  const params = route.params;
  const isClass = params.mode === "class";
  const studentId = params.mode === "student" ? params.studentId : null;
  const classSectionId = params.mode === "class" ? params.classSectionId : null;
  const title = params.mode === "student" ? capitalizeFirst(params.studentName) : params.classLabel;
  const subtitle = params.mode === "student" ? params.classLabel : "Message goes to every student in this class";

  const { accessToken } = useAuth();
  const { colors, pressedOpacity } = useTheme();
  const insets = useSafeAreaInsets();
  // Lift the composer by however much of this container the keyboard really
  // covers (measured), else rest above the bottom safe-area inset.
  const keyboard = useKeyboardOverlap();

  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = studentId
        ? await api.listCommunicationsWithStudent(accessToken, studentId)
        : await api.listCommunicationsForClass(accessToken, classSectionId as string);
      setMessages([...res].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, studentId, classSectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // A message can arrive twice (send response + socket push) - merge by id.
  const addMessage = useCallback((incoming: CommunicationMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.id === incoming.id)
        ? prev
        : [...prev, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );
  }, []);

  useRealtimeMessages((m) => {
    const belongs = studentId
      ? (m.channel === "teacher_to_student" && m.recipientStudentStubId === studentId) ||
        (m.channel === "student_to_teacher" && m.senderStudentStubId === studentId)
      : m.channel === "teacher_to_class" && m.recipientClassSectionId === classSectionId;
    if (belongs) addMessage(m);
  }, load);

  async function send() {
    const body = draft.trim();
    if (!accessToken || !body || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const sent = studentId
        ? await api.sendCommunicationToStudent(accessToken, { studentStubId: studentId, body })
        : await api.sendCommunicationToClass(accessToken, { classSectionId: classSectionId as string, body });
      setDraft("");
      addMessage(sent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  // Day separators are injected as a flag on the first message of each day.
  const rows = useMemo(
    () =>
      messages.map((m, i) => ({
        message: m,
        showDay: i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString(),
      })),
    [messages]
  );

  const inverted = useMemo(() => [...rows].reverse(), [rows]);

  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <Screen edges={["top"]}>
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        {params.mode === "student" ? (
          <StudentAvatar
            studentId={params.studentId}
            picture={{ avatarKey: params.studentAvatarKey, photoMimeType: params.studentPhotoMimeType }}
            size={AVATAR_SIZE}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="people" size={20} color={colors.accent} />
          </View>
        )}
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View
        ref={keyboard.ref}
        onLayout={keyboard.onLayout}
        collapsable={false}
        style={[styles.flex, { paddingBottom: keyboard.keyboardVisible ? keyboard.overlap : insets.bottom }]}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <View style={[styles.flex, styles.emptyWrap]}>
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="chatbubbles-outline" size={28} color={colors.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {isClass ? "Send an announcement to the whole class." : "Say hello to start the conversation."}
              </Text>
            </View>
          </View>
        ) : (
          // Inverted list: index 0 (the newest message) sits at the bottom and
          // the view stays pinned there as messages arrive or the keyboard
          // resizes the area - no scrollToEnd timing to get wrong.
          <FlatList
            inverted
            data={inverted}
            keyExtractor={(r) => r.message.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const { message: m, showDay } = item;
              const incoming = m.channel === "student_to_teacher";
              return (
                <View>
                  {showDay ? (
                    <View style={[styles.dayChip, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.dayText, { color: colors.textMuted }]}>{formatDay(m.createdAt)}</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      incoming
                        ? { alignSelf: "flex-start", backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4 }
                        : { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 4 },
                    ]}
                  >
                    <Text style={[styles.bubbleText, { color: incoming ? colors.textPrimary : colors.accentOn }]}>{m.body}</Text>
                    <Text style={[styles.bubbleTime, { color: incoming ? colors.textMuted : colors.accentOn, opacity: incoming ? 1 : 0.75 }]}>
                      {formatTime(m.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={draft}
            onChangeText={setDraft}
            placeholder={isClass ? "Message the class..." : "Write a message..."}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.accent }, (!canSend || pressed) && { opacity: canSend ? pressedOpacity : 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {isSending ? <ActivityIndicator color={colors.accentOn} /> : <Ionicons name="send" size={18} color={colors.accentOn} />}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1 },
  title: { fontSize: 16, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  emptyWrap: { justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: 32 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyText: { fontSize: 13, marginTop: 4, textAlign: "center" },
  dayChip: { alignSelf: "center", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 10 },
  dayText: { fontSize: 11, fontWeight: "700" },
  bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 10, marginTop: 3, alignSelf: "flex-end" },
  error: { textAlign: "center", fontSize: 12, paddingVertical: 6 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, maxHeight: 120, fontSize: 14 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
