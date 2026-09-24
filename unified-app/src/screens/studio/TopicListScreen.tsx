import { useCallback, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image, Modal, Keyboard, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { AnimatedHeight } from "../../components/AnimatedHeight";
import { api, Topic, Subject } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { capitalizeFirst } from "../../utils/text";
import { getRelativeDateLabel } from "../../utils/date";

type Props = NativeStackScreenProps<RootStackParamList, "TopicList">;

function displayClassName(className: string, sectionName: string) {
  return `${capitalizeFirst(className)} - ${capitalizeFirst(sectionName)}`;
}

export function TopicListScreen({ navigation, route }: Props) {
  const { classSectionId, className, sectionName } = route.params;
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const keyboardHeight = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

  const [schoolSubjects, setSchoolSubjects] = useState<Subject[]>([]);
  const [showNewTopicSubjectPicker, setShowNewTopicSubjectPicker] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState("");
  const nameInputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Keyboard continuity between the two steps. The keyboard only stays up
  // while some text field is focused, and Android drops it the instant a
  // focused field is hidden or removed. So both steps stay mounted and laid
  // out for the whole life of the sheet (the inactive one is just invisible),
  // and focus is handed directly from one field to the other BEFORE the swap
  // - a field-to-field focus move never closes the keyboard.
  function openSubjectStep() {
    if (nameInputRef.current?.isFocused() || Keyboard.isVisible()) searchInputRef.current?.focus();
    setSubjectQuery("");
    setShowNewTopicSubjectPicker(true);
  }

  function closeSubjectStep() {
    if (searchInputRef.current?.isFocused() || Keyboard.isVisible()) nameInputRef.current?.focus();
    setShowNewTopicSubjectPicker(false);
  }

  // With the keyboard up the list gets less room, so the sheet (header +
  // search + list) still fits between the keyboard and the status bar.
  const subjectListMaxHeight = Math.round(
    keyboardHeight > 0 ? Math.max(150, Math.min(windowHeight * 0.5, windowHeight - keyboardHeight - 300)) : windowHeight * 0.5
  );

  const filteredSubjects = subjectQuery.trim()
    ? schoolSubjects.filter((s) => s.name.toLowerCase().includes(subjectQuery.trim().toLowerCase()))
    : schoolSubjects;

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
      const topic = await api.createTopic(accessToken, { classSectionId, subject: subject.trim(), name: name.trim() });
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
              <Text style={[styles.subjectText, { color: colors.accent }]}>{subjectFilter ? capitalizeFirst(subjectFilter) : "All subjects"}</Text>
              {availableSubjects.length > 0 ? <Ionicons name="chevron-down" size={16} color={colors.accent} /> : null}
            </Pressable>
          </View>
        </View>

        <View style={styles.topicCountRow}>
          <Text style={[styles.topicCount, { color: colors.textMuted }]}>{displayedTopics.length} topic{displayedTopics.length === 1 ? "" : "s"}</Text>
          {subjectFilter ? (
            <Pressable
              style={({ pressed }) => [styles.attainmentReportButton, { borderColor: colors.accentSoftAlt }, pressed && { opacity: pressedOpacity }]}
              onPress={() => navigation.navigate("AttainmentReport", { classSectionId, subject: subjectFilter, className, sectionName })}
              accessibilityRole="button"
              accessibilityLabel="View attainment report for this subject"
            >
              <Ionicons name="bar-chart-outline" size={14} color={colors.accent} />
              <Text style={[styles.attainmentReportButtonText, { color: colors.accent }]}>Attainment report</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : topics.length === 0 ? (
          <View style={[styles.emptyTopics, { backgroundColor: colors.surface }, cardShadow]}>
            <Ionicons name="book-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyTopicsText, { color: colors.textMuted }]}>Your first topic will appear here.</Text>
          </View>
        ) : displayedTopics.length === 0 ? (
          <View style={[styles.emptyTopics, { backgroundColor: colors.surface }, cardShadow]}>
            <Ionicons name="filter-outline" size={22} color={colors.accent} />
            <Text style={[styles.emptyTopicsText, { color: colors.textMuted }]}>No topics for {capitalizeFirst(subjectFilter)}.</Text>
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
                <Text style={[styles.topicMeta, { color: colors.textMuted }]} numberOfLines={1}>{capitalizeFirst(topic.subject)} · {getRelativeDateLabel(topic.updatedAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.accent} />
            </Pressable>
          ))
        )}

      </ScrollView>

      <SheetModal
        visible={showNewTopic}
        onClose={() => {
          setShowNewTopic(false);
          setShowNewTopicSubjectPicker(false);
        }}
        closeLabel="Close new topic form"
        maxHeightRatio={0.88}
        sheetStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
      >
        {/* Height eases between the form and the subject step, and the
            incoming step fades/slides in (forward from the right, back from the left). */}
        <AnimatedHeight contentKey={showNewTopicSubjectPicker ? "subject" : "form"} direction={showNewTopicSubjectPicker ? 1 : -1}>
        {/* Subject step: swaps with the form inside the same sheet instead of
            stacking an overlay on top of it, so nothing darkens part of the
            sheet. Always mounted - see openSubjectStep for why. */}
          <View
            style={showNewTopicSubjectPicker ? undefined : styles.hiddenLaidOut}
            pointerEvents={showNewTopicSubjectPicker ? "auto" : "none"}
            importantForAccessibility={showNewTopicSubjectPicker ? "auto" : "no-hide-descendants"}
            accessibilityElementsHidden={!showNewTopicSubjectPicker}
          >
            <View style={styles.stepHeader}>
              <Pressable
                style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surfaceRaised }, pressed && { opacity: pressedOpacity }]}
                onPress={closeSubjectStep}
                accessibilityRole="button"
                accessibilityLabel="Back to new topic form"
              >
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </Pressable>
              <View style={styles.stepHeaderCopy}>
                <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Choose subject</Text>
                <Text style={[styles.stepSubtitle, { color: colors.textMuted }]}>
                  {schoolSubjects.length === 0
                    ? "Your school hasn't added subjects yet."
                    : `${schoolSubjects.length} subject${schoolSubjects.length === 1 ? "" : "s"} available`}
                </Text>
              </View>
            </View>

            {/* Always present when there are subjects: it's the field the
                keyboard's focus moves to while this step is open. */}
            {schoolSubjects.length > 0 ? (
              <View style={[styles.searchWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Ionicons name="search" size={17} color={colors.textMuted} />
                <TextInput
                  ref={searchInputRef}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  value={subjectQuery}
                  onChangeText={setSubjectQuery}
                  placeholder="Search subjects"
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {subjectQuery ? (
                  <Pressable onPress={() => setSubjectQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {schoolSubjects.length === 0 ? (
              <View style={[styles.subjectEmpty, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="library-outline" size={22} color={colors.textMuted} />
                <Text style={[styles.subjectEmptyText, { color: colors.textMuted }]}>Ask your school admin to add subjects, then try again.</Text>
              </View>
            ) : filteredSubjects.length === 0 ? (
              <Text style={[styles.subjectNoMatch, { color: colors.textMuted }]}>No subjects match "{subjectQuery.trim()}".</Text>
            ) : (
              <ScrollView
                style={[styles.subjectList, { borderColor: colors.border, maxHeight: subjectListMaxHeight }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filteredSubjects.map((s, index) => {
                  const selected = subject === s.name;
                  return (
                    <Pressable
                      key={s.id}
                      style={({ pressed }) => [
                        styles.subjectRow,
                        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                        selected && { backgroundColor: colors.accentSoft },
                        pressed && { opacity: pressedOpacity },
                      ]}
                      onPress={() => {
                        setSubject(s.name);
                        closeSubjectStep();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[styles.subjectRowText, { color: selected ? colors.accent : colors.textPrimary }, selected && styles.subjectRowTextSelected]}
                        numberOfLines={1}
                      >
                        {capitalizeFirst(s.name)}
                      </Text>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

        {/* Hidden (not display:none) while choosing a subject: it stays laid
            out, so its text field can still take focus - see closeSubjectStep.
            Absolute, so it doesn't count toward the sheet's measured height. */}
        <View
          style={showNewTopicSubjectPicker ? styles.hiddenLaidOut : undefined}
          pointerEvents={showNewTopicSubjectPicker ? "none" : "auto"}
          importantForAccessibility={showNewTopicSubjectPicker ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={showNewTopicSubjectPicker}
        >
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
            ref={nameInputRef}
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
                onPress={openSubjectStep}
                accessibilityRole="button"
                accessibilityLabel="Choose subject"
              >
                <Text style={[styles.subjectInput, { color: subject ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
                  {subject ? capitalizeFirst(subject) : "Select subject"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.accent} />
              </Pressable>
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
        </AnimatedHeight>
      </SheetModal>

      <SheetModal
        visible={showSubjectPicker}
        onClose={() => setShowSubjectPicker(false)}
        closeLabel="Close subject filter"
        maxHeightRatio={0.65}
      >
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
              <Text style={[styles.pickerRowText, { color: subjectFilter === s ? colors.accent : colors.textPrimary }]}>{capitalizeFirst(s)}</Text>
              {subjectFilter === s ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </SheetModal>
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
  topicCountRow: { marginTop: 18, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topicCount: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2, textTransform: "uppercase" },
  attainmentReportButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30, paddingHorizontal: 11, borderWidth: 1, borderRadius: 15 },
  attainmentReportButtonText: { fontSize: 11, fontWeight: "800" },
  error: { textAlign: "center", marginBottom: 12, fontSize: 13 },
  loader: { marginVertical: 28 },
  emptyTopics: { minHeight: 80, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: radius.lg, paddingHorizontal: 20, marginBottom: 18 },
  emptyTopicsText: { fontSize: 14, fontWeight: "500" },
  topicCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, paddingVertical: 13, paddingLeft: 14, paddingRight: 12, marginBottom: 10 },
  topicNumber: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  topicNumberText: { fontSize: 14, fontWeight: "800" },
  topicCopy: { flex: 1, paddingRight: 4 },
  topicName: { fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: -0.2 },
  topicMeta: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(22, 15, 20, 0.48)" },
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
  subjectInputWrap: { height: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingLeft: 14, paddingRight: 12 },
  subjectInput: { flex: 1, height: "100%", fontSize: 14, fontWeight: "500", textAlignVertical: "center" },
  startButton: { height: 56, alignItems: "center", justifyContent: "center", borderRadius: 12, marginTop: 20 },
  startButtonText: { fontSize: 16, fontWeight: "800" },
  hiddenLaidOut: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  stepHeaderCopy: { flex: 1 },
  stepTitle: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.4 },
  stepSubtitle: { marginTop: 1, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  searchWrap: { height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, height: "100%", fontSize: 14, fontWeight: "500", paddingVertical: 0 },
  subjectList: { flexGrow: 0, borderWidth: 1, borderRadius: 14 },
  subjectRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16 },
  subjectRowText: { flex: 1, fontSize: 15, fontWeight: "600" },
  subjectRowTextSelected: { fontWeight: "800" },
  subjectEmpty: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, padding: 16 },
  subjectEmptyText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  subjectNoMatch: { textAlign: "center", fontSize: 13, fontWeight: "500", paddingVertical: 20 },
  pickerSheetScroll: { flexGrow: 0 },
  pickerTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  pickerRowText: { fontSize: 15, fontWeight: "600" },
});
