import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustSummary } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

export function TrustsPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [trusts, setTrusts] = useState<TrustSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [trustName, setTrustName] = useState("");
  const [trustEmail, setTrustEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .listTrusts(accessToken)
      .then(setTrusts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trusts"));
  }, [accessToken]);

  async function createTrust() {
    if (!accessToken || !trustName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const trust = await api.createTrust(accessToken, trustName.trim(), trustEmail.trim() || undefined);
      // Straight to its detail page - that's where "+ Add school" lives now,
      // so creating a trust flows directly into onboarding its first school.
      navigate(`/trusts/${trust.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create trust");
    } finally {
      setIsCreating(false);
    }
  }

  const filteredTrusts = trusts?.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Trusts"
        subtitle="Every client organisation on the platform"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {trusts && trusts.length > 0 ? (
              <input
                style={styles.search}
                placeholder="Search trusts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            ) : null}
            <button style={styles.newButton} onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Cancel" : "+ New trust"}
            </button>
          </div>
        }
      />

      {showCreate ? (
        <Card title="Create a trust">
          <div style={styles.row}>
            <input
              style={styles.input}
              placeholder="Trust name"
              value={trustName}
              onChange={(e) => setTrustName(e.target.value)}
              autoFocus
            />
            <input
              style={styles.input}
              placeholder="Contact email (optional)"
              value={trustEmail}
              onChange={(e) => setTrustEmail(e.target.value)}
            />
            <button style={styles.newButton} onClick={createTrust} disabled={isCreating || !trustName.trim()}>
              {isCreating ? "Creating…" : "Create trust"}
            </button>
          </div>
          {createError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{createError}</p> : null}
        </Card>
      ) : null}

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!trusts ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : trusts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No trusts yet — click "+ New trust" above to create one.</p>
        ) : filteredTrusts && filteredTrusts.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No trusts match "{search}".</p>
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
              {(filteredTrusts ?? []).map((t) => (
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
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    flex: 1,
    minWidth: 160,
  },
  search: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
    minWidth: 200,
  },
  newButton: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
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
