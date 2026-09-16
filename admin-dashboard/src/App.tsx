import type { ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolProvider } from "./context/SchoolContext";
import { Layout, NAV_ITEMS } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { ClassJoinPage } from "./pages/ClassJoinPage";
import { OverviewPage } from "./pages/OverviewPage";
import { FunnelPage } from "./pages/FunnelPage";
import { BySourcePage } from "./pages/BySourcePage";
import { CounsellorsPage } from "./pages/CounsellorsPage";
import { AiUsagePage } from "./pages/AiUsagePage";
import { AiPromptsPage } from "./pages/AiPromptsPage";
import { PlatformSettingsPage } from "./pages/PlatformSettingsPage";
import { SubjectChangeRequestsPage } from "./pages/SubjectChangeRequestsPage";
import { ClassChangeRequestsPage } from "./pages/ClassChangeRequestsPage";
import { BoardChangeTicketsPage } from "./pages/BoardChangeTicketsPage";
import { PipelineStagesPage } from "./pages/PipelineStagesPage";
import { FormBuilderPage } from "./pages/FormBuilderPage";
import { MessageTemplatesPage } from "./pages/MessageTemplatesPage";
import { ExportsPage } from "./pages/ExportsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { TrustsPage } from "./pages/TrustsPage";
import { TrustDetailPage } from "./pages/TrustDetailPage";
import { SchoolLayout } from "./pages/school/SchoolLayout";
import { SchoolDetailsTab } from "./pages/school/SchoolDetailsTab";
import { SchoolStaffTab } from "./pages/school/SchoolStaffTab";
import { SchoolStudentsTab } from "./pages/school/SchoolStudentsTab";
import { SchoolAcademicsTab } from "./pages/school/SchoolAcademicsTab";
import { SchoolTemplatesTab } from "./pages/school/SchoolTemplatesTab";
import { SchoolBrandingTab } from "./pages/school/SchoolBrandingTab";
import { SchoolSubjectsTab } from "./pages/school/SchoolSubjectsTab";
import { MySchoolRedirect } from "./pages/MySchoolRedirect";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";

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
  const location = useLocation();

  // Public, unauthenticated - works regardless of auth state or loading, so
  // a parent/student can open a class join link without ever logging in.
  if (location.pathname.startsWith("/join/")) {
    return (
      <Routes>
        <Route path="/join/:code" element={<ClassJoinPage />} />
      </Routes>
    );
  }

  // Public, unauthenticated - Google Play Console & general privacy policy access
  if (location.pathname === "/privacy" || location.pathname === "/privacy-policy") {
    return (
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      </Routes>
    );
  }

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
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/my-school" element={<RequireRole path="/my-school"><MySchoolRedirect /></RequireRole>} />
        <Route path="/funnel" element={<RequireRole path="/funnel"><FunnelPage /></RequireRole>} />
        <Route path="/sources" element={<RequireRole path="/sources"><BySourcePage /></RequireRole>} />
        <Route path="/counsellors" element={<RequireRole path="/counsellors"><CounsellorsPage /></RequireRole>} />
        <Route path="/ai-usage" element={<RequireRole path="/ai-usage"><AiUsagePage /></RequireRole>} />
        <Route path="/ai-prompts" element={<RequireRole path="/ai-prompts"><AiPromptsPage /></RequireRole>} />
        <Route path="/platform-settings" element={<RequireRole path="/platform-settings"><PlatformSettingsPage /></RequireRole>} />
        <Route path="/subject-change-requests" element={<RequireRole path="/subject-change-requests"><SubjectChangeRequestsPage /></RequireRole>} />
        <Route path="/class-change-requests" element={<RequireRole path="/class-change-requests"><ClassChangeRequestsPage /></RequireRole>} />
        <Route path="/board-change-tickets" element={<RequireRole path="/board-change-tickets"><BoardChangeTicketsPage /></RequireRole>} />
        <Route path="/pipeline-stages" element={<RequireRole path="/pipeline-stages"><PipelineStagesPage /></RequireRole>} />
        <Route path="/form-builder" element={<RequireRole path="/form-builder"><FormBuilderPage /></RequireRole>} />
        <Route path="/message-templates" element={<RequireRole path="/message-templates"><MessageTemplatesPage /></RequireRole>} />
        <Route path="/exports" element={<RequireRole path="/exports"><ExportsPage /></RequireRole>} />
        <Route path="/audit-log" element={<RequireRole path="/audit-log"><AuditLogPage /></RequireRole>} />
        <Route path="/trusts" element={<RequireRole path="/trusts"><TrustsPage /></RequireRole>} />
        <Route path="/trusts/:id" element={<RequireRole path="/trusts/:id"><TrustDetailPage /></RequireRole>} />
        <Route path="/schools/:id" element={<RequireRole path="/schools/:id"><SchoolLayout /></RequireRole>}>
          <Route index element={<SchoolDetailsTab />} />
          <Route path="staff" element={<SchoolStaffTab />} />
          <Route path="students" element={<SchoolStudentsTab />} />
          <Route path="academics" element={<SchoolAcademicsTab />} />
          <Route path="templates" element={<SchoolTemplatesTab />} />
          <Route path="branding" element={<SchoolBrandingTab />} />
          <Route path="subjects" element={<SchoolSubjectsTab />} />
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
