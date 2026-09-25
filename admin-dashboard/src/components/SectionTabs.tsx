import { NavLink } from "react-router-dom";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { useAdminStatus } from "../context/AdminStatusContext";
import { TAB_GROUPS } from "./nav";

// Sibling pages presented as one place: the sidebar has a single entry for the
// group and this strip switches between its pages. Renders nothing for a
// visitor who can only open one of the pages.
export function SectionTabs({ group }: { group: keyof typeof TAB_GROUPS }) {
  const { user } = useAuth();
  const { status } = useAdminStatus();
  const def = TAB_GROUPS[group];

  if (!user?.role || !def.roles.includes(user.role)) return null;

  const counts = status?.approvals;
  return (
    <nav style={styles.strip} aria-label="Sections">
      {def.tabs.map((tab) => {
        const pending = tab.badge && counts ? counts[tab.badge] : 0;
        return (
          <NavLink key={tab.to} to={tab.to} style={({ isActive }) => ({ ...styles.tab, ...(isActive ? styles.tabActive : {}) })}>
            {tab.label}
            {pending > 0 ? <span style={styles.count}>{pending}</span> : null}
          </NavLink>
        );
      })}
    </nav>
  );
}

const styles: Record<string, CSSProperties> = {
  strip: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22, borderBottom: "1px solid var(--border)", paddingBottom: 0 },
  tab: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderBottom: "3px solid transparent",
    marginBottom: -1,
  },
  tabActive: { color: "var(--accent-dark)", borderBottomColor: "var(--accent)" },
  count: {
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
};
