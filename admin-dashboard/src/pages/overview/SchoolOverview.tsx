import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { FunnelResponse, CounsellorPerformanceEntry, AppUserSummary, EnquiryStatus } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { StatTile } from "../../components/StatTile";
import { BarChart } from "../../components/BarChart";

const FUNNEL_STAGES: EnquiryStatus[] = ["new", "contacted", "visit", "application", "admitted", "enrolled"];
const SEQ_COLORS = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

export function SchoolOverview() {
  const { accessToken, user } = useAuth();
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [counsellors, setCounsellors] = useState<CounsellorPerformanceEntry[] | null>(null);
  const [users, setUsers] = useState<AppUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.getFunnel(accessToken), api.getCounsellorPerformance(accessToken), api.listUsers(accessToken)])
      .then(([f, c, u]) => {
        setFunnel(f);
        setCounsellors(c);
        setUsers(u);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load overview"));
  }, [accessToken]);

  const isLoading = !funnel || !counsellors || !users;
  const activeStaff = users?.filter((u) => u.status === "active").length ?? 0;
  const topCounsellor = counsellors?.[0];

  return (
    <div>
      <PageHeader title="Overview" subtitle="Your school's enrolment and staff at a glance" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Total enquiries" value={String(funnel.totalCount)} />
            <StatTile label="Conversion rate" value={`${(funnel.conversionRate * 100).toFixed(1)}%`} />
            <StatTile label="Active staff" value={String(activeStaff)} />
          </div>

          <div style={styles.twoCol}>
            <Card title="Funnel snapshot">
              <BarChart
                data={FUNNEL_STAGES.map((stage, i) => ({
                  label: stage,
                  value: funnel.byStatus[stage] ?? 0,
                  color: SEQ_COLORS[i],
                }))}
              />
              <Link to="/funnel" style={styles.viewAllLink}>
                View full funnel →
              </Link>
            </Card>

            <Card title="Team">
              {topCounsellor ? (
                <div style={styles.topCounsellor}>
                  <span style={styles.topCounsellorLabel}>Top counsellor</span>
                  <span style={styles.topCounsellorName}>{topCounsellor.fullName}</span>
                  <span style={styles.topCounsellorStat}>
                    {(topCounsellor.conversionRate * 100).toFixed(0)}% conversion · {topCounsellor.totalCount}{" "}
                    enquiries
                  </span>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No counsellor activity yet.</p>
              )}
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 16, marginBottom: 0 }}>
                {users.length} staff · {activeStaff} active
              </p>
              {user?.schoolId ? (
                <Link to={`/schools/${user.schoolId}/staff`} style={styles.viewAllLink}>
                  Manage staff →
                </Link>
              ) : null}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statsRow: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  twoCol: { display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" },
  viewAllLink: { display: "inline-block", marginTop: 16, color: "var(--accent)", fontWeight: 600, fontSize: 13, textDecoration: "none" },
  topCounsellor: { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 4 },
  topCounsellorLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" },
  topCounsellorName: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)" },
  topCounsellorStat: { fontSize: 13, color: "var(--text-secondary)" },
};
