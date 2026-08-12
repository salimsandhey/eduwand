import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSchoolContext } from "../../context/SchoolContext";
import { api } from "../../api/client";
import type { TrustDetail } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { StatTile } from "../../components/StatTile";

export function LeadershipOverview() {
  const { accessToken, user } = useAuth();
  const { setSelectedSchoolId } = useSchoolContext();
  const navigate = useNavigate();
  const [trust, setTrust] = useState<TrustDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.trustId) return;
    api
      .getTrust(accessToken, user.trustId)
      .then(setTrust)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load your trust"));
  }, [accessToken, user?.trustId]);

  function viewSchoolData(schoolId: string) {
    setSelectedSchoolId(schoolId);
    navigate("/funnel");
  }

  return (
    <div>
      <PageHeader title={trust ? trust.name : "Trust Overview"} subtitle="Schools in your trust" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!trust ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.statsRow}>
            <StatTile label="Schools" value={String(trust.schools.length)} />
            <StatTile
              label="Active schools"
              value={String(trust.schools.filter((s) => s.status === "active").length)}
            />
          </div>

          <Card title="Schools">
            {trust.schools.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>
                No schools yet — ask your platform admin to add one to your trust.
              </p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Board</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {trust.schools.map((s) => (
                    <tr key={s.id}>
                      <td style={styles.td}>{s.name}</td>
                      <td style={styles.td}>{s.board}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            color: s.status === "active" ? "var(--status-good)" : "var(--text-muted)",
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <button style={styles.linkButton} onClick={() => viewSchoolData(s.id)}>
                            View data →
                          </button>
                          <Link to={`/schools/${s.id}`} style={styles.viewLink}>
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  viewLink: { color: "var(--text-secondary)", fontWeight: 600, fontSize: 13, textDecoration: "none" },
  linkButton: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
};
