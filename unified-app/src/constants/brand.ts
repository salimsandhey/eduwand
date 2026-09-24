// The in-app AI assistant's product name - used everywhere the assistant is
// named to the user (chat header, greetings, welcome mascot, errors,
// accessibility labels). Mirrors ASSISTANT_NAME in backend/src/lib/
// assistant-engine.ts, which the model uses to introduce itself - keep both
// in sync.
//
// Split in two for the wordmark (components/AIWandName.tsx): the accent part
// is drawn in the brand primary color, the rest in the normal text color for
// whatever background it sits on.
export const AI_ASSISTANT_NAME_ACCENT = "AI";
export const AI_ASSISTANT_NAME_REST = "Wand";
export const AI_ASSISTANT_NAME = `${AI_ASSISTANT_NAME_ACCENT}${AI_ASSISTANT_NAME_REST}`;
