import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { spacing } from "../../theme/tokens";
import { Screen } from "../../components/Screen";
import { SheetModal } from "../../components/SheetModal";
import { TimePicker } from "../../components/TimePicker";
import { api, ClassSection, Subject, TimetableSlot } from "../../api/client";
import { capitalizeFirst } from "../../utils/text";

// A teacher's weekly timetable. Institutional teachers see what their school
// admin set up (read-only); individual teachers have no admin panel, so they
// build their own here - the backend treats them as admin of their personal
// school only. See backend/src/routes/timetable.ts.

type Props = NativeStackScreenProps<RootStackParamList, "Timetable">;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Suggested end time for the picker: 45 minutes after the chosen start.
function suggestedEnd(startTime: string): string {
  if (!TIME_RE.test(startTime)) return "09:45";
  const total = Math.min(Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) + 45, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

interface FormState {
  id: string | null;
  weekday: number;
  classSectionId: string;
  subject: string;
  startTime: string;
  endTime: string;
  room: string;
}

const emptyForm = (weekday = 1): FormState => ({ id: null, weekday, classSectionId: "", subject: "", startTime: "", endTime: "", room: "" });

export function TimetableScreen({ navigation }: Props) {
  const { accessToken, user } = useAuth();
  const { colors, cardShadow, pressedOpacity } = useTheme();
  const canEdit = user?.accountType === "individual";

  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [mine, sections, subjectList] = await Promise.all([
        api.getMyTimetable(accessToken),
        canEdit ? api.listClassSections(accessToken) : Promise.resolve([] as ClassSection[]),
        canEdit ? api.listSubjects(accessToken) : Promise.resolve([] as Subject[]),
      ]);
      setSlots(mine);
      setClassSections(sections.filter((s) => s.isActive));
      setSubjects(subjectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canEdit]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openEdit(slot: TimetableSlot) {
    if (!canEdit) return;
    setFormError(null);
    setForm({
      id: slot.id,
      weekday: slot.weekday,
      classSectionId: slot.classSectionId,
      subject: slot.subject,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room ?? "",
    });
  }

  function openNew(weekday: number) {
    setFormError(null);
    setForm({ ...emptyForm(weekday), classSectionId: classSections[0]?.id ?? "" });
  }

  async function save() {
    if (!accessToken || !user?.schoolId || !form) return;
    const { startTime, endTime } = form;
    if (!form.classSectionId) return setFormError("Choose a class");
    if (!form.subject.trim()) return setFormError("Choose a subject");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return setFormError("Choose a start and end time");
    if (startTime >= endTime) return setFormError("End time must be after start time");

    setIsSaving(true);
    setFormError(null);
    const input = { teacherUserId: user.id, classSectionId: form.classSectionId, subject: form.subject.trim(), weekday: form.weekday, startTime, endTime, room: form.room.trim() || null };
    try {
      if (form.id) await api.updateTimetableSlot(accessToken, user.schoolId, form.id, input);
      else await api.createTimetableSlot(accessToken, user.schoolId, input);
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save period");
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete() {
    if (!form?.id) return;
    const slotId = form.id;
    Alert.alert("Delete this period?", "It will be removed from every week.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!accessToken || !user?.schoolId) return;
          try {
            await api.deleteTimetableSlot(accessToken, user.schoolId, slotId);
            setForm(null);
            await load();
          } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to delete period");
          }
        },
      },
    ]);
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: pressedOpacity }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>My timetable</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>{canEdit ? "Your weekly classes" : "Set by your school"}</Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : (
          <>
            {slots.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {canEdit ? "No periods yet. Add your first class below." : "Your school hasn't set up your timetable yet."}
              </Text>
            ) : null}

            {canEdit && classSections.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Create a class first, then you can add it to your timetable.</Text>
            ) : null}

            {WEEKDAYS.map((label, index) => {
              const weekday = index + 1;
              const daySlots = slots.filter((s) => s.weekday === weekday);
              if (daySlots.length === 0 && !canEdit) return null;
              return (
                <View key={label} style={styles.daySection}>
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayTitle, { color: colors.textPrimary }]}>{label}</Text>
                    {canEdit && classSections.length > 0 ? (
                      <Pressable onPress={() => openNew(weekday)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add period on ${label}`}>
                        <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                  {daySlots.length === 0 ? (
                    <Text style={[styles.dayEmpty, { color: colors.textMuted }]}>No classes</Text>
                  ) : (
                    <View style={[styles.card, { backgroundColor: colors.surface, borderWidth: 0 }, cardShadow]}>
                      {daySlots.map((slot, i) => (
                        <Pressable
                          key={slot.id}
                          onPress={() => openEdit(slot)}
                          disabled={!canEdit}
                          style={({ pressed }) => [styles.slotRow, i < daySlots.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { opacity: pressedOpacity }]}
                          accessibilityRole={canEdit ? "button" : undefined}
                        >
                          <View style={styles.slotTime}>
                            <Text style={[styles.slotTimeText, { color: colors.textPrimary }]}>{slot.startTime}</Text>
                            <Text style={[styles.slotTimeSub, { color: colors.textMuted }]}>{slot.endTime}</Text>
                          </View>
                          <View style={styles.slotBody}>
                            <Text style={[styles.slotTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                              {capitalizeFirst(slot.classSection.className)} {capitalizeFirst(slot.classSection.sectionName)} · {capitalizeFirst(slot.subject)}
                            </Text>
                            {slot.room ? <Text style={[styles.slotMeta, { color: colors.textMuted }]}>Room {slot.room}</Text> : null}
                          </View>
                          {canEdit ? <Ionicons name="create-outline" size={18} color={colors.textMuted} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <SheetModal
        visible={form !== null}
        onClose={() => setForm(null)}
        closeLabel="Close period form"
        maxHeightRatio={0.88}
        sheetStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{form?.id ? "Edit period" : "Add period"}</Text>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Day</Text>
          <View style={styles.chipRow}>
            {WEEKDAYS.map((label, index) => {
              const active = form?.weekday === index + 1;
              return (
                <Pressable
                  key={label}
                  onPress={() => form && setForm({ ...form, weekday: index + 1 })}
                  style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textPrimary }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Class</Text>
          <View style={styles.chipRow}>
            {classSections.map((section) => {
              const active = form?.classSectionId === section.id;
              return (
                <Pressable
                  key={section.id}
                  onPress={() => form && setForm({ ...form, classSectionId: section.id })}
                  style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textPrimary }]}>
                    {capitalizeFirst(section.className)} {capitalizeFirst(section.sectionName)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Subject</Text>
          {subjects.length === 0 ? (
            <Text style={[styles.emptyInline, { color: colors.textMuted }]}>No subjects yet - add one from your class setup first.</Text>
          ) : (
            <View style={styles.chipRow}>
              {subjects.map((s) => {
                const active = form?.subject === s.name;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => form && setForm({ ...form, subject: s.name })}
                    style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surfaceRaised, borderColor: active ? colors.accent : colors.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.accentOn : colors.textPrimary }]}>{capitalizeFirst(s.name)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Starts</Text>
              <TimePicker
                value={form?.startTime ?? ""}
                onChange={(startTime) => form && setForm({ ...form, startTime })}
                placeholder="Start time"
                defaultValue="09:00"
              />
            </View>
            <View style={styles.timeField}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Ends</Text>
              <TimePicker
                value={form?.endTime ?? ""}
                onChange={(endTime) => form && setForm({ ...form, endTime })}
                placeholder="End time"
                defaultValue={suggestedEnd(form?.startTime ?? "")}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Room (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.textPrimary }]}
            value={form?.room ?? ""}
            onChangeText={(room) => form && setForm({ ...form, room })}
            placeholder="e.g. 204"
            placeholderTextColor={colors.textMuted}
          />

          {formError ? <Text style={[styles.error, { color: colors.danger }]}>{formError}</Text> : null}

          <View style={styles.modalActions}>
            {form?.id ? (
              <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.deleteButton, { borderColor: colors.danger }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
                <Text style={[styles.deleteText, { color: colors.danger }]}>Delete</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setForm(null)} style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && { opacity: pressedOpacity }]} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={isSaving}
              style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.accent }, (isSaving || pressed) && { opacity: pressedOpacity }]}
              accessibilityRole="button"
            >
              {isSaving ? <ActivityIndicator color={colors.accentOn} /> : <Text style={[styles.saveText, { color: colors.accentOn }]}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </SheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 60 },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  titleBlock: { flex: 1 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  loader: { marginTop: 40 },
  error: { marginTop: 14, textAlign: "center", fontSize: 13 },
  emptyText: { marginTop: 20, textAlign: "center", fontSize: 13 },
  daySection: { marginTop: 20 },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  dayTitle: { fontSize: 15, fontWeight: "800" },
  dayEmpty: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  slotRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  slotTime: { width: 44 },
  slotTimeText: { fontSize: 13, fontWeight: "800" },
  slotTimeSub: { fontSize: 11, fontWeight: "600" },
  slotBody: { flex: 1 },
  slotTitle: { fontSize: 14, fontWeight: "700" },
  slotMeta: { fontSize: 11, marginTop: 2 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalCard: { maxHeight: "88%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 28 },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emptyInline: { fontSize: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
  input: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeField: { flex: 1 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  deleteButton: { paddingHorizontal: 16, height: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  deleteText: { fontSize: 14, fontWeight: "700" },
  cancelButton: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, fontWeight: "700" },
  saveButton: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveText: { fontSize: 14, fontWeight: "800" },
});
