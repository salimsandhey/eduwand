import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// School admins land here from the "My School" sidebar link. Their school ID
// varies per user, so this just resolves it from the auth context and
// redirects into the normal school detail route.
export function MySchoolRedirect() {
  const { user } = useAuth();

  if (!user?.schoolId) {
    return <Navigate to="/overview" replace />;
  }

  return <Navigate to={`/schools/${user.schoolId}`} replace />;
}
