import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, Image, Animated, Alert, ActivityIndicator, useWindowDimensions, Easing } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { decorativeAssets } from "../theme/decorativeAssets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOverlap } from "../hooks/useKeyboardOverlap";
import { useWelcomeMascot } from "../context/WelcomeMascotContext";
import { useAuth } from "../context/AuthContext";
import { api, AssistantAction, AssistantLink, AssistantMessage } from "../api/client";

// Local-only bubbles (greeting, send errors) share the server message shape so
// one renderer handles everything; they are never persisted.
const GREETING: AssistantMessage = {
  id: "local-greeting",
  from: "assistant",
  text: "Meow! I'm your AI assistant. Ask me about your own data here, or tell me what to do and I'll set it up for you to confirm.",
  links: [],
  createdAt: "",
  action: null,
};

const ROLE_SUBTITLE: Record<string, string> = {
  counsellor: "Leads, follow-ups and your pipeline",
  front_desk: "Leads, follow-ups and your pipeline",
  teacher: "Classes, assignments, grading and messages",
  student: "Your work, results and study help",
};

const ROLE_PROMPTS: Record<string, string[]> = {
  counsellor: ["What follow-ups are overdue?", "How many leads are in each stage?", "Remind me to follow up a lead tomorrow"],
  front_desk: ["What follow-ups are overdue?", "How many leads are in each stage?", "Show my most recently updated leads"],
  teacher: ["Which submissions still need grading?", "What topics do I have?", "Draft an assignment from a topic"],
  student: ["What's due for me?", "Show my results", "Help me understand a topic"],
};

// Deep links come from the server, so only screens we know about are followed.
const ALLOWED_SCREENS = new Set([
  "MainTabs",
  "EnquiryDetail",
  "Pipeline",
  "TopicDetail",
  "AssignmentDetail",
  "AssignmentDraftReview",
  "GenerationSetup",
  "CommunicationHub",
]);

function localError(text: string): AssistantMessage {
  return { id: `local-error-${Date.now()}`, from: "assistant", text, links: [], createdAt: "", action: null };
}

function TypingDots() {
  const { colors } = useTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    const anims = [makeLoop(dot1, 0), makeLoop(dot2, 120), makeLoop(dot3, 240)];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
  });

  return (
    <View style={styles.typingRow}>
      <Animated.View style={[styles.typingDot, { backgroundColor: colors.textMuted }, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: colors.textMuted }, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, { backgroundColor: colors.textMuted }, dotStyle(dot3)]} />
    </View>
  );
}

