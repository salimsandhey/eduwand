import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { ThemeColors, radius, spacing, typography } from "../../../theme/tokens";
import { ContextSource } from "../../../api/client";
import { LessonPlanContent, LessonPlanStage } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

function assessmentMarkdownStyles(colors: ThemeColors) {
  return {
    body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, fontFamily: typography.fontFamily },
    heading1: { color: colors.textPrimary, fontFamily: typography.bold, fontSize: 16, marginTop: 0, marginBottom: 6 },
    heading2: { color: colors.textPrimary, fontFamily: typography.bold, fontSize: 15, marginTop: 10, marginBottom: 4 },
    heading3: { color: colors.textPrimary, fontFamily: typography.semiBold, fontSize: 14, marginTop: 8, marginBottom: 4 },
    strong: { fontFamily: typography.semiBold, color: colors.textPrimary },
    paragraph: { marginTop: 0, marginBottom: 8 },
    bullet_list: { marginBottom: 6 },
    ordered_list: { marginBottom: 6 },
    list_item: { marginBottom: 4 },
    bullet_list_icon: { color: colors.accent },
  };
}

interface Props {
  content: LessonPlanContent;
  editable: boolean;
  onChange: (content: LessonPlanContent) => void;
  sources: ContextSource[];
  scrollRef?: React.RefObject<ScrollView | null>;
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
function extractBloom(text: string): { level: string; color: string; icon: keyof typeof Ionicons.glyphMap; rest: string } | null {
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

export function LessonPlanView({ content, editable, onChange, sources, scrollRef }: Props) {
  const { colors, cardShadow } = useTheme();
  const [step, setStep] = useState("overview");
  const overviewInputRef = useRef<TextInput>(null);
  const assessmentInputRef = useRef<TextInput>(null);

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
            {content.objectives.slice(0, 2).map((obj, i) => (
              <View key={i} style={styles.checkRow}>
                <View style={[styles.checkIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="checkmark" size={13} color={colors.accent} />
                </View>
                <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{obj}</Text>
              </View>
            ))}
            {content.objectives.length > 2 ? (
              <Pressable onPress={() => setStep("objectives")} accessibilityRole="button" hitSlop={8} style={{ marginTop: spacing.xs }}>
                <Text style={[styles.link, { color: colors.textMuted }]}>+{content.objectives.length - 2} more</Text>
              </Pressable>
            ) : null}
          </Card>

          {sources.length > 0 ? (
            <Card colors={colors} cardShadow={cardShadow}>
              <CardLabel colors={colors}>Sources used</CardLabel>
              {sources.map((s) => (
                <View key={s.id} style={styles.sourceRow}>
                  <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                    {s.originalFilename ?? s.sourceUrl ?? s.sourceType}
                  </Text>
                </View>
              ))}
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
                    {bloom ? (
                      <View style={[styles.bloomTile, { backgroundColor: `${bloom.color}22` }]}>
                        <Ionicons name={bloom.icon} size={12} color={bloom.color} />
                        <Text style={[styles.bloomTileText, { color: bloom.color }]}>{bloom.level.toUpperCase()}</Text>
                      </View>
                    ) : null}
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
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>What happens in each stage of the lesson?</Text>
          {content.stages.map((stg, si) => (
            <View key={si} style={[styles.stageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.stageHeadingRow}>
                <View style={[styles.stageDot, { backgroundColor: FLOW_COLORS[si % FLOW_COLORS.length] }]} />
                <Text style={[styles.stageName, { color: colors.textPrimary }]}>{stg.stage}</Text>
                <Tag colors={colors} icon="time-outline" label={`${stg.durationMinutes} min`} />
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
                      {act.description ? (
                        <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: spacing.sm }]}>{act.description}</Text>
                      ) : null}
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
          ))}
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
                  {act.description ? (
                    <Text style={[styles.bodyText, { color: colors.textSecondary, marginTop: spacing.sm }]}>{act.description}</Text>
                  ) : null}
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
            (() => {
              const lines = content.assessment.split("\n");
              const bloom = extractBloom(lines[0] ?? "");
              const displayText = bloom ? [bloom.rest, ...lines.slice(1)].join("\n") : content.assessment;
              return (
                <Card colors={colors} cardShadow={cardShadow}>
                  <CardLabel colors={colors}>Assessment</CardLabel>
                  {bloom ? (
                    <View style={[styles.bloomTile, { backgroundColor: `${bloom.color}22` }]}>
                      <Ionicons name={bloom.icon} size={12} color={bloom.color} />
                      <Text style={[styles.bloomTileText, { color: bloom.color }]}>{bloom.level.toUpperCase()}</Text>
                    </View>
                  ) : null}
                  <Markdown style={assessmentMarkdownStyles(colors)}>{displayText}</Markdown>
                </Card>
              );
            })()
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
  const [description, setDescription] = useState(initial.description);
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
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: spacing.xs }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description"
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
            description: description.trim(),
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
  const [description, setDescription] = useState(initial.description);
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
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: spacing.xs }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description"
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
            description: description.trim(),
            materials: materials.split(",").map((m) => m.trim()).filter(Boolean),
          })
        }
      />
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
  bodyText: { fontSize: 14, lineHeight: 20, fontFamily: typography.fontFamily },
  itemTitle: { fontSize: 14, fontFamily: typography.semiBold, marginBottom: 2 },
  sectionHint: { fontSize: 13, marginBottom: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontFamily: typography.medium },
  stageCard: { borderWidth: 1, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.lg },
  stageHeadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  stageName: { flex: 1, fontSize: 15, fontFamily: typography.bold },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  bloomTile: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginBottom: spacing.sm, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  bloomTileText: { fontSize: 11, fontFamily: typography.bold, letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
