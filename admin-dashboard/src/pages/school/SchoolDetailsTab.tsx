import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";

// Same board list unified-app's signup screen uses (src/constants/boards.ts)
// - keep these in sync.
const BOARDS = ["CBSE", "ICSE", "IB"];
const STATUSES = ["onboarding", "active", "suspended"];

export function SchoolDetailsTab() {
  const { school, reload, canEditSchoolProfile, canDelete, accessToken, id } = useOutletContext<SchoolOutletContext>();
  const navigate = useNavigate();

  const [name, setName] = useState(school.name);
  const [address, setAddress] = useState(school.address ?? "");
  const [principalName, setPrincipalName] = useState(school.principalName ?? "");
  const [principalPhone, setPrincipalPhone] = useState(school.principalPhone ?? "");
  const [expectedStudentStrength, setExpectedStudentStrength] = useState(
    school.expectedStudentStrength != null ? String(school.expectedStudentStrength) : ""
  );
  const [classLimit, setClassLimit] = useState(school.classLimit != null ? String(school.classLimit) : "");
  const [subjectLimit, setSubjectLimit] = useState(school.subjectLimit != null ? String(school.subjectLimit) : "");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showBoardRequest, setShowBoardRequest] = useState(false);
  const [requestedBoard, setRequestedBoard] = useState(school.board);
  const [boardRequestMessage, setBoardRequestMessage] = useState<string | null>(null);
  const [boardRequestError, setBoardRequestError] = useState<string | null>(null);
  const [isSubmittingBoardRequest, setIsSubmittingBoardRequest] = useState(false);

  useEffect(() => {
    setName(school.name);
    setRequestedBoard(school.board);
    setAddress(school.address ?? "");
    setPrincipalName(school.principalName ?? "");
    setPrincipalPhone(school.principalPhone ?? "");
    setExpectedStudentStrength(school.expectedStudentStrength != null ? String(school.expectedStudentStrength) : "");
    setClassLimit(school.classLimit != null ? String(school.classLimit) : "");
    setSubjectLimit(school.subjectLimit != null ? String(school.subjectLimit) : "");
  }, [school]);

  async function saveDetails() {
    if (!accessToken || !id) return;
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      await api.updateSchool(accessToken, id, {
        name,
        address: address || undefined,
        principalName: principalName || undefined,
        principalPhone: principalPhone || undefined,
        expectedStudentStrength: expectedStudentStrength ? Number(expectedStudentStrength) : undefined,
        ...(school.accountType === "individual"
          ? {
              classLimit: classLimit.trim() ? Number(classLimit) : null,
              subjectLimit: subjectLimit.trim() ? Number(subjectLimit) : null,
            }
          : {}),
      });
      await reload();
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  // Board is request/approval-only for every school - no self-service edit
  // path (backend/src/routes/schools.ts rejects any board change on PATCH
  // /schools/:id outside an approved ticket). See Docs/superpowers/plans/
  // 2026-09-09-individual-teacher-onboarding-and-credits.md.
  async function requestBoardChange() {
    if (!accessToken || !id || requestedBoard === school.board) return;
    setBoardRequestError(null);
    setBoardRequestMessage(null);
    setIsSubmittingBoardRequest(true);
    try {
      await api.createBoardChangeTicket(accessToken, id, { requestedBoard });
      setBoardRequestMessage("Request submitted - a platform admin will review it.");
      setShowBoardRequest(false);
    } catch (err) {
      setBoardRequestError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setIsSubmittingBoardRequest(false);
    }
  }

  async function setStatus(status: string) {
    if (!accessToken || !id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await api.updateSchool(accessToken, id, { status });
      await reload();
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

  return (
    <Card title="Details">
      <div style={styles.row}>
        <div style={styles.field}>
          <label style={styles.label}>Name</label>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEditSchoolProfile} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Board</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>{school.board}</span>
            {canEditSchoolProfile ? (
              <button style={styles.linkButton} onClick={() => setShowBoardRequest((v) => !v)}>
                Request change
              </button>
            ) : null}
          </div>
          {showBoardRequest ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <select style={styles.input} value={requestedBoard} onChange={(e) => setRequestedBoard(e.target.value)}>
                {BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                style={styles.secondaryButton}
                onClick={requestBoardChange}
                disabled={isSubmittingBoardRequest || requestedBoard === school.board}
              >
                {isSubmittingBoardRequest ? "Submitting…" : "Submit"}
              </button>
            </div>
          ) : null}
          {boardRequestMessage ? <p style={styles.success}>{boardRequestMessage}</p> : null}
          {boardRequestError ? <p style={styles.error}>{boardRequestError}</p> : null}
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, marginBottom: 0 }}>
            Board is a backend setting - changes go through platform admin review.
          </p>
        </div>
      </div>
      <div style={{ ...styles.row, marginTop: 12 }}>
        <div style={styles.field}>
          <label style={styles.label}>Address</label>
          <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEditSchoolProfile} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Principal name</label>
          <input
            style={styles.input}
            value={principalName}
            onChange={(e) => setPrincipalName(e.target.value)}
            disabled={!canEditSchoolProfile}
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Principal phone</label>
          <input
            style={styles.input}
            value={principalPhone}
            onChange={(e) => setPrincipalPhone(e.target.value)}
            disabled={!canEditSchoolProfile}
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
            disabled={!canEditSchoolProfile}
          />
        </div>
      </div>

      {school.accountType === "individual" ? (
        <div style={{ ...styles.row, marginTop: 12 }}>
          <div style={{ ...styles.field, maxWidth: 200 }}>
            <label style={styles.label}>Class limit override</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              placeholder="Platform default"
              value={classLimit}
              onChange={(e) => setClassLimit(e.target.value)}
              disabled={!canEditSchoolProfile}
            />
          </div>
          <div style={{ ...styles.field, maxWidth: 200 }}>
            <label style={styles.label}>Subject limit override</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              placeholder="Platform default"
              value={subjectLimit}
              onChange={(e) => setSubjectLimit(e.target.value)}
              disabled={!canEditSchoolProfile}
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", flexBasis: "100%", margin: 0 }}>
            Leave blank to use the platform default (Platform Settings). Overrides only this teacher's account.
          </p>
        </div>
      ) : null}

      {canEditSchoolProfile ? (
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  linkButton: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
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
};
