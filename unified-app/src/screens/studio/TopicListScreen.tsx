import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal } from "react-native";
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
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { capitalizeFirst } from "../../utils/text";

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

export function TopicListScreen({ navigation, route }: Props) {
  const { classSectionId, className, sectionName } = route.params;
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [board, setBoard] = useState(BOARDS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

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
          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Topics</Text>
          <Pressable
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, marginRight: 8 }, pressed && { opacity: pressedOpacity }]}
            onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <Ionicons name="home-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addButton, { backgroundColor: colors.accent }, cardShadow, pressed && { opacity: pressedOpacity }]}
            onPress={() => {
              setSubject(subjectFilter ?? "");
              setShowNewTopicSubjectPicker(false);
              setShowNewTopic(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add a new topic"
          >
            <Ionicons name="add" size={24} color={colors.accentOn} />
          </Pressable>
        </View>

        <View style={[styles.classContext, { backgroundColor: colors.accent }]}>
          <Image source={decorativeAssets.book} style={styles.classContextArtwork} resizeMode="contain" />
          <View style={styles.classContextCopy}>
            <Text style={styles.classContextLabel}>CLASS</Text>
            <Text style={styles.classTitle}>{displayClassName(className, sectionName)}</Text>
            <Text style={styles.classContextSubtitle}>Browse and build lessons for this class.</Text>
            <Pressable
              style={({ pressed }) => [styles.subjectFilter, pressed && availableSubjects.length > 0 && { opacity: pressedOpacity }]}
              onPress={() => availableSubjects.length > 0 && setShowSubjectPicker(true)}
              disabled={availableSubjects.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Filter topics by subject"
            >
              <Text style={[styles.subjectText, { color: colors.accent }]}>{subjectFilter ?? "All subjects"}</Text>
              {availableSubjects.length > 0 ? <Ionicons name="chevron-down" size={16} color={colors.accent} /> : null}
            </Pressable>
          </View>
        </View>

        <Text style={[styles.topicCount, { color: colors.textMuted }]}>{displayedTopics.length} topic{displayedTopics.length === 1 ? "" : "s"}</Text>

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
              <View style={[styles.topicNumber, { backgroundColor: colors.accentSoft }]}>
                <Text style={[styles.topicNumberText, { color: colors.accent }]}>{String(index + 1).padStart(2, "0")}</Text>
              </View>
              <View style={styles.topicCopy}>
                <Text style={[styles.topicName, { color: colors.textPrimary }]} numberOfLines={2}>{capitalizeFirst(topic.name)}</Text>
                <Text style={[styles.topicMeta, { color: colors.textMuted }]} numberOfLines={1}>{topic.subject} · {topic.board} · {getUpdatedLabel(topic.updatedAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.accent} />
            </Pressable>
          ))
        )}

      </ScrollView>

      <Modal transparent animationType="slide" visible={showNewTopic} onRequestClose={() => setShowNewTopic(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowNewTopic(false)} accessibilityRole="button" accessibilityLabel="Close new topic form" />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, marginBottom: keyboardHeight }]}>
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
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={showNewTopicSubjectPicker} onRequestClose={() => setShowNewTopicSubjectPicker(false)}>
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setShowNewTopicSubjectPicker(false)}
          accessibilityRole="button"
          accessibilityLabel="Close subject picker"
        >
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Select subject</Text>
            {schoolSubjects.length === 0 ? (
              <Text style={[styles.pickerRowText, { color: colors.textMuted, paddingVertical: 10 }]}>
                No subjects yet - ask your school admin to add one.
              </Text>
            ) : (
              <ScrollView style={styles.pickerSheetScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {schoolSubjects.map((s) => (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [styles.pickerRow, pressed && { opacity: pressedOpacity }]}
                    onPress={() => {
                      setSubject(s.name);
                      setShowNewTopicSubjectPicker(false);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.pickerRowText, { color: subject === s.name ? colors.accent : colors.textPrimary }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {subject === s.name ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
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
            <ScrollView style={styles.pickerSheetScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 132 },
  topBar: { height: 48, flexDirection: "row", alignItems: "center" },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  topBarTitle: { marginLeft: 12, flex: 1, fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.45 },
  addButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  classContext: { position: "relative", minHeight: 116, marginTop: 14, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, overflow: "hidden" },
  classContextCopy: { maxWidth: "69%", zIndex: 1 },
  classContextArtwork: { position: "absolute", right: -8, bottom: -10, width: 122, height: 122, opacity: 0.96 },
  classContextLabel: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  classTitle: { marginTop: 2, color: "#FFFFFF", fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.4 },
  classContextSubtitle: { marginTop: 2, color: "rgba(255,255,255,0.82)", fontSize: 11, lineHeight: 16, fontWeight: "600" },
  subjectFilter: { alignSelf: "flex-start", height: 30, flexDirection: "row", alignItems: "center", gap: 4, marginTop: 9, borderRadius: 15, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.94)" },
  subjectText: { fontSize: 12, fontWeight: "700" },
  topicCount: { marginTop: 18, marginBottom: 10, fontSize: 12, fontWeight: "700", letterSpacing: 0.2, textTransform: "uppercase" },
  error: { textAlign: "center", marginBottom: 12, fontSize: 13 },
  loader: { marginVertical: 28 },
  emptyTopics: { minHeight: 80, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 20, marginBottom: 18 },
  emptyTopicsText: { fontSize: 14, fontWeight: "500" },
  topicCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, paddingVertical: 13, paddingLeft: 14, paddingRight: 12, marginBottom: 10 },
  topicNumber: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  topicNumberText: { fontSize: 14, fontWeight: "800" },
  topicCopy: { flex: 1, paddingRight: 4 },
  topicName: { fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: -0.2 },
  topicMeta: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: "600" },
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
  subjectInput: { flex: 1, height: "100%", fontSize: 14, fontWeight: "500", textAlignVertical: "center" },
  boardSwitch: { height: 44, flexDirection: "row", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  boardOption: { flex: 1, alignItems: "center", justifyContent: "center" },
  boardOptionText: { fontSize: 11, fontWeight: "700" },
  startButton: { height: 56, alignItems: "center", justifyContent: "center", borderRadius: 12, marginTop: 20 },
  startButtonText: { fontSize: 16, fontWeight: "800" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(22, 15, 20, 0.48)", justifyContent: "center", alignItems: "center", padding: 24 },
  pickerSheet: { width: "100%", maxWidth: 340, maxHeight: "70%", borderRadius: radius.lg, padding: 16 },
  pickerSheetScroll: { flexGrow: 0 },
  pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  pickerRowText: { fontSize: 15, fontWeight: "600" },
});
