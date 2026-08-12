import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { SchoolDetail } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

const BOARDS = ["CBSE", "ICSE", "State"];
const STATUSES = ["onboarding", "active", "suspended"];

export function SchoolDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [board, setBoard] = useState("CBSE");
  const [address, setAddress] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const canEdit = user?.role === "platform_admin" || user?.role === "leadership";

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const s = await api.getSchool(accessToken, id);
      setSchool(s);
      setName(s.name);
      setBoard(s.board);
      setAddress(s.address ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load school");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDetails() {
    if (!accessToken || !id) return;
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      const updated = await api.updateSchool(accessToken, id, { name, board, address: address || undefined });
      setSchool(updated);
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function inviteAdmin() {
    if (!accessToken || !id || !inviteName.trim() || !inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await api.inviteUser(accessToken, {
        fullName: inviteName.trim(),
        email: inviteEmail.trim(),
        role: "admin",
        schoolId: id,
      });
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setInviteResult({ email: inviteEmail.trim(), tempPassword: tempPassword ?? "(not returned)" });
      setInviteName("");
      setInviteEmail("");
      setShowInvite(false);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Failed to invite admin");
    } finally {
      setIsInviting(false);
    }
  }

  async function setStatus(status: string) {
    if (!accessToken || !id) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateSchool(accessToken, id, { status });
      setSchool(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setIsSaving(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/trusts" style={styles.backLink}>
          ← Back to trusts
        </Link>
        <p style={{ color: "var(--status-critical)" }}>{error}</p>
      </div>
    );
  }

  if (!school) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div>
      <Link to={`/trusts/${school.trustId}`} style={styles.backLink}>
        ← Back to trust
      </Link>

      <PageHeader
        title={school.name}
        subtitle="School details"
        action={
          <span
            style={{
              ...styles.statusBadge,
              color:
                school.status === "active"
                  ? "var(--status-good)"
                  : school.status === "suspended"
                  ? "var(--status-critical)"
                  : "var(--text-muted)",
            }}
          >
            {school.status}
          </span>
        }
      />

      <Card title="Details">
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Board</label>
            <select style={styles.input} value={board} onChange={(e) => setBoard(e.target.value)} disabled={!canEdit}>
              {BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ ...styles.field, marginTop: 12 }}>
          <label style={styles.label}>Address</label>
          <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} />
        </div>

        {canEdit ? (
          <>
            <div style={styles.actionRow}>
              <button style={styles.button} onClick={saveDetails} disabled={isSaving || !name}>
                Save changes
              </button>
              {STATUSES.filter((s) => s !== school.status).map((s) => (
                <button key={s} style={styles.secondaryButton} onClick={() => setStatus(s)} disabled={isSaving}>
                  Mark {s}
                </button>
              ))}
            </div>
            {saveMessage ? <p style={styles.success}>{saveMessage}</p> : null}
            {saveError ? <p style={styles.error}>{saveError}</p> : null}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
            Only platform admins and trust leadership can edit school details.
          </p>
        )}
      </Card>

      {canEdit ? (
        <Card title="Invite an admin">
          {!showInvite ? (
            <button style={styles.secondaryButton} onClick={() => setShowInvite(true)}>
              + Invite admin
            </button>
          ) : (
            <div style={styles.row}>
              <input
                style={styles.input}
                placeholder="Full name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                autoFocus
              />
              <input
                style={styles.input}
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button style={styles.button} onClick={inviteAdmin} disabled={isInviting || !inviteName.trim() || !inviteEmail.trim()}>
                {isInviting ? "Inviting…" : "Send invite"}
              </button>
              <button style={styles.secondaryButton} onClick={() => setShowInvite(false)}>
                Cancel
              </button>
            </div>
          )}
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
        </Card>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backLink: { display: "inline-block", marginBottom: 12, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" },
  headerRow: { display: "flex", alignItems: "center", gap: 12 },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  actionRow: { display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" },
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
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
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
