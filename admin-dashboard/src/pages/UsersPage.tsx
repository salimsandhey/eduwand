import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { AppUserSummary } from "../api/client";
import { Card } from "../components/Card";
import { TrustScopeNotice } from "../components/TrustScopeNotice";

const INVITABLE_ROLES = ["front_desk", "counsellor", "teacher", "admin"];

export function UsersPage() {
  const { accessToken, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUserSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsTrustScope, setNeedsTrustScope] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(INVITABLE_ROLES[0]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

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

  async function inviteUser() {
    if (!accessToken || !inviteName || !inviteEmail) return;
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await api.inviteUser(accessToken, { fullName: inviteName, email: inviteEmail, role: inviteRole });
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setInviteResult({ email: inviteEmail, tempPassword: tempPassword ?? "(not returned)" });
      setInviteName("");
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite user");
    }
  }

  async function changeRole(id: string, role: string) {
    if (!accessToken) return;
    setSavingRowId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      const updated = await api.updateUser(accessToken, id, { role });
      setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev);
      setEditingRoleId(null);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Failed to change role" }));
    } finally {
      setSavingRowId(null);
    }
  }

  async function toggleUserStatus(u: AppUserSummary) {
    if (!accessToken) return;
    const nextStatus = u.status === "disabled" ? "active" : "disabled";
    setSavingRowId(u.id);
    setRowError((prev) => ({ ...prev, [u.id]: "" }));
    try {
      const updated = await api.updateUser(accessToken, u.id, { status: nextStatus });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? prev);
    } catch (err) {
      setRowError((prev) => ({ ...prev, [u.id]: err instanceof Error ? err.message : "Failed to update status" }));
    } finally {
      setSavingRowId(null);
    }
  }

  if (needsTrustScope) return <TrustScopeNotice />;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>User & Role Management</h1>

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
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const isSaving = savingRowId === u.id;
                  return (
                    <tr key={u.id}>
                      <td style={styles.td}>{u.fullName}</td>
                      <td style={styles.td}>{u.email}</td>
                      <td style={{ ...styles.td, textTransform: "capitalize" }}>
                        {editingRoleId === u.id ? (
                          <select
                            style={styles.roleSelect}
                            defaultValue={u.role}
                            autoFocus
                            disabled={isSaving}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            onBlur={() => setEditingRoleId(null)}
                          >
                            {INVITABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            color:
                              u.status === "active"
                                ? "var(--status-good)"
                                : u.status === "disabled"
                                ? "var(--status-critical)"
                                : "var(--text-muted)",
                          }}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {isSelf ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>You</span>
                        ) : (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              style={styles.smallButton}
                              disabled={isSaving}
                              onClick={() => setEditingRoleId(editingRoleId === u.id ? null : u.id)}
                            >
                              Change role
                            </button>
                            <button
                              style={u.status === "disabled" ? styles.smallButton : styles.smallDangerButton}
                              disabled={isSaving}
                              onClick={() => toggleUserStatus(u)}
                            >
                              {u.status === "disabled" ? "Enable" : "Disable"}
                            </button>
                          </div>
                        )}
                        {rowError[u.id] ? (
                          <p style={{ color: "var(--status-critical)", fontSize: 12, margin: "4px 0 0 0" }}>
                            {rowError[u.id]}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card>
        {!showInvite ? (
          <button style={styles.button} onClick={() => setShowInvite(true)}>
            Invite user
          </button>
        ) : (
          <div>
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <select style={styles.input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button style={styles.button} onClick={inviteUser} disabled={!inviteName || !inviteEmail}>
                Send invite
              </button>
            </div>
            {inviteError ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{inviteError}</p> : null}
            {inviteResult ? (
              <div style={styles.tempPasswordBox}>
                <p style={{ margin: "0 0 4px 0" }}>
                  Share these credentials with <strong>{inviteResult.email}</strong> yourself - there's no email
                  delivery yet:
                </p>
                <code style={styles.code}>{inviteResult.tempPassword}</code>
              </div>
            ) : null}
          </div>
        )}
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
  roleSelect: {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 13,
    textTransform: "capitalize",
  },
  smallButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  smallDangerButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--status-critical)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    flex: 1,
    minWidth: 140,
  },
  tempPasswordBox: {
    marginTop: 16,
    padding: 12,
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
  },
  code: { fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
};
