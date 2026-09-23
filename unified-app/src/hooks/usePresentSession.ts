import { useEffect, useState } from "react";
import { getPresentSocketUrl, presentGetState, PresentState } from "../api/client";

const MAX_BACKOFF_MS = 15_000;

/**
 * Live "X of N answered" state for a presenter session this device started.
 * Same code path admin-dashboard's Display/Control pages use (present.ts) -
 * no auth token, just the short-lived code. Lets the teacher's own phone show
 * progress without needing the Control page open on it.
 */
export function usePresentSession(code: string | null): { state: PresentState | null; ended: boolean } {
  const [state, setState] = useState<PresentState | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    presentGetState(code)
      .then((s) => !cancelled && setState(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!code || ended) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;

    function connect() {
      socket = new WebSocket(getPresentSocketUrl(code as string));
      socket.onopen = () => {
        attempt = 0;
        presentGetState(code as string)
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
  }, [code, ended]);

  return { state, ended };
}
