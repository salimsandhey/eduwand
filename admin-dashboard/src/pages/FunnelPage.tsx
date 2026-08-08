import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { FunnelResponse, EnquiryStatus } from "../api/client";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { BarChart } from "../components/BarChart";
import { TrustScopeNotice } from "../components/TrustScopeNotice";

// Funnel stages in order, excluding "lost" (a terminal outcome, not a funnel step -
// shown separately below rather than blended into the sequential ramp).
const FUNNEL_STAGES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled"];
const SEQ_COLORS = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

export function FunnelPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsTrustScope, setNeedsTrustScope] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    setNeedsTrustScope(false);
    try {
      const res = await api.getFunnel(accessToken, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === "school_scope_required") {
        setNeedsTrustScope(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load funnel");
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  if (needsTrustScope) return <TrustScopeNotice />;

  return (
    <div style={styles.container}>
      {/* Title Header Section */}
      <div style={styles.headerBlock}>
        <h1 style={styles.title}>Enrolment Funnel</h1>
        <p style={styles.subtitle}>Monitor conversion milestones and lead pipeline metrics</p>
      </div>

      <Card style={{ padding: "20px 24px" }}>
        <div style={styles.filterRow}>
          <div style={styles.filterField}>
            <label style={styles.filterLabel}>Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>
          <div style={styles.filterField}>
            <label style={styles.filterLabel}>End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} style={styles.clearBtn}>
              Clear Filters
            </button>
          )}
        </div>
      </Card>

      {error ? <p style={styles.errorText}>{error}</p> : null}

      {isLoading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Loading funnel data…</p>
        </div>
      ) : data ? (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Total enquiries" value={String(data.totalCount)} />
            <StatTile label="Admitted or enrolled" value={String(data.convertedCount)} />
            <StatTile label="Conversion rate" value={`${(data.conversionRate * 100).toFixed(1)}%`} />
          </div>

          <Card title="Funnel Stage Analysis">
            <BarChart
              data={FUNNEL_STAGES.map((stage, i) => ({
                label: stage,
                value: data.byStatus[stage] ?? 0,
                color: SEQ_COLORS[i],
              }))}
            />
            <div style={styles.chartSeparator}>
              <BarChart
                data={[{ label: "lost", value: data.byStatus.lost ?? 0, color: "var(--status-critical)" }]}
              />
            </div>
          </Card>

          <p style={styles.footerNote}>
            Trend over time is currently unavailable - the backend returns current counts only, not historical snapshots.
          </p>
        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { paddingBottom: 40 },
  headerBlock: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.5px" },
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, margin: 0 },
  filterRow: { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" },
  filterField: { display: "flex", flexDirection: "column", gap: 6 },
  filterLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.2px" },
  dateInput: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    backgroundColor: "#F9FAF9",
    outline: "none",
    fontSize: 13,
    color: "var(--text-primary)",
    fontWeight: 600,
    transition: "border-color 0.2s",
  },
  clearBtn: {
    border: "none",
    background: "none",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 0",
    textDecorationLine: "underline",
  },
  errorText: { color: "var(--status-critical)", fontWeight: 600, margin: "16px 0" },
  loadingContainer: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "3px solid var(--accent-wash)",
    borderTopColor: "var(--accent)",
    animation: "spin 1s linear infinite",
  },
  statsRow: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  chartSeparator: { marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" },
  footerNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 20, fontStyle: "italic" },
};
