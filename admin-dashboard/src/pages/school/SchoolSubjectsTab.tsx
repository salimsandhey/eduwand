import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import type { Subject } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";

// The per-school gateway for Topic.subject (unified-app's Lesson Studio
// "New topic" form reads this list as a closed picker - no free text).
export function SchoolSubjectsTab() {
  const { id, accessToken, canManageAcademics } = useOutletContext<SchoolOutletContext>();

  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const result = await api.listSubjectsForSchool(accessToken, id);
      setSubjects(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subjects");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addSubject() {
    if (!accessToken || !id || !name.trim()) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.createSubject(accessToken, id, name.trim());
      setName("");
      setShowAdd(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add subject");
    } finally {
      setIsAdding(false);
    }
  }

  async function removeSubject(subjectId: string) {
    if (!accessToken || !id) return;
    setError(null);
    try {
      await api.deleteSubject(accessToken, id, subjectId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove subject");
    }
  }

  return (
    <Card title="Subjects">
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
        The subjects teachers can choose from when creating a Lesson Studio topic. No free text - this is the
        only source.
      </p>

      {error ? <p style={styles.error}>{error}</p> : null}

      {!subjects ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : subjects.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No subjects added yet.</p>
      ) : (
        <div style={styles.chipRow}>
          {subjects.map((s) => (
            <span key={s.id} style={styles.chip}>
              {s.name}
              {canManageAcademics ? (
                <button style={styles.chipRemoveButton} onClick={() => removeSubject(s.id)} aria-label={`Remove ${s.name}`}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}

      {canManageAcademics ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {!showAdd ? (
            <button style={styles.secondaryButton} onClick={() => setShowAdd(true)}>
              + Add subject
            </button>
          ) : (
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="e.g. Mathematics"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <button style={styles.button} onClick={addSubject} disabled={isAdding || !name.trim()}>
                Add
              </button>
              <button
                style={styles.secondaryButton}
                onClick={() => {
                  setShowAdd(false);
                  setName("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 6px 4px 10px",
    borderRadius: 12,
    background: "var(--bg-page)",
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
  },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 8, marginBottom: 0 },
};