function LinkChips({ links, onOpen }: { links: AssistantLink[]; onOpen: (link: AssistantLink) => void }) {
  const { colors, pressedOpacity } = useTheme();
  if (!links.length) return null;
  return (
    <View style={styles.chipRow}>
      {links.map((link, index) => (
        <Pressable
          key={`${link.screen}-${index}`}
          onPress={() => onOpen(link)}
          style={({ pressed }) => [styles.linkChip, { borderColor: colors.accent, backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel={link.label}
        >
          <Text style={[styles.linkChipText, { color: colors.accent }]} numberOfLines={1}>
            {link.label}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.accent} />
        </Pressable>
      ))}
    </View>
  );
}

// A proposed change. Nothing has happened yet while it is "pending" - the write
// only runs when the user taps Confirm.
function ActionCard({
  action,
  busy,
  onConfirm,
  onCancel,
  onOpen,
}: {
  action: AssistantAction;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onOpen: (link: AssistantLink) => void;
}) {
  const { colors, pressedOpacity } = useTheme();
  const done = action.status === "confirmed";
  const failed = action.status === "failed";
  const cancelled = action.status === "cancelled";
  return (
    <View style={[styles.actionCard, { borderColor: failed ? colors.danger ?? colors.border : colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.actionHeader}>
        <Ionicons
          name={done ? "checkmark-circle" : failed ? "alert-circle" : cancelled ? "close-circle-outline" : "flash-outline"}
          size={16}
          color={done ? colors.accent : colors.textMuted}
        />
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
          {done ? "Done" : failed ? "Didn't go through" : cancelled ? "Cancelled" : "Confirm this change"}
        </Text>
      </View>
      <Text style={[styles.bubbleText, { color: colors.textPrimary }]}>{action.summary}</Text>
      {(done || failed) && action.resultText ? <Text style={[styles.actionResult, { color: colors.textMuted }]}>{action.resultText}</Text> : null}
      {action.status === "pending" ? (
        <View style={styles.actionButtons}>
          <Pressable
            onPress={onCancel}
            disabled={busy}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surfaceRaised }, (pressed || busy) && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel this change"
          >
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.accent }, (pressed || busy) && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Confirm this change"
          >
            {busy ? <ActivityIndicator size="small" color={colors.accentOn} /> : <Text style={[styles.actionButtonText, { color: colors.accentOn }]}>Confirm</Text>}
          </Pressable>
        </View>
      ) : null}
      {done && action.resultLink ? <LinkChips links={[action.resultLink]} onOpen={onOpen} /> : null}
    </View>
  );
}

export function AiAssistChatModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, cardShadow, pressedOpacity, mode } = useTheme();
  const { accessToken, user } = useAuth();
  // The modal is mounted by each tab navigator, so this resolves to the root
  // stack - links can jump to any stack screen or back into a tab.
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // The Modal is a full-window overlay (status/navigation bars translucent), so
  // the sheet must add the bottom inset itself or the input row ends up under
  // the 3-button / gesture navigation bar.
  //
  // With the keyboard open, useKeyboardOverlap measures how much of this overlay
  // the keyboard really covers and lifts the sheet by exactly that. The sheet
  // keeps its 82% height until the space left above the keyboard gets too small,
  // then shrinks (never past the status bar) so the header stays on screen.
  const keyboard = useKeyboardOverlap();
  const [rootHeight, setRootHeight] = useState(windowHeight);
  const lift = keyboard.keyboardVisible ? keyboard.overlap : 0;
  const sheetHeight = Math.min(windowHeight * 0.82, Math.max(0, rootHeight - lift - insets.top - 8));
  const { startWelcome } = useWelcomeMascot();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [isRendered, setIsRendered] = useState(visible);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(windowHeight)).current;
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setIsRendered(true);
      backdropAnim.setValue(0);
      sheetTranslateY.setValue(windowHeight);

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          tension: 260,
          friction: 26,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (isRendered && !isClosingRef.current) {
      animateAndClose();
    }
  }, [visible, windowHeight]);

  function animateAndClose(callback?: () => void) {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: windowHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsRendered(false);
      isClosingRef.current = false;
      onClose();
      if (callback) callback();
    });
  }

  const role = user?.role ?? "";
  const prompts = ROLE_PROMPTS[role] ?? [];

  // History is per-user on the server, so it is refetched each time the sheet
  // opens (the same modal instance is reused across opens).
  useEffect(() => {
    if (!visible || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    api
      .getAssistantMessages(accessToken)
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch(() => {
        // Keep whatever is on screen; sending surfaces a real error if the server is down.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, accessToken]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? draft).trim();
    if (!text || !accessToken || isTyping) return;
    const optimistic: AssistantMessage = { id: `local-user-${Date.now()}`, from: "user", text, links: [], createdAt: "", action: null };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setIsTyping(true);
    try {
      const { userMessage, replies } = await api.sendAssistantMessage(accessToken, text);
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), userMessage, ...replies]);
    } catch {
      // Drop the unsent bubble and hand the text back so it isn't lost.
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), localError("Couldn't reach the assistant - please try again.")]);
      setDraft(text);
    } finally {
      setIsTyping(false);
    }
  }

  const patchAction = useCallback((actionId: string, patch: Partial<AssistantAction>) => {
    setMessages((prev) => prev.map((m) => (m.action?.id === actionId ? { ...m, action: { ...m.action, ...patch } } : m)));
  }, []);

  async function resolveAction(actionId: string, decision: "confirm" | "cancel") {
    if (!accessToken || busyActionId) return;
    setBusyActionId(actionId);
    try {
      if (decision === "confirm") {
        const result = await api.confirmAssistantAction(accessToken, actionId);
        patchAction(actionId, { status: result.status, resultText: result.resultText, resultLink: result.resultLink });
      } else {
        await api.cancelAssistantAction(accessToken, actionId);
        patchAction(actionId, { status: "cancelled", resultText: "Cancelled" });
      }
    } catch (err) {
      // Most likely already handled (409) or the network dropped: resync from the server.
      try {
        setMessages(await api.getAssistantMessages(accessToken));
      } catch {
        setMessages((prev) => [...prev, localError(err instanceof Error ? err.message : "Couldn't update that - please try again.")]);
      }
    } finally {
      setBusyActionId(null);
    }
  }

  function openLink(link: AssistantLink) {
    if (!ALLOWED_SCREENS.has(link.screen)) return;
    animateAndClose(() => navigation.navigate(link.screen, link.params));
  }

  function confirmClear() {
    if (!accessToken) return;
    Alert.alert("Start a new chat?", "This clears your conversation with the assistant.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          try {
            await api.clearAssistantMessages(accessToken);
            setMessages([]);
          } catch {
            setMessages((prev) => [...prev, localError("Couldn't clear the chat - please try again.")]);
          }
        },
      },
    ]);
  }

  if (!isRendered) return null;

  const shown = messages.length ? messages : [GREETING];
  const showPrompts = messages.length === 0 && !isLoading && prompts.length > 0;
  const canSend = draft.trim().length > 0 && !isTyping;
  const isDark = mode === "dark";

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      visible={isRendered}
      onRequestClose={() => animateAndClose()}
    >
      <View
        ref={keyboard.ref}
        collapsable={false}
        style={[styles.root, { paddingBottom: lift }]}
        onLayout={(e) => {
          setRootHeight(e.nativeEvent.layout.height);
          keyboard.onLayout();
        }}
      >
        <Animated.View
          style={[
            styles.backdrop,
            {
              opacity: backdropAnim,
              backgroundColor: isDark ? "rgba(0, 0, 0, 0.62)" : "rgba(15, 23, 42, 0.35)",
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => animateAndClose()}
            accessibilityRole="button"
            accessibilityLabel="Close AI assistant"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              height: sheetHeight,
              transform: [{ translateY: sheetTranslateY }],
              paddingBottom: keyboard.keyboardVisible ? 12 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.avatarWrap, { backgroundColor: colors.accentSoft }]}>
                <Image source={decorativeAssets.teacherLessonCat} style={styles.avatarImage} resizeMode="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>AI Assistant</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                  {ROLE_SUBTITLE[role] ?? "Ask me anything"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {messages.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                  onPress={confirmClear}
                  accessibilityRole="button"
                  accessibilityLabel="Start a new chat"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={() => {
                  animateAndClose(() => {
                    setTimeout(() => {
                      startWelcome();
                    }, 200);
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="Replay welcome animation"
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={() => animateAndClose()}
                accessibilityRole="button"
                accessibilityLabel="Close AI assistant"
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {shown.map((message) => {
              const isUser = message.from === "user";
              if (message.action) {
                return (
                  <View key={message.id} style={[styles.bubbleRow, styles.bubbleRowBot, styles.cardRow]}>
                    <Image source={decorativeAssets.teacherLessonCat} style={styles.bubbleAvatar} resizeMode="contain" />
                    <ActionCard
                      action={message.action}
                      busy={busyActionId === message.action.id}
                      onConfirm={() => resolveAction(message.action!.id, "confirm")}
                      onCancel={() => resolveAction(message.action!.id, "cancel")}
                      onOpen={openLink}
                    />
                  </View>
                );
              }
              return (
                <View key={message.id} style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
                  {!isUser ? <Image source={decorativeAssets.teacherLessonCat} style={styles.bubbleAvatar} resizeMode="contain" /> : null}
                  <View style={{ flexShrink: 1 }}>
                    <View
                      style={[
                        styles.bubble,
                        isUser
                          ? { backgroundColor: colors.accent, borderBottomRightRadius: 4 }
                          : { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4 },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: isUser ? colors.accentOn : colors.textPrimary }]}>{message.text}</Text>
                    </View>
                    {!isUser ? <LinkChips links={message.links} onOpen={openLink} /> : null}
                  </View>
                </View>
              );
            })}
            {showPrompts ? (
              <View style={styles.promptRow}>
                {prompts.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => send(prompt)}
                    style={({ pressed }) => [styles.promptChip, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                  >
                    <Text style={[styles.promptText, { color: colors.textPrimary }]}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {isTyping ? (
              <View style={[styles.bubbleRow, styles.bubbleRowBot]}>
                <Image source={decorativeAssets.teacherLessonCat} style={styles.bubbleAvatar} resizeMode="contain" />
                <View style={[styles.bubble, { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4 }]}>
                  <TypingDots />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask me anything..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: colors.accent },
                cardShadow,
                (!canSend || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={() => send()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="arrow-up" size={18} color={colors.accentOn} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatarWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 36, height: 36 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  headerSubtitle: { marginTop: 2, fontSize: 11, fontWeight: "500" },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  messageList: { flex: 1 },
  messageListContent: { paddingVertical: 12, gap: 12 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "88%" },
  bubbleRowBot: { alignSelf: "flex-start" },
  bubbleRowUser: { alignSelf: "flex-end" },
  cardRow: { maxWidth: "94%" },
  bubbleAvatar: { width: 26, height: 26 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  typingRow: { flexDirection: "row", gap: 4, paddingVertical: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 220 },
  linkChipText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  promptRow: { gap: 8, alignItems: "flex-start", paddingLeft: 34 },
  promptChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  promptText: { fontSize: 13, fontWeight: "600" },
  actionCard: { flexShrink: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  actionResult: { fontSize: 12, fontWeight: "500" },
  actionButtons: { flexDirection: "row", gap: 8, marginTop: 2 },
  actionButton: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionButtonText: { fontSize: 13, fontWeight: "800" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    borderWidth: 1,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 8,
  },
  input: { flex: 1, maxHeight: 100, fontSize: 14, fontWeight: "500", paddingVertical: 8 },
  sendButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
