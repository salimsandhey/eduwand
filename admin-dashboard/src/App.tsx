import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SchoolProvider } from "./context/SchoolContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { FunnelPage } from "./pages/FunnelPage";
import { BySourcePage } from "./pages/BySourcePage";
import { CounsellorsPage } from "./pages/CounsellorsPage";
import { AiUsagePage } from "./pages/AiUsagePage";
import { UsersPage } from "./pages/UsersPage";
import { PipelineStagesPage } from "./pages/PipelineStagesPage";
import { MessageTemplatesPage } from "./pages/MessageTemplatesPage";
import { ExportsPage } from "./pages/ExportsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { TrustsPage } from "./pages/TrustsPage";
import { TrustDetailPage } from "./pages/TrustDetailPage";
import { SchoolDetailPage } from "./pages/SchoolDetailPage";

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
        <Route path="/funnel" element={<FunnelPage />} />
        <Route path="/sources" element={<BySourcePage />} />
        <Route path="/counsellors" element={<CounsellorsPage />} />
        <Route path="/ai-usage" element={<AiUsagePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/pipeline-stages" element={<PipelineStagesPage />} />
        <Route path="/message-templates" element={<MessageTemplatesPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/trusts" element={<TrustsPage />} />
        <Route path="/trusts/:id" element={<TrustDetailPage />} />
        <Route path="/schools/:id" element={<SchoolDetailPage />} />
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
