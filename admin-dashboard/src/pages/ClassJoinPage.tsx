import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicGetClassJoinInfo, publicSubmitClassJoinRequest, ApiError } from "../api/client";
import type { ClassJoinInfo } from "../api/client";
import { FieldError, invalidInput } from "../components/FieldError";
import { useFormErrors } from "../hooks/useForm";
import { rules, phoneInput } from "../utils/validation";

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
  const [studentEmail, setStudentEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Rules mirror backend/src/lib/validation.ts; field names match the API's.
  const v = useFormErrors(
    { studentName, dateOfBirth, guardianName, guardianContact, studentEmail },
    {
      studentName: rules.personName("Student name"),
      dateOfBirth: rules.dateOfBirth("Date of birth"),
      guardianName: rules.personName("Guardian name"),
      guardianContact: rules.phone(true, "Guardian phone number"),
      studentEmail: rules.email(true, "Student email"),
    }
  );

  useEffect(() => {
    if (!code) return;
    publicGetClassJoinInfo(code)
      .then(setInfo)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "This class link is invalid or no longer active"));
  }, [code]);

  async function submit() {
    if (!code) return;
    if (!v.submit()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await publicSubmitClassJoinRequest(code, {
        studentName: studentName.trim(),
        dateOfBirth,
        guardianName: guardianName.trim(),
        guardianContact: guardianContact.trim(),
        studentEmail: studentEmail.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && v.applyServerError(err)) setSubmitError("Please fix the highlighted fields.");
      else setSubmitError(err instanceof ApiError ? err.message : "Failed to submit request");
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
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("studentName")) }}
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            onBlur={() => v.blur("studentName")}
            maxLength={80}
            autoComplete="off"
            aria-invalid={!!v.error("studentName")}
          />
          <FieldError message={v.error("studentName")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Date of birth</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("dateOfBirth")) }}
            type="date"
            value={dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateOfBirth(e.target.value)}
            onBlur={() => v.blur("dateOfBirth")}
            aria-invalid={!!v.error("dateOfBirth")}
          />
          <FieldError message={v.error("dateOfBirth")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Guardian's name</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("guardianName")) }}
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            onBlur={() => v.blur("guardianName")}
            maxLength={80}
            autoComplete="name"
            aria-invalid={!!v.error("guardianName")}
          />
          <FieldError message={v.error("guardianName")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Guardian's phone number</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("guardianContact")) }}
            value={guardianContact}
            onChange={(e) => setGuardianContact(phoneInput(e.target.value))}
            onBlur={() => v.blur("guardianContact")}
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            placeholder="10-digit mobile number"
            aria-invalid={!!v.error("guardianContact")}
          />
          <FieldError message={v.error("guardianContact")} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Student's email (used to sign in)</label>
          <input
            style={{ ...styles.input, ...invalidInput(!!v.error("studentEmail")) }}
            type="email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            onBlur={() => v.blur("studentEmail")}
            maxLength={254}
            autoComplete="email"
            aria-invalid={!!v.error("studentEmail")}
          />
          <FieldError message={v.error("studentEmail")} />
        </div>

        {submitError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{submitError}</p> : null}

        <button
          style={{ ...styles.button, opacity: isSubmitting ? 0.6 : 1 }}
          onClick={submit}
          disabled={isSubmitting}
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
