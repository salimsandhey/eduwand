import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TrustDetail, School, Plan } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Modal, ModalFooter } from "../components/Modal";
import { FieldError, invalidInput } from "../components/FieldError";
import { useFormErrors } from "../hooks/useForm";
import { rules, phoneInput } from "../utils/validation";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
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

  // Rules mirror backend/src/lib/validation.ts; field names match the API's.
  const v = useFormErrors(
    { name, legalName, contactPersonName, contactPersonPhone, contactEmail, registeredAddress, gstNumber, expectedSchoolCount },
    {
      name: rules.label("Trust name", true, 120),
      legalName: rules.label("Legal name", false, 160),
      contactPersonName: rules.personName("Contact person name", false),
      contactPersonPhone: rules.phone(false, "Contact person phone number"),
      contactEmail: rules.email(false, "Contact email"),
      registeredAddress: rules.note("Registered address", false, 300),
      gstNumber: rules.gstin(false),
      expectedSchoolCount: rules.integer("Expected schools", 0, 10000, false),
    }
  );
  const sv = useFormErrors(
    { name: schoolName, timezone: schoolTimezone, expectedStudentStrength, address: schoolAddress, principalName, principalPhone },
    {
      name: rules.label("School name", true, 120),
      timezone: rules.timezone(),
      expectedStudentStrength: rules.integer("Expected student strength", 0, 100000, false),
      address: rules.note("Address", false, 300),
      principalName: rules.personName("Principal name", false),
      principalPhone: rules.phone(false, "Principal phone number"),
    }
  );

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const [t, plansRes] = await Promise.all([
        api.getTrust(accessToken, id),
        canEdit ? api.listPlans(accessToken) : Promise.resolve([]),
      ]);
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
      setPlans(plansRes);
      setSelectedPlanId(t.planId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trust");
    }
  }, [accessToken, id, canEdit]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDetails() {
    if (!accessToken || !id) return;
    setSaveError(null);
    setSaveMessage(null);
    if (!v.submit()) {
      setSaveError("Please fix the highlighted fields.");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await api.updateTrust(accessToken, id, {
        name: name.trim(),
        // Empty strings clear the saved value on the server.
        legalName: legalName.trim(),
        trustType: trustType || undefined,
        contactPersonName: contactPersonName.trim(),
        contactPersonPhone: contactPersonPhone.trim(),
        contactEmail: contactEmail.trim(),
        registeredAddress: registeredAddress.trim(),
        gstNumber: gstNumber.trim().toUpperCase(),
        expectedSchoolCount: expectedSchoolCount ? Number(expectedSchoolCount) : undefined,
      });
      setTrust((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaveMessage("Saved");
    } catch (err) {
      if (v.applyServerError(err)) setSaveError("Please fix the highlighted fields.");
      else setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function createSchool() {
    if (!accessToken || !id) return;
    if (!sv.submit()) {
      setSchoolError("Please fix the highlighted fields.");
      return;
    }
    setIsCreatingSchool(true);
    setSchoolError(null);
    try {
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
      if (sv.applyServerError(err)) setSchoolError("Please fix the highlighted fields.");
      else setSchoolError(err instanceof Error ? err.message : "Failed to add school");
    } finally {
      setIsCreatingSchool(false);
    }
  }

  async function assignPlan() {
    if (!accessToken || !id) return;
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);
    try {
      const updated = await api.updateTrust(accessToken, id, { planId: selectedPlanId || null });
      setTrust((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaveMessage("Plan updated");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update plan");
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
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("name")) }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => v.blur("name")}
              maxLength={120}
              aria-invalid={!!v.error("name")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("name")} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Legal / registered name</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("legalName")) }}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              onBlur={() => v.blur("legalName")}
              maxLength={160}
              aria-invalid={!!v.error("legalName")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("legalName")} />
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
              style={{ ...styles.input, ...invalidInput(!!v.error("contactPersonName")) }}
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              onBlur={() => v.blur("contactPersonName")}
              maxLength={80}
              aria-invalid={!!v.error("contactPersonName")}
              disabled={!canEdit}
              placeholder="Name"
            />
            <FieldError message={v.error("contactPersonName")} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contact person phone</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("contactPersonPhone")) }}
              value={contactPersonPhone}
              onChange={(e) => setContactPersonPhone(phoneInput(e.target.value))}
              onBlur={() => v.blur("contactPersonPhone")}
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              placeholder="10-digit mobile number"
              aria-invalid={!!v.error("contactPersonPhone")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("contactPersonPhone")} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contact email</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("contactEmail")) }}
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              onBlur={() => v.blur("contactEmail")}
              maxLength={254}
              aria-invalid={!!v.error("contactEmail")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("contactEmail")} />
          </div>
        </div>
        <div style={{ ...styles.row, marginTop: 16 }}>
          <div style={styles.field}>
            <label style={styles.label}>Registered address</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("registeredAddress")) }}
              value={registeredAddress}
              onChange={(e) => setRegisteredAddress(e.target.value)}
              onBlur={() => v.blur("registeredAddress")}
              maxLength={300}
              aria-invalid={!!v.error("registeredAddress")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("registeredAddress")} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>GST number</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("gstNumber")) }}
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              onBlur={() => v.blur("gstNumber")}
              maxLength={15}
              aria-invalid={!!v.error("gstNumber")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("gstNumber")} />
          </div>
          <div style={{ ...styles.field, maxWidth: 160 }}>
            <label style={styles.label}>Expected schools</label>
            <input
              style={{ ...styles.input, ...invalidInput(!!v.error("expectedSchoolCount")) }}
              type="number"
              min={0}
              max={10000}
              step={1}
              value={expectedSchoolCount}
              onChange={(e) => setExpectedSchoolCount(e.target.value)}
              onBlur={() => v.blur("expectedSchoolCount")}
              aria-invalid={!!v.error("expectedSchoolCount")}
              disabled={!canEdit}
            />
            <FieldError message={v.error("expectedSchoolCount")} />
          </div>
        </div>

        {canEdit ? (
          <div style={{ ...styles.row, marginTop: 16 }}>
            <div style={styles.field}>
              <label style={styles.label}>Billing plan</label>
              <select style={styles.input} value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
                <option value="">No plan (unlimited teacher seats)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {p.teacherSeatLimit} seat{p.teacherSeatLimit === 1 ? "" : "s"}, {p.creditsPerTeacherSeat} credits/seat
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                No plan assigned = self-service teacher invites are unlimited. Assigning a plan caps invites at its seat limit.
              </p>
            </div>
            <button style={{ ...styles.secondaryButton, alignSelf: "flex-end", height: 42 }} onClick={assignPlan} disabled={isSaving}>
              Save plan
            </button>
          </div>
        ) : null}

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
                      style={{ ...styles.input, ...invalidInput(!!sv.error("name")) }}
                      placeholder="e.g. Sunrise Public School"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      onBlur={() => sv.blur("name")}
                      maxLength={120}
                      aria-invalid={!!sv.error("name")}
                      autoFocus
                    />
                    <FieldError message={sv.error("name")} />
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
                      style={{ ...styles.input, ...invalidInput(!!sv.error("timezone")) }}
                      placeholder="e.g. Asia/Kolkata"
                      value={schoolTimezone}
                      onChange={(e) => setSchoolTimezone(e.target.value)}
                      onBlur={() => sv.blur("timezone")}
                      maxLength={64}
                      aria-invalid={!!sv.error("timezone")}
                    />
                    <FieldError message={sv.error("timezone")} />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Expected student strength</label>
                    <input
                      style={{ ...styles.input, ...invalidInput(!!sv.error("expectedStudentStrength")) }}
                      placeholder="Optional"
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      value={expectedStudentStrength}
                      onChange={(e) => setExpectedStudentStrength(e.target.value)}
                      onBlur={() => sv.blur("expectedStudentStrength")}
                      aria-invalid={!!sv.error("expectedStudentStrength")}
                    />
                    <FieldError message={sv.error("expectedStudentStrength")} />
                  </div>
                  <div style={{ ...styles.field, ...styles.fieldFull }}>
                    <label style={styles.label}>Address</label>
                    <input
                      style={{ ...styles.input, ...invalidInput(!!sv.error("address")) }}
                      placeholder="Optional"
                      value={schoolAddress}
                      onChange={(e) => setSchoolAddress(e.target.value)}
                      onBlur={() => sv.blur("address")}
                      maxLength={300}
                      aria-invalid={!!sv.error("address")}
                    />
                    <FieldError message={sv.error("address")} />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Principal name</label>
                    <input
                      style={{ ...styles.input, ...invalidInput(!!sv.error("principalName")) }}
                      placeholder="Optional"
                      value={principalName}
                      onChange={(e) => setPrincipalName(e.target.value)}
                      onBlur={() => sv.blur("principalName")}
                      maxLength={80}
                      aria-invalid={!!sv.error("principalName")}
                    />
                    <FieldError message={sv.error("principalName")} />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Principal phone</label>
                    <input
                      style={{ ...styles.input, ...invalidInput(!!sv.error("principalPhone")) }}
                      placeholder="Optional - 10-digit mobile number"
                      value={principalPhone}
                      onChange={(e) => setPrincipalPhone(phoneInput(e.target.value))}
                      onBlur={() => sv.blur("principalPhone")}
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={16}
                      aria-invalid={!!sv.error("principalPhone")}
                    />
                    <FieldError message={sv.error("principalPhone")} />
                  </div>
                </div>
                {schoolError ? <p style={styles.error}>{schoolError}</p> : null}
                <ModalFooter>
                  <button style={styles.secondaryButton} onClick={() => setShowAddSchool(false)}>
                    Cancel
                  </button>
                  <button style={styles.button} onClick={createSchool} disabled={isCreatingSchool}>
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
