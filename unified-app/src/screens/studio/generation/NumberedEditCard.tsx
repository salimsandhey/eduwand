import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../../theme/ThemeContext";
import { radius, spacing, typography } from "../../../theme/tokens";

interface NumberedEditCardProps {
  index: number;
  editable: boolean;
  renderView: () => React.ReactNode;
  renderEditor: (done: () => void, cancel: () => void) => React.ReactNode;
  onRemove?: () => void;
}

// Matches the Figma pattern used across lesson-plan objectives/activities:
// a numbered badge, a pencil that flips the card into an inline editor with
// its own Cancel/Done row, and the card border turning accent-colored while
// editing. Shared by every structured generation view (LessonPlan/
// CustomActivity/Flashcards/Presentation) so the interaction stays identical.
export function NumberedEditCard({ index, editable, renderView, renderEditor, onRemove }: NumberedEditCardProps) {
  const { colors, pressedOpacity } = useTheme();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: isEditing ? colors.accent : colors.border },
      ]}
    >
      {isEditing ? (
        renderEditor(
          () => setIsEditing(false),
          () => setIsEditing(false)
        )
      ) : (
        <View style={styles.row}>
          <View style={[styles.badge, { backgroundColor: isEditing ? colors.accentSoft : colors.surfaceAccent }]}>
            <Text style={[styles.badgeText, { color: isEditing ? colors.accent : colors.textPrimary }]}>
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>{renderView()}</View>
          {editable ? (
            <View style={styles.actions}>
              <Pressable
                onPress={() => setIsEditing(true)}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: pressedOpacity }}
                accessibilityRole="button"
                accessibilityLabel="Edit"
              >
                <Ionicons name="pencil" size={16} color={colors.textMuted} />
              </Pressable>
              {onRemove ? (
                <Pressable
                  onPress={onRemove}
                  hitSlop={8}
                  style={({ pressed }) => pressed && { opacity: pressedOpacity }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove"
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

interface EditActionRowProps {
  onCancel: () => void;
  onDone: () => void;
  doneLabel?: string;
}

export function EditActionRow({ onCancel, onDone, doneLabel = "Done" }: EditActionRowProps) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <View style={styles.editActionRow}>
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
      >
        <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
      </Pressable>
      <Pressable
        onPress={onDone}
        style={({ pressed }) => [styles.doneButton, { backgroundColor: colors.accent }, pressed && { opacity: pressedOpacity }]}
        accessibilityRole="button"
      >
        <Text style={[styles.doneText, { color: colors.accentOn }]}>{doneLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontFamily: typography.bold },
  actions: { flexDirection: "row", gap: 14, paddingTop: 2 },
  editActionRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: 10 },
  cancelText: { fontSize: 14, fontFamily: typography.semiBold },
  doneButton: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill },
  doneText: { fontSize: 14, fontFamily: typography.semiBold },
});
