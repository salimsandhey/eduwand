import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustDetail } from "../api/client";
import { Card } from "../components/Card";

export function TrustDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const canEdit = user?.role === "platform_admin";
  const [trust, setTrust] = useState<TrustDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const t = await api.getTrust(accessToken, id);
      setTrust(t);
      setName(t.name);
      setContactEmail(t.contactEmail ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trust");
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
      const updated = await api.updateTrust(accessToken, id, { name, contactEmail: contactEmail || undefined });
      setTrust((prev) => (prev ? { ...prev, name: updated.name } : prev));
      setSaveMessage("Saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus() {
    if (!accessToken || !id || !trust) return;
    const nextStatus = trust.status === "active" ? "suspended" : "active";
    setSaveError(null);
    setIsSaving(true);
    try {
      const updated = await api.updateTrust(accessToken, id, { status: nextStatus });
      setTrust((prev) => (prev ? { ...prev, status: updated.status } : prev));
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

  if (!trust) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div>
      <Link to="/trusts" style={styles.backLink}>
        ← Back to trusts
      </Link>

      <div style={styles.headerRow}>
        <h1 style={{ marginTop: 0 }}>{trust.name}</h1>
        <span
          style={{
            ...styles.statusBadge,
            color: trust.status === "active" ? "var(--status-good)" : "var(--status-critical)",
          }}
        >
          {trust.status}
        </span>
      </div>

      <Card title="Details">
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contact email</label>
            <input
              style={styles.input}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>
        {canEdit ? (
          <>
            <div style={styles.actionRow}>
              <button style={styles.button} onClick={saveDetails} disabled={isSaving || !name}>
                Save changes
              </button>
              <button style={styles.secondaryButton} onClick={toggleStatus} disabled={isSaving}>
                {trust.status === "active" ? "Suspend trust" : "Reactivate trust"}
              </button>
            </div>
            {saveMessage ? <p style={styles.success}>{saveMessage}</p> : null}
            {saveError ? <p style={styles.error}>{saveError}</p> : null}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
            Only platform admins can edit trust details.
          </p>
        )}
      </Card>

      <Card title="Schools">
        {trust.schools.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No schools under this trust yet.{" "}
            <Link to="/onboarding" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Add one from Onboarding.
            </Link>
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
                        color:
                          s.status === "active"
                            ? "var(--status-good)"
                            : s.status === "suspended"
                            ? "var(--status-critical)"
                            : "var(--text-muted)",
                      }}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <Link to={`/schools/${s.id}`} style={styles.viewLink}>
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
  backLink: { display: "inline-block", marginBottom: 12, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" },
  headerRow: { display: "flex", alignItems: "center", gap: 12 },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  row: { display: "flex", gap: 16, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 200 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)" },
  input: { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 },
  actionRow: { display: "flex", gap: 8, marginTop: 16 },
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
  },
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 12, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 12, marginBottom: 0 },
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
  viewLink: { color: "var(--accent)", fontWeight: 600, fontSize: 13, textDecoration: "none" },
};
