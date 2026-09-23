import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { useTheme } from "../../../theme/ThemeContext";
import { spacing, radius, typography } from "../../../theme/tokens";
import { SheetModal } from "../../../components/SheetModal";
import { api, StudentStub } from "../../../api/client";
import { capitalizeFirst } from "../../../utils/text";

interface Props {
  visible: boolean;
  onClose: () => void;
  topicId: string;
  initialSharedWithAll: boolean;
  initialSelectedIds: string[];
  isSubmitting: boolean;
  // undefined = share with the whole class; a list = just those students.
  onConfirm: (studentStubIds: string[] | undefined) => void;
}

type Mode = "all" | "selected";

// Opened from "Share with students" - lets the teacher choose the whole
// class (today's default) or a specific subset, instead of publishing
// straight to everyone. See POST /generations/:id/publish's studentStubIds.
export function ShareAudienceSheet({ visible, onClose, topicId, initialSharedWithAll, initialSelectedIds, isSubmitting, onConfirm }: Props) {
  const { accessToken } = useAuth();
  const { colors, pressedOpacity } = useTheme();

  const [mode, setMode] = useState<Mode>(initialSharedWithAll ? "all" : "selected");
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const topic = await api.getTopic(accessToken, topicId);
      const roster = await api.listStudents(accessToken, topic.classSectionId);
      setStudents(roster.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the class roster");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, topicId]);

  useEffect(() => {
    if (!visible) return;
    setMode(initialSharedWithAll ? "all" : "selected");
    setSelectedIds(new Set(initialSelectedIds));
    load();
    // Only reset when the sheet opens, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canConfirm = mode === "all" || selectedIds.size > 0;

  return (
    <SheetModal visible={visible} onClose={onClose} maxHeightRatio={0.85}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Share with students</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Choose who in the class gets this.</Text>

      <View style={styles.modeRow}>
        <ModeOption label="All students" icon="people-outline" active={mode === "all"} onPress={() => setMode("all")} />
        <ModeOption label="Select students" icon="person-outline" active={mode === "selected"} onPress={() => setMode("selected")} />
      </View>

      {mode === "selected" ? (
        isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : error ? (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: 12 }}>{error}</Text>
        ) : (
          <>
            <View style={styles.rosterHeaderRow}>
              <Text style={[styles.rosterCount, { color: colors.textSecondary }]}>
                {selectedIds.size} of {students.length} selected
              </Text>
              <Pressable onPress={() => setSelectedIds(selectedIds.size === students.length ? new Set() : new Set(students.map((s) => s.id)))} hitSlop={8}>
                <Text style={[styles.selectAllLink, { color: colors.accent }]}>{selectedIds.size === students.length ? "Clear all" : "Select all"}</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.rosterList}>
              {students.map((s) => {
                const checked = selectedIds.has(s.id);
                return (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [styles.studentRow, pressed && { opacity: pressedOpacity }]}
                    onPress={() => toggleStudent(s.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                  >
                    <Ionicons name={checked ? "checkbox" : "square-outline"} size={20} color={checked ? colors.accent : colors.textMuted} />
                    <Text style={[styles.studentName, { color: colors.textPrimary }]}>{capitalizeFirst(s.fullName)}</Text>
                  </Pressable>
                );
              })}
              {students.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>No students in this class yet.</Text> : null}
            </ScrollView>
          </>
        )
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.confirmButton,
          { backgroundColor: colors.accent },
          (!canConfirm || isSubmitting || pressed) && { opacity: pressedOpacity },
        ]}
        onPress={() => onConfirm(mode === "all" ? undefined : [...selectedIds])}
        disabled={!canConfirm || isSubmitting}
        accessibilityRole="button"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.accentOn} />
        ) : (
          <Text style={[styles.confirmButtonText, { color: colors.accentOn }]}>
            {mode === "all" ? "Share with all students" : `Share with ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}`}
          </Text>
        )}
      </Pressable>
    </SheetModal>
  );
}

function ModeOption({ label, icon, active, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  const { colors, pressedOpacity } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.modeOption,
        { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border },
        pressed && { opacity: pressedOpacity },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
    >
      <Ionicons name={icon} size={16} color={active ? colors.accentOn : colors.textSecondary} />
      <Text style={[styles.modeOptionText, { color: active ? colors.accentOn : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: typography.bold },
  subtitle: { fontSize: 13, marginTop: 3, marginBottom: spacing.md },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  modeOption: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: radius.md, paddingVertical: 11 },
  modeOptionText: { fontSize: 13, fontFamily: typography.semiBold },
  rosterHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, marginBottom: spacing.xs },
  rosterCount: { fontSize: 12, fontFamily: typography.medium },
  selectAllLink: { fontSize: 12, fontFamily: typography.semiBold },
  rosterList: { maxHeight: 280 },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  studentName: { fontSize: 14, fontFamily: typography.medium },
  confirmButton: { height: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  confirmButtonText: { fontSize: 14, fontFamily: typography.bold },
});
