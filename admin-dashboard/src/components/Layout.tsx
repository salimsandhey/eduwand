import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AdminStatusProvider, useAdminStatus } from "../context/AdminStatusContext";
import { SchoolPicker } from "./SchoolPicker";
import { NavIcon } from "./NavIcon";
import { NAV_SECTIONS, isPathActive } from "./nav";
import type { NavItem, NavSection } from "./nav";
import { formatEnumLabel } from "../utils/format";

// The sidebar (grouped, collapsible, with a hint on every entry), the header with
// the profile menu, and the page area. Navigation content lives in nav.ts.

const SCHOOL_SCOPED_PATHS = new Set([
  "/funnel",
  "/sources",
  "/counsellors",
  "/ai-usage",
  "/pipeline-stages",
  "/form-builder",
  "/message-templates",
  "/exports",
  "/audit-log",
]);

const COLLAPSE_KEY = "eduwand_admin_nav_collapsed";

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function itemPaths(item: NavItem): string[] {
  return item.matchPaths ?? [item.to];
}

function Sidebar({ sections }: { sections: NavSection[] }) {
  const location = useLocation();
  const { status } = useAdminStatus();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);

  const badgeFor = (item: NavItem): number => (item.badge === "approvals" ? status?.approvals.total ?? 0 : 0);

  function toggle(id: string, current: boolean) {
    const next = { ...collapsed, [id]: !current };
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  return (
    <nav style={styles.nav} aria-label="Main">
      {sections.map((section) => {
        const containsActive = section.items.some((item) => isPathActive(location.pathname, itemPaths(item)));
        // A section stays open while you are inside it, whatever was saved.
        const isCollapsed = !containsActive && (collapsed[section.id] ?? section.collapsedByDefault ?? false);
        const sectionBadge = section.items.reduce((sum, item) => sum + badgeFor(item), 0);

        return (
          <div key={section.id} style={styles.section}>
            {section.title ? (
              <button style={styles.sectionHeader} onClick={() => toggle(section.id, isCollapsed)} aria-expanded={!isCollapsed}>
                <span>{section.title}</span>
                {isCollapsed && sectionBadge > 0 ? <span style={styles.countDot}>{sectionBadge}</span> : null}
                <span style={{ ...styles.chevron, transform: isCollapsed ? "rotate(-90deg)" : "none" }}>▾</span>
              </button>
            ) : null}
            {!isCollapsed
              ? section.items.map((item) => {
                  const pending = badgeFor(item);
                  const active = isPathActive(location.pathname, itemPaths(item));
                  return (
                    <NavLink
                      key={`${section.id}:${item.to}`}
                      to={item.to}
                      title={item.hint}
                      aria-label={`${item.label}. ${item.hint}`}
                      style={{ ...styles.navLink, ...(active ? styles.navLinkActive : {}) }}
                    >
                      <span style={styles.navIcon}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {pending > 0 ? <span style={styles.countDot}>{pending}</span> : null}
                    </NavLink>
                  );
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}

// The signed-in person: avatar + name in the header; opens a small menu with
// their details and Log out. Closes on an outside click or Escape.
function ProfileMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (user?.fullName ?? "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} style={styles.profileWrap}>
      <button style={styles.profileButton} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <span style={styles.avatar}>{initials}</span>
        <span style={styles.profileText}>
          <span style={styles.profileName}>{user?.fullName}</span>
          <span style={styles.profileRole}>{formatEnumLabel(user?.role)}</span>
        </span>
        <span style={{ ...styles.profileChevron, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {open ? (
        <div style={styles.menu} role="menu">
          <div style={styles.menuHeader}>
            <span style={{ ...styles.avatar, width: 44, height: 44, fontSize: 15 }}>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div style={styles.menuName}>{user?.fullName}</div>
              {user?.email ? <div style={styles.menuEmail}>{user.email}</div> : null}
              <span style={styles.roleChip}>{formatEnumLabel(user?.role)}</span>
            </div>
          </div>
          <button style={styles.menuItem} role="menuitem" onClick={logout}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LayoutInner() {
  const { user } = useAuth();
  const location = useLocation();

  const sections = NAV_SECTIONS.filter((section) => !!user?.role && section.roles.includes(user.role))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !!user?.role && (item.roles ?? section.roles).includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);

  const showSchoolPicker = (user?.role === "leadership" || user?.role === "platform_admin") && SCHOOL_SCOPED_PATHS.has(location.pathname);

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <img src="/eduwand-logo.png" alt="EduWand" style={styles.logoImage} />
        </div>
        <Sidebar sections={sections} />
      </aside>

      <div style={styles.main}>
        <header style={styles.topbar}>
          <div style={styles.topLeft}>
            {showSchoolPicker ? <SchoolPicker /> : null}
          </div>
          <ProfileMenu />
        </header>

        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <AdminStatusProvider>
      <LayoutInner />
    </AdminStatusProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: "flex", minHeight: "100vh" },
  sidebar: {
    width: 264,
    background: "rgba(255,255,255,0.88)",
    borderRight: "1px solid var(--border)",
    padding: "24px 14px",
    flexShrink: 0,
    backdropFilter: "blur(18px)",
    overflowY: "auto",
    maxHeight: "100vh",
    position: "sticky",
    top: 0,
  },
  logo: { margin: "2px 10px 26px" },
  logoImage: { width: 150, height: "auto", objectFit: "contain", objectPosition: "left center" },
  nav: { display: "flex", flexDirection: "column", gap: 4 },
  section: { display: "flex", flexDirection: "column", gap: 2, marginBottom: 10 },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 12px 6px",
    fontSize: 11,
    fontWeight: 800,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.9px",
    textAlign: "left",
  },
  chevron: { marginLeft: "auto", fontSize: 12, transition: "transform 0.15s" },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "9px 12px",
    borderRadius: 12,
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
  },
  navIcon: { display: "flex", flexShrink: 0, color: "inherit" },
  navLinkActive: {
    background: "linear-gradient(135deg, var(--accent-wash), #fbeef7)",
    color: "var(--accent-dark)",
    boxShadow: "inset 3px 0 0 var(--accent)",
  },
  countDot: {
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    borderRadius: 10,
    background: "var(--status-warning)",
    color: "#3a2a00",
    fontSize: 11,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: {
    minHeight: 72,
    borderBottom: "1px solid var(--border)",
    background: "rgba(255,255,255,0.76)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "10px 32px",
    backdropFilter: "blur(18px)",
  },
  topLeft: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  profileWrap: { position: "relative", flexShrink: 0 },
  profileButton: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "none",
    border: "1px solid transparent",
    borderRadius: 14,
    padding: "5px 10px 5px 5px",
    cursor: "pointer",
    textAlign: "left",
  },
  profileText: { display: "flex", flexDirection: "column", lineHeight: 1.25 },
  profileName: { fontWeight: 700, fontSize: 14, color: "var(--text-primary)" },
  profileRole: { fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" },
  profileChevron: { fontSize: 12, color: "var(--text-muted)", transition: "transform 0.15s" },
  menu: {
    position: "absolute",
    right: 0,
    top: "calc(100% + 8px)",
    width: 280,
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    boxShadow: "0 12px 32px rgba(0,0,0,0.14)",
    padding: 8,
    zIndex: 50,
  },
  menuHeader: { display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 14px", borderBottom: "1px solid var(--border)", marginBottom: 6 },
  menuName: { fontWeight: 700, fontSize: 15, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  menuEmail: { fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  roleChip: {
    display: "inline-block",
    marginTop: 6,
    padding: "2px 9px",
    borderRadius: 999,
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "capitalize",
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    background: "none",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--status-critical)",
    textAlign: "left",
  },
  content: { flex: 1, width: "100%", maxWidth: 1440, padding: "34px 40px 48px", margin: "0 auto" },
};
