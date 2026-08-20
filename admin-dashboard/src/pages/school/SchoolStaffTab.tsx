import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { AppUserSummary } from "../../api/client";
import { Card } from "../../components/Card";
import { Modal, ModalFooter } from "../../components/Modal";
import type { SchoolOutletContext } from "./SchoolLayout";

const INVITABLE_ROLES = ["front_desk", "counsellor", "teacher", "admin"];

export function SchoolStaffTab() {
  const { id, accessToken, user, canManageStaff, reload } = useOutletContext<SchoolOutletContext>();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(INVITABLE_ROLES[0]);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [staff, setStaff] = useState<AppUserSummary[] | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [staffRowError, setStaffRowError] = useState<Record<string, string>>({});
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [staffBulkError, setStaffBulkError] = useState<string | null>(null);
  const [isStaffBulkWorking, setIsStaffBulkWorking] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!accessToken || !id || !canManageStaff) return;
    setStaffLoading(true);
    setStaffError(null);
    try {
      const res = await api.listUsers(accessToken, { schoolId: id });
      setStaff(res);
      setSelectedStaffIds(new Set());
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, id, canManageStaff]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  async function inviteStaff() {
    if (!accessToken || !id || !inviteName.trim() || !inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await api.inviteUser(accessToken, {
        fullName: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        schoolId: id,
      });
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setInviteResult({ email: inviteEmail.trim(), tempPassword: tempPassword ?? "(not returned)" });
      setInviteName("");
      setInviteEmail("");
      setInviteRole(INVITABLE_ROLES[0]);
      reload();
      loadStaff();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to invite staff member");
    } finally {
      setIsInviting(false);
    }
  }

  function closeInviteModal() {
    setShowInvite(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole(INVITABLE_ROLES[0]);
    setInviteError(null);
    setInviteResult(null);
  }

  async function changeStaffRole(staffId: string, role: string) {
    if (!accessToken) return;
    setSavingStaffId(staffId);
    setStaffRowError((prev) => ({ ...prev, [staffId]: "" }));
    try {
      const updated = await api.updateUser(accessToken, staffId, { role });
      setStaff((prev) => prev?.map((u) => (u.id === staffId ? updated : u)) ?? prev);
      setEditingRoleId(null);
    } catch (err) {
      setStaffRowError((prev) => ({ ...prev, [staffId]: err instanceof Error ? err.message : "Failed to change role" }));
    } finally {
      setSavingStaffId(null);
    }
  }

  async function toggleStaffStatus(u: AppUserSummary) {
    if (!accessToken) return;
    const nextStatus = u.status === "disabled" ? "active" : "disabled";
    setSavingStaffId(u.id);
    setStaffRowError((prev) => ({ ...prev, [u.id]: "" }));
    try {
      const updated = await api.updateUser(accessToken, u.id, { status: nextStatus });
      setStaff((prev) => prev?.map((x) => (x.id === u.id ? updated : x)) ?? prev);
    } catch (err) {
      setStaffRowError((prev) => ({ ...prev, [u.id]: err instanceof Error ? err.message : "Failed to update status" }));
    } finally {
      setSavingStaffId(null);
    }
  }

  async function resetStaffPassword(u: AppUserSummary) {
    if (!accessToken) return;
    if (!window.confirm(`Generate a new temporary password for ${u.fullName}? Their current password stops working immediately.`)) return;
    setSavingStaffId(u.id);
    setStaffRowError((prev) => ({ ...prev, [u.id]: "" }));
    setResetResult(null);
    try {
      const res = await api.resetUserPassword(accessToken, u.id);
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setResetResult({ email: u.email, tempPassword: tempPassword ?? "(not returned)" });
      if (res.data) setStaff((prev) => prev?.map((x) => (x.id === u.id ? res.data! : x)) ?? prev);
    } catch (err) {
      setStaffRowError((prev) => ({ ...prev, [u.id]: err instanceof Error ? err.message : "Failed to reset password" }));
    } finally {
      setSavingStaffId(null);
    }
  }

  function toggleStaffSelected(staffId: string) {
    setSelectedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  function toggleSelectAllStaff() {
    if (!filteredStaff) return;
    const selectableIds = filteredStaff.filter((u) => u.id !== user?.id).map((u) => u.id);
    setSelectedStaffIds((prev) => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)));
  }

  async function bulkSetStaffStatus(status: "active" | "disabled") {
    if (!accessToken || selectedStaffIds.size === 0) return;
    setStaffBulkError(null);
    setIsStaffBulkWorking(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedStaffIds).map((staffId) => api.updateUser(accessToken, staffId, { status }))
      );
      const failures = results.filter((r) => r.status === "rejected").length;
      if (failures > 0) setStaffBulkError(`${failures} of ${selectedStaffIds.size} update(s) failed.`);
      await loadStaff();
    } finally {
      setIsStaffBulkWorking(false);
    }
  }

  const filteredStaff = staff?.filter((u) => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });
  const selectableStaffCount = filteredStaff?.filter((u) => u.id !== user?.id).length ?? 0;
  const allStaffSelected = selectableStaffCount > 0 && selectedStaffIds.size === selectableStaffCount;

  return (
    <Card>
      <div style={styles.staffHeader}>
        <h3 style={styles.staffHeaderTitle}>Staff</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {staff && staff.length > 0 ? (
            <input
              style={{ ...styles.input, minWidth: 220 }}
              placeholder="Search name, email, or role…"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
            />
          ) : null}
          <button style={styles.button} onClick={() => setShowInvite(true)}>
            + Invite staff
          </button>
        </div>
      </div>

      {staffError ? <p style={styles.error}>{staffError}</p> : null}

      {resetResult ? (
        <div style={styles.tempPasswordBox}>
          <p style={{ margin: "0 0 4px 0" }}>
            New temporary password for <strong>{resetResult.email}</strong> - share it with them yourself, there's
            no email delivery yet:
          </p>
          <code style={styles.code}>{resetResult.tempPassword}</code>
        </div>
      ) : null}

      {staffLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : !staff || staff.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No staff found for this school.</p>
      ) : filteredStaff && filteredStaff.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No staff match "{staffSearch}".</p>
      ) : (
        <>
          {selectedStaffIds.size > 0 ? (
            <div style={styles.bulkBar}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedStaffIds.size} selected</span>
              <button
                style={styles.smallButton}
                disabled={isStaffBulkWorking}
                onClick={() => bulkSetStaffStatus("disabled")}
              >
                Disable selected
              </button>
              <button
                style={styles.smallButton}
                disabled={isStaffBulkWorking}
                onClick={() => bulkSetStaffStatus("active")}
              >
                Enable selected
              </button>
              {staffBulkError ? (
                <span style={{ color: "var(--status-critical)", fontSize: 12 }}>{staffBulkError}</span>
              ) : null}
            </div>
          ) : null}
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>
                  <input
                    type="checkbox"
                    checked={allStaffSelected}
                    onChange={toggleSelectAllStaff}
                    aria-label="Select all"
                  />
                </th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {(filteredStaff ?? []).map((u) => {
                const isSelf = u.id === user?.id;
                const isSaving = savingStaffId === u.id;
                return (
                  <tr key={u.id}>
                    <td style={styles.td}>
                      {isSelf ? null : (
                        <input
                          type="checkbox"
                          checked={selectedStaffIds.has(u.id)}
                          onChange={() => toggleStaffSelected(u.id)}
                          aria-label={`Select ${u.fullName}`}
                        />
                      )}
                    </td>
                    <td style={styles.td}>{u.fullName}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={{ ...styles.td, textTransform: "capitalize" }}>
                      {editingRoleId === u.id ? (
                        <select
                          style={styles.roleSelect}
                          defaultValue={u.role}
                          autoFocus
                          disabled={isSaving}
                          onChange={(e) => changeStaffRole(u.id, e.target.value)}
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
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
                            onClick={() => toggleStaffStatus(u)}
                          >
                            {u.status === "disabled" ? "Enable" : "Disable"}
                          </button>
                          <button style={styles.smallButton} disabled={isSaving} onClick={() => resetStaffPassword(u)}>
                            Reset password
                          </button>
                        </div>
                      )}
                      {staffRowError[u.id] ? (
                        <p style={{ color: "var(--status-critical)", fontSize: 12, margin: "4px 0 0 0" }}>
                          {staffRowError[u.id]}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {showInvite ? (
        <Modal title="Invite staff" onClose={closeInviteModal}>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Full name</label>
              <input
                style={styles.input}
                placeholder="e.g. Priya Sharma"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                style={styles.input}
                placeholder="name@school.example"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Role</label>
              <select style={styles.input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {inviteError ? <p style={styles.error}>{inviteError}</p> : null}
          {inviteResult ? (
            <div style={styles.tempPasswordBox}>
              <p style={{ margin: "0 0 4px 0" }}>
                Share these credentials with <strong>{inviteResult.email}</strong> yourself - there's no email
                delivery yet:
              </p>
              <code style={styles.code}>{inviteResult.tempPassword}</code>
            </div>
          ) : null}
          <ModalFooter>
            <button style={styles.secondaryButton} onClick={closeInviteModal}>
              {inviteResult ? "Done" : "Cancel"}
            </button>
            <button
              style={styles.button}
              onClick={inviteStaff}
              disabled={isInviting || !inviteName.trim() || !inviteEmail.trim()}
            >
              {isInviting ? "Inviting…" : "Send invite"}
            </button>
          </ModalFooter>
        </Modal>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
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
  secondaryButton: {
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
    textTransform: "capitalize",
  },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  tempPasswordBox: {
    marginTop: 16,
    padding: 12,
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
  },
  code: { fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
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
  staffHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  staffHeaderTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: "-0.2px",
  },
  bulkBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0 14px 0",
    marginBottom: 6,
    borderBottom: "1px solid var(--border)",
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
  roleSelect: {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 13,
    textTransform: "capitalize",
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
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
};
