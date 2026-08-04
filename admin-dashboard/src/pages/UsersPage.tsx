import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { AppUserSummary } from "../api/client";
import { Card } from "../components/Card";
import { TrustScopeNotice } from "../components/TrustScopeNotice";

export function UsersPage() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<AppUserSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsTrustScope, setNeedsTrustScope] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    setNeedsTrustScope(false);
    try {
      const res = await api.listUsers(accessToken);
      setUsers(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === "school_scope_required") {
        setNeedsTrustScope(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load users");
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (needsTrustScope) return <TrustScopeNotice />;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>User & Role Management</h1>

      <Card>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
          Invite, role-change, and disable actions aren't built yet - there's no invite flow (email delivery,
          identity provisioning) designed on the backend. This lists existing staff accounts only.
        </p>
      </Card>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <Card>
          {!users || users.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No users found for this school.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td}>{u.fullName}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={{ ...styles.td, textTransform: "capitalize" }}>{u.role}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          color: u.status === "active" ? "var(--status-good)" : "var(--text-muted)",
                        }}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button style={styles.disabledButton} disabled title="Not built yet">
                        Change role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card>
        <button style={styles.disabledButton} disabled title="Not built yet">
          Invite user
        </button>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  disabledButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-muted)",
    fontSize: 13,
    cursor: "not-allowed",
  },
};
