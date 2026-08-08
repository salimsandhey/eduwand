import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { TrustSummary, School } from "../api/client";
import { Card } from "../components/Card";

const PLATFORM_ADMIN_ROLE = "platform_admin";

export function OnboardingPage() {
  const { user, accessToken } = useAuth();
  const isPlatformAdmin = user?.role === PLATFORM_ADMIN_ROLE;

  const [trusts, setTrusts] = useState<TrustSummary[]>([]);
  const [selectedTrustId, setSelectedTrustId] = useState("");

  const [trustName, setTrustName] = useState("");
  const [trustEmail, setTrustEmail] = useState("");
  const [trustMessage, setTrustMessage] = useState<string | null>(null);
  const [trustError, setTrustError] = useState<string | null>(null);

  const [schoolName, setSchoolName] = useState("");
  const [schoolBoard, setSchoolBoard] = useState("CBSE");
  const [createdSchool, setCreatedSchool] = useState<School | null>(null);
  const [schoolError, setSchoolError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isPlatformAdmin) return;
    api
      .listTrusts(accessToken)
      .then(setTrusts)
      .catch(() => {});
  }, [accessToken, isPlatformAdmin]);

  if (!user || (user.role !== PLATFORM_ADMIN_ROLE && user.role !== "leadership")) {
    return (
      <div>
        <h1 style={{ marginTop: 0 }}>Onboarding</h1>
        <Card>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Only platform admins and trust leadership can onboard new schools.
          </p>
        </Card>
      </div>
    );
  }

  async function createTrust() {
    if (!accessToken || !trustName) return;
    setTrustError(null);
    setTrustMessage(null);
    try {
      const trust = await api.createTrust(accessToken, trustName, trustEmail || undefined);
      setTrustMessage(`Created trust "${trust.name}"`);
      setTrusts((prev) => [...prev, trust]);
      setSelectedTrustId(trust.id);
      setTrustName("");
      setTrustEmail("");
    } catch (err) {
      setTrustError(err instanceof Error ? err.message : "Failed to create trust");
    }
  }

  async function createSchool() {
    if (!accessToken || !schoolName || !schoolBoard) return;
    if (isPlatformAdmin && !selectedTrustId) {
      setSchoolError("Select a trust first");
      return;
    }
    setSchoolError(null);
    try {
      const school = await api.createSchool(accessToken, {
        name: schoolName,
        board: schoolBoard,
        trustId: isPlatformAdmin ? selectedTrustId : undefined,
      });
      setCreatedSchool(school);
      setSchoolName("");
    } catch (err) {
      setSchoolError(err instanceof Error ? err.message : "Failed to create school");
    }
  }

  async function inviteAdmin() {
    if (!accessToken || !createdSchool || !inviteName || !inviteEmail) return;
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await api.inviteUser(accessToken, {
        fullName: inviteName,
        email: inviteEmail,
        role: "admin",
        schoolId: createdSchool.id,
      });
      const tempPassword = res.meta?.tempPassword as string | undefined;
      setInviteResult({ email: inviteEmail, tempPassword: tempPassword ?? "(not returned)" });
      setInviteName("");
      setInviteEmail("");
    } catch (err) {
      if (err instanceof ApiError) {
        setInviteError(err.message);
      } else {
        setInviteError("Failed to invite admin");
      }
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Onboarding</h1>

      {isPlatformAdmin ? (
        <Card title="1. Create a trust">
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
            Skip this if the client's trust already exists - pick it in step 2 instead.
          </p>
          <div style={styles.row}>
            <input
              style={styles.input}
              placeholder="Trust name"
              value={trustName}
              onChange={(e) => setTrustName(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Contact email (optional)"
              value={trustEmail}
              onChange={(e) => setTrustEmail(e.target.value)}
            />
            <button style={styles.button} onClick={createTrust} disabled={!trustName}>
              Create trust
            </button>
          </div>
          {trustMessage ? (
            <p style={styles.success}>
              {trustMessage} - <Link to={`/trusts/${selectedTrustId}`}>view it</Link>
            </p>
          ) : null}
          {trustError ? <p style={styles.error}>{trustError}</p> : null}
        </Card>
      ) : null}

      {isPlatformAdmin && trusts.length > 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-8px 0 16px 0" }}>
          Onboarding a school for an existing client instead? Browse <Link to="/trusts">all trusts</Link> to find
          theirs.
        </p>
      ) : null}

      <Card title={isPlatformAdmin ? "2. Add a school" : "Add a school to your trust"}>
        {isPlatformAdmin ? (
          <div style={{ marginBottom: 12 }}>
            <label style={styles.label}>Trust</label>
            <select style={styles.input} value={selectedTrustId} onChange={(e) => setSelectedTrustId(e.target.value)}>
              <option value="">Select a trust…</option>
              {trusts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder="School name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
          <select style={styles.input} value={schoolBoard} onChange={(e) => setSchoolBoard(e.target.value)}>
            <option value="CBSE">CBSE</option>
            <option value="ICSE">ICSE</option>
            <option value="State">State</option>
          </select>
          <button style={styles.button} onClick={createSchool} disabled={!schoolName}>
            Add school
          </button>
        </div>
        {schoolError ? <p style={styles.error}>{schoolError}</p> : null}
        {createdSchool ? (
          <p style={styles.success}>
            Created "{createdSchool.name}" (status: {createdSchool.status}) - now invite its first admin below, or{" "}
            <Link to={`/schools/${createdSchool.id}`}>view the school</Link>.
          </p>
        ) : null}
      </Card>

      {createdSchool ? (
        <Card title="3. Invite the school's first admin">
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
            <button style={styles.button} onClick={inviteAdmin} disabled={!inviteName || !inviteEmail}>
              Invite admin
            </button>
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
        </Card>
      ) : null}
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
  label: { display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 },
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
