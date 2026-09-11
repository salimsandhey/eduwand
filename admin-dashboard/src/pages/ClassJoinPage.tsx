import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicGetClassJoinInfo, publicSubmitClassJoinRequest, ApiError } from "../api/client";
import type { ClassJoinInfo } from "../api/client";

// Public, unauthenticated landing page for a class join link
// (ClassSection.joinCode). Submitting here NEVER grants class entry - it
// creates a pending ClassJoinRequest the teacher must approve in the app.
// See Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md.

export function ClassJoinPage() {
  const { code } = useParams<{ code: string }>();

  const [info, setInfo] = useState<ClassJoinInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!code) return;
    publicGetClassJoinInfo(code)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "This class link is invalid or no longer active"));
  }, [code]);

  async function submit() {
    if (!code || !studentName.trim() || !dateOfBirth || !guardianName.trim() || !guardianContact.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await publicSubmitClassJoinRequest(code, {
        studentName: studentName.trim(),
        dateOfBirth,
        guardianName: guardianName.trim(),
        guardianContact: guardianContact.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <p style={{ color: "var(--status-critical)", margin: 0 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <h2 style={styles.title}>Request sent</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            Your request to join <strong>{info.className} {info.sectionName}</strong> has been sent to
            {info.teacherName ? ` ${info.teacherName}` : " the teacher"} for review. You'll be added once they confirm it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        <h2 style={styles.title}>
          Join {info.className} {info.sectionName}
        </h2>
        <p style={{ color: "var(--text-secondary)", marginTop: -6 }}>
          {info.schoolName}
          {info.teacherName ? ` · ${info.teacherName}` : ""}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Fill this in to request joining the class. The teacher will review and confirm before the student is added.
        </p>

        <div style={styles.field}>
          <label style={styles.label}>Student's full name</label>
          <input style={styles.input} value={studentName} onChange={(e) => setStudentName(e.target.value)} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Date of birth</label>
          <input style={styles.input} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Guardian's name</label>
          <input style={styles.input} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Guardian's phone number</label>
          <input style={styles.input} value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} />
        </div>

        {submitError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{submitError}</p> : null}

        <button
          style={{ ...styles.button, opacity: isSubmitting ? 0.6 : 1 }}
          onClick={submit}
          disabled={isSubmitting || !studentName.trim() || !dateOfBirth || !guardianName.trim() || !guardianContact.trim()}
        >
          {isSubmitting ? "Submitting…" : "Request to join"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-page, #f6f7fb)",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  },
  title: { margin: "0 0 4px 0", fontSize: 20, fontWeight: 800 },
  field: { display: "flex", flexDirection: "column", gap: 6, marginTop: 14 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  button: {
    marginTop: 20,
    width: "100%",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 15,
  },
};
