import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { aiProvider, AssistantContent, AssistantPart } from "./ai";
import { AssistantRole, buildAssistantContext, formatIst, loadAssistantIdentity } from "./assistant-context";
import { AssistantLink, ToolCtx, ToolError, findTool, toolsForRole } from "./assistant-tools";

// The assistant's product name - how the model introduces itself and how
// user-facing assistant errors name it. Mirrors AI_ASSISTANT_NAME in
// unified-app/src/constants/brand.ts - keep both in sync.
export const ASSISTANT_NAME = "AIWand";

const MAX_STEPS = 6;
const MAX_ACTIONS_PER_TURN = 3;
const MAX_LINKS = 4;

const ROLE_GUIDE: Record<AssistantRole, string> = {
  counsellor:
    "They are an admissions counsellor. You help with their leads (enquiries), follow-up tasks and pipeline. They can only see their own leads.",
  front_desk:
    "They work the school's front desk / admissions desk. You help with leads (enquiries), follow-up tasks and the pipeline across the school.",
  teacher:
    "They are a teacher. You help with their classes, topics, lesson material, assignments, grading progress and messages to students.",
  student:
    "They are a student. You are a friendly study helper. You can tell them what is due, show their released results, and explain concepts using the material their teacher shared.\n" +
    "STRICT RULES for students:\n" +
    "- For any assignment question that is still to do (not submitted), NEVER give the final answer. Give a hint, the method, or a worked example with different numbers, and ask them to try.\n" +
    "- Once an assignment is submitted you may explain the answer and where they went wrong.\n" +
    "- Never write their submission for them, and never discuss other students.",
};

function buildSystemPrompt(role: AssistantRole, identity: { fullName: string; schoolName: string }, contextBullets: string): string {
  return [
    `You are ${ASSISTANT_NAME}, the in-app AI assistant for ${identity.schoolName}, inside the EduWand mobile app. You are talking to ${identity.fullName}.`,
    `Your name is ${ASSISTANT_NAME}. Use it when you introduce yourself or are asked who you are; never call yourself Gemini, a Google model, or any other name.`,
    ROLE_GUIDE[role],
    "",
    `Current date and time: ${formatIst(new Date())} (India Standard Time, UTC+05:30). Resolve words like "today", "tomorrow", "next Monday" against this and send ISO 8601 times with the +05:30 offset.`,
    "",
    "A short summary of their current data:",
    contextBullets,
    "",
    "How to behave:",
    "- Ground every answer in the summary above or in tool results. Use the tools for anything more specific. Never invent records, names, ids, numbers or dates.",
    "- IDs must come from tool results - never guess them. If you lack a needed detail (which lead, what time), ask one short question.",
    "- If something is outside your data or tools, say you don't have that information yet.",
    "- Tools that change data do NOT run immediately: they show the user a Confirm / Cancel card. After calling one, say in one sentence that it is ready for their confirmation. Never say it is already done.",
    "- Only discuss this user's own school and data.",
    "- Write plain text for a phone screen: short sentences, simple hyphen lists, no markdown symbols (no **, #, or tables). Keep answers brief.",
  ].join("\n");
}

const isText = (p: AssistantPart): p is { text: string } => "text" in p && typeof p.text === "string";
const isCall = (p: AssistantPart): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p;

export interface AssistantTurnResult {
  text: string;
  links: AssistantLink[];
  // Ids of the AiAction rows created this turn (each becomes a confirm card).
  actionIds: string[];
}

export async function runAssistantTurn(params: {
  ctx: ToolCtx;
  conversationId: string;
  history: { from: string; text: string }[];
}): Promise<AssistantTurnResult> {
  const { ctx, conversationId, history } = params;
  const role = ctx.role;
  const [identity, contextBullets] = await Promise.all([
    loadAssistantIdentity(ctx.user, ctx.schoolId, role),
    buildAssistantContext(ctx.user, ctx.schoolId, role),
  ]);
  const systemPrompt = buildSystemPrompt(role, identity, contextBullets);
  const tools = toolsForRole(role);
  const declarations = tools.map((t) => t.declaration);

  const contents: AssistantContent[] = history.map((m) => ({
    role: m.from === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const links: AssistantLink[] = [];
  const actionIds: string[] = [];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const { parts } = await aiProvider.assistantStep({ contents, systemPrompt, tools: declarations });
    contents.push({ role: "model", parts });

    const calls = parts.filter(isCall);
    if (!calls.length) {
      text = parts.filter(isText).map((p) => p.text).join("").trim();
      break;
    }

    const responses: AssistantPart[] = [];
    for (const { functionCall } of calls) {
      const tool = findTool(role, functionCall.name);
      let response: Record<string, unknown>;
      try {
        if (!tool) throw new ToolError(`Unknown tool ${functionCall.name}`);
        if (tool.kind === "read") {
          const result = await tool.run(functionCall.args ?? {}, ctx);
          for (const link of result.links ?? []) if (links.length < MAX_LINKS) links.push(link);
          response = { result: result.data };
        } else if (actionIds.length >= MAX_ACTIONS_PER_TURN) {
          throw new ToolError("Too many changes proposed at once - ask the user to confirm these first.");
        } else {
          const prepared = await tool.prepare(functionCall.args ?? {}, ctx);
          const action = await prisma.aiAction.create({
            data: { conversationId, tool: tool.declaration.name, args: prepared.args as Prisma.InputJsonValue, summary: prepared.summary },
          });
          actionIds.push(action.id);
          response = { status: "awaiting_user_confirmation", summary: prepared.summary };
        }
      } catch (err) {
        response = { error: err instanceof ToolError ? err.message : "That lookup failed." };
        if (!(err instanceof ToolError)) console.error("[assistant] tool failed:", functionCall.name, err);
      }
      responses.push({ functionResponse: { name: functionCall.name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }

  if (!text) {
    text = actionIds.length
      ? "Ready for your confirmation below."
      : "Sorry, I couldn't work that out. Could you rephrase or try again?";
  }
  return { text, links, actionIds };
}
