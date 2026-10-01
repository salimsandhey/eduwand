import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";
import { FieldError, invalidInput } from "../../components/FieldError";
import { useFormErrors } from "../../hooks/useForm";
import { rules, phoneInput } from "../../utils/validation";
import { btn } from "../../components/buttons";

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

  // Rules mirror backend/src/lib/validation.ts; field names match the API's.
  const v = useFormErrors(
    { name, address, principalName, principalPhone, expectedStudentStrength, classLimit, subjectLimit },
    {
      name: rules.label("School name", true, 120),
      address: rules.note("Address", false, 300),
      principalName: rules.personName("Principal name", false),
      principalPhone: rules.phone(false, "Principal phone number"),
      expectedStudentStrength: rules.integer("Expected students", 0, 100000, false),
      classLimit: rules.integer("Class limit", 0, 200, false),
      subjectLimit: rules.integer("Subject limit", 0, 200, false),
    }
  );

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
    if (!v.submit()) {
      setSaveError("Please fix the highlighted fields.");
      return;
    }
    setIsSaving(true);
    try {
      await api.updateSchool(accessToken, id, {
        name: name.trim(),
        // Empty strings clear the saved value on the server.
        address: address.trim(),
        principalName: principalName.trim(),
        principalPhone: principalPhone.trim(),
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
      if (v.applyServerError(err)) setSaveError("Please fix the highlighted fields.");
      else setSaveError(err instanceof Error ? err.message : "Failed to save");
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
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("name")) }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => v.blur("name")}
            maxLength={120}
            aria-invalid={!!v.error("name")}
            disabled={!canEditSchoolProfile}
          />
          <FieldError message={v.error("name")} />
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
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("address")) }}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={() => v.blur("address")}
            maxLength={300}
            aria-invalid={!!v.error("address")}
            disabled={!canEditSchoolProfile}
          />
          <FieldError message={v.error("address")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Principal name</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("principalName")) }}
            value={principalName}
            onChange={(e) => setPrincipalName(e.target.value)}
            onBlur={() => v.blur("principalName")}
            maxLength={80}
            aria-invalid={!!v.error("principalName")}
            disabled={!canEditSchoolProfile}
          />
          <FieldError message={v.error("principalName")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Principal phone</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("principalPhone")) }}
            value={principalPhone}
            onChange={(e) => setPrincipalPhone(phoneInput(e.target.value))}
            onBlur={() => v.blur("principalPhone")}
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            placeholder="10-digit mobile number"
            aria-invalid={!!v.error("principalPhone")}
            disabled={!canEditSchoolProfile}
          />
          <FieldError message={v.error("principalPhone")} />
        </div>
        <div style={{ ...styles.field, maxWidth: 160 }}>
          <label style={styles.label}>Expected students</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("expectedStudentStrength")) }}
            type="number"
            min={0}
            max={100000}
            step={1}
            value={expectedStudentStrength}
            onChange={(e) => setExpectedStudentStrength(e.target.value)}
            onBlur={() => v.blur("expectedStudentStrength")}
            aria-invalid={!!v.error("expectedStudentStrength")}
            disabled={!canEditSchoolProfile}
          />
          <FieldError message={v.error("expectedStudentStrength")} />
        </div>
      </div>

      {school.accountType === "individual" ? (
        <div style={{ ...styles.row, marginTop: 12 }}>
          <div style={{ ...styles.field, maxWidth: 200 }}>
            <label style={styles.label}>Class limit override</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("classLimit")) }}
              type="number"
              min={0}
              max={200}
              step={1}
              placeholder="Platform default"
              value={classLimit}
              onChange={(e) => setClassLimit(e.target.value)}
              onBlur={() => v.blur("classLimit")}
              aria-invalid={!!v.error("classLimit")}
              disabled={!canEditSchoolProfile}
            />
            <FieldError message={v.error("classLimit")} />
          </div>
          <div style={{ ...styles.field, maxWidth: 200 }}>
            <label style={styles.label}>Subject limit override</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("subjectLimit")) }}
              type="number"
              min={0}
              max={200}
              step={1}
              placeholder="Platform default"
              value={subjectLimit}
              onChange={(e) => setSubjectLimit(e.target.value)}
              onBlur={() => v.blur("subjectLimit")}
              aria-invalid={!!v.error("subjectLimit")}
              disabled={!canEditSchoolProfile}
            />
            <FieldError message={v.error("subjectLimit")} />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", flexBasis: "100%", margin: 0 }}>
            Leave blank to use the platform default (Platform Settings). Overrides only this teacher's account.
          </p>
        </div>
      ) : null}

      {canEditSchoolProfile ? (
        <>
          <div style={styles.actionRow}>
            <button style={styles.button} onClick={saveDetails} disabled={isSaving}>
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
  linkButton: btn.link,
  actionRow: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
  button: btn.primary,
  secondaryButton: btn.secondary,
  dangerButton: btn.danger,
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
};
