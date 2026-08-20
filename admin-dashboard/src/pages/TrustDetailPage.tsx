import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustDetail, School } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Modal, ModalFooter } from "../components/Modal";

const BOARDS = ["CBSE", "ICSE", "State"];

export function TrustDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const canEdit = user?.role === "platform_admin";
  const [trust, setTrust] = useState<TrustDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [trustType, setTrustType] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonPhone, setContactPersonPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [expectedSchoolCount, setExpectedSchoolCount] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [schoolSearch, setSchoolSearch] = useState("");

  const [showAddSchool, setShowAddSchool] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolBoard, setSchoolBoard] = useState(BOARDS[0]);
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolTimezone, setSchoolTimezone] = useState("Asia/Kolkata");
  const [principalName, setPrincipalName] = useState("");
  const [principalPhone, setPrincipalPhone] = useState("");
  const [expectedStudentStrength, setExpectedStudentStrength] = useState("");
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
      setLegalName(t.legalName ?? "");
      setTrustType(t.trustType ?? "");
      setContactPersonName(t.contactPersonName ?? "");
      setContactPersonPhone(t.contactPersonPhone ?? "");
      setContactEmail(t.contactEmail ?? "");
      setRegisteredAddress(t.registeredAddress ?? "");
      setGstNumber(t.gstNumber ?? "");
      setExpectedSchoolCount(t.expectedSchoolCount != null ? String(t.expectedSchoolCount) : "");
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
      const updated = await api.updateTrust(accessToken, id, {
        name,
        legalName: legalName || undefined,
        trustType: trustType || undefined,
        contactPersonName: contactPersonName || undefined,
        contactPersonPhone: contactPersonPhone || undefined,
        contactEmail: contactEmail || undefined,
        registeredAddress: registeredAddress || undefined,
        gstNumber: gstNumber || undefined,
        expectedSchoolCount: expectedSchoolCount ? Number(expectedSchoolCount) : undefined,
      });
      setTrust((prev) => (prev ? { ...prev, ...updated } : prev));
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
      const school = await api.createSchool(accessToken, {
        name: schoolName.trim(),
        board: schoolBoard,
        trustId: id,
        address: schoolAddress.trim() || undefined,
        timezone: schoolTimezone || undefined,
        principalName: principalName.trim() || undefined,
        principalPhone: principalPhone.trim() || undefined,
        expectedStudentStrength: expectedStudentStrength ? Number(expectedStudentStrength) : undefined,
      });
      setCreatedSchool(school);
      setSchoolName("");
      setSchoolAddress("");
      setPrincipalName("");
      setPrincipalPhone("");
      setExpectedStudentStrength("");
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

  async function deleteTrust() {
    if (!accessToken || !id || !trust) return;
    if (trust.schools.length > 0) return;
    if (!window.confirm(`Permanently delete "${trust.name}"? This cannot be undone.`)) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await api.deleteTrust(accessToken, id);
      navigate("/trusts");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete trust");
    } finally {
      setIsDeleting(false);
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
            <label style={styles.label}>Display name</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Legal / registered name</label>
            <input style={styles.input} value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Trust type</label>
            <select style={styles.input} value={trustType} onChange={(e) => setTrustType(e.target.value)} disabled={!canEdit}>
              <option value="">Not set</option>
              <option value="society">Society</option>
              <option value="trust">Trust</option>
              <option value="section_8_company">Section 8 company</option>
              <option value="private_limited">Private limited</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div style={{ ...styles.row, marginTop: 16 }}>
          <div style={styles.field}>
            <label style={styles.label}>Contact person</label>
            <input
              style={styles.input}
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              disabled={!canEdit}
              placeholder="Name"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contact person phone</label>
            <input
              style={styles.input}
              value={contactPersonPhone}
              onChange={(e) => setContactPersonPhone(e.target.value)}
              disabled={!canEdit}
            />
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
        <div style={{ ...styles.row, marginTop: 16 }}>
          <div style={styles.field}>
            <label style={styles.label}>Registered address</label>
            <input
              style={styles.input}
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>GST number</label>
            <input style={styles.input} value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={{ ...styles.field, maxWidth: 160 }}>
            <label style={styles.label}>Expected schools</label>
            <input
              style={styles.input}
              type="number"
              min={0}
              value={expectedSchoolCount}
              onChange={(e) => setExpectedSchoolCount(e.target.value)}
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
              <button
                style={styles.dangerButton}
                onClick={deleteTrust}
                disabled={isDeleting || trust.schools.length > 0}
                title={trust.schools.length > 0 ? "Remove all schools from this trust first" : undefined}
              >
                {isDeleting ? "Deleting…" : "Delete trust"}
              </button>
            </div>
            {trust.schools.length > 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                This trust has {trust.schools.length} school(s) - remove them before it can be deleted.
              </p>
            ) : null}
            {saveMessage ? <p style={styles.success}>{saveMessage}</p> : null}
            {saveError ? <p style={styles.error}>{saveError}</p> : null}
            {deleteError ? <p style={styles.error}>{deleteError}</p> : null}
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
            <button style={styles.secondaryButton} onClick={() => setShowAddSchool(true)}>
              + Add school
            </button>

            {showAddSchool ? (
              <Modal title="Add school" onClose={() => setShowAddSchool(false)}>
                <div style={styles.formGrid}>
                  <div style={styles.field}>
                    <label style={styles.label}>School name</label>
                    <input
                      style={styles.input}
                      placeholder="e.g. Sunrise Public School"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Board</label>
                    <select style={styles.input} value={schoolBoard} onChange={(e) => setSchoolBoard(e.target.value)}>
                      {BOARDS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Timezone</label>
                    <input
                      style={styles.input}
                      placeholder="e.g. Asia/Kolkata"
                      value={schoolTimezone}
                      onChange={(e) => setSchoolTimezone(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Expected student strength</label>
                    <input
                      style={styles.input}
                      placeholder="Optional"
                      type="number"
                      min={0}
                      value={expectedStudentStrength}
                      onChange={(e) => setExpectedStudentStrength(e.target.value)}
                    />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label style={styles.label}>Address</label>
                    <input
                      style={styles.input}
                      placeholder="Optional"
                      value={schoolAddress}
                      onChange={(e) => setSchoolAddress(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Principal name</label>
                    <input
                      style={styles.input}
                      placeholder="Optional"
                      value={principalName}
                      onChange={(e) => setPrincipalName(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Principal phone</label>
                    <input
                      style={styles.input}
                      placeholder="Optional"
                      value={principalPhone}
                      onChange={(e) => setPrincipalPhone(e.target.value)}
                    />
                  </div>
                </div>
                {schoolError ? <p style={styles.error}>{schoolError}</p> : null}
                <ModalFooter>
                  <button style={styles.secondaryButton} onClick={() => setShowAddSchool(false)}>
                    Cancel
                  </button>
                  <button style={styles.button} onClick={createSchool} disabled={isCreatingSchool || !schoolName.trim()}>
                    {isCreatingSchool ? "Adding…" : "Add school"}
                  </button>
                </ModalFooter>
              </Modal>
            ) : null}

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
          <>
            {trust.schools.length > 5 ? (
              <input
                style={{ ...styles.input, maxWidth: 280, marginBottom: 12 }}
                placeholder="Search schools…"
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
              />
            ) : null}
            {(() => {
              const q = schoolSearch.trim().toLowerCase();
              const filteredSchools = q ? trust.schools.filter((s) => s.name.toLowerCase().includes(q)) : trust.schools;
              if (filteredSchools.length === 0) {
                return <p style={{ color: "var(--text-muted)" }}>No schools match "{schoolSearch}".</p>;
              }
              return (
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
              {filteredSchools.map((s) => (
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
              );
            })()}
          </>
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
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  fieldFull: { gridColumn: "1 / -1" },
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
  dangerButton: {
    background: "var(--bg-page)",
    color: "var(--status-critical)",
    border: "1px solid var(--status-critical)",
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
