import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, Topic, Subject } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

const BOARDS = ["CBSE", "ICSE", "IB"];

type Props = NativeStackScreenProps<RootStackParamList, "TopicList">;

function displayClassName(className: string, sectionName: string) {
  return `${className} - ${sectionName}`;
}

function getUpdatedLabel(updatedAt: string) {
  const updated = new Date(updatedAt);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const updatedStart = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime();
  const dayDifference = Math.round((todayStart - updatedStart) / 86_400_000);

  if (dayDifference <= 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  if (dayDifference < 7) return `${dayDifference} days ago`;
  return updated.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Topics are scoped to the selected class section. The redesigned view keeps the
// same create-and-open flow while presenting it as a focused teacher workspace.
export function TopicListScreen({ navigation, route }: Props) {
  const { classSectionId, className, sectionName } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [isCreating, setIsCreating] = useState(false);

  // A class section has no single subject (multiple teachers can teach the
  // same class for different subjects) - so this filters the real, possibly-
  // varying subjects actually present across this class's topics, client-side
  // (topic counts per class are small - no need for a server round trip).
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

  // The real gateway for "New topic"'s Subject field - admin-managed per
  // school (backend/src/routes/subjects.ts), a closed picker, no free text -
  // same "fixed set" pattern BOARDS already is.
  const [schoolSubjects, setSchoolSubjects] = useState<Subject[]>([]);
  const [showNewTopicSubjectPicker, setShowNewTopicSubjectPicker] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [topicList, subjectList] = await Promise.all([
        api.listTopics(accessToken, { classSectionId }),
        api.listSubjects(accessToken),
      ]);
      setTopics(topicList);
      setSchoolSubjects(subjectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topics");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, classSectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function createTopic() {
    if (!accessToken || !name.trim() || !subject.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const topic = await api.createTopic(accessToken, { classSectionId, subject: subject.trim(), name: name.trim(), board });
      setShowNewTopic(false);
      setName("");
      navigation.navigate("TopicDetail", { topicId: topic.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    } finally {
      setIsCreating(false);
    }
  }

  const availableSubjects = Array.from(new Set(topics.map((t) => t.subject))).sort();
  const displayedTopics = subjectFilter ? topics.filter((t) => t.subject === subjectFilter) : topics;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back to classes"
          >
            <Ionicons name="arrow-back" size={23} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Studio</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setSubject(subjectFilter ?? "");
              setShowNewTopic(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add a new topic"
          >
            <Ionicons name="add" size={24} color={colors.accentOn} />
          </Pressable>
        </View>

        <View style={styles.heroSection}>
          <View pointerEvents="none" style={styles.heroImageWrap}>
            <Image source={decorativeAssets.studioTeacher} style={styles.heroImage} resizeMode="contain" />
          </View>
          <Text style={[styles.classTitle, { color: colors.textPrimary }]}>{displayClassName(className, sectionName)}</Text>
          <Pressable
            style={({ pressed }) => [styles.subjectRow, pressed && availableSubjects.length > 0 && { opacity: pressedOpacity }]}
            onPress={() => availableSubjects.length > 0 && setShowSubjectPicker(true)}
            disabled={availableSubjects.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Filter topics by subject"
          >
            <Text style={[styles.subjectText, { color: colors.textMuted }]}>{subjectFilter ?? "All subjects"}</Text>
            {availableSubjects.length > 0 ? <Ionicons name="chevron-down" size={17} color={colors.accent} /> : null}
          </Pressable>
        </View>

        <View style={styles.topicIntro}>
          <Text style={[styles.topicHeading, { color: colors.textPrimary }]}>Topics</Text>
          <Text style={[styles.topicDescription, { color: colors.textMuted }]}>Continue a topic or start something new.</Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : topics.length === 0 ? (
          <View style={[styles.emptyTopics, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="book-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyTopicsText, { color: colors.textMuted }]}>Your first topic will appear here.</Text>
          </View>
        ) : displayedTopics.length === 0 ? (
          <View style={[styles.emptyTopics, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="filter-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyTopicsText, { color: colors.textMuted }]}>No topics for {subjectFilter}.</Text>
          </View>
        ) : (
          displayedTopics.map((topic, index) => (
            <Pressable
              key={topic.id}
              style={({ pressed }) => [styles.topicCard, { backgroundColor: colors.surface }, cardShadow, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.navigate("TopicDetail", { topicId: topic.id })}
              accessibilityRole="button"
            >
              {index === 0 ? <View style={[styles.firstTopicRail, { backgroundColor: colors.accent }]} /> : null}
              <View style={[styles.topicNumber, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.topicNumberText, { color: colors.accent }]}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={styles.topicCopy}>
                <Text style={[styles.topicName, { color: colors.textPrimary }]} numberOfLines={2}>{topic.name}</Text>
                <Text style={[styles.topicMeta, { color: colors.textMuted }]} numberOfLines={1}>{topic.subject}  /  {topic.board}</Text>
                <View style={styles.updatedRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.updatedText, { color: colors.textMuted }]}>Last updated</Text>
                  <Text style={[styles.updatedValue, { color: colors.accent }]}>{getUpdatedLabel(topic.updatedAt)}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.accent} />
            </Pressable>
          ))
        )}

      </ScrollView>

      <Modal transparent animationType="slide" visible={showNewTopic} onRequestClose={() => setShowNewTopic(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowNewTopic(false)} accessibilityRole="button" accessibilityLabel="Close new topic form" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New topic</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>Set up a topic for {displayClassName(className, sectionName)}.</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={() => setShowNewTopic(false)}
                accessibilityRole="button"
                accessibilityLabel="Close new topic form"
              >
                <Ionicons name="close" size={21} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Topic name</Text>
              <TextInput
                style={[styles.topicInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
                value={name}
                onChangeText={setName}
                placeholder="Enter topic name"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              <View style={styles.formRow}>
                <View style={styles.subjectField}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Subject</Text>
                  <Pressable
                    style={[styles.subjectInputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                    onPress={() => setShowNewTopicSubjectPicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Choose subject"
                  >
                    <Text style={[styles.subjectInput, { color: subject ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
                      {subject || "Select subject"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.accent} />
                  </Pressable>
                </View>
                <View style={styles.boardField}>
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Board</Text>
                  <View style={[styles.boardSwitch, { borderColor: colors.border }]}>
                    {BOARDS.map((option) => {
                      const isActive = board === option;
                      return (
                        <Pressable
                          key={option}
                          style={({ pressed }) => [styles.boardOption, isActive && { backgroundColor: colors.accentSoft }, pressed && { opacity: pressedOpacity }]}
                          onPress={() => setBoard(option)}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.boardOptionText, { color: isActive ? colors.accent : colors.textMuted }]}>{option}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.startButton, { backgroundColor: colors.accent }, (isCreating || !name.trim() || !subject.trim() || pressed) && { opacity: pressedOpacity }]}
                onPress={createTopic}
                disabled={isCreating || !name.trim() || !subject.trim()}
                accessibilityRole="button"
              >
                {isCreating ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.startButtonText, { color: colors.accentOn }]}>Start topic</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent animationType="fade" visible={showSubjectPicker} onRequestClose={() => setShowSubjectPicker(false)}>
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setShowSubjectPicker(false)}
          accessibilityRole="button"
          accessibilityLabel="Close subject filter"
        >
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Filter by subject</Text>
            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: pressedOpacity }]}
              onPress={() => {
                setSubjectFilter(null);
                setShowSubjectPicker(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.pickerRowText, { color: subjectFilter === null ? colors.accent : colors.textPrimary }]}>All subjects</Text>
              {subjectFilter === null ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </Pressable>
            {availableSubjects.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [styles.pickerRow, pressed && { opacity: pressedOpacity }]}
                onPress={() => {
                  setSubjectFilter(s);
                  setShowSubjectPicker(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.pickerRowText, { color: subjectFilter === s ? colors.accent : colors.textPrimary }]}>{s}</Text>
                {subjectFilter === s ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent animationType="fade" visible={showNewTopicSubjectPicker} onRequestClose={() => setShowNewTopicSubjectPicker(false)}>
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setShowNewTopicSubjectPicker(false)}
          accessibilityRole="button"
          accessibilityLabel="Close subject picker"
        >
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Choose subject</Text>
            {schoolSubjects.length === 0 ? (
              <Text style={[styles.pickerRowText, { color: colors.textMuted, paddingVertical: 12 }]}>
                No subjects yet - ask your school admin to add one.
              </Text>
            ) : (
              schoolSubjects.map((s) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [styles.pickerRow, pressed && { opacity: pressedOpacity }]}
                  onPress={() => {
                    setSubject(s.name);
                    setShowNewTopicSubjectPicker(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.pickerRowText, { color: subject === s.name ? colors.accent : colors.textPrimary }]}>{s.name}</Text>
                  {subject === s.name ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  topBar: { height: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarTitle: { marginLeft: 16, flex: 1, fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  heroSection: { position: "relative", minHeight: 124, justifyContent: "flex-end", paddingBottom: 14 },
  heroImageWrap: { position: "absolute", right: -8, top: -2, width: 150, height: 150 },
  heroImage: { width: "100%", height: "100%" },
  classTitle: { fontSize: 28, lineHeight: 35, fontWeight: "800", letterSpacing: -0.8, maxWidth: "62%" },
  subjectRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  subjectText: { fontSize: 16, fontWeight: "500" },
  topicIntro: { marginTop: 4, marginBottom: 24 },
  topicHeading: { fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.5 },
  topicDescription: { marginTop: 1, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  error: { textAlign: "center", marginBottom: 12, fontSize: 13 },
  loader: { marginVertical: 28 },
  emptyTopics: { minHeight: 80, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 20, marginBottom: 18 },
  emptyTopicsText: { fontSize: 14, fontWeight: "500" },
  topicCard: { position: "relative", minHeight: 118, flexDirection: "row", alignItems: "center", gap: 16, borderRadius: radius.lg, paddingVertical: 16, paddingLeft: 20, paddingRight: 14, marginBottom: 18, overflow: "hidden" },
  firstTopicRail: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  topicNumber: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  topicNumberText: { fontSize: 16, fontWeight: "800" },
  topicCopy: { flex: 1 },
  topicName: { fontSize: 17, lineHeight: 24, fontWeight: "800", letterSpacing: -0.3 },
  topicMeta: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  updatedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  updatedText: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  updatedValue: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(22, 15, 20, 0.48)" },
  modalSheet: { maxHeight: "78%", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 28 },
  modalHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  modalTitle: { fontSize: 25, lineHeight: 31, fontWeight: "800", letterSpacing: -0.5 },
  modalSubtitle: { marginTop: 3, maxWidth: 260, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalContent: { paddingBottom: 4 },
  fieldLabel: { marginTop: 18, marginBottom: 6, fontSize: 13, fontWeight: "500" },
  topicInput: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 14, fontWeight: "500" },
  formRow: { flexDirection: "row", gap: 16 },
  subjectField: { flex: 1 },
  boardField: { flex: 1.02 },
  subjectInputWrap: { height: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingLeft: 14, paddingRight: 12 },
  subjectInput: { flex: 1, height: "100%", fontSize: 14, fontWeight: "500" },
  boardSwitch: { height: 44, flexDirection: "row", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  boardOption: { flex: 1, alignItems: "center", justifyContent: "center" },
  boardOptionText: { fontSize: 11, fontWeight: "700" },
  startButton: { height: 56, alignItems: "center", justifyContent: "center", borderRadius: 12, marginTop: 20 },
  startButtonText: { fontSize: 16, fontWeight: "800" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(22, 15, 20, 0.48)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { width: "100%", maxWidth: 340, borderRadius: radius.lg, padding: 16 },
  pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  pickerRowText: { fontSize: 15, fontWeight: "600" },
});
