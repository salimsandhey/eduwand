import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { AcademicYear, ClassSection, Student } from "../../api/client";
import { Card } from "../../components/Card";
import { Modal, ModalFooter } from "../../components/Modal";
import { FieldError, invalidInput } from "../../components/FieldError";
import { useFormErrors } from "../../hooks/useForm";
import { rules, phoneInput } from "../../utils/validation";
import type { SchoolOutletContext } from "./SchoolLayout";
import { btn } from "../../components/buttons";

interface StudentFormState {
  fullName: string;
  dateOfBirth: string;
  classSectionId: string;
  guardianName: string;
  guardianContact: string;
  email: string;
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
  email: "",
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
  // Rules mirror backend/src/lib/validation.ts; field names match the API's. An
  // unchanged date of birth isn't re-checked, so older records stay editable.
  const originalDob = editingId ? students?.find((s) => s.id === editingId)?.dateOfBirth.slice(0, 10) : undefined;
  const v = useFormErrors(form, {
    fullName: rules.personName("Student name"),
    dateOfBirth: (value) => (originalDob && value === originalDob ? null : rules.dateOfBirth("Date of birth")(value)),
    classSectionId: rules.required("Class section"),
    guardianName: rules.personName("Guardian name"),
    guardianContact: rules.phone(true, "Guardian phone number"),
    email: rules.email(true, "Student email"),
    seatNumber: rules.integer("Clicker number", 1, 40, false),
  });

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
    v.clear();
    setForm({ ...EMPTY_FORM, classSectionId });
    setFormError(null);
    setEditingId(null);
    setShowForm("create");
  }

  function openEdit(s: Student) {
    v.clear();
    setForm({
      fullName: s.fullName,
      dateOfBirth: s.dateOfBirth.slice(0, 10),
      classSectionId: s.classSectionId,
      guardianName: s.guardianName,
      guardianContact: s.guardianContact,
      email: s.email ?? "",
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
    if (!v.submit()) {
      setFormError("Please fix the highlighted fields.");
      return;
    }
    const trimmedSeat = form.seatNumber.trim();
    const seatNumber = trimmedSeat === "" ? null : Number(trimmedSeat);

    setIsSaving(true);
    setFormError(null);
    try {
      if (showForm === "edit" && editingId) {
        await api.updateStudent(accessToken, id, editingId, {
          fullName: form.fullName.trim(),
          ...(form.dateOfBirth !== originalDob ? { dateOfBirth: form.dateOfBirth } : {}),
          classSectionId: form.classSectionId,
          guardianName: form.guardianName.trim(),
          guardianContact: form.guardianContact.trim(),
          email: form.email.trim().toLowerCase(),
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
          email: form.email.trim().toLowerCase(),
          feeStatus: form.feeStatus,
        });
      }
      closeForm();
      loadStudents();
    } catch (err) {
      if (err instanceof ApiError && v.applyServerError(err)) setFormError("Please fix the highlighted fields.");
      else setFormError(err instanceof ApiError ? err.message : "Failed to save student");
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
                style={{ ...styles.input, ...invalidInput(!!v.error("fullName")) }}
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                onBlur={() => v.blur("fullName")}
                maxLength={80}
                aria-invalid={!!v.error("fullName")}
                autoFocus
              />
              <FieldError message={v.error("fullName")} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Date of birth</label>
              <input
                style={{ ...styles.input, ...invalidInput(!!v.error("dateOfBirth")) }}
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                onBlur={() => v.blur("dateOfBirth")}
                aria-invalid={!!v.error("dateOfBirth")}
              />
              <FieldError message={v.error("dateOfBirth")} />
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
                style={{ ...styles.input, ...invalidInput(!!v.error("guardianName")) }}
                value={form.guardianName}
                onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
                onBlur={() => v.blur("guardianName")}
                maxLength={80}
                aria-invalid={!!v.error("guardianName")}
              />
              <FieldError message={v.error("guardianName")} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Guardian phone</label>
              <input
                style={{ ...styles.input, ...invalidInput(!!v.error("guardianContact")) }}
                value={form.guardianContact}
                onChange={(e) => setForm((f) => ({ ...f, guardianContact: phoneInput(e.target.value) }))}
                onBlur={() => v.blur("guardianContact")}
                inputMode="tel"
                autoComplete="tel"
                maxLength={16}
                aria-invalid={!!v.error("guardianContact")}
                placeholder="10-digit mobile number"
              />
              <FieldError message={v.error("guardianContact")} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Student email</label>
              <input
                style={{ ...styles.input, ...invalidInput(!!v.error("email")) }}
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={() => v.blur("email")}
                maxLength={254}
                aria-invalid={!!v.error("email")}
                placeholder="Used for the student's OTP login"
              />
              <FieldError message={v.error("email")} />
            </div>
            {showForm === "edit" ? (
              <div style={styles.field}>
                <label style={styles.label}>Clicker # (for live quick checks)</label>
                <input
                  style={{ ...styles.input, ...invalidInput(!!v.error("seatNumber")) }}
                  type="number"
                  min={1}
                  max={40}
                  step={1}
                  value={form.seatNumber}
                  onChange={(e) => setForm((f) => ({ ...f, seatNumber: e.target.value }))}
                  onBlur={() => v.blur("seatNumber")}
                  aria-invalid={!!v.error("seatNumber")}
                  placeholder="Not assigned"
                />
                <FieldError message={v.error("seatNumber")} />
              </div>
            ) : null}
          </div>
          <p style={styles.hint}>
            The student email is what the student uses to log in (email + one-time code) - a wrong address here
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
  button: btn.primary,
  secondaryButton: btn.secondary,
  smallButton: btn.small,
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)" },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
};
