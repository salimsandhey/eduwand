import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { ThemeColors, radius, spacing, typography } from "../../../theme/tokens";
import { ContextSource } from "../../../api/client";
import { LessonPlanContent, LessonPlanStage } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";
import { UsedSources } from "./UsedSources";

interface Props {
  content: LessonPlanContent;
  editable: boolean;
  onChange: (content: LessonPlanContent) => void;
  sources: ContextSource[];
  topicId: string;
  shownAsIsIds?: Set<string>;
  scrollRef?: React.RefObject<ScrollView | null>;
  // Which class periods the teacher has ticked off as taught - only relevant
  // when the plan spans more than one class (see stages[].sessions).
  completedSessions?: number[];
  onToggleSession?: (session: number, completed: boolean) => void;
}

// Scrolls the field being edited to the top of the visible (above-keyboard) area, instead of
// leaving it wherever it happened to be - otherwise the last field in a section (e.g. the final
// objective, or the assessment box) can end up hidden behind the keyboard with no way to see it.
// A short delay lets the edit-mode layout (and the keyboard's own open animation) settle first.
function scrollFieldIntoView(inputRef: React.RefObject<TextInput | null>, scrollRef?: React.RefObject<ScrollView | null>) {
  if (!scrollRef?.current || !inputRef.current) return;
  setTimeout(() => {
    if (!scrollRef.current || !inputRef.current) return;
    (inputRef.current as any).measureLayout(
      scrollRef.current as any,
      (_x: number, y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
      () => {}
    );
  }, 250);
}

const STEPS = [
  { key: "overview", label: "Overview" },
  { key: "objectives", label: "Objectives" },
  { key: "activities", label: "Lesson Stages" },
  { key: "assessment", label: "Assessment" },
];

const FLOW_COLORS = ["#7C005A", "#FBAA0A", "#FB5F7E", "#52DFD6", "#7C005A"];

const BLOOM_LEVELS: { level: string; color: string; icon: keyof typeof Ionicons.glyphMap; verbs: string[] }[] = [
  {
    level: "Remember", color: "#4C6FEA", icon: "bookmark-outline",
    verbs: ["remember", "remembering", "recall", "recalling", "identify", "identifying", "identifies", "define", "defining", "defines", "list", "listing", "lists", "recognize", "recognizing", "recognizes", "recognise", "recognising", "name", "naming", "names", "state", "stating", "states", "label", "labeling", "labelling", "labels"],
  },
  {
    level: "Understand", color: "#2FAE66", icon: "bulb-outline",
    verbs: ["understand", "understanding", "understands", "explain", "explaining", "explains", "describe", "describing", "describes", "summarize", "summarizing", "summarizes", "summarise", "summarising", "interpret", "interpreting", "interprets", "classify", "classifying", "classifies", "discuss", "discussing", "discusses", "outline", "outlining", "outlines", "comprehend", "comprehending"],
  },
  {
    level: "Apply", color: "#E8952E", icon: "construct-outline",
    verbs: ["apply", "applying", "applies", "demonstrate", "demonstrating", "demonstrates", "use", "using", "uses", "solve", "solving", "solves", "implement", "implementing", "implements", "execute", "executing", "executes", "practise", "practising", "practice", "practicing", "illustrate", "illustrating", "illustrates"],
  },
  {
    level: "Analyze", color: "#E4574F", icon: "search-outline",
    verbs: ["analyze", "analyzing", "analyzes", "analyse", "analysing", "analyses", "compare", "comparing", "compares", "contrast", "contrasting", "contrasts", "differentiate", "differentiating", "differentiates", "examine", "examining", "examines", "investigate", "investigating", "investigates", "categorize", "categorizing", "categorizes"],
  },
  {
    level: "Evaluate", color: "#8B5CF6", icon: "checkmark-done-outline",
    verbs: ["evaluate", "evaluating", "evaluates", "assess", "assessing", "assesses", "judge", "judging", "judges", "critique", "critiquing", "critiques", "justify", "justifying", "justifies", "argue", "arguing", "argues", "defend", "defending", "defends"],
  },
  {
    level: "Create", color: "#2AACC9", icon: "sparkles-outline",
    verbs: ["create", "creating", "creates", "design", "designing", "designs", "develop", "developing", "develops", "construct", "constructing", "constructs", "formulate", "formulating", "formulates", "compose", "composing", "composes", "produce", "producing", "produces", "plan", "planning", "plans"],
  },
];

const LEAD_PHRASE_RE =
  /^(students (will|should be able to|can)( be able to)?|by the end of (this|the) lesson,?\s*(students (will|can)( be able to)?)?|learners (will|can)( be able to)?)[\s,:-]*/i;

// Detects a Bloom's-taxonomy verb within the first few words and returns the sentence with the
// lead-in phrase and that verb removed (so the tile shown alongside the text doesn't just repeat it).
export function extractBloom(text: string): { level: string; color: string; icon: keyof typeof Ionicons.glyphMap; rest: string } | null {
  const trimmed = text.trim();
  const leadMatch = trimmed.toLowerCase().match(LEAD_PHRASE_RE);
  const afterLead = (leadMatch ? trimmed.slice(leadMatch[0].length) : trimmed).trim();

  const words = afterLead.split(/\s+/);
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    const clean = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (!clean) continue;
    const entry = BLOOM_LEVELS.find((lvl) => lvl.verbs.includes(clean));
    if (!entry) continue;
    const rest = [...words.slice(0, i), ...words.slice(i + 1)].join(" ").trim();
    if (!rest) return null;
    return { level: entry.level, color: entry.color, icon: entry.icon, rest: rest.charAt(0).toUpperCase() + rest.slice(1) };
  }
  return null;
}

