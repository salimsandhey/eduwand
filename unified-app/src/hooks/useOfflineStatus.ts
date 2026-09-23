import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api/client";

// No @react-native-community/netinfo (would need a native rebuild) - instead
// pings the existing public /health route periodically and whenever the app
// returns to the foreground. Good enough for "can we reach EduWand's
// servers", which is what actually matters for the banner.
const PING_INTERVAL_MS = 20000;

export function useOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function ping() {
      const reachable = await api.checkHealth();
      if (mountedRef.current) setIsOffline(!reachable);
    }

    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") ping();
    });

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return isOffline;
}
