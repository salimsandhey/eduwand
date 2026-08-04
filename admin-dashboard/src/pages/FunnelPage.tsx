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
    <div>
      <h1 style={{ marginTop: 0 }}>Enrolment Funnel</h1>

      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
              Start date
            </label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
              End date
            </label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
              style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13 }}
            >
              Clear
            </button>
          )}
        </div>
      </Card>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p>Loading…</p>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <StatTile label="Total enquiries" value={String(data.totalCount)} />
            <StatTile label="Admitted or enrolled" value={String(data.convertedCount)} />
            <StatTile label="Conversion rate" value={`${(data.conversionRate * 100).toFixed(1)}%`} />
          </div>

          <Card title="Funnel by stage">
            <BarChart
              data={FUNNEL_STAGES.map((stage, i) => ({
                label: stage,
                value: data.byStatus[stage] ?? 0,
                color: SEQ_COLORS[i],
              }))}
            />
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <BarChart
                data={[{ label: "lost", value: data.byStatus.lost ?? 0, color: "var(--status-critical)" }]}
              />
            </div>
          </Card>

          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Trend over time isn't available yet - the backend returns current counts only, not historical
            snapshots.
          </p>
        </>
      ) : null}
    </div>
  );
}
