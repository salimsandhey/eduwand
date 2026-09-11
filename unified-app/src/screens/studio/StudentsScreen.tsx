import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { DatePicker } from "../../components/DatePicker";
import { api, ClassSection, StudentStub } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

// One roster across every class the teacher teaches - not nested inside a
// single class. Matches how institutional schools already manage students
// (admin-dashboard's SchoolStudentsTab.tsx: one school-wide list, class as a
// filter/field, not a navigation boundary). Available to every teacher,
// individual or institutional, for their own classes only (backend scopes
// GET/PATCH/DELETE /students to classes the caller actually teaches). See
// Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

type Props = NativeStackScreenProps<RootStackParamList, "Students">;

function classLabel(section: { className: string; sectionName: string } | undefined): string {
  if (!section) return "";
  return `${capitalizeFirst(section.className)} ${capitalizeFirst(section.sectionName)}`;
}

const EMPTY_MANUAL_FORM = { fullName: "", dateOfBirth: "", guardianName: "", guardianContact: "" };

export function StudentsScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();

  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [students, setStudents] = useState<StudentStub[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignClassId, setBulkAssignClassId] = useState<string | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);

  const [editingStudent, setEditingStudent] = useState<StudentStub | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_MANUAL_FORM);
  const [editClassId, setEditClassId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [sections, rosterRes] = await Promise.all([api.listClassSections(accessToken), api.listStudents(accessToken)]);
      setClassSections(sections);
      setStudents(rosterRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter && s.classSectionId !== classFilter) return false;
      if (q && !s.fullName.toLowerCase().includes(q) && !s.guardianName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [students, classFilter, search]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function submitBulkAssign() {
    if (!accessToken || !bulkAssignClassId || selectedIds.size === 0) return;
    setIsBulkAssigning(true);
    try {
      const res = await api.bulkReassignStudents(accessToken, bulkAssignClassId, Array.from(selectedIds));
      setShowBulkAssign(false);
      exitSelectionMode();
      await load();
      if (res.skipped.length > 0) {
        Alert.alert("Some students weren't moved", `${res.updated} moved, ${res.skipped.length} skipped.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign class");
    } finally {
      setIsBulkAssigning(false);
    }
  }

  function confirmDelete(student: StudentStub) {
    Alert.alert("Remove student?", `${student.fullName} will be removed from your roster. Their past grades and submissions stay on record.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (!accessToken) return;
          try {
            await api.deleteStudent(accessToken, student.id);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to remove student");
          }
        },
      },
    ]);
  }

  function openEdit(student: StudentStub) {
    setEditingStudent(student);
    setEditForm({
      fullName: student.fullName,
      dateOfBirth: student.dateOfBirth.slice(0, 10),
      guardianName: student.guardianName,
      guardianContact: student.guardianContact,
    });
    setEditClassId(student.classSectionId);
  }

  async function saveEdit() {
    if (!accessToken || !editingStudent || !editClassId) return;
    if (!editForm.fullName.trim() || !editForm.guardianName.trim() || !editForm.guardianContact.trim()) return;
    setIsSavingEdit(true);
    setError(null);
    try {
      await api.updateStudent(accessToken, editingStudent.id, {
        fullName: editForm.fullName.trim(),
        dateOfBirth: editForm.dateOfBirth,
        classSectionId: editClassId,
        guardianName: editForm.guardianName.trim(),
        guardianContact: editForm.guardianContact.trim(),
      });
      setEditingStudent(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Students</Text>
        {selectionMode ? (
          <Pressable onPress={exitSelectionMode} style={styles.headerAction}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setSelectionMode(true)} style={styles.headerAction}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Select</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => setClassFilter(null)}
            style={[styles.filterChip, { backgroundColor: classFilter === null ? colors.accent : colors.surfaceAccent }]}
          >
            <Text style={{ color: classFilter === null ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 12 }}>All classes</Text>
          </Pressable>
          {classSections.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setClassFilter(c.id)}
              style={[styles.filterChip, { backgroundColor: classFilter === c.id ? colors.accent : colors.surfaceAccent }]}
            >
              <Text style={{ color: classFilter === c.id ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 12 }}>{classLabel(c)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Search name or guardian…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
        ) : filteredStudents.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No students match.</Text>
        ) : (
          filteredStudents.map((student) => {
            const section = classSections.find((c) => c.id === student.classSectionId);
            const selected = selectedIds.has(student.id);
            return (
              <Pressable
                key={student.id}
                onPress={() => (selectionMode ? toggleSelected(student.id) : openEdit(student))}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}
              >
                {selectionMode ? (
                  <Ionicons name={selected ? "checkbox" : "square-outline"} size={22} color={selected ? colors.accent : colors.textMuted} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }]}>{student.fullName}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    {classLabel(section)} · {student.guardianName}
                  </Text>
                </View>
                {!selectionMode ? (
                  <Pressable onPress={() => confirmDelete(student)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {!selectionMode ? (
        <Pressable onPress={() => navigation.navigate("AddStudent")} style={[styles.fab, { backgroundColor: colors.accent }, cardShadow]} accessibilityRole="button">
          <Ionicons name="add" size={26} color={colors.accentOn} />
        </Pressable>
      ) : selectedIds.size > 0 ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border }, cardShadow]}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{selectedIds.size} selected</Text>
          <Pressable
            onPress={() => {
              setBulkAssignClassId(classSections[0]?.id ?? null);
              setShowBulkAssign(true);
            }}
            style={[styles.selectionBarButton, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: colors.accentOn, fontWeight: "700" }}>Assign to class</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Bulk assign class modal */}
      <Modal visible={showBulkAssign} animationType="slide" transparent onRequestClose={() => setShowBulkAssign(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Assign {selectedIds.size} student{selectedIds.size === 1 ? "" : "s"} to</Text>
              <Pressable onPress={() => setShowBulkAssign(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {classSections.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setBulkAssignClassId(c.id)}
                  style={[styles.classOption, { backgroundColor: bulkAssignClassId === c.id ? colors.accentSoft : "transparent", borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{classLabel(c)}</Text>
                  {bulkAssignClassId === c.id ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={submitBulkAssign}
              disabled={isBulkAssigning || !bulkAssignClassId}
              style={[styles.saveButton, { backgroundColor: colors.accent }, isBulkAssigning && { opacity: 0.6 }]}
            >
              {isBulkAssigning ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Assign</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Edit student modal */}
      <Modal visible={!!editingStudent} animationType="slide" transparent onRequestClose={() => setEditingStudent(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Edit student</Text>
              <Pressable onPress={() => setEditingStudent(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.textPrimary }]}>Full name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={editForm.fullName}
                onChangeText={(v) => setEditForm((f) => ({ ...f, fullName: v }))}
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Date of birth</Text>
              <DatePicker value={editForm.dateOfBirth} onChange={(v) => setEditForm((f) => ({ ...f, dateOfBirth: v }))} />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Guardian name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={editForm.guardianName}
                onChangeText={(v) => setEditForm((f) => ({ ...f, guardianName: v }))}
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Guardian contact</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={editForm.guardianContact}
                onChangeText={(v) => setEditForm((f) => ({ ...f, guardianContact: v }))}
                keyboardType="phone-pad"
              />
              <Text style={[styles.label, { color: colors.textPrimary }]}>Class</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {classSections.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setEditClassId(c.id)}
                    style={[styles.filterChip, { backgroundColor: editClassId === c.id ? colors.accent : colors.surfaceAccent }]}
                  >
                    <Text style={{ color: editClassId === c.id ? colors.accentOn : colors.textPrimary, fontWeight: "700", fontSize: 12 }}>{classLabel(c)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={saveEdit}
                disabled={isSavingEdit}
                style={[styles.saveButton, { backgroundColor: colors.accent }, isSavingEdit && { opacity: 0.6 }]}
              >
                {isSavingEdit ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveButtonText, { color: colors.accentOn }]}>Save changes</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    flex: 1,
  },
  headerAction: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  filterRow: {
    marginTop: 14,
    paddingLeft: spacing.lg,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  searchRow: {
    paddingHorizontal: spacing.lg,
    marginTop: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: {
    marginHorizontal: spacing.lg,
    marginTop: 10,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 8,
  },
  emptyText: {
    marginTop: 30,
    textAlign: "center",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  rowName: {
    fontSize: 14,
    fontWeight: "700",
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  selectionBarButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  classOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
