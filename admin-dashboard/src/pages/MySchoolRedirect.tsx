import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function MySchoolRedirect() {
  const { user } = useAuth();

  if (!user?.schoolId) {
    return <Navigate to="/overview" replace />;
  }

  return <Navigate to={`/schools/${user.schoolId}`} replace />;
}
