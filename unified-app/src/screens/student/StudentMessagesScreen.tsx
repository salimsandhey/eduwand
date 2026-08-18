import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, CommunicationMessage } from "../../api/client";

// FloatingTabBar.tsx's own numbers (it's absolutely positioned, so it doesn't
// reserve layout space for anyone): bottom offset is Math.max(insets.bottom, 10),
// bar height is 68. A fixed footer like the composer below only needs to clear
// that exactly, plus a small gap - unlike a *scrollable* list's paddingBottom
// (the 132 every sibling student screen uses), which deliberately wants a much
// more generous buffer at the end of scrollable content. Reusing that 132 here
// was wrong: it left a large, obviously-too-big empty gap between the composer
// and the tab bar. This computes the real clearance instead of guessing.
const TAB_BAR_HEIGHT = 68;
const COMPOSER_GAP = 12;

// "Reach out to the teacher" (client doc section 5) - routed through the
// Communication Hub. No teacher-picker: a student's messages go to whichever
// teacher(s) read their class's thread (see student-portal.ts's note on
// student_to_teacher routing by class section, not a named teacher).
export function StudentMessagesScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const tabBarClearance = Math.max(insets.bottom, 10) + TAB_BAR_HEIGHT + COMPOSER_GAP;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setMessages(await api.listStudentCommunications(accessToken));
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

  async function send() {
    if (!accessToken || !draft.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await api.sendStudentCommunication(accessToken, draft.trim());
      setDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {messages.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No messages yet - say hello to your teacher.</Text>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageBubble,
                    { backgroundColor: colors.surfaceRaised },
                    m.channel === "student_to_teacher" ? { alignSelf: "flex-end", backgroundColor: colors.accent + "20" } : { alignSelf: "flex-start" },
                  ]}
                >
                  <Text style={[styles.messageText, { color: colors.textPrimary }]}>{m.body}</Text>
                  <Text style={[styles.messageMeta, { color: colors.textMuted }]}>{new Date(m.createdAt).toLocaleString()}</Text>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: keyboardVisible ? 0 : tabBarClearance },
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
          />
          <Pressable
            style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.accent }, (isSending || !draft.trim() || pressed) && { opacity: pressedOpacity }]}
            onPress={send}
            disabled={isSending || !draft.trim()}
            accessibilityRole="button"
          >
            {isSending ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Text style={[styles.sendButtonText, { color: colors.accentOn }]}>Send</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 20 },
  empty: { textAlign: "center", marginTop: 40 },
  error: { textAlign: "center", marginBottom: 8 },
  messageBubble: { borderRadius: 12, padding: 10, marginBottom: 10, maxWidth: "85%" },
  messageText: { fontSize: 13 },
  messageMeta: { fontSize: 10, marginTop: 4 },
  // marginBottom (tab-bar clearance) is applied inline, conditional on keyboardVisible - see tabBarClearance above.
  composer: { flexDirection: "row", gap: 8, alignItems: "flex-end", borderTopWidth: 1, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 40, maxHeight: 100, fontSize: 13 },
  sendButton: { borderRadius: 8, height: 40, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  sendButtonText: { fontSize: 13, fontWeight: "700" },
});
