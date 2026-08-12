import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { TrustSummary, School } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { StatTile } from "../../components/StatTile";

export function PlatformOverview() {
  const { accessToken } = useAuth();
  const [trusts, setTrusts] = useState<TrustSummary[] | null>(null);
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([api.listTrusts(accessToken), api.listSchools(accessToken)])
      .then(([t, s]) => {
        setTrusts(t);
        setSchools(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load overview"));
  }, [accessToken]);

  const isLoading = !trusts || !schools;
  const activeSchools = schools?.filter((s) => s.status === "active").length ?? 0;

  return (
    <div>
      <PageHeader
        title="Platform Overview"
        subtitle="Every trust and school on EduWand"
        action={
          <Link to="/trusts" style={styles.actionButton}>
            + Onboard a trust or school
          </Link>
        }
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Trusts" value={String(trusts.length)} />
            <StatTile label="Schools" value={String(schools.length)} />
            <StatTile label="Active schools" value={String(activeSchools)} />
          </div>

          <Card title="Trusts">
            {trusts.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>
                No trusts yet — <Link to="/trusts">create the first one</Link>.
              </p>
            ) : (
              <>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trusts.slice(0, 5).map((t) => (
                      <tr key={t.id}>
                        <td style={styles.td}>{t.name}</td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.statusBadge,
                              color: t.status === "active" ? "var(--status-good)" : "var(--status-critical)",
                            }}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <Link to={`/trusts/${t.id}`} style={styles.viewLink}>
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {trusts.length > 5 ? (
                  <Link to="/trusts" style={styles.viewAllLink}>
                    View all {trusts.length} trusts →
                  </Link>
                ) : null}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statsRow: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" },
  actionButton: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
  },
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
  statusBadge: { fontSize: 12, fontWeight: 600, textTransform: "capitalize" },
  viewLink: { color: "var(--accent)", fontWeight: 600, fontSize: 13, textDecoration: "none" },
  viewAllLink: { display: "inline-block", marginTop: 12, color: "var(--accent)", fontWeight: 600, fontSize: 13, textDecoration: "none" },
};
