import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { BySourceResponse } from "../api/client";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { BarChart } from "../components/BarChart";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

// Fixed categorical order, validated for CVD/normal-vision separation
// (dataviz skill, scripts/validate_palette.js) - never reordered per filter.
const SOURCE_COLORS: Record<string, string> = {
  phone: "var(--series-1)",
  website: "var(--series-2)",
  walk_in: "var(--series-3)",
  referral: "var(--series-4)",
  event: "var(--series-5)",
  social: "var(--series-6)",
};
const SOURCE_ORDER = ["phone", "website", "walk_in", "referral", "event", "social"];

function previousPeriod(startDate: string, endDate: string): { startDate: string; endDate: string } | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const lengthMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);
  return { startDate: prevStart.toISOString().slice(0, 10), endDate: prevEnd.toISOString().slice(0, 10) };
}

export function BySourcePage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";

  const [data, setData] = useState<BySourceResponse | null>(null);
  const [previous, setPrevious] = useState<BySourceResponse | null>(null);
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
      const res = await api.getBySource(accessToken, { startDate: startDate || undefined, endDate: endDate || undefined, schoolId });
      setData(res);

      const prevRange = previousPeriod(startDate, endDate);
      if (prevRange) {
        const prevRes = await api.getBySource(accessToken, { ...prevRange, schoolId });
        setPrevious(prevRes);
      } else {
        setPrevious(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load source breakdown");
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

  const delta =
    data && previous && previous.totalCount > 0
      ? ((data.totalCount - previous.totalCount) / previous.totalCount) * 100
      : null;

  return (
    <div>
      <PageHeader title="Enquiry Source Breakdown" subtitle="Volume of enquiries by channel" />

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
        </div>
        {!startDate || !endDate ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
            Set both dates to see a comparison against the prior period of equal length.
          </p>
        ) : null}
      </Card>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p>Loading…</p>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <StatTile label="Total enquiries" value={String(data.totalCount)} />
            {delta !== null ? (
              <StatTile
                label="vs previous period"
                value={`${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
              />
            ) : null}
          </div>

          <Card title="By source">
            <BarChart
              data={SOURCE_ORDER.map((source) => ({
                label: source.replace("_", " "),
                value: data.bySource[source as keyof typeof data.bySource] ?? 0,
                color: SOURCE_COLORS[source],
              }))}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
