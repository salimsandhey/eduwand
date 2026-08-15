import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api, ApiError } from "../api/client";
import type { SchoolDetail, AcademicYear } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

const BOARDS = ["CBSE", "ICSE", "State"];
const STATUSES = ["onboarding", "active", "suspended"];

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span style={{ color: done ? "var(--status-good)" : "var(--text-muted)", fontWeight: 700 }}>{done ? "✓" : "○"}</span>
      <span style={{ color: done ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

export function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { setSelectedSchoolId } = useSchoolContext();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [academicYears, setAcademicYears] = useState<AcademicYear[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);

  const [showAddYear, setShowAddYear] = useState(false);
  const [yearLabel, setYearLabel] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [isAddingYear, setIsAddingYear] = useState(false);

  const [addingSectionForYear, setAddingSectionForYear] = useState<string | null>(null);
  const [sectionClassName, setSectionClassName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  const [name, setName] = useState("");
  const [board, setBoard] = useState("CBSE");
  const [address, setAddress] = useState("");
  const [principalName, setPrincipalName] = useState("");
  const [principalPhone, setPrincipalPhone] = useState("");
  const [expectedStudentStrength, setExpectedStudentStrength] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const canEdit = user?.role === "platform_admin" || user?.role === "leadership";
  const canDelete = user?.role === "platform_admin";

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const s = await api.getSchool(accessToken, id);
      setSchool(s);
      setName(s.name);
      setBoard(s.board);
      setAddress(s.address ?? "");
      setPrincipalName(s.principalName ?? "");
      setPrincipalPhone(s.principalPhone ?? "");
      setExpectedStudentStrength(s.expectedStudentStrength != null ? String(s.expectedStudentStrength) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load school");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function addAcademicYear() {
    if (!accessToken || !id || !yearLabel.trim() || !yearStart || !yearEnd) return;
    setIsAddingYear(true);
    setClassesError(null);
    try {
      await api.createAcademicYear(accessToken, id, { label: yearLabel.trim(), startDate: yearStart, endDate: yearEnd });
      setYearLabel("");
      setYearStart("");
      setYearEnd("");
      setShowAddYear(false);
      loadClasses();
      load();
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
      load();
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
      load();
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : "Failed to add class section");
    } finally {
      setIsAddingSection(false);
    }
  }

  function viewStaff() {
    if (!id) return;
    setSelectedSchoolId(id);
    navigate("/users");
  }

  async function saveDetails() {
    if (!accessToken || !id) return;
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      const updated = await api.updateSchool(accessToken, id, {
        name,
        board,
        address: address || undefined,
        principalName: principalName || undefined,
        principalPhone: principalPhone || undefined,
        expectedStudentStrength: expectedStudentStrength ? Number(expectedStudentStrength) : undefined,
      });
      setSchool(updated);
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function inviteAdmin() {
    if (!accessToken || !id || !inviteName.trim() || !inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await api.inviteUser(accessToken, {
        fullName: inviteName.trim(),
        email: inviteEmail.trim(),
        role: "admin",
        schoolId: id,
      });
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setInviteResult({ email: inviteEmail.trim(), tempPassword: tempPassword ?? "(not returned)" });
      setInviteName("");
      setInviteEmail("");
      load();
      setShowInvite(false);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to invite admin");
    } finally {
      setIsInviting(false);
    }
  }

  async function setStatus(status: string) {
    if (!accessToken || !id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateSchool(accessToken, id, { status });
      setSchool(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSchool() {
    if (!accessToken || !id || !school) return;
    if (!window.confirm(`Permanently delete "${school.name}"? This cannot be undone.`)) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await api.deleteSchool(accessToken, id);
      navigate(`/trusts/${school.trustId}`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete school");
    } finally {
      setIsDeleting(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/trusts" style={styles.backLink}>
          ← Back to trusts
        </Link>
        <p style={{ color: "var(--status-critical)" }}>{error}</p>
      </div>
    );
  }

  if (!school) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div>
      <Link to={`/trusts/${school.trustId}`} style={styles.backLink}>
        ← Back to trust
      </Link>

      <PageHeader
        title={school.name}
        subtitle="School details"
        action={
          <span
            style={{
              ...styles.statusBadge,
              color:
                school.status === "active"
                  ? "var(--status-good)"
                  : school.status === "suspended"
                  ? "var(--status-critical)"
                  : "var(--text-muted)",
            }}
          >
            {school.status}
          </span>
        }
      />

      {!school.readiness.ready ? (
        <Card title="Setup checklist">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ChecklistRow done={school.readiness.hasCurrentAcademicYear} label="Current academic year set" />
            <ChecklistRow done={school.readiness.hasClassSections} label="At least one class section added" />
            <ChecklistRow done={school.readiness.hasAdmin} label="Admin or leadership user invited" />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
            This school can't be marked active until everything above is checked off.
          </p>
        </Card>
      ) : null}

      <Card title="Details">
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Board</label>
            <select style={styles.input} value={board} onChange={(e) => setBoard(e.target.value)} disabled={!canEdit}>
              {BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...styles.row, marginTop: 12 }}>
          <div style={styles.field}>
            <label style={styles.label}>Address</label>
            <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Principal name</label>
            <input
              style={styles.input}
              value={principalName}
              onChange={(e) => setPrincipalName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Principal phone</label>
            <input
              style={styles.input}
              value={principalPhone}
              onChange={(e) => setPrincipalPhone(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div style={{ ...styles.field, maxWidth: 160 }}>
            <label style={styles.label}>Expected students</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={expectedStudentStrength}
              onChange={(e) => setExpectedStudentStrength(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {canEdit ? (
          <>
            <div style={styles.actionRow}>
              <button style={styles.button} onClick={saveDetails} disabled={isSaving || !name}>
                Save changes
              </button>
              {STATUSES.filter((s) => s !== school.status).map((s) => {
                const blocked = s === "active" && !school.readiness.ready;
                return (
                  <button
                    key={s}
                    style={styles.secondaryButton}
                    onClick={() => setStatus(s)}
                    disabled={isSaving || blocked}
                    title={blocked ? `Not ready: ${school.readiness.missing.join("; ")}` : undefined}
                  >
                    Mark {s}
                  </button>
                );
              })}
              {canDelete ? (
                <button style={styles.dangerButton} onClick={deleteSchool} disabled={isDeleting}>
                  {isDeleting ? "Deleting…" : "Delete school"}
                </button>
              ) : null}
              <button style={styles.secondaryButton} onClick={viewStaff}>
                View staff →
              </button>
            </div>
            {saveMessage ? <p style={styles.success}>{saveMessage}</p> : null}
            {saveError ? <p style={styles.error}>{saveError}</p> : null}
            {deleteError ? <p style={styles.error}>{deleteError}</p> : null}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
            Only platform admins and trust leadership can edit school details.
          </p>
        )}
      </Card>

      {canEdit ? (
        <Card title="Invite an admin">
          {!showInvite ? (
            <button style={styles.secondaryButton} onClick={() => setShowInvite(true)}>
              + Invite admin
            </button>
          ) : (
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                autoFocus
              />
              <input
                style={styles.input}
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button style={styles.button} onClick={inviteAdmin} disabled={isInviting || !inviteName.trim() || !inviteEmail.trim()}>
                {isInviting ? "Inviting…" : "Send invite"}
              </button>
              <button style={styles.secondaryButton} onClick={() => setShowInvite(false)}>
                Cancel
              </button>
            </div>
          )}
          {inviteError ? <p style={styles.error}>{inviteError}</p> : null}
          {inviteResult ? (
            <div style={styles.tempPasswordBox}>
              <p style={{ margin: "0 0 4px 0" }}>
                Share these credentials with <strong>{inviteResult.email}</strong> yourself - there's no email
                delivery yet:
              </p>
              <code style={styles.code}>{inviteResult.tempPassword}</code>
            </div>
          ) : null}
        </Card>
      ) : null}

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
                  ) : canEdit ? (
                    <button style={styles.smallButton} onClick={() => makeCurrentYear(year.id)}>
                      Make current
                    </button>
                  ) : null}
                </div>
                {year.classSections.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0" }}>No class sections yet.</p>
                ) : (
                  <div style={styles.sectionChips}>
                    {year.classSections.map((cs) => (
                      <span key={cs.id} style={styles.chip}>
                        {cs.className} {cs.sectionName}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit ? (
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
                    <button style={{ ...styles.smallButton, marginTop: 8 }} onClick={() => setAddingSectionForYear(year.id)}>
                      + Add class section
                    </button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canEdit ? (
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
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backLink: { display: "inline-block", marginBottom: 12, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" },
  headerRow: { display: "flex", alignItems: "center", gap: 12 },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  actionRow: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
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
  dangerButton: {
    background: "var(--bg-page)",
    color: "var(--status-critical)",
    border: "1px solid var(--status-critical)",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  tempPasswordBox: {
    marginTop: 16,
    padding: 12,
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
  },
  code: { fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
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
};
