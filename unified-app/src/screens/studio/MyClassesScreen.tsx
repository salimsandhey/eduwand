import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { TeacherTabParamList, RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing, radius } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { api, ClassSection } from "../../api/client";
import { decorativeAssets } from "../../theme/decorativeAssets";

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
}

function getClassCardMeta(index: number) {
  return {
    accent: CLASS_CARD_ACCENTS[index % CLASS_CARD_ACCENTS.length],
    graphic: CLASS_FOLDER_GRAPHICS[index % CLASS_FOLDER_GRAPHICS.length],
  };
}

export function MyClassesScreen({ navigation }: Props) {
  const { accessToken } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classStats, setClassStats] = useState<Record<string, ClassCardStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClassName, setExpandedClassName] = useState<string | null>(null);

  const groupedClasses = useMemo(() => {
    const map = new Map<string, ClassSection[]>();
    for (const cs of classSections) {
      const list = map.get(cs.className) ?? [];
      list.push(cs);
      map.set(cs.className, list);
    }
    return Array.from(map.entries()).map(([className, sections]) => ({ className, sections }));
  }, [classSections]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const sections = await api.listClassSections(accessToken);
      setClassSections(sections);

      const statsEntries = await Promise.all(
        sections.map(async (cs) => {
          const [studentsRes, topics] = await Promise.all([
            api.listStudents(accessToken, cs.id),
            api.listTopics(accessToken, { classSectionId: cs.id }),
          ]);
          const studentCount = studentsRes.data?.length ?? 0;
          return [cs.id, { studentCount, topicCount: topics.length }] as const;
        })
      );
      setClassStats(Object.fromEntries(statsEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.navigate("Home")}
            style={({ pressed }) => [
              styles.circleButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              cardShadow,
              pressed && { opacity: pressedOpacity },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back to home"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>

          <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>My classes</Text>
          <View style={[styles.topBarAccent, { backgroundColor: colors.accent }]} />

        </View>

        <View style={styles.classListHeader}>
          <View style={[styles.classListLabel, { backgroundColor: colors.accentSoft }]}>
            <View style={[styles.classListLabelDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.classListLabelText, { color: colors.accent }]}>Class folders</Text>
          </View>
          <Text style={[styles.classCount, { color: colors.textMuted }]}>{groupedClasses.length} class{groupedClasses.length === 1 ? "" : "es"}</Text>
        </View>

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
              const totalTopics = group.sections.reduce((total, section) => total + (classStats[section.id]?.topicCount ?? 0), 0);

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
                  style={[styles.classFolder, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}
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
                        {isMultiSection ? group.className : `${singleSection.className} · ${singleSection.sectionName}`}
                      </Text>
                      <Text style={[styles.folderMeta, { color: colors.textMuted }]} numberOfLines={1}>{metaText}</Text>
                      <View style={styles.topicDots}>
                        {Array.from({ length: Math.min(Math.max(totalTopics, 1), 8) }, (_, dotIndex) => (
                          <View key={dotIndex} style={[styles.topicDot, { backgroundColor: meta.accent, opacity: dotIndex < totalTopics ? 1 : 0.22 }]} />
                        ))}
                        <Text style={[styles.topicCount, { color: colors.textMuted }]}>{totalTopics} topic{totalTopics === 1 ? "" : "s"}</Text>
                      </View>
                    </View>
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
                              <Text style={[styles.folderSectionTitle, { color: colors.textPrimary }]}>Section {section.sectionName}</Text>
                              <Text style={[styles.folderSectionMeta, { color: colors.textMuted }]}>
                                {stats ? `${stats.studentCount} student${stats.studentCount === 1 ? "" : "s"} · ${stats.topicCount} topic${stats.topicCount === 1 ? "" : "s"}` : "Loading…"}
                              </Text>
                            </View>
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
            <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>No classes assigned yet</Text>
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
              Ask your school admin to assign you to a class.
            </Text>
          </View>
        ) : null}
      </ScrollView>

    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  classListLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  classListLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  classListLabelText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  classCount: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
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
    position: "relative",
    borderWidth: 1,
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
  topicDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 11,
  },
  topicDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  topicCount: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: "700",
  },
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
});
