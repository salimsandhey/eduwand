import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { CounsellorPerformanceEntry } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

// A ranked list is a table, not a chart (dataviz skill, choosing-a-form.md) - the
// inline bar is a secondary, sequential-hue magnitude cue beside the real numbers,
// not a substitute for them.
export function CounsellorsPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";

  const [data, setData] = useState<CounsellorPerformanceEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getCounsellorPerformance(accessToken, {
        schoolId: needsSchoolPicker ? selectedSchoolId ?? undefined : undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load counsellor performance");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, needsSchoolPicker, selectedSchoolId]);

  useEffect(() => {
    load();
  }, [load]);

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  return (
    <div>
      <PageHeader title="Counsellor Performance" subtitle="Conversion rate and activity per counsellor" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <Card>
          {!data || data.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No enquiries with an assigned owner yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Counsellor</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Converted</th>
                  <th style={styles.th}>Conversion rate</th>
                  <th style={styles.th}>Avg. response time</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.ownerUserId}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>{row.fullName}</td>
                    <td style={styles.td}>{row.totalCount}</td>
                    <td style={styles.td}>{row.convertedCount}</td>
                    <td style={styles.td}>
                      <div style={styles.rateCell}>
                        <div style={styles.rateTrack}>
                          <div style={{ ...styles.rateFill, width: `${row.conversionRate * 100}%` }} />
                        </div>
                        <span>{(row.conversionRate * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      {row.avgResponseHours === null ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        `${row.avgResponseHours}h`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
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
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  rateCell: { display: "flex", alignItems: "center", gap: 10 },
  rateTrack: { width: 100, height: 8, background: "var(--bg-page)", borderRadius: 4, overflow: "hidden" },
  rateFill: { height: "100%", background: "var(--seq-5)", borderRadius: 4 },
};
