import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, Image, Animated, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { decorativeAssets } from "../theme/decorativeAssets";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import { useWelcomeMascot } from "../context/WelcomeMascotContext";

interface ChatMessage {
  id: string;
  from: "bot" | "user";
  text: string;
}

const GREETING: ChatMessage = {
  id: "greeting",
  from: "bot",
  text: "Meow! I'm your AI assistant - I'm still learning, but soon I'll help you plan lessons, find resources, and answer questions right here.",
};

const CANNED_REPLIES = [
  "Got it! I can't fully chat yet, but this is exactly the kind of thing I'll help with soon.",
  "Noted! Real AI answers are coming - for now I'm just a friendly preview.",
  "Thanks for trying me out. Full conversations are on the way.",
];

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

export function AiAssistChatModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  // Base (no-keyboard) height is 82% of the window, anchored to the bottom. When the
  // keyboard opens we lift the sheet by keyboardHeight (marginBottom) so the input row
  // clears it - but if the sheet height stays at 82%, that lift pushes the header off
  // the top. Shrinking the height by exactly keyboardHeight keeps the top edge (header)
  // right where it was and only eats into the message-list space, with a floor so it
  // never collapses to nothing on very tall keyboards.
  const baseSheetHeight = windowHeight * 0.82;
  const sheetHeight = Math.max(280, baseSheetHeight - keyboardHeight);
  const { startWelcome } = useWelcomeMascot();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function send() {
    const text = draft.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: String(Date.now()), from: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setIsTyping(true);
    setTimeout(() => {
      const replyText = CANNED_REPLIES[Math.floor(Math.random() * CANNED_REPLIES.length)];
      const botMsg: ChatMessage = { id: String(Date.now() + 1), from: "bot", text: replyText };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 1200);
  }

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close AI assistant" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, height: sheetHeight, marginBottom: keyboardHeight }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.avatarWrap, { backgroundColor: colors.accentSoft }]}>
                <Image source={decorativeAssets.teacherLessonCat} style={styles.avatarImage} resizeMode="contain" />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>AI Assistant</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Preview - full answers coming soon</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={() => {
                  onClose();
                  setTimeout(() => {
                    startWelcome();
                  }, 300);
                }}
                accessibilityRole="button"
                accessibilityLabel="Replay welcome animation"
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={onClose}
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
            {messages.map((message) => (
              <View
                key={message.id}
                style={[styles.bubbleRow, message.from === "user" ? styles.bubbleRowUser : styles.bubbleRowBot]}
              >
                {message.from === "bot" ? (
                  <Image source={decorativeAssets.teacherLessonCat} style={styles.bubbleAvatar} resizeMode="contain" />
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    message.from === "user"
                      ? { backgroundColor: colors.accent, borderBottomRightRadius: 4 }
                      : { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 4 },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: message.from === "user" ? colors.accentOn : colors.textPrimary }]}>
                    {message.text}
                  </Text>
                </View>
              </View>
            ))}
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
              onSubmitEditing={send}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: colors.accent },
                cardShadow,
                (!draft.trim() || pressed) && { opacity: pressedOpacity },
              ]}
              onPress={send}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="arrow-up" size={18} color={colors.accentOn} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(22, 15, 20, 0.48)" },
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
  bubbleAvatar: { width: 26, height: 26 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  typingRow: { flexDirection: "row", gap: 4, paddingVertical: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    borderWidth: 1,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 16,
    marginTop: 8,
  },
  input: { flex: 1, maxHeight: 100, fontSize: 14, fontWeight: "500", paddingVertical: 8 },
  sendButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
