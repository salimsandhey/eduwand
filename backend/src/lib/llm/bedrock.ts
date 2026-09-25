// Claude on AWS Bedrock via the Converse API, authenticated with a Bedrock API
// key (AWS_BEARER_TOKEN_BEDROCK). Every Claude call in the app goes through
// converse(), which is where the spend guard reserves and settles the cost.

import { estimateTokens, reserveAiSpend, settleAiSpend } from "./guard";

export type ClaudeTier = "sonnet" | "haiku";

// Global inference profiles - overridable so a model upgrade is an env change.
export const CLAUDE_MODEL_IDS: Record<ClaudeTier, string> = {
  sonnet: process.env.BEDROCK_SONNET_MODEL_ID || "global.anthropic.claude-sonnet-4-6",
  haiku: process.env.BEDROCK_HAIKU_MODEL_ID || "global.anthropic.claude-haiku-4-5-20251001-v1:0",
};

// The names prices are stored under (ai_model_price) and calls are logged as.
export const CLAUDE_MODEL_LABELS: Record<ClaudeTier, string> = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK);
}

export type ConverseContentBlock =
  | { text: string }
  | { image: { format: "png" | "jpeg" | "gif" | "webp"; source: { bytes: string } } }
  | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
  | {
      toolResult: {
        toolUseId: string;
        content: ({ json: Record<string, unknown> } | { text: string })[];
        status?: "success" | "error";
      };
    };

export interface ConverseMessage {
  role: "user" | "assistant";
  content: ConverseContentBlock[];
}

export interface ConverseToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ConverseParams {
  tier: ClaudeTier;
  // What the call is for (shown in the AI cost log) - e.g. "generateContent".
  purpose: string;
  messages: ConverseMessage[];
  system?: string;
  maxTokens: number;
  temperature?: number;
  tools?: ConverseToolSpec[];
  // Force the model to answer by calling this tool (used to get schema-valid
  // JSON out of a tool's input).
  forceTool?: string;
  timeoutMs?: number;
}

export interface ConverseResult {
  text: string;
  toolCalls: { toolUseId: string; name: string; input: Record<string, unknown> }[];
  stopReason: string;
  usage: ClaudeUsage;
  latencyMs: number;
  modelId: string;
}

interface RawConverseResponse {
  output?: { message?: { content?: Record<string, unknown>[] } };
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  };
  metrics?: { latencyMs?: number };
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3;
// Rough token cost of one image (they are billed by size, not by bytes).
const IMAGE_TOKEN_ESTIMATE = 2500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class BedrockHttpError extends Error {}

// Worst-case input size of a request, for the guard's reservation. Image
// bytes are not counted as text - each image is a fixed allowance instead.
function estimateInputTokens(params: ConverseParams): number {
  let tokens = 0;
  let text = params.system ?? "";
  for (const message of params.messages) {
    for (const block of message.content) {
      if ("text" in block) text += block.text;
      else if ("image" in block) tokens += IMAGE_TOKEN_ESTIMATE;
      else text += JSON.stringify(block);
    }
  }
  if (params.tools?.length) text += JSON.stringify(params.tools);
  return tokens + estimateTokens(text);
}

export async function converse(params: ConverseParams): Promise<ConverseResult> {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!token) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not set");

  // Throws AiLimitError - before anything is sent - if a limit would be crossed.
  const reservation = await reserveAiSpend({
    provider: "bedrock",
    model: CLAUDE_MODEL_LABELS[params.tier],
    purpose: params.purpose,
    estInputTokens: estimateInputTokens(params),
    maxOutputTokens: params.maxTokens,
  });

  const region = process.env.AWS_REGION || "ap-south-1";
  const modelId = CLAUDE_MODEL_IDS[params.tier];
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

  const body: Record<string, unknown> = {
    messages: params.messages,
    inferenceConfig: {
      maxTokens: reservation.maxOutputTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    },
  };
  if (params.system) body.system = [{ text: params.system }];
  if (params.tools?.length) {
    body.toolConfig = {
      tools: params.tools.map((t) => ({
        toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } },
      })),
      ...(params.forceTool ? { toolChoice: { tool: { name: params.forceTool } } } : {}),
    };
  }

  const started = Date.now();

  try {
    // Only HTTP-level rejections are retried (they are never billed); a
    // timeout or dropped connection is not, since that request may still be
    // running and billed - retrying it could double the spend.
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(params.timeoutMs ?? 240_000),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw new BedrockHttpError(`Bedrock ${params.tier} request failed (${response.status}): ${errBody.slice(0, 500)}`);
      }

      const data = (await response.json()) as RawConverseResponse;
      const blocks = data.output?.message?.content ?? [];
      const text = blocks.map((b) => (typeof b.text === "string" ? b.text : "")).join("");
      const toolCalls = blocks
        .filter((b) => b.toolUse)
        .map((b) => {
          const use = b.toolUse as { toolUseId: string; name: string; input: Record<string, unknown> };
          return { toolUseId: use.toolUseId, name: use.name, input: use.input ?? {} };
        });

      const usage: ClaudeUsage = {
        inputTokens: data.usage?.inputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
        cacheReadTokens: data.usage?.cacheReadInputTokens ?? 0,
        cacheWriteTokens: data.usage?.cacheWriteInputTokens ?? 0,
      };
      const latencyMs = data.metrics?.latencyMs ?? Date.now() - started;
      await settleAiSpend(reservation, { status: "success", usage: { ...usage, searches: 0 }, latencyMs });

      return { text, toolCalls, stopReason: data.stopReason ?? "unknown", usage, latencyMs, modelId };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await settleAiSpend(reservation, {
      status: err instanceof BedrockHttpError ? "error" : "timeout",
      latencyMs: Date.now() - started,
      error: message,
    });
    throw err;
  }
}
