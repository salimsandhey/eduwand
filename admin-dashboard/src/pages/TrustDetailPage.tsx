import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustDetail, School } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

const BOARDS = ["CBSE", "ICSE", "State"];

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

  const [showAddSchool, setShowAddSchool] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolBoard, setSchoolBoard] = useState(BOARDS[0]);
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [createdSchool, setCreatedSchool] = useState<School | null>(null);

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

  async function createSchool() {
    if (!accessToken || !id || !schoolName.trim()) return;
    setIsCreatingSchool(true);
    setSchoolError(null);
    try {
      // trustId is always this page's trust - never a picker, per the new flow.
      const school = await api.createSchool(accessToken, { name: schoolName.trim(), board: schoolBoard, trustId: id });
      setCreatedSchool(school);
      setSchoolName("");
      setShowAddSchool(false);
      load();
    } catch (err) {
      setSchoolError(err instanceof Error ? err.message : "Failed to add school");
    } finally {
      setIsCreatingSchool(false);
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

      <PageHeader
        title={trust.name}
        subtitle="Trust details"
        action={
          <span
            style={{
              ...styles.statusBadge,
              color: trust.status === "active" ? "var(--status-good)" : "var(--status-critical)",
            }}
          >
            {trust.status}
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
        {canEdit ? (
          <div style={styles.addSchoolBox}>
            {!showAddSchool ? (
              <button style={styles.secondaryButton} onClick={() => setShowAddSchool(true)}>
                + Add school
              </button>
            ) : (
              <div style={styles.row}>
                <input
                  style={styles.input}
                  placeholder="School name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  autoFocus
                />
                <select style={styles.input} value={schoolBoard} onChange={(e) => setSchoolBoard(e.target.value)}>
                  {BOARDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <button style={styles.button} onClick={createSchool} disabled={isCreatingSchool || !schoolName.trim()}>
                  {isCreatingSchool ? "Adding…" : "Add school"}
                </button>
                <button style={styles.secondaryButton} onClick={() => setShowAddSchool(false)}>
                  Cancel
                </button>
              </div>
            )}
            {schoolError ? <p style={styles.error}>{schoolError}</p> : null}
            {createdSchool ? (
              <p style={styles.success}>
                Added "{createdSchool.name}" to this trust —{" "}
                <Link to={`/schools/${createdSchool.id}`}>open it to invite the school's first admin</Link>.
              </p>
            ) : null}
          </div>
        ) : null}

        {trust.schools.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No schools under this trust yet.{" "}
            {canEdit ? "Use \"+ Add school\" above." : "Ask your platform admin to add one."}
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
  addSchoolBox: { marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" },
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
