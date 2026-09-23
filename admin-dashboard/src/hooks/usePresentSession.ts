import { useEffect, useRef, useState } from "react";
import { ApiError, getPresentSocketUrl, publicGetPresentState } from "../api/client";
import type { PresentControlState, PresentDisplayState } from "../api/client";

const MAX_BACKOFF_MS = 15_000;

interface Result<T> {
  state: T | null;
  error: string | null;
  ended: boolean;
}

/**
 * Shared by the Display and Control pages: loads the current session once,
 * then keeps it live over the websocket every teacher action re-broadcasts
 * (see backend/src/routes/present.ts). Reconnects with backoff and refetches
 * on reconnect, same pattern as the app's useRealtimeMessages.
 *
 * role determines which shape comes back - "control" gets full roster
 * identity + per-student choices (present.ts's controlState()), "display"
 * gets the redacted, anonymous aggregate shape (displayState()). The two
 * pages are never interchangeable, so the generic return type tracks which
 * one a caller asked for.
 */
export function usePresentSession(code: string | undefined, role: "control"): Result<PresentControlState>;
export function usePresentSession(code: string | undefined, role: "display"): Result<PresentDisplayState>;
export function usePresentSession(code: string | undefined, role: "control" | "display"): Result<PresentControlState | PresentDisplayState> {
  const [state, setState] = useState<PresentControlState | PresentDisplayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    publicGetPresentState(code, role)
      .then((s) => !cancelled && setState(s))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "This session code is invalid or has expired"));
    return () => {
      cancelled = true;
    };
  }, [code, role]);

  useEffect(() => {
    if (!code || error) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;

    function connect() {
      socket = new WebSocket(getPresentSocketUrl(code as string, role));
      socket.onopen = () => {
        attempt = 0;
        // A reconnect can miss events, so pull the authoritative state once.
        publicGetPresentState(code as string, role)
          .then(setState)
          .catch(() => {});
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data?.type === "present_state" && data.state) setState(data.state);
          if (data?.type === "present_ended") setEnded(true);
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (stopped || ended) return;
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
  }, [code, error, ended, role]);

  return { state, error, ended };
}
