import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { FunnelResponse, TrendResponse, PipelineStage } from "../api/client";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { BarChart } from "../components/BarChart";
import { LineChart } from "../components/LineChart";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

// Pipeline stages are configurable per school (FR-EG-3) - fetched dynamically
// rather than a fixed list. Colors cycle if a school configures more non-terminal
// stages than the sequential ramp has steps, rather than crashing.
const SEQ_COLORS = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Jan" normally; "Jan '25" at the first bucket and at every year boundary, so a
// 12-month trailing window that spans two calendar years never reads as ambiguous.
function formatPeriodLabel(period: string, index: number): string {
  const [year, month] = period.split("-");
  const monthName = MONTH_NAMES[Number(month) - 1];
  const isYearBoundary = index === 0 || month === "01";
  return isYearBoundary ? `${monthName} '${year.slice(2)}` : monthName;
}

export function FunnelPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";

  const [data, setData] = useState<FunnelResponse | null>(null);
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [stages, setStages] = useState<PipelineStage[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setIsLoading(true);
    setError(null);
    try {
      const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;
      const [funnelRes, trendRes, stagesRes] = await Promise.all([
        api.getFunnel(accessToken, {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          schoolId,
        }),
        api.getTrend(accessToken, { schoolId }),
        api.listPipelineStages(accessToken, { schoolId }),
      ]);
      setData(funnelRes);
      setTrend(trendRes);
      setStages([...stagesRes].sort((a, b) => a.order - b.order));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load funnel");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, startDate, endDate, needsSchoolPicker, selectedSchoolId]);

  useEffect(() => {
    load();
  }, [load]);

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  return (
    <div style={styles.container}>
      <PageHeader title="Enrolment Funnel" subtitle="Monitor conversion milestones and lead pipeline metrics" />

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
      ) : data && stages ? (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Total enquiries" value={String(data.totalCount)} />
            <StatTile label="Converted" value={String(data.convertedCount)} />
            <StatTile label="Conversion rate" value={`${(data.conversionRate * 100).toFixed(1)}%`} />
          </div>

          <Card title="Funnel Stage Analysis">
            <BarChart
              data={stages
                .filter((s) => !s.isTerminal)
                .map((stage, i) => ({
                  label: stage.label,
                  value: data.byStatus[stage.key] ?? 0,
                  color: SEQ_COLORS[i % SEQ_COLORS.length],
                }))}
            />
            {stages.some((s) => s.isTerminal) ? (
              <div style={styles.chartSeparator}>
                <BarChart
                  data={stages
                    .filter((s) => s.isTerminal)
                    .map((stage) => ({
                      label: stage.label,
                      value: data.byStatus[stage.key] ?? 0,
                      color: "var(--status-critical)",
                    }))}
                />
              </div>
            ) : null}
          </Card>

          {trend ? (
            <Card title="Enrolment Trend (last 12 months)">
              <LineChart
                xLabels={trend.periods.map((p, i) => formatPeriodLabel(p.period, i))}
                series={[
                  { label: "New enquiries", color: "var(--series-1)", values: trend.periods.map((p) => p.newEnquiries) },
                  { label: "Converted", color: "var(--series-2)", values: trend.periods.map((p) => p.converted) },
                ]}
              />
            </Card>
          ) : null}
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
