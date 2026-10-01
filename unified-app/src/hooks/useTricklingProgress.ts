import { useEffect, useMemo, useRef, useState } from "react";
import { AiGenerationProgress } from "../context/AiAssistantGlowContext";

const START_FRACTION = 0.15;
const CEILING_FRACTION = 0.92;
const TICK_MS = 900;
const TICK_RATE = 0.1;

/**
 * A progress bar for a single blocking AI call with no real server-side
 * stage to report (unlike AI Research's job/poll setup) - trickles from
 * START_FRACTION toward CEILING_FRACTION while `active` is true, an honest
 * "still working, almost there" rather than a fake precise percentage.
 * Feed the result straight into useAiGenerating's third argument.
 */
export function useTricklingProgress(active: boolean, label: string): AiGenerationProgress | null {
  const [fraction, setFraction] = useState(START_FRACTION);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setFraction(START_FRACTION);
      intervalRef.current = setInterval(() => {
        setFraction((f) => Math.min(CEILING_FRACTION, f + (CEILING_FRACTION - f) * TICK_RATE));
      }, TICK_MS);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  return useMemo(() => (active ? { label, fraction } : null), [active, label, fraction]);
}
