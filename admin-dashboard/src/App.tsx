import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolProvider } from "./context/SchoolContext";
import { Layout, NAV_ITEMS } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { FunnelPage } from "./pages/FunnelPage";
import { BySourcePage } from "./pages/BySourcePage";
import { CounsellorsPage } from "./pages/CounsellorsPage";
import { AiUsagePage } from "./pages/AiUsagePage";
import { PipelineStagesPage } from "./pages/PipelineStagesPage";
import { MessageTemplatesPage } from "./pages/MessageTemplatesPage";
import { ExportsPage } from "./pages/ExportsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { TrustsPage } from "./pages/TrustsPage";
import { TrustDetailPage } from "./pages/TrustDetailPage";
import { SchoolLayout } from "./pages/school/SchoolLayout";
import { SchoolDetailsTab } from "./pages/school/SchoolDetailsTab";
import { SchoolStaffTab } from "./pages/school/SchoolStaffTab";
import { SchoolAcademicsTab } from "./pages/school/SchoolAcademicsTab";
import { SchoolTemplatesTab } from "./pages/school/SchoolTemplatesTab";
import { MySchoolRedirect } from "./pages/MySchoolRedirect";

// Routes not shown in the sidebar (drill-in detail pages) still need a role
// check so a non-permitted role can't reach them by typing the URL directly.
const EXTRA_ROUTE_ROLES: Record<string, string[]> = {
  "/trusts/:id": ["platform_admin", "leadership"],
  "/schools/:id": ["front_desk", "counsellor", "teacher", "admin", "leadership", "platform_admin"],
};

const ROUTE_ROLES: Record<string, string[]> = {
  ...EXTRA_ROUTE_ROLES,
  ...Object.fromEntries(NAV_ITEMS.map((item) => [item.to, item.roles])),
};

function RequireRole({ path, children }: { path: string; children: ReactElement }) {
  const { user } = useAuth();
  const allowedRoles = ROUTE_ROLES[path];
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Navigate to="/overview" replace />;
  }
  return children;
}

function Root() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/my-school" element={<RequireRole path="/my-school"><MySchoolRedirect /></RequireRole>} />
        <Route path="/funnel" element={<RequireRole path="/funnel"><FunnelPage /></RequireRole>} />
        <Route path="/sources" element={<RequireRole path="/sources"><BySourcePage /></RequireRole>} />
        <Route path="/counsellors" element={<RequireRole path="/counsellors"><CounsellorsPage /></RequireRole>} />
        <Route path="/ai-usage" element={<RequireRole path="/ai-usage"><AiUsagePage /></RequireRole>} />
        <Route path="/pipeline-stages" element={<RequireRole path="/pipeline-stages"><PipelineStagesPage /></RequireRole>} />
        <Route path="/message-templates" element={<RequireRole path="/message-templates"><MessageTemplatesPage /></RequireRole>} />
        <Route path="/exports" element={<RequireRole path="/exports"><ExportsPage /></RequireRole>} />
        <Route path="/audit-log" element={<RequireRole path="/audit-log"><AuditLogPage /></RequireRole>} />
        <Route path="/trusts" element={<RequireRole path="/trusts"><TrustsPage /></RequireRole>} />
        <Route path="/trusts/:id" element={<RequireRole path="/trusts/:id"><TrustDetailPage /></RequireRole>} />
        <Route path="/schools/:id" element={<RequireRole path="/schools/:id"><SchoolLayout /></RequireRole>}>
          <Route index element={<SchoolDetailsTab />} />
          <Route path="staff" element={<SchoolStaffTab />} />
          <Route path="academics" element={<SchoolAcademicsTab />} />
          <Route path="templates" element={<SchoolTemplatesTab />} />
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SchoolProvider>
        <Root />
      </SchoolProvider>
    </AuthProvider>
  );
}
