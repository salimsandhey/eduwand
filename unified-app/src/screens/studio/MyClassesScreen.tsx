import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius, softCardShadow } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { ClassOptionsSheet, DeletedClassesSheet } from "../../components/ClassDeleteSheets";
import { FieldError } from "../../components/FieldError";
import { useFormErrors } from "../../hooks/useForm";
import { rules } from "../../utils/validation";
import { api, ClassSection, Subject } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";
import { getRelativeDateLabel } from "../../utils/date";
import { capitalizeFirst } from "../../utils/text";
import { useTabBarClearance } from "../../navigation/useTabBarClearance";
import { useTabBarScrollHandler } from "../../navigation/TabBarScrollContext";

type Props = CompositeScreenProps<BottomTabScreenProps<TeacherTabParamList, "Studio">, NativeStackScreenProps<RootStackParamList>>;

const CLASS_CARD_ACCENTS = ["#8B5CF6", "#4F8EF7", "#3DDC97", "#F2A93B", "#F4739C"] as const;
const CLASS_FOLDER_GRAPHICS = [
  decorativeAssets.classBooks,
  decorativeAssets.classPaperPlane,
  decorativeAssets.classBookmark,
  decorativeAssets.classPencilCup,
  decorativeAssets.classNotebook,
] as const;

interface ClassCardStats {
  studentCount: number;
  topicCount: number;
  lastActivityAt: string | null;
}

function getClassCardMeta(index: number) {
  return {
    accent: CLASS_CARD_ACCENTS[index % CLASS_CARD_ACCENTS.length],
    graphic: CLASS_FOLDER_GRAPHICS[index % CLASS_FOLDER_GRAPHICS.length],
  };
}

