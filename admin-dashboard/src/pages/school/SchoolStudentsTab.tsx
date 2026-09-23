import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { AcademicYear, ClassSection, Student } from "../../api/client";
import { Card } from "../../components/Card";
import { Modal, ModalFooter } from "../../components/Modal";
import type { SchoolOutletContext } from "./SchoolLayout";

interface StudentFormState {
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  feeStatus: string;
  // Text input, kept as a string while editing - "" means "not assigned".
  seatNumber: string;
}

const EMPTY_FORM: StudentFormState = {
  fullName: "",
  dateOfBirth: "",
  classSectionId: "",
  guardianName: "",
  guardianContact: "",
  feeStatus: "pending",
  seatNumber: "",
};

function sectionLabel(s: ClassSection): string {
  return `${s.className} - ${s.sectionName}`;
}

export function SchoolStudentsTab() {
  const { id, accessToken } = useOutletContext<SchoolOutletContext>();

  const [academicYears, setAcademicYears] = useState<AcademicYear[] | null>(null);
  const [yearsError, setYearsError] = useState<string | null>(null);

  const [classSectionId, setClassSectionId] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sections = useMemo<ClassSection[]>(() => {
    if (!academicYears) return [];
    const current = academicYears.find((y) => y.isCurrent) ?? academicYears[0];
    return current?.classSections ?? [];
  }, [academicYears]);

  useEffect(() => {
    if (!accessToken || !id) return;
    (async () => {
      try {
        const years = await api.listAcademicYears(accessToken, id);
        setAcademicYears(years);
      } catch (err) {
        setYearsError(err instanceof Error ? err.message : "Failed to load class sections");
      }
    })();
  }, [accessToken, id]);

  useEffect(() => {
    if (sections.length > 0 && !classSectionId) {
      setClassSectionId(sections[0].id);
    }
  }, [sections, classSectionId]);

  const loadStudents = useCallback(async () => {
    if (!accessToken || !classSectionId) return;
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const res = await api.listStudents(accessToken, id, { classSectionId, pageSize: 100 });
      setStudents(res);
    } catch (err) {
      setStudentsError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setStudentsLoading(false);
    }
  }, [accessToken, id, classSectionId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, classSectionId });
    setFormError(null);
    setEditingId(null);
    setShowForm("create");
  }

  function openEdit(s: Student) {
    setForm({
      fullName: s.fullName,
      dateOfBirth: s.dateOfBirth.slice(0, 10),
      classSectionId: s.classSectionId,
      guardianName: s.guardianName,
      guardianContact: s.guardianContact,
      feeStatus: s.feeStatus,
      seatNumber: s.seatNumber != null ? String(s.seatNumber) : "",
    });
    setFormError(null);
    setEditingId(s.id);
    setShowForm("edit");
  }

  function closeForm() {
    setShowForm(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function saveStudent() {
    if (!accessToken) return;
    if (!form.fullName.trim() || !form.dateOfBirth || !form.classSectionId || !form.guardianName.trim() || !form.guardianContact.trim()) {
      setFormError("Full name, date of birth, class section, guardian name, and guardian contact are all required.");
      return;
    }
    const trimmedSeat = form.seatNumber.trim();
    const seatNumber = trimmedSeat === "" ? null : Number(trimmedSeat);
    if (seatNumber !== null && (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 40)) {
      setFormError("Clicker number must be a whole number from 1 to 40, or left blank.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      if (showForm === "edit" && editingId) {
        await api.updateStudent(accessToken, id, editingId, {
          fullName: form.fullName.trim(),
          dateOfBirth: form.dateOfBirth,
          classSectionId: form.classSectionId,
          guardianName: form.guardianName.trim(),
          guardianContact: form.guardianContact.trim(),
          feeStatus: form.feeStatus,
          seatNumber,
        });
      } else {
        await api.createStudent(accessToken, id, {
          fullName: form.fullName.trim(),
          dateOfBirth: form.dateOfBirth,
          classSectionId: form.classSectionId,
          guardianName: form.guardianName.trim(),
          guardianContact: form.guardianContact.trim(),
          feeStatus: form.feeStatus,
        });
      }
      closeForm();
      loadStudents();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save student");
    } finally {
      setIsSaving(false);
    }
  }

  const filteredStudents = students?.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.fullName.toLowerCase().includes(q) || s.guardianName.toLowerCase().includes(q) || s.guardianContact.toLowerCase().includes(q);
  });

  return (
    <Card>
      <div style={styles.header}>
        <h3 style={styles.headerTitle}>Students</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {sections.length > 0 ? (
            <select style={styles.input} value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {sectionLabel(s)}
                </option>
              ))}
            </select>
          ) : null}
          {students && students.length > 0 ? (
            <input
              style={{ ...styles.input, minWidth: 220 }}
              placeholder="Search name, guardian, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          ) : null}
          <button style={styles.button} onClick={openCreate} disabled={sections.length === 0}>
            + Add student
          </button>
        </div>
      </div>

      <p style={styles.hint}>
        Most students arrive here automatically when an enquiry is confirmed as admitted. Use "Add student" only for
        someone who was already enrolled before this system was set up.
      </p>

      {yearsError ? <p style={styles.error}>{yearsError}</p> : null}
      {studentsError ? <p style={styles.error}>{studentsError}</p> : null}

      {sections.length === 0 && !yearsError ? (
        <p style={{ color: "var(--text-muted)" }}>Add a class section under Academics before adding students.</p>
      ) : studentsLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !students || students.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No students in this section yet.</p>
      ) : filteredStudents && filteredStudents.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No students match "{search}".</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Date of birth</th>
              <th style={styles.th}>Guardian</th>
              <th style={styles.th}>Guardian phone</th>
              <th style={styles.th}>Fee status</th>
              <th style={styles.th}>Clicker #</th>
              <th style={styles.th}>Source</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {(filteredStudents ?? []).map((s) => (
              <tr key={s.id}>
                <td style={styles.td}>{s.fullName}</td>
                <td style={styles.td}>{new Date(s.dateOfBirth).toLocaleDateString()}</td>
                <td style={styles.td}>{s.guardianName}</td>
                <td style={styles.td}>{s.guardianContact}</td>
                <td style={{ ...styles.td, textTransform: "capitalize" }}>{s.feeStatus}</td>
                <td style={styles.td}>{s.seatNumber ?? "—"}</td>
                <td style={styles.td}>{s.sourceEnquiryId ? "Admissions" : "Added directly"}</td>
                <td style={styles.td}>
                  <button style={styles.smallButton} onClick={() => openEdit(s)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm ? (
        <Modal title={showForm === "edit" ? "Edit student" : "Add student"} onClose={closeForm}>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Full name</label>
              <input
                style={styles.input}
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Date of birth</label>
              <input
                style={styles.input}
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Class section</label>
              <select
                style={styles.input}
                value={form.classSectionId}
                onChange={(e) => setForm((f) => ({ ...f, classSectionId: e.target.value }))}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Fee status</label>
              <select style={styles.input} value={form.feeStatus} onChange={(e) => setForm((f) => ({ ...f, feeStatus: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Guardian name</label>
              <input
                style={styles.input}
                value={form.guardianName}
                onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Guardian phone</label>
              <input
                style={styles.input}
                value={form.guardianContact}
                onChange={(e) => setForm((f) => ({ ...f, guardianContact: e.target.value }))}
                placeholder="Used for the student's OTP login"
              />
            </div>
            {showForm === "edit" ? (
              <div style={styles.field}>
                <label style={styles.label}>Clicker # (for live quick checks)</label>
                <input
                  style={styles.input}
                  type="number"
                  min={1}
                  max={40}
                  value={form.seatNumber}
                  onChange={(e) => setForm((f) => ({ ...f, seatNumber: e.target.value }))}
                  placeholder="Not assigned"
                />
              </div>
            ) : null}
          </div>
          <p style={styles.hint}>
            The guardian's phone number is what the student (or their guardian) uses to log in - a wrong number here
            means they can't get in.
          </p>
          {formError ? <p style={styles.error}>{formError}</p> : null}
          <ModalFooter>
            <button style={styles.secondaryButton} onClick={closeForm}>
              Cancel
            </button>
            <button style={styles.button} onClick={saveStudent} disabled={isSaving}>
              {isSaving ? "Saving…" : showForm === "edit" ? "Save changes" : "Add student"}
            </button>
          </ModalFooter>
        </Modal>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 10 },
  headerTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.2px" },
  hint: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px 0" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  button: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  secondaryButton: { background: "var(--bg-page)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  smallButton: { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-page)", color: "var(--text-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)" },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
};
