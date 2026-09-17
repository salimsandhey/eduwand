import React from "react";
import { AIAssistantGlow } from "./AIAssistantGlow";
import { useAiAssistantGlow } from "../../context/AiAssistantGlowContext";

export function AiAssistantGlowOverlay() {
  const { aiState } = useAiAssistantGlow();

  return (
    <AIAssistantGlow
      state={aiState}
      size="fullscreen"
    />
  );
}
