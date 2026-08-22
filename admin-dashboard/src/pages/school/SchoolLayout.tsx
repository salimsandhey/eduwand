import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { SchoolDetail } from "../../api/client";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";

export interface SchoolOutletContext {
  school: SchoolDetail;
  reload: () => Promise<void>;
  canEditSchoolProfile: boolean;
  canManageAcademics: boolean;
  canDelete: boolean;
  canManageStaff: boolean;
  accessToken: string | null;
  id: string;
  user: ReturnType<typeof useAuth>["user"];
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span style={{ color: done ? "var(--status-good)" : "var(--text-muted)", fontWeight: 700 }}>{done ? "✓" : "○"}</span>
      <span style={{ color: done ? "var(--text-primary)" : "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

export function SchoolLayout() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEditSchoolProfile = user?.role === "platform_admin" || user?.role === "leadership";
  const canDelete = user?.role === "platform_admin";
  // Backend /users routes (see backend/src/routes/users.ts) authorize
  // platform_admin, leadership, AND admin (scoped to their own school) - so
  // staff management is gated a notch wider than canEditSchoolProfile, which excludes admin.
  const canManageStaff = user?.role === "platform_admin" || user?.role === "leadership" || user?.role === "admin";
  // Backend authorizeForSchool() in academic-structure.ts authorizes
  // platform_admin, leadership, AND admin (scoped to their own school) for
  // academic years / class sections / teacher assignment.
  const canManageAcademics = user?.role === "platform_admin" || user?.role === "leadership" || user?.role === "admin";

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setError(null);
    try {
      const s = await api.getSchool(accessToken, id);
      setSchool(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load school");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (!school || !id) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const context: SchoolOutletContext = {
    school,
    reload: load,
    canEditSchoolProfile,
    canManageAcademics,
    canDelete,
    canManageStaff,
    accessToken,
    id,
    user,
  };

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

      {!school.readiness.ready ? (
        <Card title="Setup checklist">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ChecklistRow done={school.readiness.hasCurrentAcademicYear} label="Current academic year set" />
            <ChecklistRow done={school.readiness.hasClassSections} label="At least one class section added" />
            <ChecklistRow done={school.readiness.hasAdmin} label="Admin or leadership user invited" />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
            This school can't be marked active until everything above is checked off.
          </p>
        </Card>
      ) : null}

      <nav style={styles.tabNav}>
        <NavLink
          to={`/schools/${id}`}
          end
          style={({ isActive }) => ({ ...styles.tabLink, ...(isActive ? styles.tabLinkActive : {}) })}
        >
          Details
        </NavLink>
        {canManageStaff ? (
          <NavLink
            to={`/schools/${id}/staff`}
            style={({ isActive }) => ({ ...styles.tabLink, ...(isActive ? styles.tabLinkActive : {}) })}
          >
            Staff
          </NavLink>
        ) : null}
        <NavLink
          to={`/schools/${id}/academics`}
          style={({ isActive }) => ({ ...styles.tabLink, ...(isActive ? styles.tabLinkActive : {}) })}
        >
          Academics
        </NavLink>
        {canManageAcademics ? (
          <NavLink
            to={`/schools/${id}/templates`}
            style={({ isActive }) => ({ ...styles.tabLink, ...(isActive ? styles.tabLinkActive : {}) })}
          >
            Format template
          </NavLink>
        ) : null}
        {canManageAcademics ? (
          <NavLink
            to={`/schools/${id}/subjects`}
            style={({ isActive }) => ({ ...styles.tabLink, ...(isActive ? styles.tabLinkActive : {}) })}
          >
            Subjects
          </NavLink>
        ) : null}
      </nav>

      <Outlet context={context} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backLink: { display: "inline-block", marginBottom: 12, color: "var(--text-muted)", fontSize: 13, textDecoration: "none" },
  statusBadge: { fontSize: 13, fontWeight: 700, textTransform: "capitalize" },
  tabNav: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid var(--border)",
    marginBottom: 24,
  },
  tabLink: {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 18px",
    borderRadius: "8px 8px 0 0",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
    borderBottom: "2px solid transparent",
    marginBottom: -1,
    transition: "background 0.15s ease, color 0.15s ease",
  },
  tabLinkActive: {
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
    borderBottom: "2px solid var(--accent)",
  },
};
