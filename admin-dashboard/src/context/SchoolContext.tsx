import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";
import type { School } from "../api/client";

interface SchoolContextValue {
  schools: School[];
  selectedSchoolId: string | null;
  setSelectedSchoolId: (id: string | null) => void;
  isLoading: boolean;
}

const SchoolContext = createContext<SchoolContextValue | undefined>(undefined);

const STORAGE_KEY = "eduwand_admin_selected_school";

// Meaningful for leadership (trustId, no single schoolId) and platform_admin
// (no schoolId or trustId at all) - lets either pick which school to view,
// since every school-scoped analytics/users/templates/exports endpoint now
// accepts a validated ?schoolId= for both roles (see backend/src/plugins/scope.ts).
// No-op for every other role.
export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const isLeadership = user?.role === "leadership";
  const isPlatformAdmin = user?.role === "platform_admin";
  const needsSchoolPicker = isLeadership || isPlatformAdmin;

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!needsSchoolPicker || !accessToken) {
      setSchools([]);
      return;
    }
    setIsLoading(true);
    api
      .listSchools(accessToken)
      .then((res) => {
        setSchools(res);
        // Default to the first school so leadership sees real data immediately
        // instead of a blank prompt; drop a stale selection from another trust.
        setSelectedSchoolIdState((prev) => {
          const next = prev && res.some((s) => s.id === prev) ? prev : res[0]?.id ?? null;
          if (next) localStorage.setItem(STORAGE_KEY, next);
          return next;
        });
      })
      .finally(() => setIsLoading(false));
  }, [needsSchoolPicker, accessToken]);

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      setSelectedSchoolIdState(null);
    }
  }, [user]);

  const setSelectedSchoolId = useCallback((id: string | null) => {
    setSelectedSchoolIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <SchoolContext.Provider
      value={{
        schools,
        selectedSchoolId: needsSchoolPicker ? selectedSchoolId : null,
        setSelectedSchoolId,
        isLoading,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchoolContext() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchoolContext must be used within SchoolProvider");
  return ctx;
}
