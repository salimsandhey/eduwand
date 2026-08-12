import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { PipelineStage } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

export function PipelineStagesPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";

  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setError(null);
    try {
      const res = await api.listPipelineStages(accessToken, { schoolId });
      setStages(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline stages");
    }
  }, [accessToken, needsSchoolPicker, selectedSchoolId, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(stage: PipelineStage, direction: -1 | 1) {
    if (!accessToken || !stages) return;
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((s) => s.id === stage.id);
    const swapWith = sorted[index + direction];
    if (!swapWith) return;

    setSavingId(stage.id);
    try {
      await Promise.all([
        api.updatePipelineStage(accessToken, stage.id, { order: swapWith.order }, { schoolId }),
        api.updatePipelineStage(accessToken, swapWith.id, { order: stage.order }, { schoolId }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder");
    } finally {
      setSavingId(null);
    }
  }

  async function rename(stage: PipelineStage, label: string) {
    if (!accessToken || !label.trim() || label === stage.label) return;
    setSavingId(stage.id);
    try {
      await api.updatePipelineStage(accessToken, stage.id, { label: label.trim() }, { schoolId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleFlag(stage: PipelineStage, flag: "isTerminal" | "isConverted") {
    if (!accessToken) return;
    setSavingId(stage.id);
    try {
      await api.updatePipelineStage(accessToken, stage.id, { [flag]: !stage[flag] }, { schoolId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setSavingId(null);
    }
  }

  async function addStage() {
    if (!accessToken || !newKey.trim() || !newLabel.trim()) return;
    setAddError(null);
    try {
      await api.createPipelineStage(accessToken, { key: newKey.trim(), label: newLabel.trim() }, { schoolId });
      setNewKey("");
      setNewLabel("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add stage");
    }
  }

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  const sortedStages = stages ? [...stages].sort((a, b) => a.order - b.order) : null;

  return (
    <div>
      <PageHeader
        title="Pipeline Stages"
        subtitle="Configure the admissions stages your team moves enquiries through"
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!sortedStages ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>Key</th>
                <th style={styles.th}>Label</th>
                <th style={styles.th}>Terminal</th>
                <th style={styles.th}>Counts as converted</th>
              </tr>
            </thead>
            <tbody>
              {sortedStages.map((stage, i) => (
                <tr key={stage.id}>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        style={styles.reorderBtn}
                        disabled={i === 0 || savingId === stage.id}
                        onClick={() => move(stage, -1)}
                      >
                        ↑
                      </button>
                      <button
                        style={styles.reorderBtn}
                        disabled={i === sortedStages.length - 1 || savingId === stage.id}
                        onClick={() => move(stage, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td style={{ ...styles.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{stage.key}</td>
                  <td style={styles.td}>
                    <input
                      style={styles.labelInput}
                      defaultValue={stage.label}
                      disabled={savingId === stage.id}
                      onBlur={(e) => rename(stage, e.target.value)}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={stage.isTerminal}
                      disabled={savingId === stage.id}
                      onChange={() => toggleFlag(stage, "isTerminal")}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={stage.isConverted}
                      disabled={savingId === stage.id}
                      onChange={() => toggleFlag(stage, "isConverted")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Add a stage">
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="Key (e.g. waitlist)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
          />
          <input
            style={styles.input}
            placeholder="Label (e.g. Waitlist)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button style={styles.button} onClick={addStage} disabled={!newKey.trim() || !newLabel.trim()}>
            Add stage
          </button>
        </div>
        {addError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{addError}</p> : null}
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
          New stages can't be removed once created - archiving a stage with live enquiries in it needs a product
          decision, not a silent delete.
        </p>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    padding: "0 12px 10px 0",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "10px 12px 10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  reorderBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 13,
  },
  labelInput: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 14,
    minWidth: 160,
  },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    flex: 1,
    minWidth: 160,
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
};
