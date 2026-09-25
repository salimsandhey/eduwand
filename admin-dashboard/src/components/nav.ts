import type { IconName } from "./NavIcon";

// The sidebar, by section. Each item says what it is (hint) so nobody has to
// guess from a label. Access control lives here too: ROUTE_ROLES is derived
// from these items (plus the tab-only pages below), so a page is reachable
// exactly when it is shown - or is a tab of a page that is.

export type BadgeKey = "approvals";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  // Shown on hover and read by screen readers.
  hint: string;
  // Defaults to the section's roles.
  roles?: string[];
  // The item is highlighted on any of these paths (pages that are tabs of it).
  matchPaths?: string[];
  badge?: BadgeKey;
}

export interface NavSection {
  id: string;
  // Empty for the top "Home" group, which gets no heading.
  title: string;
  roles: string[];
  collapsedByDefault?: boolean;
  items: NavItem[];
}

const PLATFORM = ["platform_admin"];
const SCHOOL_STAFF = ["admin", "leadership", "principal"];

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    title: "",
    roles: ["front_desk", "counsellor", "admin", "leadership", "platform_admin"],
    items: [{ to: "/overview", label: "Overview", icon: "home", hint: "Enrolment, staff and activity at a glance" }],
  },
  {
    id: "account",
    title: "My account",
    roles: ["teacher"],
    items: [{ to: "/billing", label: "My plan", icon: "plan", hint: "Your trial or plan, payments and invoices" }],
  },

  // --- Platform admin ---------------------------------------------------------
  {
    id: "customers",
    title: "Customers",
    roles: PLATFORM,
    items: [
      { to: "/trusts", label: "Schools & trusts", icon: "building", hint: "Trusts, their schools, staff and billing plans", matchPaths: ["/trusts", "/schools"] },
      { to: "/teacher-plans", label: "Individual teachers", icon: "user", hint: "Self-signed-up teachers: free trial, paid plan, extend or cancel" },
    ],
  },
  {
    id: "money",
    title: "Money",
    roles: PLATFORM,
    items: [
      { to: "/payments", label: "Payments", icon: "wallet", hint: "Money taken for teacher plans, GST invoices, gateway status" },
      { to: "/platform-settings", label: "Plans & pricing", icon: "tag", hint: "School billing plans and what each AI action costs in credits" },
    ],
  },
  {
    id: "ai",
    title: "AI",
    roles: PLATFORM,
    items: [
      {
        to: "/ai-costs",
        label: "AI spend & limits",
        icon: "zap",
        hint: "What AI costs, spending limits, the pause switch and the call log",
        matchPaths: ["/ai-costs", "/ai-limits", "/ai-calls", "/ai-usage"],
      },
      { to: "/ai-prompts", label: "AI prompts", icon: "message", hint: "Edit the instructions the AI follows for each kind of content" },
    ],
  },
  {
    id: "review",
    title: "Review",
    roles: PLATFORM,
    items: [
      {
        to: "/subject-change-requests",
        label: "Approvals",
        icon: "check",
        hint: "Subject, class and board change requests waiting for a decision",
        matchPaths: ["/subject-change-requests", "/class-change-requests", "/board-change-tickets"],
        badge: "approvals",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    roles: PLATFORM,
    items: [
      { to: "/content-pages", label: "Website pages", icon: "globe", hint: "Privacy policy, terms, about and contact pages" },
      { to: "/audit-log", label: "Audit log", icon: "clock", hint: "Who changed what, and when" },
    ],
  },
  {
    id: "school-tools",
    title: "School tools",
    roles: PLATFORM,
    collapsedByDefault: true,
    items: [
      { to: "/funnel", label: "Enrolment funnel", icon: "filter", hint: "Pick a school at the top, then see how enquiries move to admission" },
      { to: "/sources", label: "Source breakdown", icon: "chart", hint: "Where a school's enquiries come from" },
      { to: "/counsellors", label: "Counsellor performance", icon: "users", hint: "How each counsellor is doing" },
      { to: "/pipeline-stages", label: "Pipeline stages", icon: "pipeline", hint: "A school's admission stages" },
      { to: "/message-templates", label: "Message templates", icon: "mail", hint: "A school's reusable messages" },
      { to: "/exports", label: "CSV exports", icon: "download", hint: "Download a school's data" },
    ],
  },

  // --- School staff -----------------------------------------------------------
  {
    id: "admissions",
    title: "Admissions",
    roles: SCHOOL_STAFF,
    items: [
      { to: "/funnel", label: "Enrolment funnel", icon: "filter", hint: "How enquiries move through to admission" },
      { to: "/sources", label: "Source breakdown", icon: "chart", hint: "Where your enquiries come from" },
      { to: "/counsellors", label: "Counsellor performance", icon: "users", hint: "How each counsellor is doing" },
      { to: "/pipeline-stages", label: "Pipeline stages", icon: "pipeline", hint: "Edit your admission stages" },
      { to: "/form-builder", label: "Form builder", icon: "form", roles: ["admin", "principal"], hint: "Build the enquiry and admission forms" },
      { to: "/message-templates", label: "Message templates", icon: "mail", hint: "Reusable messages to parents" },
    ],
  },
  {
    id: "school",
    title: "School",
    roles: ["admin", "leadership"],
    items: [
      { to: "/my-school", label: "My school", icon: "school", roles: ["admin"], hint: "Your school's details, staff, classes and students" },
      { to: "/ai-usage", label: "AI usage", icon: "zap", hint: "How your teachers are using AI" },
      { to: "/exports", label: "CSV exports", icon: "download", hint: "Download your school's data" },
      { to: "/audit-log", label: "Audit log", icon: "clock", hint: "Who changed what, and when" },
    ],
  },
];

// Pages reached from a tab strip rather than the sidebar.
const TAB_ONLY_ROUTES: Record<string, string[]> = {
  "/ai-limits": PLATFORM,
  "/ai-calls": PLATFORM,
  "/ai-usage": PLATFORM,
  "/class-change-requests": PLATFORM,
  "/board-change-tickets": PLATFORM,
};

// Which roles may open each path - the union across every place it appears.
export const ROUTE_ROLES: Record<string, string[]> = (() => {
  const map: Record<string, Set<string>> = {};
  const add = (path: string, roles: string[]) => {
    map[path] ??= new Set();
    roles.forEach((role) => map[path].add(role));
  };
  for (const section of NAV_SECTIONS) for (const item of section.items) add(item.to, item.roles ?? section.roles);
  for (const [path, roles] of Object.entries(TAB_ONLY_ROUTES)) add(path, roles);
  return Object.fromEntries(Object.entries(map).map(([path, roles]) => [path, [...roles]]));
})();

// --- Tab strips: sibling pages shown as one place ---------------------------------

export interface TabDef {
  to: string;
  label: string;
  // A pending-count badge on the tab, looked up in the admin status.
  badge?: "subject" | "class" | "board";
}

export const TAB_GROUPS: Record<string, { roles: string[]; tabs: TabDef[] }> = {
  ai: {
    roles: PLATFORM,
    tabs: [
      { to: "/ai-costs", label: "Costs" },
      { to: "/ai-limits", label: "Limits & pause" },
      { to: "/ai-calls", label: "Call log" },
      { to: "/ai-usage", label: "By school" },
    ],
  },
  approvals: {
    roles: PLATFORM,
    tabs: [
      { to: "/subject-change-requests", label: "Subject changes", badge: "subject" },
      { to: "/class-change-requests", label: "Class changes", badge: "class" },
      { to: "/board-change-tickets", label: "Board changes", badge: "board" },
    ],
  },
};

export function isPathActive(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
