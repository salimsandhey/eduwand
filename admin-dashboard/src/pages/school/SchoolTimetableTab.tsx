import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import type { AppUserSummary, Subject, TimetableSlot } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface FormState {
  id: string | null;
  weekday: number;
  classSectionId: string;
  subject: string;
  startTime: string;
  endTime: string;
  room: string;
}

const emptyForm = (weekday: number, classSectionId: string): FormState => ({ id: null, weekday, classSectionId, subject: "", startTime: "", endTime: "", room: "" });

// Sets each teacher's weekly timetable. What's entered here is exactly what
// shows on that teacher's home-screen calendar in the mobile app.
export function SchoolTimetableTab() {
  const { id, accessToken, school, canManageAcademics } = useOutletContext<SchoolOutletContext>();

  const [teachers, setTeachers] = useState<AppUserSummary[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [slots, setSlots] = useState<TimetableSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const classSections = school.classSections ?? [];

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listUsers(accessToken, { schoolId: id }), api.listSubjectsForSchool(accessToken, id)])
      .then(([users, subjectList]) => {
        setTeachers(users.filter((u) => u.role === "teacher"));
        setSubjects(subjectList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load teachers"));
  }, [accessToken, id]);

  const loadSlots = useCallback(async () => {
    if (!accessToken || !teacherId) return;
    setError(null);
    try {
      setSlots(await api.listTimetableSlots(accessToken, id, teacherId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable");
    }
  }, [accessToken, id, teacherId]);

  useEffect(() => {
    setSlots(null);
    setForm(null);
    loadSlots();
  }, [loadSlots]);

  async function save() {
    if (!accessToken || !form || !teacherId) return;
    if (!form.classSectionId || !form.subject.trim() || !form.startTime || !form.endTime) {
      setError("Class, subject, start time and end time are required");
      return;
    }
    setIsSaving(true);
    setError(null);
    const input = {
      teacherUserId: teacherId,
      classSectionId: form.classSectionId,
      subject: form.subject.trim(),
      weekday: form.weekday,
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room.trim() || null,
    };
    try {
      if (form.id) await api.updateTimetableSlot(accessToken, id, form.id, input);
      else await api.createTimetableSlot(accessToken, id, input);
      setForm(null);
      await loadSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save period");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(slotId: string) {
    if (!accessToken || !window.confirm("Delete this period from the timetable?")) return;
    setError(null);
    try {
      await api.deleteTimetableSlot(accessToken, id, slotId);
      await loadSlots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete period");
    }
  }

  const label = (s: TimetableSlot) => `${s.classSection.className} ${s.classSection.sectionName} · ${s.subject}`;
  const subjectNames = subjects.map((s) => s.name);

  return (
    <Card title="Teacher timetables">
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
        Set each teacher's weekly classes. They appear on the teacher's home-screen calendar in the app, and teachers
        can't edit them.
      </p>

      {error ? <p style={styles.error}>{error}</p> : null}

      {!teachers ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : teachers.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No teachers in this school yet. Invite one from the Staff tab.</p>
      ) : (
        <>
          <label style={styles.label}>
            Teacher
            <select style={styles.input} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </label>

          {teacherId && classSections.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Add a class section in the Academics tab before building a timetable.</p>
          ) : null}

          {teacherId && slots ? (
            <div style={{ marginTop: 16 }}>
              {WEEKDAYS.map((day, index) => {
                const weekday = index + 1;
                const daySlots = slots.filter((s) => s.weekday === weekday);
                return (
                  <div key={day} style={styles.dayBlock}>
                    <div style={styles.dayHeader}>
                      <strong style={{ fontSize: 14 }}>{day}</strong>
                      {canManageAcademics && classSections.length > 0 ? (
                        <button style={styles.linkButton} onClick={() => setForm(emptyForm(weekday, classSections[0].id))}>
                          + Add period
                        </button>
                      ) : null}
                    </div>
                    {daySlots.length === 0 ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No classes</span>
                    ) : (
                      daySlots.map((slot) => (
                        <div key={slot.id} style={styles.slotRow}>
                          <span style={styles.slotTime}>
                            {slot.startTime}–{slot.endTime}
                          </span>
                          <span style={{ flex: 1, fontSize: 14 }}>
                            {label(slot)}
                            {slot.room ? <span style={{ color: "var(--text-muted)" }}> · Room {slot.room}</span> : null}
                          </span>
                          {canManageAcademics ? (
                            <>
                              <button
                                style={styles.linkButton}
                                onClick={() =>
                                  setForm({
                                    id: slot.id,
                                    weekday: slot.weekday,
                                    classSectionId: slot.classSectionId,
                                    subject: slot.subject,
                                    startTime: slot.startTime,
                                    endTime: slot.endTime,
                                    room: slot.room ?? "",
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button style={{ ...styles.linkButton, color: "var(--status-critical)" }} onClick={() => remove(slot.id)}>
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {form ? (
            <div style={styles.formBox}>
              <strong style={{ fontSize: 14 }}>{form.id ? "Edit period" : "Add period"}</strong>
              <div style={styles.formGrid}>
                <label style={styles.label}>
                  Day
                  <select style={styles.input} value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i + 1}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  Class
                  <select style={styles.input} value={form.classSectionId} onChange={(e) => setForm({ ...form, classSectionId: e.target.value })}>
                    {classSections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.className} {c.sectionName}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  Subject
                  {subjectNames.length > 0 ? (
                    <select style={styles.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                      <option value="">Select…</option>
                      {form.subject && !subjectNames.includes(form.subject) ? <option value={form.subject}>{form.subject}</option> : null}
                      {subjectNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input style={styles.input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Science" />
                  )}
                </label>
                <label style={styles.label}>
                  Starts
                  <input style={styles.input} type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Ends
                  <input style={styles.input} type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </label>
                <label style={styles.label}>
                  Room (optional)
                  <input style={styles.input} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. 204" />
                </label>
              </div>
              <div style={styles.row}>
                <button style={styles.button} onClick={save} disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button style={styles.secondaryButton} onClick={() => setForm(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)", color: "var(--text-primary)" },
  dayBlock: { padding: "12px 0", borderBottom: "1px solid var(--border)" },
  dayHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  slotRow: { display: "flex", alignItems: "center", gap: 12, padding: "6px 0" },
  slotTime: { width: 110, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" },
  linkButton: { background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 },
  formBox: { marginTop: 20, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-page)" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 },
  button: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  secondaryButton: { background: "var(--bg-page)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 8, marginBottom: 0 },
};
