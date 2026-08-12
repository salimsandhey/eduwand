import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { CsvExportLogEntry, CsvExportSchedule } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

export function ExportsPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";
  const canManageSchedule = user?.role === "admin" || user?.role === "leadership" || user?.role === "platform_admin";
  const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;

  const [logs, setLogs] = useState<CsvExportLogEntry[] | null>(null);
  const [schedule, setSchedule] = useState<CsvExportSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setError(null);
    try {
      const [logRes, scheduleRes] = await Promise.all([
        api.listCsvExportLog(accessToken, { schoolId }),
        canManageSchedule ? api.getCsvExportSchedule(accessToken, { schoolId }) : Promise.resolve(null),
      ]);
      setLogs(logRes.data ?? []);
      setSchedule(scheduleRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exports");
    }
  }, [accessToken, needsSchoolPicker, selectedSchoolId, schoolId, canManageSchedule]);

  useEffect(() => {
    load();
  }, [load]);

  async function runExport() {
    if (!accessToken) return;
    setIsRunning(true);
    setError(null);
    try {
      await api.runCsvExport(accessToken, { schoolId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsRunning(false);
    }
  }

  async function updateSchedule(input: { frequency?: "daily" | "weekly"; isActive?: boolean }) {
    if (!accessToken) return;
    setIsSavingSchedule(true);
    try {
      const updated = await api.updateCsvExportSchedule(accessToken, input, { schoolId });
      setSchedule(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update schedule");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function download(id: string) {
    if (!accessToken) return;
    try {
      const csv = await api.downloadExport(accessToken, id, { schoolId });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  return (
    <div>
      <PageHeader
        title="CSV Exports"
        subtitle="Download enrolment data, or schedule a recurring export"
        action={
          <button style={styles.button} onClick={runExport} disabled={isRunning}>
            {isRunning ? "Running…" : "Run export now"}
          </button>
        }
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {canManageSchedule ? (
        <Card title="Recurring export">
          {!schedule ? (
            <p style={{ color: "var(--text-muted)" }}>No schedule configured yet.</p>
          ) : (
            <div style={styles.row}>
              <label style={styles.label}>
                Frequency
                <select
                  style={styles.input}
                  value={schedule.frequency}
                  disabled={isSavingSchedule}
                  onChange={(e) => updateSchedule({ frequency: e.target.value as "daily" | "weekly" })}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label style={{ ...styles.label, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={schedule.isActive}
                  disabled={isSavingSchedule}
                  onChange={(e) => updateSchedule({ isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          )}
          {!schedule ? (
            <button style={styles.secondaryButton} onClick={() => updateSchedule({ frequency: "weekly", isActive: true })}>
              Enable weekly export
            </button>
          ) : null}
        </Card>
      ) : null}

      <Card title="Export history">
        {!logs ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : logs.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No exports yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Run at</th>
                <th style={styles.th}>Rows</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={styles.td}>{new Date(log.runAt).toLocaleString()}</td>
                  <td style={styles.td}>{log.rowCount}</td>
                  <td style={styles.td}>
                    <span style={{ color: log.status === "success" ? "var(--status-good)" : "var(--status-critical)" }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {log.status === "success" ? (
                      <button style={styles.smallButton} onClick={() => download(log.id)}>
                        Download
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
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
};
