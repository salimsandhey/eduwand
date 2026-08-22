import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";
import { CustomActivityContent } from "./content";
import { NumberedEditCard, EditActionRow } from "./NumberedEditCard";

interface Props {
  content: CustomActivityContent;
  editable: boolean;
  onChange: (content: CustomActivityContent) => void;
}

export function CustomActivityView({ content, editable, onChange }: Props) {
  const { colors } = useTheme();
  const [editingObjective, setEditingObjective] = useState(false);
  const [objectiveDraft, setObjectiveDraft] = useState(content.objective);

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
      activities: [...content.activities, { title: "New activity", description: "", durationMinutes: 10, materials: [] }],
    });
  }

  return (
    <View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Objective</Text>
        {editable && editingObjective ? (
          <View>
            <TextInput
              style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={objectiveDraft}
              onChangeText={setObjectiveDraft}
              multiline
              autoFocus
            />
            <EditActionRow
              onCancel={() => { setObjectiveDraft(content.objective); setEditingObjective(false); }}
              onDone={() => { onChange({ ...content, objective: objectiveDraft.trim() || content.objective }); setEditingObjective(false); }}
            />
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
            <Text style={[styles.bodyText, { color: colors.textSecondary, flex: 1 }]}>{content.objective}</Text>
            {editable ? (
              <Pressable onPress={() => setEditingObjective(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit objective">
                <Ionicons name="pencil" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        )}
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
              {act.description ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{act.description}</Text> : null}
              <View style={styles.tagRow}>
                <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{act.durationMinutes} min</Text>
                </View>
                {act.materials.length > 0 ? (
                  <View style={[styles.tag, { backgroundColor: colors.surfaceRaised }]}>
                    <Ionicons name="cube-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.tagText, { color: colors.textSecondary }]}>{act.materials.join(", ")}</Text>
                  </View>
                ) : null}
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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.md }]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Report format</Text>
        {editable ? (
          <TextInput
            style={[styles.multilineInput, { color: colors.textPrimary, borderColor: colors.border }]}
            value={content.reportFormat}
            onChangeText={(reportFormat) => onChange({ ...content, reportFormat })}
            multiline
          />
        ) : (
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{content.reportFormat}</Text>
        )}
      </View>
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

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardLabel: { fontSize: 16, fontFamily: typography.bold, marginBottom: spacing.sm },
  bodyText: { fontSize: 14, lineHeight: 20, fontFamily: typography.fontFamily },
  itemTitle: { fontSize: 14, fontFamily: typography.semiBold, marginBottom: 2 },
  sectionHint: { fontSize: 13, marginBottom: spacing.sm, fontFamily: typography.semiBold },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  tagText: { fontSize: 11, fontFamily: typography.medium },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  multilineInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, minHeight: 60, textAlignVertical: "top" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12, marginTop: spacing.xs },
  addButtonText: { fontSize: 14, fontFamily: typography.semiBold },
});
