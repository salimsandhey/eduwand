import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { Screen } from "../../components/Screen";
import { api, ClassSection, StudentStub, CommunicationMessage } from "../../api/client";

type Section = "student" | "class" | "weekly";

// Communication Hub (client doc section 7) - three channels: teacher-to-
// student, teacher-to-class, and the automatic weekly parent update (preview
// + hold only, since delivery is unresolved - PRD Q-08 gap).
export function CommunicationHubScreen() {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [section, setSection] = useState<Section>("student");
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [classSectionId, setClassSectionId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [thread, setThread] = useState<CommunicationMessage[]>([]);
  const [classMessages, setClassMessages] = useState<CommunicationMessage[]>([]);
  const [pendingUpdates, setPendingUpdates] = useState<CommunicationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listClassSections(accessToken)
      .then((sections) => {
        setClassSections(sections);
        if (sections.length > 0) setClassSectionId(sections[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load classes"));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !classSectionId) return;
    api
      .listStudents(accessToken, classSectionId)
      .then((res) => {
        const list = res.data ?? [];
        setStudents(list);
        setStudentId(list[0]?.id ?? null);
      })
      .catch(() => {});
  }, [accessToken, classSectionId]);

  const loadThread = useCallback(async () => {
    if (!accessToken || !studentId) return;
    try {
      setThread(await api.listCommunicationsWithStudent(accessToken, studentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
    }
  }, [accessToken, studentId]);

  const loadClassMessages = useCallback(async () => {
    if (!accessToken || !classSectionId) return;
    try {
      setClassMessages(await api.listCommunicationsForClass(accessToken, classSectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load class messages");
    }
  }, [accessToken, classSectionId]);

  const loadPending = useCallback(async () => {
    if (!accessToken) return;
    try {
      setPendingUpdates(await api.listPendingParentUpdates(accessToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending updates");
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (section === "student") loadThread();
      if (section === "class") loadClassMessages();
      if (section === "weekly") loadPending();
    }, [section, loadThread, loadClassMessages, loadPending])
  );

  async function send() {
    if (!accessToken || !draft.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      if (section === "student" && studentId) {
        await api.sendCommunicationToStudent(accessToken, { studentStubId: studentId, body: draft.trim() });
        setDraft("");
        loadThread();
      } else if (section === "class" && classSectionId) {
        await api.sendCommunicationToClass(accessToken, { classSectionId, body: draft.trim() });
        setDraft("");
        loadClassMessages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }

  async function hold(id: string) {
    if (!accessToken) return;
    setError(null);
    try {
      await api.holdParentUpdate(accessToken, id);
      loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hold update");
    }
  }

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.textPrimary }]}>Communication Hub</Text>

        <View style={styles.tabRow}>
          {(["student", "class", "weekly"] as Section[]).map((s) => {
            const active = section === s;
            const label = s === "student" ? "To student" : s === "class" ? "To class" : "Weekly updates";
            return (
              <Pressable
                key={s}
                style={({ pressed }) => [
                  styles.tab,
                  { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                  pressed && { opacity: pressedOpacity },
                ]}
                onPress={() => setSection(s)}
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {section !== "weekly" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Class</Text>
            <View style={styles.chipRow}>
              {classSections.map((cs) => {
                const active = classSectionId === cs.id;
                return (
                  <Pressable
                    key={cs.id}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                      pressed && { opacity: pressedOpacity },
                    ]}
                    onPress={() => setClassSectionId(cs.id)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>
                      {cs.className} {cs.sectionName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {section === "student" ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Student</Text>
                <View style={styles.chipRow}>
                  {students.map((s) => {
                    const active = studentId === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        style={({ pressed }) => [
                          styles.chip,
                          { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
                          pressed && { opacity: pressedOpacity },
                        ]}
                        onPress={() => setStudentId(s.id)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textSecondary }]}>{s.fullName}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {thread.map((m) => (
                  <View key={m.id} style={[styles.messageBubble, m.channel === "student_to_teacher" ? { alignSelf: "flex-start", backgroundColor: colors.surfaceRaised } : { alignSelf: "flex-end", backgroundColor: colors.accent + "20" }]}>
                    <Text style={[styles.messageText, { color: colors.textPrimary }]}>{m.body}</Text>
                    <Text style={[styles.messageMeta, { color: colors.textMuted }]}>{new Date(m.createdAt).toLocaleString()}</Text>
                  </View>
                ))}
              </>
            ) : (
              classMessages.map((m) => (
                <View key={m.id} style={[styles.messageBubble, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.messageText, { color: colors.textPrimary }]}>{m.body}</Text>
                  <Text style={[styles.messageMeta, { color: colors.textMuted }]}>{new Date(m.createdAt).toLocaleString()}</Text>
                </View>
              ))
            )}

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.accent }, (isSending || !draft.trim() || pressed) && { opacity: pressedOpacity }]}
              onPress={send}
              disabled={isSending || !draft.trim()}
              accessibilityRole="button"
            >
              {isSending ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.sendButtonText, { color: colors.accentOn }]}>Send</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
            <Text style={[styles.meta, { color: colors.textMuted, marginBottom: 8 }]}>
              Automatic weekly parent updates are assembled here but not yet sent - the delivery channel (SMS/email) hasn't been confirmed.
              Review and hold any you don't want to send once that's wired up.
            </Text>
            {pendingUpdates.length === 0 ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>No pending updates.</Text>
            ) : (
              pendingUpdates.map((m) => (
                <View key={m.id} style={[styles.listRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.messageText, { color: colors.textPrimary }]}>{m.body}</Text>
                    <Text style={[styles.messageMeta, { color: colors.textMuted }]}>{new Date(m.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Pressable onPress={() => hold(m.id)} accessibilityRole="button">
                    <Ionicons name="pause-circle-outline" size={22} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginBottom: 12 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  tabText: { fontSize: 12, fontWeight: "700" },
  error: { textAlign: "center", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  label: { fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 4 },
  meta: { fontSize: 12, lineHeight: 17 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  messageBubble: { borderRadius: 12, padding: 10, marginTop: 10, maxWidth: "85%" },
  messageText: { fontSize: 13 },
  messageMeta: { fontSize: 10, marginTop: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, fontSize: 13, marginTop: 14 },
  sendButton: { borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center", marginTop: 10 },
  sendButtonText: { fontSize: 13, fontWeight: "700" },
});
