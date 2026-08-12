import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SchoolPicker } from "./SchoolPicker";

type IconName = "home" | "filter" | "chart" | "users" | "sparkle" | "building" | "buildingPlus" | "layers";

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M3 4h18l-7 8v6l-4 2v-8z" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <rect x="7" y="12" width="3" height="6" />
          <rect x="12" y="8" width="3" height="10" />
          <rect x="17" y="5" width="3" height="13" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 21v-6h6v6" />
          <path d="M3 21h18" />
        </svg>
      );
    case "buildingPlus":
      return (
        <svg {...common}>
          <path d="M4 21V8l6-3.5L16 8v13" />
          <path d="M2 21h16" />
          <path d="M19 10v6M16 13h6" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 2 2 7l10 5 10-5-10-5z" />
          <path d="M2 12l10 5 10-5" />
          <path d="M2 17l10 5 10-5" />
        </svg>
      );
  }
}

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const OVERVIEW_NAV_ITEM: NavItem = { to: "/overview", label: "Overview", icon: "home" };
const AI_USAGE_NAV_ITEM: NavItem = { to: "/ai-usage", label: "AI Usage Analytics", icon: "sparkle" };
const TRUSTS_NAV_ITEM: NavItem = { to: "/trusts", label: "Trusts", icon: "building" };

const SCHOOL_SCOPED_NAV_ITEMS: NavItem[] = [
  { to: "/funnel", label: "Enrolment Funnel", icon: "filter" },
  { to: "/sources", label: "Source Breakdown", icon: "chart" },
  { to: "/counsellors", label: "Counsellor Performance", icon: "users" },
  { to: "/users", label: "User & Role Management", icon: "users" },
  { to: "/pipeline-stages", label: "Pipeline Stages", icon: "layers" },
  AI_USAGE_NAV_ITEM,
];

export function Layout() {
  const { user, logout } = useAuth();

  // platform_admin has no school_id, so the school-scoped analytics/users screens
  // don't apply to it at all - only Trusts and Onboarding. leadership can onboard
  // schools into their own trust and now views school-scoped screens too, via the
  // "Viewing" school switcher in the topbar (backend/src/plugins/scope.ts).
  // Onboarding (creating a trust / adding a school) now lives inline on the
  // Trusts and Trust Detail pages instead of a separate nav item - platform_admin
  // reaches it via Trusts, leadership can no longer create schools at all.
  let navItems: NavItem[] = [OVERVIEW_NAV_ITEM, ...SCHOOL_SCOPED_NAV_ITEMS];
  if (user?.role === "platform_admin") {
    navItems = [OVERVIEW_NAV_ITEM, TRUSTS_NAV_ITEM];
  } else if (user?.role === "leadership") {
    navItems = [OVERVIEW_NAV_ITEM, ...SCHOOL_SCOPED_NAV_ITEMS];
  }

  const initials = (user?.fullName ?? "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
              <span style={styles.navIcon}>
                <NavIcon name={item.icon} />
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? <span style={styles.badge}>{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div style={styles.main}>
        <header style={styles.topbar}>
          <div>{user?.role === "leadership" ? <SchoolPicker /> : null}</div>
          <div style={styles.profile}>
            <span style={styles.avatar}>{initials}</span>
            <div style={styles.profileText}>
              <span style={styles.profileName}>{user?.fullName}</span>
              <span style={styles.profileRole}>{user?.role}</span>
            </div>
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
    width: 240,
    background: "var(--bg-card)",
    borderRight: "1px solid var(--border)",
    padding: "20px 16px",
    flexShrink: 0,
  },
  logo: { fontSize: 20, fontWeight: 700, marginBottom: 28, color: "var(--text-primary)" },
  nav: { display: "flex", flexDirection: "column", gap: 4 },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
  },
  navIcon: { display: "flex", flexShrink: 0, color: "inherit" },
  navLinkActive: {
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-muted)",
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "2px 7px",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
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
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  profileText: { display: "flex", flexDirection: "column", lineHeight: 1.3 },
  profileName: { fontWeight: 600, fontSize: 14 },
  profileRole: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "capitalize",
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
