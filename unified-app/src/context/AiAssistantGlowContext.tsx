import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";

export type AIAssistantState = "off" | "idle" | "listening" | "thinking" | "speaking";

// A task can optionally report how far along it is (e.g. multi-stage AI
// research) - the overlay shows this instead of its generic static subtitle.
export interface AiGenerationProgress {
  label: string;
  /** 0 to 1 - how far along the task is. */
  fraction: number;
}

// The generating animation (AiGeneratingOverlay + edge glow) is driven only by
// real AI work: each running task registers an id via useAiGenerating(), and
// the animation shows while at least one is active.
interface AiAssistantGlowContextType {
  aiState: AIAssistantState;
  isGlowActive: boolean;
  /** Progress reported by whichever active task most recently reported one. */
  progress: AiGenerationProgress | null;
  startGlow: (taskId: string) => void;
  stopGlow: (taskId: string) => void;
  setGlowProgress: (taskId: string, progress: AiGenerationProgress | null) => void;
}

const AiAssistantGlowContext = createContext<AiAssistantGlowContextType | null>(null);

export function AiAssistantGlowProvider({ children }: { children: React.ReactNode }) {
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());
  // Only the most recently reported task's progress is shown - in practice at
  // most one active task reports progress at a time.
  const [progressState, setProgressState] = useState<{ taskId: string; progress: AiGenerationProgress } | null>(null);

  const startGlow = useCallback((taskId: string) => {
    setActiveTasks((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  }, []);

  const stopGlow = useCallback((taskId: string) => {
    setActiveTasks((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setProgressState((prev) => (prev?.taskId === taskId ? null : prev));
  }, []);

  const setGlowProgress = useCallback((taskId: string, progress: AiGenerationProgress | null) => {
    setProgressState((prev) => {
      if (!progress) return prev?.taskId === taskId ? null : prev;
      return { taskId, progress };
    });
  }, []);

  const isGlowActive = activeTasks.size > 0;
  const aiState: AIAssistantState = isGlowActive ? "listening" : "off";
  const progress = progressState?.progress ?? null;

  const value = useMemo(
    () => ({ aiState, isGlowActive, progress, startGlow, stopGlow, setGlowProgress }),
    [aiState, isGlowActive, progress, startGlow, stopGlow, setGlowProgress]
  );

  return (
    <AiAssistantGlowContext.Provider value={value}>
      {children}
    </AiAssistantGlowContext.Provider>
  );
}

export function useAiAssistantGlow(): AiAssistantGlowContextType {
  const context = useContext(AiAssistantGlowContext);
  if (!context) {
    throw new Error("useAiAssistantGlow must be used within an AiAssistantGlowProvider");
  }
  return context;
}

/**
 * Hook to automatically bind the glowing edge animation to any asynchronous AI generation task.
 * Activates glow when isGenerating is true, and automatically cleans up when finished or unmounted.
 */
let taskIdCounter = 0;
export function useAiGenerating(isGenerating: boolean, taskId?: string, progress?: AiGenerationProgress | null) {
  const { startGlow, stopGlow, setGlowProgress } = useAiAssistantGlow();
  const idRef = useRef(taskId ?? `gen_task_${++taskIdCounter}`);

  useEffect(() => {
    const id = idRef.current;
    if (isGenerating) {
      startGlow(id);
      return () => {
        stopGlow(id);
      };
    } else {
      stopGlow(id);
    }
  }, [isGenerating, startGlow, stopGlow]);

  useEffect(() => {
    if (!isGenerating) return;
    setGlowProgress(idRef.current, progress ?? null);
    // progress is a fresh object each render - compare by value, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, progress?.label, progress?.fraction, setGlowProgress]);
}