export type Bloom = NonNullable<ReturnType<typeof extractBloom>>;

// The one place a Bloom's-level tag renders as a colored tile - used
// everywhere a "[Level] ..." string shows up (Objectives, the Overview
// preview, and each Assessment line), so a raw "[Understand]" bracket is
// never shown as literal text anywhere in the lesson plan.
export function BloomTile({ bloom, inline }: { bloom: Bloom; inline?: boolean }) {
  return (
    <View style={[styles.bloomTile, { backgroundColor: `${bloom.color}22` }, inline && styles.bloomTileInline]}>
      <Ionicons name={bloom.icon} size={12} color={bloom.color} />
      <Text style={[styles.bloomTileText, { color: bloom.color }]}>{bloom.level.toUpperCase()}</Text>
    </View>
  );
}

export function LessonPlanView({ content, editable, onChange, sources, topicId, shownAsIsIds, scrollRef, completedSessions, onToggleSession }: Props) {
  const { colors, cardShadow } = useTheme();
  const [step, setStep] = useState("overview");
  const overviewInputRef = useRef<TextInput>(null);
  const assessmentInputRef = useRef<TextInput>(null);

  // Self-describing from the content itself (not a separate classCount prop)
  // so it always matches what the stages actually say, even after an edit.
  const totalSessions = Math.max(1, ...(content.stages ?? []).flatMap((s) => s.sessions ?? []));
  const [selectedSession, setSelectedSession] = useState(1);
  const completedSet = new Set(completedSessions ?? []);
  function stageIsComplete(stage: LessonPlanStage): boolean {
    return !!stage.sessions?.length && stage.sessions.every((s) => completedSet.has(s));
  }

  function updateObjective(i: number, value: string) {
    const objectives = [...content.objectives];
    objectives[i] = value;
    onChange({ ...content, objectives });
  }
  function removeObjective(i: number) {
    onChange({ ...content, objectives: content.objectives.filter((_, idx) => idx !== i) });
  }
  function addObjective() {
    onChange({ ...content, objectives: [...content.objectives, "New objective"] });
  }

  // Legacy (pre-5E-restructure) content only - kept so old, already-generated
  // plans still work with the editor.
  function updateLegacyActivity(i: number, patch: Partial<NonNullable<LessonPlanContent["activities"]>[number]>) {
    const activities = [...(content.activities ?? [])];
    activities[i] = { ...activities[i], ...patch };
    onChange({ ...content, activities });
  }
  function removeLegacyActivity(i: number) {
    onChange({ ...content, activities: (content.activities ?? []).filter((_, idx) => idx !== i) });
  }
  function addLegacyActivity() {
    onChange({
      ...content,
      activities: [...(content.activities ?? []), { title: "New activity", description: "", durationMinutes: 10, materials: [] }],
    });
  }

  // New (5E) shape - activities live nested inside their stage.
  type StageActivity = LessonPlanStage["activities"][number];
  function updateStageActivity(stageIndex: number, activityIndex: number, patch: Partial<StageActivity>) {
    const stages = [...(content.stages ?? [])];
    const activities = [...stages[stageIndex].activities];
    activities[activityIndex] = { ...activities[activityIndex], ...patch };
    stages[stageIndex] = { ...stages[stageIndex], activities };
    onChange({ ...content, stages });
  }
  function removeStageActivity(stageIndex: number, activityIndex: number) {
    const stages = [...(content.stages ?? [])];
    stages[stageIndex] = { ...stages[stageIndex], activities: stages[stageIndex].activities.filter((_, idx) => idx !== activityIndex) };
    onChange({ ...content, stages });
  }
  function addStageActivity(stageIndex: number) {
    const stages = [...(content.stages ?? [])];
    stages[stageIndex] = { ...stages[stageIndex], activities: [...stages[stageIndex].activities, { title: "New activity", description: "", materials: [] }] };
    onChange({ ...content, stages });
  }
  function updateStageSummary(stageIndex: number, summary: string) {
    const stages = [...(content.stages ?? [])];
    stages[stageIndex] = { ...stages[stageIndex], summary };
    onChange({ ...content, stages });
  }

  return (
    <View>
      <View style={[styles.stepper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {STEPS.map((item, index) => {
          const active = step === item.key;
          return (
            <Pressable key={item.key} style={styles.stepItem} onPress={() => setStep(item.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <View style={[styles.stepNumber, { backgroundColor: active ? colors.accent : colors.backgroundMuted }]}><Text style={[styles.stepNumberText, { color: active ? colors.accentOn : colors.textMuted }]}>{index + 1}</Text></View>
              <Text style={[styles.stepLabel, { color: active ? colors.accent : colors.textMuted }]} numberOfLines={1}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {step === "overview" ? (
        <View style={{ marginTop: spacing.md }}>
            <Card colors={colors} cardShadow={cardShadow}>
            <CardLabel colors={colors}>Lesson overview</CardLabel>
            {editable ? (
              <TextInput
                ref={overviewInputRef}
                style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={content.overview}
                onChangeText={(overview) => onChange({ ...content, overview })}
                onFocus={() => scrollFieldIntoView(overviewInputRef, scrollRef)}
                multiline
              />
            ) : (
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{content.overview}</Text>
            )}
            <View style={styles.tagRow}>
              <Tag colors={colors} icon="time-outline" label={`${content.durationMinutes} min`} />
            </View>
          </Card>

          <Card colors={colors} cardShadow={cardShadow}>
            <View style={styles.cardHeadingRow}>
              <CardLabel colors={colors}>Learning objectives</CardLabel>
              <Pressable onPress={() => setStep("objectives")} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.link, { color: colors.accent }]}>View all</Text>
              </Pressable>
            </View>
            <View style={styles.tagRow}>
              <Tag colors={colors} icon="checkmark-circle-outline" label={`${content.objectives.length} objective${content.objectives.length === 1 ? "" : "s"}`} />
            </View>
            {content.objectives.slice(0, 2).map((obj, i) => {
              const bloom = extractBloom(obj);
              return (
                <View key={i} style={styles.checkRow}>
                  <View style={[styles.checkIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="checkmark" size={13} color={colors.accent} />
                  </View>
                  <View style={styles.objectivePreviewText}>
                    {bloom ? <BloomTile bloom={bloom} inline /> : null}
                    <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{bloom ? bloom.rest : obj}</Text>
                  </View>
                </View>
              );
            })}
            {content.objectives.length > 2 ? (
              <Pressable onPress={() => setStep("objectives")} accessibilityRole="button" hitSlop={8} style={{ marginTop: spacing.xs }}>
                <Text style={[styles.link, { color: colors.textMuted }]}>+{content.objectives.length - 2} more</Text>
              </Pressable>
            ) : null}
          </Card>

          {sources.length > 0 ? (
            <Card colors={colors} cardShadow={cardShadow}>
              <CardLabel colors={colors}>Sources used</CardLabel>
              <UsedSources sources={sources} topicId={topicId} shownAsIsIds={shownAsIsIds} />
            </Card>
          ) : null}
        </View>
      ) : null}

      {step === "objectives" ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            What should students be able to understand or do?
          </Text>
          {content.objectives.map((obj, i) => {
            const bloom = extractBloom(obj);
            return (
              <NumberedEditCard
                key={i}
                index={i}
                editable={editable}
                onRemove={editable && content.objectives.length > 1 ? () => removeObjective(i) : undefined}
                renderView={() => (
                  <View>
                    {bloom ? <BloomTile bloom={bloom} /> : null}
                    <Text style={[styles.bodyText, { color: colors.textPrimary, marginTop: bloom ? 6 : 0 }]}>{bloom ? bloom.rest : obj}</Text>
                  </View>
                )}
                renderEditor={(done, cancel) => (
                  <EditableObjective initial={obj} onCancel={cancel} onDone={(v) => { updateObjective(i, v); done(); }} colors={colors} scrollRef={scrollRef} />
                )}
              />
            );
          })}
          {editable ? <AddButton colors={colors} label="Add objective" onPress={addObjective} /> : null}
        </View>
      ) : null}

      {step === "activities" && content.stages ? (
        <View style={{ marginTop: spacing.md }}>
          {totalSessions > 1 ? (
            <>
              <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Which class are you teaching?</Text>
              <ClassTabBar
                totalSessions={totalSessions}
                selected={selectedSession}
                completedSessions={completedSet}
                onSelect={setSelectedSession}
                colors={colors}
              />
              {onToggleSession ? (
                <Pressable
                  style={[styles.markTaughtRow, { backgroundColor: colors.surfaceRaised }]}
                  onPress={() => onToggleSession(selectedSession, !completedSet.has(selectedSession))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: completedSet.has(selectedSession) }}
                >
                  <Ionicons
                    name={completedSet.has(selectedSession) ? "checkmark-circle" : "ellipse-outline"}
                    size={18}
                    color={completedSet.has(selectedSession) ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.markTaughtText, { color: completedSet.has(selectedSession) ? colors.accent : colors.textSecondary }]}>
                    {completedSet.has(selectedSession) ? `Class ${selectedSession} marked as taught` : `Mark Class ${selectedSession} as taught`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>What happens in each stage of the lesson?</Text>
          )}
          {content.stages.map((stg, si) => {
            if (totalSessions > 1 && !stg.sessions?.includes(selectedSession)) return null;
            return (
            <View key={si} style={[styles.stageCard, { backgroundColor: colors.surface, borderColor: colors.border }, stageIsComplete(stg) && { opacity: 0.6 }]}>
              <View style={styles.stageHeadingRow}>
                <View style={[styles.stageDot, { backgroundColor: FLOW_COLORS[si % FLOW_COLORS.length] }]} />
                <Text style={[styles.stageName, { color: colors.textPrimary }]}>{stg.stage}</Text>
                {stg.sessions && stg.sessions.length > 1 ? (
                  <Tag colors={colors} icon="school-outline" label={`Also class ${stg.sessions.filter((s) => s !== selectedSession).join(", ")}`} />
                ) : null}
                <Tag colors={colors} icon="time-outline" label={`${stg.durationMinutes} min`} />
                {stageIsComplete(stg) ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
              </View>
              {editable ? (
                <TextInput
                  style={[styles.multilineInput, { color: colors.textSecondary, borderColor: colors.border, marginTop: spacing.sm }]}
                  value={stg.summary}
                  onChangeText={(summary) => updateStageSummary(si, summary)}
                  multiline
                />
              ) : (
                <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: spacing.sm }]}>{stg.summary}</Text>
              )}

              <View style={{ marginTop: spacing.md }}>
              {stg.activities.map((act, ai) => (
                <NumberedEditCard
                  key={ai}
                  index={ai}
                  editable={editable}
                  onRemove={editable ? () => removeStageActivity(si, ai) : undefined}
                  renderView={() => (
                    <View>
                      <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{act.title}</Text>
                      {act.materials.length > 0 ? (
                        <View style={styles.tagRow}>
                          {act.materials.map((m, mi) => (
                            <Tag key={mi} colors={colors} icon="cube-outline" label={m} />
                          ))}
                        </View>
                      ) : null}
                      <ActivityDescription description={act.description} colors={colors} />
                    </View>
                  )}
                  renderEditor={(done, cancel) => (
                    <EditableStageActivity
                      initial={act}
                      onCancel={cancel}
                      onDone={(v) => { updateStageActivity(si, ai, v); done(); }}
                      colors={colors}
                      scrollRef={scrollRef}
                    />
                  )}
                />
              ))}
              {editable ? <AddButton colors={colors} label="Add activity" onPress={() => addStageActivity(si)} /> : null}
              </View>
            </View>
            );
          })}
          {totalSessions > 1 && !content.stages.some((s) => s.sessions?.includes(selectedSession)) ? (
            <Text style={[styles.sectionHint, { color: colors.textMuted, marginTop: spacing.sm }]}>
              Nothing tagged for Class {selectedSession} - check the other classes, or edit a stage to add it here.
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === "activities" && !content.stages ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>How will students explore and practise this topic?</Text>
          {(content.activities ?? []).map((act, i) => (
            <NumberedEditCard
              key={i}
              index={i}
              editable={editable}
              onRemove={editable && (content.activities ?? []).length > 1 ? () => removeLegacyActivity(i) : undefined}
              renderView={() => (
                <View>
                  <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{act.title}</Text>
                  <View style={styles.tagRow}>
                    <Tag colors={colors} icon="time-outline" label={`${act.durationMinutes} min`} />
                    {act.materials.map((m, mi) => (
                      <Tag key={mi} colors={colors} icon="cube-outline" label={m} />
                    ))}
                  </View>
                  <ActivityDescription description={act.description} colors={colors} />
                </View>
              )}
              renderEditor={(done, cancel) => (
                <EditableActivity
                  initial={act}
                  onCancel={cancel}
                  onDone={(v) => { updateLegacyActivity(i, v); done(); }}
                  colors={colors}
                  scrollRef={scrollRef}
                />
              )}
            />
          ))}
          {editable ? <AddButton colors={colors} label="Add activity" onPress={addLegacyActivity} /> : null}
        </View>
      ) : null}

      {step === "assessment" ? (
        <View style={{ marginTop: spacing.md }}>
          {editable ? (
            <Card colors={colors} cardShadow={cardShadow}>
              <CardLabel colors={colors}>Assessment</CardLabel>
              <TextInput
                ref={assessmentInputRef}
                style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={content.assessment}
                onChangeText={(assessment) => onChange({ ...content, assessment })}
                onFocus={() => scrollFieldIntoView(assessmentInputRef, scrollRef)}
                multiline
              />
            </Card>
          ) : (
            <Card colors={colors} cardShadow={cardShadow}>
              <CardLabel colors={colors}>Assessment</CardLabel>
              {content.assessment
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((line, i) => {
                  // The AI numbers each line itself ("1. Check: ...") - stripped
                  // here since we draw our own numbered badge instead.
                  const withoutNumber = line.replace(/^\d+[.)]\s*/, "");
                  const bloom = extractBloom(withoutNumber);
                  return (
                    <View key={i} style={[styles.checkRow, i === 0 && { marginTop: 0 }]}>
                      <View style={[styles.checkIcon, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.assessmentIndexText, { color: colors.accent }]}>{i + 1}</Text>
                      </View>
                      <View style={styles.objectivePreviewText}>
                        {bloom ? <BloomTile bloom={bloom} inline /> : null}
                        <Text style={[styles.bodyText, { color: colors.textPrimary, flex: 1 }]}>{bloom ? bloom.rest : withoutNumber}</Text>
                      </View>
                    </View>
                  );
                })}
            </Card>
          )}
        </View>
      ) : null}
    </View>
  );
}

function EditableObjective({
  initial,
  onCancel,
  onDone,
  colors,
  scrollRef,
}: {
  initial: string;
  onCancel: () => void;
  onDone: (v: string) => void;
  colors: any;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<TextInput>(null);
  return (
    <View>
      <TextInput
        ref={inputRef}
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={value}
        onChangeText={setValue}
        onFocus={() => scrollFieldIntoView(inputRef, scrollRef)}
        multiline
        autoFocus
      />
      <EditActionRow onCancel={onCancel} onDone={() => onDone(value.trim() || initial)} />
    </View>
  );
}

function EditableActivity({
  initial,
  onCancel,
  onDone,
  colors,
  scrollRef,
}: {
  initial: NonNullable<LessonPlanContent["activities"]>[number];
  onCancel: () => void;
  onDone: (v: NonNullable<LessonPlanContent["activities"]>[number]) => void;
  colors: any;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(joinDescription(initial.description));
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [materials, setMaterials] = useState(initial.materials.join(", "));
  const titleInputRef = useRef<TextInput>(null);
  return (
    <View>
      <TextInput
        ref={titleInputRef}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        onFocus={() => scrollFieldIntoView(titleInputRef, scrollRef)}
        autoFocus
      />
      <Text style={[styles.editorHint, { color: colors.textMuted }]}>One step per line - shown as bullet points</Text>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={description}
        onChangeText={setDescription}
        placeholder={"Step one\nStep two"}
        placeholderTextColor={colors.textMuted}
        multiline
      />
      <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, flex: 1 }]}
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          placeholder="Minutes"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
        />
        <TextInput
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, flex: 2 }]}
          value={materials}
          onChangeText={setMaterials}
          placeholder="Materials, comma-separated"
          placeholderTextColor={colors.textMuted}
        />
      </View>
      <EditActionRow
        onCancel={onCancel}
        onDone={() =>
          onDone({
            title: title.trim() || initial.title,
            description: splitDescription(description) ?? initial.description,
            durationMinutes: Math.max(1, parseInt(durationMinutes, 10) || initial.durationMinutes),
            materials: materials.split(",").map((m) => m.trim()).filter(Boolean),
          })
        }
      />
    </View>
  );
}

function EditableStageActivity({
  initial,
  onCancel,
  onDone,
  colors,
  scrollRef,
}: {
  initial: LessonPlanStage["activities"][number];
  onCancel: () => void;
  onDone: (v: LessonPlanStage["activities"][number]) => void;
  colors: any;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(joinDescription(initial.description));
  const [materials, setMaterials] = useState(initial.materials.join(", "));
  const titleInputRef = useRef<TextInput>(null);
  return (
    <View>
      <TextInput
        ref={titleInputRef}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        onFocus={() => scrollFieldIntoView(titleInputRef, scrollRef)}
        autoFocus
      />
      <Text style={[styles.editorHint, { color: colors.textMuted }]}>One step per line - shown as bullet points</Text>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={description}
        onChangeText={setDescription}
        placeholder={"Step one\nStep two"}
        placeholderTextColor={colors.textMuted}
        multiline
      />
      <TextInput
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginTop: spacing.xs }]}
        value={materials}
        onChangeText={setMaterials}
        placeholder="Materials, comma-separated"
        placeholderTextColor={colors.textMuted}
      />
      <EditActionRow
        onCancel={onCancel}
        onDone={() =>
          onDone({
            title: title.trim() || initial.title,
            description: splitDescription(description) ?? initial.description,
            materials: materials.split(",").map((m) => m.trim()).filter(Boolean),
          })
        }
      />
    </View>
  );
}

// Editors work on one text field (one step per line); these convert to/from
// the string | string[] the content actually stores.
function joinDescription(description: string | string[]): string {
  return Array.isArray(description) ? description.map(cleanBulletText).join("\n") : description;
}
// Always returns bullets (even for one line) once a teacher has edited it,
// regardless of how the original (possibly legacy, plain-string) content
// looked - editing is the natural migration point to the new shape.
function splitDescription(text: string): string[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length === 0 ? null : lines;
}

// New generations give steps as an array (bulleted); older rows still have
// one prose string and keep rendering exactly as they always have - no
// attempt to guess sentence boundaries and retrofit bullets onto old text.
// The model sometimes writes its own leading "- "/"• " marker or indentation
// into a step (formatting habit from being asked for a bulleted list) - left
// alone, that shows up as blank-looking space between our own dot and the
// first visible word. Stripped defensively so our marker is always the only one.
function cleanBulletText(step: string): string {
  return step.replace(/^[\s\-–—*••‣◦]+/, "").trim();
}

function ActivityDescription({ description, colors }: { description: string | string[]; colors: ThemeColors }) {
  if (!Array.isArray(description)) {
    return description ? <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: spacing.sm }]}>{description}</Text> : null;
  }
  return (
    <View style={{ marginTop: spacing.xs, gap: 3 }}>
      {description.map((step, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]}>{cleanBulletText(step)}</Text>
        </View>
      ))}
    </View>
  );
}

