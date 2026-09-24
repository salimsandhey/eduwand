import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";

export type AIAssistantState = "off" | "idle" | "listening" | "thinking" | "speaking";

// The generating animation (AiGeneratingOverlay + edge glow) is driven only by
// real AI work: each running task registers an id via useAiGenerating(), and
// the animation shows while at least one is active.
interface AiAssistantGlowContextType {
  aiState: AIAssistantState;
  isGlowActive: boolean;
  startGlow: (taskId: string) => void;
  stopGlow: (taskId: string) => void;
}

const AiAssistantGlowContext = createContext<AiAssistantGlowContextType | null>(null);

export function AiAssistantGlowProvider({ children }: { children: React.ReactNode }) {
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

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
  }, []);

  const isGlowActive = activeTasks.size > 0;
  const aiState: AIAssistantState = isGlowActive ? "listening" : "off";

  const value = useMemo(
    () => ({ aiState, isGlowActive, startGlow, stopGlow }),
    [aiState, isGlowActive, startGlow, stopGlow]
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
export function useAiGenerating(isGenerating: boolean, taskId?: string) {
  const { startGlow, stopGlow } = useAiAssistantGlow();
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
}
