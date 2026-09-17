import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";

export type AIAssistantState = "off" | "idle" | "listening" | "thinking" | "speaking";

const STATE_CYCLE: AIAssistantState[] = ["off", "idle", "listening", "thinking", "speaking"];

interface AiAssistantGlowContextType {
  aiState: AIAssistantState;
  setAiState: (state: AIAssistantState) => void;
  cycleAiState: () => void;
  isGlowActive: boolean;
  startGlow: (taskId?: string) => void;
  stopGlow: (taskId?: string) => void;
  toggleGlow: () => void;
}

const AiAssistantGlowContext = createContext<AiAssistantGlowContextType | null>(null);

export function AiAssistantGlowProvider({ children }: { children: React.ReactNode }) {
  const [manualState, setManualState] = useState<AIAssistantState>("off");
  const [activeTasks, setActiveTasks] = useState<Set<string>>(new Set());

  const startGlow = useCallback((taskId?: string) => {
    if (taskId) {
      setActiveTasks((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
    } else {
      setManualState("listening");
    }
  }, []);

  const stopGlow = useCallback((taskId?: string) => {
    if (taskId) {
      setActiveTasks((prev) => {
        if (!prev.has(taskId)) return prev;
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    } else {
      setManualState("off");
      setActiveTasks(new Set());
    }
  }, []);

  const toggleGlow = useCallback(() => {
    setManualState((prev) => (prev === "off" ? "listening" : "off"));
  }, []);

  const cycleAiState = useCallback(() => {
    setManualState((prev) => (prev === "off" ? "listening" : "off"));
  }, []);

  const isGlowActive = manualState !== "off" || activeTasks.size > 0;
  const aiState: AIAssistantState = isGlowActive ? "listening" : "off";

  const setAiState = useCallback((state: AIAssistantState) => {
    setManualState(state);
    if (state === "off") {
      setActiveTasks(new Set());
    }
  }, []);

  const value = useMemo(
    () => ({
      aiState,
      setAiState,
      cycleAiState,
      isGlowActive,
      startGlow,
      stopGlow,
      toggleGlow,
    }),
    [aiState, cycleAiState, isGlowActive, setAiState, startGlow, stopGlow, toggleGlow]
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
