import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { AiUsageResponse } from "../api/client";
import { Card } from "../components/Card";
import { StatTile } from "../components/StatTile";
import { BarChart } from "../components/BarChart";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

const FEATURE_LABELS: Record<string, string> = {
  lesson_plan: "Lesson plans",
  research_report: "Research reports",
  personalisation_suggestion: "Personalisation suggestions",
  grading: "Grading",
};

export function AiUsagePage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";

  const [data, setData] = useState<AiUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAiUsage(accessToken, {
        schoolId: needsSchoolPicker ? selectedSchoolId ?? undefined : undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI usage analytics");
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
      <PageHeader title="AI Usage Analytics" subtitle="Leadership visibility into AI Module adoption" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : data ? (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Total generations" value={String(data.totalGenerations)} />
            <StatTile
              label="Avg. grading turnaround"
              value={data.avgGradingTurnaroundMs !== null ? `${(data.avgGradingTurnaroundMs / 1000).toFixed(1)}s` : "—"}
            />
          </div>

          <Card title="Generations per teacher">
            {data.generationsByTeacher.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>No AI generations yet.</p>
            ) : (
              <BarChart
                data={data.generationsByTeacher.map((t, i) => ({
                  label: t.fullName,
                  value: t.count,
                  color: SERIES_COLORS[i % SERIES_COLORS.length],
                }))}
              />
            )}
          </Card>

          <Card title="Feature usage breakdown">
            {data.featureUsage.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>No AI generations yet.</p>
            ) : (
              <BarChart
                data={data.featureUsage.map((f, i) => ({
                  label: FEATURE_LABELS[f.feature] ?? f.feature,
                  value: f.count,
                  color: SERIES_COLORS[(i + 1) % SERIES_COLORS.length],
                }))}
              />
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statsRow: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" },
};
