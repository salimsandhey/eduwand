import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SCHOOL_SCOPED_NAV_ITEMS = [
  { to: "/funnel", label: "Enrolment Funnel" },
  { to: "/sources", label: "Source Breakdown" },
  { to: "/counsellors", label: "Counsellor Performance" },
  { to: "/ai-usage", label: "AI Usage Analytics" },
  { to: "/users", label: "User & Role Management" },
];

const ONBOARDING_NAV_ITEM = { to: "/onboarding", label: "Onboarding" };
const TRUSTS_NAV_ITEM = { to: "/trusts", label: "Trusts" };

export function Layout() {
  const { user, logout } = useAuth();

  // platform_admin has no school_id, so the school-scoped analytics/users screens
  // would just show the "not built yet" trust-scope notice - only link to Onboarding
  // and Trusts (GET /trusts is platform_admin-only, see backend/src/routes/trusts.ts).
  // leadership can onboard schools into their own trust and view (read-only) that
  // trust's detail page, but can't browse the full trusts list.
  let navItems = SCHOOL_SCOPED_NAV_ITEMS;
  if (user?.role === "platform_admin") {
    navItems = [TRUSTS_NAV_ITEM, ONBOARDING_NAV_ITEM];
  } else if (user?.role === "leadership") {
    navItems = [...SCHOOL_SCOPED_NAV_ITEMS, ONBOARDING_NAV_ITEM];
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>EduWand</div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div style={styles.main}>
        <header style={styles.topbar}>
          <div />
          <div style={styles.profile}>
            <span style={styles.profileName}>{user?.fullName}</span>
            <span style={styles.profileRole}>{user?.role}</span>
            <button style={styles.logoutButton} onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", minHeight: "100vh" },
  sidebar: {
    width: 220,
    background: "var(--bg-card)",
    borderRight: "1px solid var(--border)",
    padding: "20px 16px",
    flexShrink: 0,
  },
  logo: { fontSize: 20, fontWeight: 700, marginBottom: 28, color: "var(--text-primary)" },
  nav: { display: "flex", flexDirection: "column", gap: 4 },
  navLink: {
    display: "block",
    padding: "10px 12px",
    borderRadius: 8,
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
  },
  navLinkActive: {
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
  },
  main: { flex: 1, display: "flex", flexDirection: "column" },
  topbar: {
    height: 64,
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-card)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
  },
  profile: { display: "flex", alignItems: "center", gap: 12 },
  profileName: { fontWeight: 600, fontSize: 14 },
  profileRole: {
    fontSize: 12,
    color: "var(--text-muted)",
    textTransform: "capitalize",
    background: "var(--bg-page)",
    padding: "2px 8px",
    borderRadius: 10,
  },
  logoutButton: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  content: { flex: 1, padding: 24, maxWidth: 1100 },
};
