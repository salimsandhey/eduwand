import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import type { AcademicYear, AppUserSummary } from "../../api/client";
import { Card } from "../../components/Card";
import { Modal, ModalFooter } from "../../components/Modal";
import type { SchoolOutletContext } from "./SchoolLayout";

function parseListInput(value: string): string[] {
  const parts = value.split(/[,\n]/).map((p) => p.trim()).filter((p) => p.length > 0);
  return [...new Set(parts)];
}

export function SchoolAcademicsTab() {
  const { id, accessToken, canManageAcademics, reload } = useOutletContext<SchoolOutletContext>();

  const [academicYears, setAcademicYears] = useState<AcademicYear[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);

  const [showAddYear, setShowAddYear] = useState(false);
  const [yearLabel, setYearLabel] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [copyFromYearId, setCopyFromYearId] = useState("");
  const [isAddingYear, setIsAddingYear] = useState(false);

  const [addingSectionForYear, setAddingSectionForYear] = useState<string | null>(null);
  const [sectionClassName, setSectionClassName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  const [bulkGenerateForYear, setBulkGenerateForYear] = useState<string | null>(null);
  const [bulkClassNames, setBulkClassNames] = useState("");
  const [bulkSectionNames, setBulkSectionNames] = useState("");
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);

  const parsedBulkClassNames = useMemo(() => parseListInput(bulkClassNames), [bulkClassNames]);
  const parsedBulkSectionNames = useMemo(() => parseListInput(bulkSectionNames), [bulkSectionNames]);
  const bulkPreviewCount = parsedBulkClassNames.length * parsedBulkSectionNames.length;

  const [teachers, setTeachers] = useState<AppUserSummary[] | null>(null);
  const [assigningTeacherFor, setAssigningTeacherFor] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!accessToken || !id) return;
    setClassesError(null);
    try {
      const years = await api.listAcademicYears(accessToken, id);
      setAcademicYears(years);
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : "Failed to load academic years");
    }
  }, [accessToken, id]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const loadTeachers = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const users = await api.listUsers(accessToken, { schoolId: id });
      setTeachers(users.filter((u) => u.role === "teacher"));
    } catch {
      // Non-critical for this page - the assign UI just won't have options.
    }
  }, [accessToken, id]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  async function addAcademicYear() {
    if (!accessToken || !id || !yearLabel.trim() || !yearStart || !yearEnd) return;
    setIsAddingYear(true);
    setClassesError(null);
    try {
      await api.createAcademicYear(accessToken, id, {
        label: yearLabel.trim(),
        startDate: yearStart,
        endDate: yearEnd,
        copyFromAcademicYearId: copyFromYearId || undefined,
      });
      setYearLabel("");
      setYearStart("");
      setYearEnd("");
      setCopyFromYearId("");
      setShowAddYear(false);
      loadClasses();
      reload();
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : "Failed to add academic year");
    } finally {
      setIsAddingYear(false);
    }
  }

  async function makeCurrentYear(academicYearId: string) {
    if (!accessToken || !id) return;
    setClassesError(null);
    try {
      await api.setCurrentAcademicYear(accessToken, id, academicYearId);
      loadClasses();
      reload();
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : "Failed to update academic year");
    }
  }

  async function addClassSection(academicYearId: string) {
    if (!accessToken || !id || !sectionClassName.trim() || !sectionName.trim()) return;
    setIsAddingSection(true);
    setClassesError(null);
    try {
      await api.createClassSection(accessToken, id, {
        academicYearId,
        className: sectionClassName.trim(),
        sectionName: sectionName.trim(),
      });
      setSectionClassName("");
      setSectionName("");
      setAddingSectionForYear(null);
      loadClasses();
      reload();
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : "Failed to add class section");
    } finally {
      setIsAddingSection(false);
    }
  }

  function closeBulkGenerateModal() {
    setBulkGenerateForYear(null);
    setBulkClassNames("");
    setBulkSectionNames("");
    setBulkError(null);
    setBulkResult(null);
  }

  async function bulkGenerateSections(academicYearId: string) {
    if (!accessToken || !id || parsedBulkClassNames.length === 0 || parsedBulkSectionNames.length === 0) return;
    setIsBulkGenerating(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const result = await api.bulkCreateClassSections(accessToken, id, {
        academicYearId,
        classNames: parsedBulkClassNames,
        sectionNames: parsedBulkSectionNames,
      });
      setBulkResult({ created: result.created.length, skipped: result.skipped });
      loadClasses();
      reload();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to bulk generate class sections");
    } finally {
      setIsBulkGenerating(false);
    }
  }

  async function assignTeacher(classSectionId: string) {
    if (!accessToken || !id || !selectedTeacherId) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      await api.assignClassSectionTeacher(accessToken, id, classSectionId, selectedTeacherId);
      setSelectedTeacherId("");
      setAssigningTeacherFor(null);
      loadClasses();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign teacher");
    } finally {
      setIsAssigning(false);
    }
  }

  async function unassignTeacher(classSectionId: string, teacherUserId: string) {
    if (!accessToken || !id) return;
    setAssignError(null);
    try {
      await api.unassignClassSectionTeacher(accessToken, id, classSectionId, teacherUserId);
      loadClasses();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to remove teacher");
    }
  }

  return (
    <Card title="Academic Years & Classes">
      {classesError ? <p style={styles.error}>{classesError}</p> : null}

      {!academicYears ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : academicYears.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>
          This school has no academic year yet - nothing can be admitted or assigned to a class until one exists.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {academicYears.map((year) => (
            <div key={year.id} style={styles.yearBox}>
              <div style={styles.yearHeader}>
                <strong>{year.label}</strong>
                {year.isCurrent ? (
                  <span style={{ ...styles.statusBadge, color: "var(--status-good)" }}>current</span>
                ) : canManageAcademics ? (
                  <button style={styles.smallButton} onClick={() => makeCurrentYear(year.id)}>
                    Make current
                  </button>
                ) : null}
              </div>
              {year.classSections.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0" }}>No class sections yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {year.classSections.map((cs) => {
                    const assignedIds = new Set(cs.teacherAssignments.map((a) => a.teacherUserId));
                    const availableTeachers = (teachers ?? []).filter((t) => !assignedIds.has(t.id));
                    return (
                      <div key={cs.id} style={styles.classSectionBox}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={styles.chip}>
                            {cs.className} {cs.sectionName}
                          </span>
                        </div>
                        <div style={{ ...styles.sectionChips, marginTop: 8 }}>
                          {cs.teacherAssignments.length === 0 ? (
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No teacher assigned yet.</span>
                          ) : (
                            cs.teacherAssignments.map((a) => (
                              <span key={a.teacherUserId} style={styles.teacherChip}>
                                {a.teacher.fullName}
                                {canManageAcademics ? (
                                  <button
                                    style={styles.chipRemoveButton}
                                    onClick={() => unassignTeacher(cs.id, a.teacherUserId)}
                                    aria-label={`Remove ${a.teacher.fullName}`}
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </span>
                            ))
                          )}
                        </div>
                        {canManageAcademics ? (
                          assigningTeacherFor === cs.id ? (
                            <div style={{ ...styles.row, marginTop: 8 }}>
                              <select
                                style={styles.input}
                                value={selectedTeacherId}
                                onChange={(e) => setSelectedTeacherId(e.target.value)}
                                autoFocus
                              >
                                <option value="">Select a teacher…</option>
                                {availableTeachers.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.fullName} ({t.email})
                                  </option>
                                ))}
                              </select>
                              <button
                                style={styles.button}
                                onClick={() => assignTeacher(cs.id)}
                                disabled={isAssigning || !selectedTeacherId}
                              >
                                Assign
                              </button>
                              <button
                                style={styles.secondaryButton}
                                onClick={() => {
                                  setAssigningTeacherFor(null);
                                  setSelectedTeacherId("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              style={{ ...styles.smallButton, marginTop: 8 }}
                              onClick={() => setAssigningTeacherFor(cs.id)}
                              disabled={availableTeachers.length === 0}
                            >
                              + Assign teacher
                            </button>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                  {assignError ? <p style={styles.error}>{assignError}</p> : null}
                </div>
              )}
              {canManageAcademics ? (
                addingSectionForYear === year.id ? (
                  <div style={{ ...styles.row, marginTop: 8 }}>
                    <input
                      style={styles.input}
                      placeholder="Class (e.g. Grade 5)"
                      value={sectionClassName}
                      onChange={(e) => setSectionClassName(e.target.value)}
                      autoFocus
                    />
                    <input
                      style={styles.input}
                      placeholder="Section (e.g. A)"
                      value={sectionName}
                      onChange={(e) => setSectionName(e.target.value)}
                    />
                    <button
                      style={styles.button}
                      onClick={() => addClassSection(year.id)}
                      disabled={isAddingSection || !sectionClassName.trim() || !sectionName.trim()}
                    >
                      Add
                    </button>
                    <button style={styles.secondaryButton} onClick={() => setAddingSectionForYear(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={styles.smallButton} onClick={() => setAddingSectionForYear(year.id)}>
                      + Add class section
                    </button>
                    <button style={styles.smallButton} onClick={() => setBulkGenerateForYear(year.id)}>
                      + Bulk generate sections
                    </button>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManageAcademics ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {!showAddYear ? (
            <button style={styles.secondaryButton} onClick={() => setShowAddYear(true)}>
              + Add academic year
            </button>
          ) : (
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Label (e.g. 2026-2027)"
                value={yearLabel}
                onChange={(e) => setYearLabel(e.target.value)}
                autoFocus
              />
              <input
                style={styles.input}
                type="date"
                value={yearStart}
                onChange={(e) => setYearStart(e.target.value)}
              />
              <input style={styles.input} type="date" value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} />
              {academicYears && academicYears.length > 0 ? (
                <select
                  style={styles.input}
                  value={copyFromYearId}
                  onChange={(e) => setCopyFromYearId(e.target.value)}
                >
                  <option value="">Copy class sections from…</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                style={styles.button}
                onClick={addAcademicYear}
                disabled={isAddingYear || !yearLabel.trim() || !yearStart || !yearEnd}
              >
                Add
              </button>
              <button style={styles.secondaryButton} onClick={() => setShowAddYear(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}

      {bulkGenerateForYear ? (
        <Modal title="Bulk generate class sections" onClose={closeBulkGenerateModal}>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Classes</label>
              <textarea
                style={{ ...styles.input, ...styles.textarea }}
                placeholder="Grade 1, Grade 2, Grade 3"
                value={bulkClassNames}
                onChange={(e) => setBulkClassNames(e.target.value)}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Sections</label>
              <textarea
                style={{ ...styles.input, ...styles.textarea }}
                placeholder="A, B, C"
                value={bulkSectionNames}
                onChange={(e) => setBulkSectionNames(e.target.value)}
              />
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
            {bulkPreviewCount > 0
              ? `This will create up to ${bulkPreviewCount} section${bulkPreviewCount === 1 ? "" : "s"}.`
              : "Enter at least one class and one section."}
          </p>
          {bulkError ? <p style={styles.error}>{bulkError}</p> : null}
          {bulkResult ? (
            <div style={styles.tempPasswordBox}>
              Created {bulkResult.created} section{bulkResult.created === 1 ? "" : "s"}
              {bulkResult.skipped > 0 ? `, skipped ${bulkResult.skipped} (already existed).` : "."}
            </div>
          ) : null}
          <ModalFooter>
            <button style={styles.secondaryButton} onClick={closeBulkGenerateModal}>
              {bulkResult ? "Done" : "Cancel"}
            </button>
            <button
              style={styles.button}
              onClick={() => bulkGenerateForYear && bulkGenerateSections(bulkGenerateForYear)}
              disabled={isBulkGenerating || bulkPreviewCount === 0}
            >
              {isBulkGenerating ? "Generating…" : "Generate"}
            </button>
          </ModalFooter>
        </Modal>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  textarea: { minHeight: 80, resize: "vertical", fontFamily: "inherit" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  tempPasswordBox: {
    marginTop: 16,
    padding: 12,
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
  },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  secondaryButton: {
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
    textTransform: "capitalize",
  },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  smallButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  yearBox: { border: "1px solid var(--border)", borderRadius: 10, padding: 14 },
  yearHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  classSectionBox: { border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-page)" },
  sectionChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: {
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 12,
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  },
  teacherChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 6px 4px 10px",
    borderRadius: 12,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  },
  chipRemoveButton: {
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
  },
};