export function MyClassesScreen({ navigation }: Props) {
  const { user, accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const tabBarClearance = useTabBarClearance();
  const handleTabBarScroll = useTabBarScrollHandler();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classStats, setClassStats] = useState<Record<string, ClassCardStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClassName, setExpandedClassName] = useState<string | null>(null);

  // Individual accounts get a fixed number of free class slots (default 2 -
  // see backend/src/lib/limits.ts). Onboarding's CreateFirstClassScreen only
  // ever shows once (MyClassesScreen's own empty-state below), so a teacher
  // who created just 1 of their 2 slots had no way back in to claim the
  // 2nd - this modal is that way back in, shown only while still under limit.
  const [classLimit, setClassLimit] = useState<number | null>(null);
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [addClassError, setAddClassError] = useState<string | null>(null);
  // Rules mirror backend/src/lib/validation.ts. The duplicate check covers the
  // classes already loaded on this screen; the server re-checks it.
  const addClassV = useFormErrors(
    { className: newClassName, sectionName: newSectionName },
    {
      className: rules.label("Class name"),
      sectionName: (value) =>
        rules.label("Section name")(value) ??
        (classSections.some(
          (c) =>
            c.className.trim().toLowerCase() === newClassName.trim().toLowerCase() && c.sectionName.trim().toLowerCase() === value.trim().toLowerCase()
        )
          ? `${newClassName.trim()} ${value.trim()} already exists`
          : null),
    }
  );

  // Same gap, same fix, for subjects - CreateFirstClassScreen sets up both
  // classes and subjects together, but is just as unreachable a second time,
  // so a teacher who added only 1 of their subject slots was equally stuck.
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectLimit, setSubjectLimit] = useState<number | null>(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [addSubjectError, setAddSubjectError] = useState<string | null>(null);
  const addSubjectV = useFormErrors(
    { name: newSubjectName },
    {
      name: (value) =>
        rules.label("Subject name")(value) ??
        (subjects.some((s) => s.name.trim().toLowerCase() === value.trim().toLowerCase()) ? "You already have this subject" : null),
    }
  );

  // Individual teachers own their workspace, so they can back up and delete
  // their own classes (backend: class-lifecycle.ts). Institutional teachers
  // can't - their school admin manages classes in the admin dashboard.
  const canManageClasses = user?.accountType === "individual" && !!user.schoolId;
  const [optionsClass, setOptionsClass] = useState<ClassSection | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const groupedClasses = useMemo(() => {
    const map = new Map<string, ClassSection[]>();
    for (const cs of classSections) {
      const list = map.get(cs.className) ?? [];
      list.push(cs);
      map.set(cs.className, list);
    }
    return Array.from(map.entries()).map(([className, sections]) => ({ className, sections }));
  }, [classSections]);

  // Only shown once the teacher already has at least 1 class - the true
  // first-ever class goes through CreateFirstClassScreen's empty-state
  // button below instead (it also sets up subjects, which this shortcut
  // deliberately skips since those are already configured by this point).
  const canAddAnotherClass =
    user?.accountType === "individual" && !isLoading && classSections.length > 0 && classLimit !== null && classSections.length < classLimit;
  const canAddAnotherSubject =
    user?.accountType === "individual" && !isLoading && subjects.length > 0 && subjectLimit !== null && subjects.length < subjectLimit;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);

      if (user?.accountType === "individual" && user.schoolId) {
        api
          .getSchoolLimits(accessToken, user.schoolId)
          .then((limits) => {
            setClassLimit(limits.classLimit);
            setSubjectLimit(limits.subjectLimit);
          })
          .catch(() => {});
        api.listSubjects(accessToken).then(setSubjects).catch(() => {});
      }

      const statsEntries = await Promise.all(
        sections.map(async (cs) => {
          const [studentsRes, topics] = await Promise.all([
            api.listStudents(accessToken, cs.id),
            api.listTopics(accessToken, { classSectionId: cs.id }),
          ]);
          const studentCount = studentsRes.data?.length ?? 0;
          const lastActivityAt = topics.reduce<string | null>((latest, topic) => {
            if (!latest || new Date(topic.updatedAt).getTime() > new Date(latest).getTime()) return topic.updatedAt;
            return latest;
          }, null);
          return [cs.id, { studentCount, topicCount: topics.length, lastActivityAt }] as const;
        })
      );
      setClassStats(Object.fromEntries(statsEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, user?.accountType, user?.schoolId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openAddClass() {
    setNewClassName("");
    setNewSectionName("");
    setAddClassError(null);
    addClassV.clear();
    setShowAddClass(true);
  }

  async function createAnotherClass() {
    if (!accessToken || !user?.schoolId) return;
    const className = newClassName.trim();
    const sectionName = newSectionName.trim();
    if (!addClassV.submit()) return;
    setIsCreatingClass(true);
    setAddClassError(null);
    try {
      const academicYears = await api.listAcademicYears(accessToken);
      const currentYear = academicYears.find((y) => y.isCurrent) ?? academicYears[0];
      if (!currentYear) throw new Error("No academic year found for this workspace");

      const classSection = await api.createClassSection(accessToken, user.schoolId, {
        academicYearId: currentYear.id,
        className,
        sectionName,
      });
      await api.assignTeacherToClassSection(accessToken, user.schoolId, classSection.id, user.id);

      setShowAddClass(false);
      load();
    } catch (err) {
      if (!addClassV.applyServerError(err)) setAddClassError(err instanceof Error ? err.message : "Failed to create class");
    } finally {
      setIsCreatingClass(false);
    }
  }

  function openAddSubject() {
    setNewSubjectName("");
    setAddSubjectError(null);
    addSubjectV.clear();
    setShowAddSubject(true);
  }

  async function createAnotherSubject() {
    if (!accessToken || !user?.schoolId) return;
    const name = newSubjectName.trim();
    if (!addSubjectV.submit()) return;
    setIsCreatingSubject(true);
    setAddSubjectError(null);
    try {
      await api.createSubject(accessToken, user.schoolId, { name });
      setShowAddSubject(false);
      load();
    } catch (err) {
      if (!addSubjectV.applyServerError(err)) setAddSubjectError(err instanceof Error ? err.message : "Failed to create subject");
    } finally {
      setIsCreatingSubject(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabBarScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [
              styles.circleButton,
              { backgroundColor: colors.surface, borderWidth: 0 },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back to home"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>

          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>My Classes</Text>
          <View style={[styles.topBarAccent, { backgroundColor: colors.accent }]} />

          {canManageClasses ? (
            <Pressable
              onPress={() => setShowDeleted(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.circleButton, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow, pressed && { opacity: pressedOpacity }]}
              accessibilityRole="button"
              accessibilityLabel="Recently deleted classes"
            >
              <Ionicons name="trash-bin-outline" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}

        </View>

        <View style={styles.classListHeader}>
          <Text style={[styles.classListLabelText, { color: colors.textMuted }]}>Class Folders</Text>
          <Text style={[styles.classCount, { color: colors.textMuted }]}>{groupedClasses.length} class{groupedClasses.length === 1 ? "" : "es"}</Text>
        </View>

        {canAddAnotherClass ? (
          <Pressable
            onPress={openAddClass}
            style={({ pressed }) => [styles.addClassRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={[styles.addClassRowText, { color: colors.accent }]}>
              Add another class ({classSections.length} of {classLimit} used)
            </Text>
          </Pressable>
        ) : null}

        {canAddAnotherSubject ? (
          <Pressable
            onPress={openAddSubject}
            style={({ pressed }) => [styles.addClassRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={[styles.addClassRowText, { color: colors.accent }]}>
              Add another subject ({subjects.length} of {subjectLimit} used)
            </Text>
          </Pressable>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : groupedClasses.length === 0 ? null : (
          <View style={styles.classList}>
            {groupedClasses.map((group, index) => {
              const meta = getClassCardMeta(index);
              const isMultiSection = group.sections.length > 1;
              const isExpanded = expandedClassName === group.className;
              const singleSection = group.sections[0];
              const singleStats = classStats[singleSection.id];
              const groupLastActivityAt = group.sections.reduce<string | null>((latest, section) => {
                const sectionActivity = classStats[section.id]?.lastActivityAt ?? null;
                if (!sectionActivity) return latest;
                if (!latest || new Date(sectionActivity).getTime() > new Date(latest).getTime()) return sectionActivity;
                return latest;
              }, null);

              let metaText: string;
              if (isMultiSection) {
                metaText = `${group.sections.length} sections`;
              } else if (singleStats) {
                metaText = `${singleStats.studentCount} student${singleStats.studentCount === 1 ? "" : "s"} · ${singleStats.topicCount} topic${singleStats.topicCount === 1 ? "" : "s"}`;
              } else {
                metaText = "Loading…";
              }

              return (
                <View
                  key={group.className}
                  style={[styles.classFolder, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}
                >
                  <View style={[styles.folderCover, { backgroundColor: `${meta.accent}18` }]} />
                  <View style={[styles.folderTab, { backgroundColor: meta.accent }]} />
                  <Pressable
                    style={({ pressed }) => [styles.folderHeader, pressed && { opacity: pressedOpacity }]}
                    onPress={() =>
                      isMultiSection
                        ? setExpandedClassName((current) => (current === group.className ? null : group.className))
                        : navigation.navigate("TopicList", {
                            classSectionId: singleSection.id,
                            className: singleSection.className,
                            sectionName: singleSection.sectionName,
                          })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isMultiSection ? isExpanded : undefined }}
                    >
                      <View style={[styles.folderIcon, { backgroundColor: `${meta.accent}1F` }]}>
                        <Image source={meta.graphic} style={styles.folderIllustration} resizeMode="contain" />
                      </View>
                    <View style={styles.folderCopy}>
                      <Text style={[styles.folderTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {isMultiSection
                          ? capitalizeFirst(group.className)
                          : `${capitalizeFirst(singleSection.className)} · ${capitalizeFirst(singleSection.sectionName)}`}
                      </Text>
                      <Text style={[styles.folderMeta, { color: colors.textMuted }]} numberOfLines={1}>{metaText}</Text>
                      <View style={styles.activityRow}>
                        <Ionicons name="time-outline" size={12} color={meta.accent} />
                        <Text style={[styles.activityText, { color: colors.textMuted }]}>
                          {groupLastActivityAt ? `Active ${getRelativeDateLabel(groupLastActivityAt)}` : "No activity yet"}
                        </Text>
                      </View>
                    </View>
                    {canManageClasses && !isMultiSection ? (
                      <Pressable
                        onPress={() => setOptionsClass(singleSection)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.moreButton, pressed && { opacity: pressedOpacity }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Options for ${singleSection.className} ${singleSection.sectionName}`}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                    <View style={[styles.folderAction, { backgroundColor: colors.accent }]}>
                      <Ionicons name={isMultiSection ? (isExpanded ? "chevron-up" : "chevron-down") : "arrow-forward"} size={15} color={colors.accentOn} />
                    </View>
                  </Pressable>

                  {isMultiSection && isExpanded ? (
                    <View style={[styles.folderSections, { borderTopColor: colors.accentSoftAlt, backgroundColor: colors.surfaceRaised }]}>
                      {group.sections.map((section, sectionIndex) => {
                        const stats = classStats[section.id];
                        return (
                          <Pressable
                            key={section.id}
                            style={({ pressed }) => [
                              styles.folderSectionRow,
                              sectionIndex < group.sections.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                              pressed && { opacity: pressedOpacity },
                            ]}
                            onPress={() => navigation.navigate("TopicList", { classSectionId: section.id, className: section.className, sectionName: section.sectionName })}
                            accessibilityRole="button"
                          >
                            <View style={[styles.sectionMarker, { backgroundColor: colors.accent }]} />
                            <View style={styles.folderSectionCopy}>
                              <Text style={[styles.folderSectionTitle, { color: colors.textPrimary }]}>Section {capitalizeFirst(section.sectionName)}</Text>
                              <Text style={[styles.folderSectionMeta, { color: colors.textMuted }]}>
                                {stats ? `${stats.studentCount} student${stats.studentCount === 1 ? "" : "s"} · ${stats.topicCount} topic${stats.topicCount === 1 ? "" : "s"}` : "Loading…"}
                              </Text>
                            </View>
                            {canManageClasses ? (
                              <Pressable
                                onPress={() => setOptionsClass(section)}
                                hitSlop={8}
                                style={({ pressed }) => [styles.moreButton, pressed && { opacity: pressedOpacity }]}
                                accessibilityRole="button"
                                accessibilityLabel={`Options for ${section.className} ${section.sectionName}`}
                              >
                                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                              </Pressable>
                            ) : null}
                            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {!isLoading && classSections.length === 0 ? (
          <View style={[styles.emptyStateCard, { borderColor: colors.border }]}>
            <Image source={decorativeAssets.paperPlane} style={styles.emptyStateGraphic} resizeMode="contain" />
            {user?.accountType === "individual" ? (
              <>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>Create your first class</Text>
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  Set up a class and pick the subjects you teach to get started.
                </Text>
                <Pressable
                  onPress={() => navigation.navigate("CreateFirstClass")}
                  style={({ pressed }) => [styles.emptyStateButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.emptyStateButtonText, { color: colors.accentOn }]}>Create a class</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>No classes assigned yet</Text>
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  Ask your school admin to assign you to a class.
                </Text>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>

      {canManageClasses && accessToken && user?.schoolId ? (
        <>
          <ClassOptionsSheet
            classSection={optionsClass}
            schoolId={user.schoolId}
            accessToken={accessToken}
            onClose={() => setOptionsClass(null)}
            onDeleted={() => {
              setOptionsClass(null);
              load();
            }}
          />
          <DeletedClassesSheet
            visible={showDeleted}
            schoolId={user.schoolId}
            accessToken={accessToken}
            onClose={() => setShowDeleted(false)}
            onRestored={load}
          />
        </>
      ) : null}

      <SheetModal visible={showAddClass} onClose={() => setShowAddClass(false)} closeLabel="Close add class">
        <View style={styles.modalHeader}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add another class</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              {classLimit !== null ? `${classSections.length} of ${classLimit} used` : "Set up your next class."}
            </Text>
          </View>
          <Pressable style={[styles.modalCloseButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowAddClass(false)} accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Class</Text>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: addClassV.error("className") ? colors.danger : colors.border }]}
          placeholder="e.g. Grade 5"
          placeholderTextColor={colors.textMuted}
          value={newClassName}
          onChangeText={setNewClassName}
          onBlur={() => addClassV.blur("className")}
          maxLength={40}
          autoFocus
        />
        <FieldError message={addClassV.error("className")} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>Section</Text>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: addClassV.error("sectionName") ? colors.danger : colors.border }]}
          placeholder="e.g. A"
          placeholderTextColor={colors.textMuted}
          value={newSectionName}
          onChangeText={setNewSectionName}
          onBlur={() => addClassV.blur("sectionName")}
          maxLength={40}
        />
        <FieldError message={addClassV.error("sectionName")} />
        {addClassError ? <Text style={[styles.error, { color: colors.danger, textAlign: "left" }]}>{addClassError}</Text> : null}
        <Pressable
          onPress={createAnotherClass}
          disabled={isCreatingClass}
          style={[styles.saveButton, { backgroundColor: colors.accent }, isCreatingClass && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          {isCreatingClass ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Create class</Text>}
        </Pressable>
      </SheetModal>

      <SheetModal visible={showAddSubject} onClose={() => setShowAddSubject(false)} closeLabel="Close add subject">
        <View style={styles.modalHeader}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add another subject</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              {subjectLimit !== null ? `${subjects.length} of ${subjectLimit} used` : "Set up your next subject."}
            </Text>
          </View>
          <Pressable style={[styles.modalCloseButton, { backgroundColor: colors.surfaceRaised }]} onPress={() => setShowAddSubject(false)} accessibilityRole="button">
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Subject</Text>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: addSubjectV.error("name") ? colors.danger : colors.border }]}
          placeholder="e.g. Mathematics"
          placeholderTextColor={colors.textMuted}
          value={newSubjectName}
          onChangeText={setNewSubjectName}
          onBlur={() => addSubjectV.blur("name")}
          maxLength={40}
          autoFocus
        />
        <FieldError message={addSubjectV.error("name")} />
        {addSubjectError ? <Text style={[styles.error, { color: colors.danger, textAlign: "left" }]}>{addSubjectError}</Text> : null}
        <Pressable
          onPress={createAnotherSubject}
          disabled={isCreatingSubject}
          style={[styles.saveButton, { backgroundColor: colors.accent }, isCreatingSubject && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          {isCreatingSubject ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Create subject</Text>}
        </Pressable>
      </SheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addClassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  addClassRowText: {
    fontSize: 13,
    fontWeight: "700",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 132,
  },
  topBar: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  topBarAccent: {
    position: "absolute",
    left: 52,
    bottom: -8,
    width: 42,
    height: 3,
    borderRadius: 3,
  },
  classListHeader: {
    marginTop: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  classListLabelText: {
    fontSize: 12,
    fontWeight: "600",
  },
  classCount: {
    fontSize: 12,
    fontWeight: "500",
  },
  error: {
    textAlign: "center",
    marginBottom: spacing.md,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  classList: {
    gap: 10,
  },
  classFolder: {
    ...softCardShadow,
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
  },
  folderTab: {
    position: "absolute",
    top: 0,
    left: 18,
    width: 76,
    height: 7,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  folderHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 104,
    paddingHorizontal: 16,
    paddingLeft: 88,
    paddingTop: 14,
    paddingBottom: 12,
  },
  folderCover: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 74,
  },
  folderIcon: {
    position: "absolute",
    left: 17,
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  folderIllustration: {
    width: 40,
    height: 40,
  },
  folderCopy: {
    flex: 1,
  },
  folderTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  folderMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 11,
  },
  activityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  moreButton: { padding: 6, marginRight: 4 },
  folderAction: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  folderSections: {
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  folderSectionRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  sectionMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  folderSectionCopy: {
    flex: 1,
  },
  folderSectionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  folderSectionMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
  emptyStateCard: {
    marginTop: spacing.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: radius.lg + 12,
    minHeight: 290,
    paddingHorizontal: 28,
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateGraphic: {
    width: 120,
    height: 120,
    marginBottom: spacing.lg,
  },
  emptyStateTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyStateText: {
    marginTop: spacing.md,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyStateButton: {
    marginTop: spacing.lg,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyStateButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
