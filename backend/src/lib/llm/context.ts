import { AsyncLocalStorage } from "node:async_hooks";

// Who an AI call is being made for. Set per request by plugins/ai-context.ts
// once the caller is authenticated, so the guard can apply per-user limits
// without every provider method having to pass a user id down.
export interface AiRequestContext {
  userId?: string;
  schoolId?: string;
  // Ids of the AiCallLog rows written so far in this request. logAiUsage()
  // claims them, tying the provider calls to the credit-charged action.
  callLogIds?: string[];
}

export const aiRequestContext = new AsyncLocalStorage<AiRequestContext>();
