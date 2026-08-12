import type { CSSProperties } from "react";
import { useSchoolContext } from "../context/SchoolContext";

// Shown on school-scoped pages (Funnel, Sources, Counsellors, Users) for a
// leadership user before a school is resolved - in practice only when their
// trust has no schools yet, since SchoolContext auto-picks the first one
// otherwise.
export function SelectSchoolPrompt() {
  const { schools, isLoading } = useSchoolContext();

  if (isLoading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading your trust's schools…</p>;
  }

  return (
    <div style={styles.box}>
      <strong style={styles.title}>No schools in your trust yet</strong>
      <p style={styles.body}>
        {schools.length === 0 ? (
          "This screen shows a single school's data at a time. Ask your platform admin to add a school to your trust first, then pick it from the \"Viewing\" switcher in the top bar."
        ) : (
          "Pick a school from the \"Viewing\" switcher in the top bar to see its data."
        )}
      </p>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  box: {
    background: "#fff8e6",
    border: "1px solid var(--status-warning)",
    borderRadius: 8,
    padding: 16,
  },
  title: { color: "#8a5a00", display: "block", marginBottom: 6 },
  body: { margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 },
};
