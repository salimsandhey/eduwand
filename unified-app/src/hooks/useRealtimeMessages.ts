import { useEffect, useRef } from "react";
import { getRealtimeUrl, CommunicationMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const MAX_BACKOFF_MS = 15_000;

// Keeps one WebSocket open while the calling screen is mounted and forwards
// chat messages pushed by the server. `onReconnect` fires after every
// re-established connection so the screen can refetch whatever it missed
// while offline (the socket only delivers live events, not history).
export function useRealtimeMessages(onMessage: (message: CommunicationMessage) => void, onReconnect?: () => void) {
  const { accessToken } = useAuth();
  const onMessageRef = useRef(onMessage);
  const onReconnectRef = useRef(onReconnect);
  onMessageRef.current = onMessage;
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!accessToken) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;
    let hasConnected = false;

    function connect() {
      socket = new WebSocket(getRealtimeUrl(accessToken as string));
      socket.onopen = () => {
        attempt = 0;
        if (hasConnected) onReconnectRef.current?.();
        hasConnected = true;
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data?.type === "message" && data.message) onMessageRef.current(data.message as CommunicationMessage);
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS));
        attempt += 1;
      };
      socket.onerror = () => socket?.close();
    }

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [accessToken]);
}
