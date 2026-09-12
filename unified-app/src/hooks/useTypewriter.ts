import { useEffect, useState } from "react";

interface UseTypewriterOptions {
  speed?: number;
  startDelay?: number;
}

/**
 * Reveals `text` one character at a time, restarting from scratch every time
 * `trigger` changes identity (e.g. a focus-effect counter that bumps on
 * every screen visit, including the first).
 */
export function useTypewriter(trigger: unknown, text: string, options: UseTypewriterOptions = {}) {
  const { speed = 45, startDelay = 0 } = options;
  const [visibleChars, setVisibleChars] = useState(0);

  useEffect(() => {
    setVisibleChars(0);
    if (!text) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const startTimeout = setTimeout(() => {
      interval = setInterval(() => {
        setVisibleChars((current) => {
          if (current >= text.length) {
            if (interval) clearInterval(interval);
            return current;
          }
          return current + 1;
        });
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(startTimeout);
      if (interval) clearInterval(interval);
    };
  }, [trigger, text, speed, startDelay]);

  return { visibleChars, done: visibleChars >= text.length };
}
