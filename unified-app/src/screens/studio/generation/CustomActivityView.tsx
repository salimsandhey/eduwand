import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { CustomActivityContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";
import { extractBloom, BloomTile } from "./LessonPlanView";

interface Props {
  content: CustomActivityContent;
  editable: boolean;
  onChange: (content: CustomActivityContent) => void;
}

// A step or report-format line can carry the model's own leading "- "/"• "
// marker or indentation - stripped so our own bullet dot is the only marker
// shown (same fix as LessonPlanView's activity descriptions).
function cleanBulletText(step: string): string {
  return step.replace(/^[\s\-–—*••‣◦]+/, "").trim();
}
function joinBulletText(text: string | string[]): string {
  return Array.isArray(text) ? text.map(cleanBulletText).join("\n") : text;
}
function splitBulletText(text: string): string[] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length === 0 ? null : lines;
}

// New generations give steps as an array (bulleted); legacy rows still have
// one prose string and render exactly as they always have.
function BulletsOrText({ text, colors }: { text: string | string[]; colors: any }) {
  if (!Array.isArray(text)) {
    return text ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{text}</Text> : null;
  }
  return (
    <View style={{ gap: 3 }}>
      {text.map((step, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]}>{cleanBulletText(step)}</Text>
        </View>
      ))}
    </View>
  );
}

export function CustomActivityView({ content, editable, onChange }: Props) {
  const { colors, cardShadow } = useTheme();
  const objectives = content.objectives ?? (content.objective ? [content.objective] : []);
  const usesLegacyObjective = !content.objectives;

  function updateObjective(i: number, value: string) {
    const next = [...objectives];
    next[i] = value;
    onChange(usesLegacyObjective ? { ...content, objective: next[0] } : { ...content, objectives: next });
  }
  function removeObjective(i: number) {
    onChange({ ...content, objectives: objectives.filter((_, idx) => idx !== i), objective: undefined });
  }
  function addObjective() {
    onChange({ ...content, objectives: [...objectives, "New objective"], objective: undefined });
  }

  function updateActivity(i: number, patch: Partial<CustomActivityContent["activities"][number]>) {
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
      activities: [...content.activities, { title: "New activity", description: ["New step"], durationMinutes: 10, materials: [] }],
    });
  }

  return (
    <View>
      <View style={[styles.card, { backgroundColor: colors.surface }, cardShadow]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Learning objectives</Text>
        {objectives.map((obj, i) => {
          const bloom = extractBloom(obj);
          return (
            <NumberedEditCard
              key={i}
              index={i}
              editable={editable}
              onRemove={editable && !usesLegacyObjective && objectives.length > 1 ? () => removeObjective(i) : undefined}
              renderView={() => (
                <View>
                  {bloom ? <BloomTile bloom={bloom} /> : null}
                  <Text style={[styles.bodyText, { color: colors.textPrimary, marginTop: bloom ? 6 : 0 }]}>{bloom ? bloom.rest : obj}</Text>
                </View>
              )}
              renderEditor={(done, cancel) => (
                <ObjectiveEditor initial={obj} colors={colors} onCancel={cancel} onDone={(v) => { updateObjective(i, v); done(); }} />
              )}
            />
          );
        })}
        {editable && !usesLegacyObjective ? <AddButton colors={colors} label="Add objective" onPress={addObjective} /> : null}
      </View>

      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Activity</Text>
      {content.activities.map((act, i) => (
        <NumberedEditCard
          key={i}
          index={i}
          editable={editable}
          onRemove={editable && content.activities.length > 1 ? () => removeActivity(i) : undefined}
          renderView={() => (
            <View>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{act.title}</Text>
              <View style={styles.tagRow}>
                <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{act.durationMinutes} min</Text>
                </View>
                {act.materials.map((m, mi) => (
                  <View key={mi} style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                    <Ionicons name="cube-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.tagText, { color: colors.textSecondary }]}>{m}</Text>
                  </View>
                ))}
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <BulletsOrText text={act.description} colors={colors} />
              </View>
            </View>
          )}
          renderEditor={(done, cancel) => (
            <ActivityEditor initial={act} colors={colors} onCancel={cancel} onDone={(v) => { updateActivity(i, v); done(); }} />
          )}
        />
      ))}
      {editable ? (
        <Pressable style={[styles.addButton, { borderColor: colors.accent }]} onPress={addActivity} accessibilityRole="button">
          <Ionicons name="add" size={16} color={colors.accent} />
          <Text style={[styles.addButtonText, { color: colors.accent }]}>Add activity</Text>
        </Pressable>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface, marginTop: spacing.md }, cardShadow]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Report format</Text>
        {editable ? (
          <TextInput
            style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
            value={joinBulletText(content.reportFormat)}
            onChangeText={(text) => onChange({ ...content, reportFormat: splitBulletText(text) ?? content.reportFormat })}
            placeholder={"What was attempted\nWhat was observed\nWhat to reinforce next class"}
            multiline
          />
        ) : (
          <BulletsOrText text={content.reportFormat} colors={colors} />
        )}
      </View>
    </View>
  );
}

function ObjectiveEditor({ initial, colors, onCancel, onDone }: { initial: string; colors: any; onCancel: () => void; onDone: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <View>
      <TextInput style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]} value={value} onChangeText={setValue} multiline autoFocus />
      <EditActionRow onCancel={onCancel} onDone={() => onDone(value.trim() || initial)} />
    </View>
  );
}

function ActivityEditor({
  initial,
  colors,
  onCancel,
  onDone,
}: {
  initial: CustomActivityContent["activities"][number];
  colors: any;
  onCancel: () => void;
  onDone: (v: CustomActivityContent["activities"][number]) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(joinBulletText(initial.description));
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [materials, setMaterials] = useState(initial.materials.join(", "));
  return (
    <View>
      <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textMuted} autoFocus />
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
            description: splitBulletText(description) ?? initial.description,
            durationMinutes: Math.max(1, parseInt(durationMinutes, 10) || initial.durationMinutes),
            materials: materials.split(",").map((m) => m.trim()).filter(Boolean),
          })
        }
      />
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
  card: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardLabel: { fontSize: 16, fontFamily: typography.bold, marginBottom: spacing.sm },
  bodyText: { fontSize: 14, lineHeight: 20, fontFamily: typography.fontFamily },
  itemTitle: { fontSize: 14, fontFamily: typography.semiBold, marginBottom: 2 },
  sectionHint: { fontSize: 13, marginBottom: spacing.sm, fontFamily: typography.semiBold },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontFamily: typography.medium },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  editorHint: { fontSize: 11, fontFamily: typography.medium, marginTop: spacing.xs, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
