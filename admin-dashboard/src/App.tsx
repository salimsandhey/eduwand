import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { FunnelPage } from "./pages/FunnelPage";
import { BySourcePage } from "./pages/BySourcePage";
import { CounsellorsPage } from "./pages/CounsellorsPage";
import { AiUsagePage } from "./pages/AiUsagePage";
import { UsersPage } from "./pages/UsersPage";

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
        <Route index element={<Navigate to="/funnel" replace />} />
        <Route path="/funnel" element={<FunnelPage />} />
        <Route path="/sources" element={<BySourcePage />} />
        <Route path="/counsellors" element={<CounsellorsPage />} />
        <Route path="/ai-usage" element={<AiUsagePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/funnel" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
