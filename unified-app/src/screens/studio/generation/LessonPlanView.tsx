import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { LessonPlanContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

interface Props {
  content: LessonPlanContent;
  editable: boolean;
  onChange: (content: LessonPlanContent) => void;
}

const STEPS = [
  { key: "overview", label: "Overview" },
  { key: "objectives", label: "Objectives" },
  { key: "activities", label: "Activities" },
  { key: "assessment", label: "Assessment" },
];

const FLOW_COLORS = ["#7C005A", "#FBAA0A", "#FB5F7E", "#52DFD6", "#7C005A"];

export function LessonPlanView({ content, editable, onChange }: Props) {
  const { colors, cardShadow } = useTheme();
  const [step, setStep] = useState("overview");

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

  function updateActivity(i: number, patch: Partial<LessonPlanContent["activities"][number]>) {
    const activities = [...content.activities];
    activities[i] = { ...activities[i], ...patch };
    onChange({ ...content, activities });
  }
  function removeActivity(i: number) {
    onChange({ ...content, activities: content.activities.filter((_, idx) => idx !== i) });
  }
  function addActivity() {
    onChange({
      ...content,
      activities: [...content.activities, { title: "New activity", description: "", durationMinutes: 10, materials: [] }],
    });
  }

  return (
    <View>
      <View style={[styles.stepper, { backgroundColor: colors.surfaceRaised }]}>
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
                style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={content.overview}
                onChangeText={(overview) => onChange({ ...content, overview })}
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
                <Text style={[styles.link, { color: colors.accent }]}>Edit</Text>
              </Pressable>
            </View>
            {content.objectives.map((obj, i) => (
              <View key={i} style={styles.checkRow}>
                <View style={[styles.checkIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="checkmark" size={13} color={colors.accent} />
                </View>
                <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]}>{obj}</Text>
              </View>
            ))}
          </Card>

          <Card colors={colors} cardShadow={cardShadow}>
            <CardLabel colors={colors}>Lesson flow</CardLabel>
            {content.lessonFlow.map((stage, i) => (
              <View key={i} style={styles.flowRow}>
                <View style={[styles.flowDot, { backgroundColor: FLOW_COLORS[i % FLOW_COLORS.length] }]} />
                <Text style={[styles.flowIndex, { color: colors.textMuted }]}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={[styles.flowLabel, { color: colors.textPrimary }]}>{stage.label}</Text>
                <Text style={[styles.flowDuration, { color: colors.textMuted }]}>{stage.durationMinutes} min</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {step === "objectives" ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            What should students be able to understand or do by the end of this lesson?
          </Text>
          {content.objectives.map((obj, i) => (
            <NumberedEditCard
              key={i}
              index={i}
              editable={editable}
              onRemove={editable && content.objectives.length > 1 ? () => removeObjective(i) : undefined}
              renderView={() => <Text style={[styles.bodyText, { color: colors.textPrimary }]}>{obj}</Text>}
              renderEditor={(done, cancel) => (
                <EditableObjective initial={obj} onCancel={cancel} onDone={(v) => { updateObjective(i, v); done(); }} colors={colors} />
              )}
            />
          ))}
          {editable ? <AddButton colors={colors} label="Add objective" onPress={addObjective} /> : null}
        </View>
      ) : null}

      {step === "activities" ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>How will students explore and practise this topic?</Text>
          {content.activities.map((act, i) => (
            <NumberedEditCard
              key={i}
              index={i}
              editable={editable}
              onRemove={editable && content.activities.length > 1 ? () => removeActivity(i) : undefined}
              renderView={() => (
                <View>
                  <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{act.title}</Text>
                  {act.description ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{act.description}</Text> : null}
                  <View style={styles.tagRow}>
                    <Tag colors={colors} icon="time-outline" label={`${act.durationMinutes} min`} />
                    {act.materials.length > 0 ? <Tag colors={colors} icon="cube-outline" label={act.materials.join(", ")} /> : null}
                  </View>
                </View>
              )}
              renderEditor={(done, cancel) => (
                <EditableActivity
                  initial={act}
                  onCancel={cancel}
                  onDone={(v) => { updateActivity(i, v); done(); }}
                  colors={colors}
                />
              )}
            />
          ))}
          {editable ? <AddButton colors={colors} label="Add activity" onPress={addActivity} /> : null}
        </View>
      ) : null}

      {step === "assessment" ? (
        <View style={{ marginTop: spacing.md }}>
          <Card colors={colors} cardShadow={cardShadow}>
            <CardLabel colors={colors}>Assessment</CardLabel>
            {editable ? (
              <TextInput
                style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={content.assessment}
                onChangeText={(assessment) => onChange({ ...content, assessment })}
                multiline
              />
            ) : (
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{content.assessment}</Text>
            )}
          </Card>
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
}: {
  initial: string;
  onCancel: () => void;
  onDone: (v: string) => void;
  colors: any;
}) {
  const [value, setValue] = useState(initial);
  return (
    <View>
      <TextInput
        style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
        value={value}
        onChangeText={setValue}
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
}: {
  initial: LessonPlanContent["activities"][number];
  onCancel: () => void;
  onDone: (v: LessonPlanContent["activities"][number]) => void;
  colors: any;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [materials, setMaterials] = useState(initial.materials.join(", "));
  return (
    <View>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textMuted} autoFocus />
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

function Card({ colors, cardShadow, children }: { colors: any; cardShadow: any; children: React.ReactNode }) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>{children}</View>;
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
  stepper: { flexDirection: "row", borderRadius: 16, paddingVertical: 9, paddingHorizontal: 4 },
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
  flowRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
  flowDot: { width: 8, height: 8, borderRadius: 4 },
  flowIndex: { fontSize: 11, fontFamily: typography.bold, width: 20 },
  flowLabel: { flex: 1, fontSize: 14, fontFamily: typography.semiBold },
  flowDuration: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
