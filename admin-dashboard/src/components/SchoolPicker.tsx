import type { CSSProperties } from "react";
import { useSchoolContext } from "../context/SchoolContext";

// Rendered in the topbar only for the leadership role - lets them switch which
// school in their trust the school-scoped analytics/users pages show.
export function SchoolPicker() {
  const { schools, selectedSchoolId, setSelectedSchoolId, isLoading } = useSchoolContext();

  if (isLoading && schools.length === 0) return null;
  if (schools.length === 0) return null;

  return (
    <div style={styles.wrap}>
      <span style={styles.label}>Viewing</span>
      <select
        style={styles.select}
        value={selectedSchoolId ?? ""}
        onChange={(e) => setSelectedSchoolId(e.target.value || null)}
      >
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 8 },
  label: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" },
  select: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