function Card({ colors, children }: { colors: any; cardShadow: any; children: React.ReactNode }) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}
function CardLabel({ colors, children }: { colors: any; children: React.ReactNode }) {
  return <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{children}</Text>;
}
function Tag({ colors, icon, label }: { colors: any; icon: any; label: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Text style={[styles.tagText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}
// Teacher-reported progress, independent of what's actually planned per
// class - ticking "Class 2" just means "I taught it," not "everything tagged
// [2] happened exactly as written."
// Real tabs, not just a label: selecting "Class 2" filters the stage list
// below to only what's tagged for it - opening a class shows just what to
// cover in it, not the whole lesson with a small tag buried in it.
function ClassTabBar({
  totalSessions,
  selected,
  completedSessions,
  onSelect,
  colors,
}: {
  totalSessions: number;
  selected: number;
  completedSessions: Set<number>;
  onSelect: (session: number) => void;
  colors: any;
}) {
  return (
    <View style={styles.sessionChecklist}>
      {Array.from({ length: totalSessions }, (_, i) => i + 1).map((session) => {
        const active = session === selected;
        const done = completedSessions.has(session);
        return (
          <Pressable
            key={session}
            style={[styles.sessionChip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }]}
            onPress={() => onSelect(session)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={active ? colors.accentOn : done ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.sessionChipText, { color: active ? colors.accentOn : colors.textSecondary }]}>Class {session}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
function AddButton({ colors, label, onPress }: { colors: any; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={onPress} accessibilityRole="button">
      <Ionicons name="add" size={16} color={colors.accent} />
      <Text style={[styles.addButtonText, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", borderRadius: 16, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 4 },
  stepItem: { flex: 1, alignItems: "center", gap: 5 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepNumberText: { fontSize: 12, fontFamily: typography.bold },
  stepLabel: { fontSize: 10, fontFamily: typography.medium },
  card: { borderWidth: 1, borderRadius: 20, padding: spacing.lg + 4, marginBottom: spacing.lg },
  cardHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  cardLabel: { fontSize: 16, fontFamily: typography.bold, marginBottom: spacing.sm },
  link: { fontSize: 13, fontFamily: typography.semiBold },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.sm },
  checkIcon: { width: 22, height: 22, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginTop: 1 },
  assessmentIndexText: { fontSize: 11, fontFamily: typography.bold },
  objectivePreviewText: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  bodyText: { fontSize: 14, lineHeight: 20, fontFamily: typography.fontFamily },
  itemTitle: { fontSize: 14, fontFamily: typography.semiBold, marginBottom: 2 },
  sectionHint: { fontSize: 13, marginBottom: spacing.sm },
  sessionChecklist: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  sessionChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  sessionChipText: { fontSize: 12, fontFamily: typography.semiBold },
  markTaughtRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, marginBottom: spacing.md },
  markTaughtText: { fontSize: 13, fontFamily: typography.semiBold },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontFamily: typography.medium },
  stageCard: { borderWidth: 1, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.lg },
  stageHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  stageName: { fontSize: 15, fontFamily: typography.bold, marginRight: "auto" },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  bloomTile: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  bloomTileInline: { alignSelf: "auto", marginBottom: 0 },
  bloomTileText: { fontSize: 11, fontFamily: typography.bold, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  editorHint: { fontSize: 11, fontFamily: typography.medium, marginTop: spacing.xs, marginBottom: 4 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  bulletDot: { width: 3, height: 3, borderRadius: 1.5, marginTop: 8 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
