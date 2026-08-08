import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustSummary } from "../api/client";
import { Card } from "../components/Card";

export function TrustsPage() {
  const { accessToken } = useAuth();
  const [trusts, setTrusts] = useState<TrustSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listTrusts(accessToken)
      .then(setTrusts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trusts"));
  }, [accessToken]);

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={{ marginTop: 0 }}>Trusts</h1>
        <Link to="/onboarding" style={styles.newButton}>
          + New trust
        </Link>
      </div>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!trusts ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : trusts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No trusts yet — create one from the Onboarding page.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {trusts.map((t) => (
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
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  newButton: {
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
};
