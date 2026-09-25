import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { AdminStatus } from "../api/client";
import { useAuth } from "./AuthContext";

// "What needs attention" for the platform admin: pending approvals, AI on/off
// and today's spend, payments setup. Feeds the sidebar badges, the top status
// strip and the tab counts. Only platform admins load it.

const REFRESH_MS = 60_000;

interface AdminStatusValue {
  status: AdminStatus | null;
  refresh: () => Promise<void>;
}

const AdminStatusContext = createContext<AdminStatusValue>({ status: null, refresh: async () => {} });

export function AdminStatusProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const enabled = user?.role === "platform_admin" && !!accessToken;

  const refresh = useCallback(async () => {
    if (!enabled || !accessToken) return;
    try {
      setStatus(await api.getAdminStatus(accessToken));
    } catch {
      // The strip is a convenience - a failed poll just keeps the last values.
    }
  }, [enabled, accessToken]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return <AdminStatusContext.Provider value={{ status, refresh }}>{children}</AdminStatusContext.Provider>;
}

export function useAdminStatus() {
  return useContext(AdminStatusContext);
}
