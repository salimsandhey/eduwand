import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Razorpay Orders + signature checks, over plain HTTPS (no SDK). Keys come from
// RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET, webhooks are verified with
// RAZORPAY_WEBHOOK_SECRET. RAZORPAY_MOCK=true swaps in a fake gateway for local
// testing only - it is refused when NODE_ENV=production (see server.ts).

export type GatewayMode = "razorpay" | "mock" | "unconfigured";

export function gatewayMode(): GatewayMode {
  if (process.env.RAZORPAY_MOCK === "true" && process.env.NODE_ENV !== "production") return "mock";
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return "razorpay";
  return "unconfigured";
}

export function publicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

const MOCK_SECRET = "mock-gateway-secret";

function hmacHex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// Creates the gateway-side order for an amount the server chose. The order id
// is what ties the later payment back to our BillingPayment row.
export async function createGatewayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ orderId: string }> {
  const mode = gatewayMode();
  if (mode === "mock") return { orderId: `order_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}` };
  if (mode === "unconfigured") throw new Error("Payments are not configured");

  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: params.amountPaise, currency: "INR", receipt: params.receipt, notes: params.notes }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Razorpay order failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Razorpay returned no order id");
  return { orderId: data.id };
}

// The signature Razorpay Checkout hands back to the browser: HMAC-SHA256 of
// "order_id|payment_id" with the key secret.
export function checkoutSignature(orderId: string, paymentId: string): string {
  const secret = gatewayMode() === "mock" ? MOCK_SECRET : process.env.RAZORPAY_KEY_SECRET ?? "";
  return hmacHex(secret, `${orderId}|${paymentId}`);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (gatewayMode() === "unconfigured" || !signature) return false;
  return safeEqualHex(checkoutSignature(orderId, paymentId), signature);
}

// Webhook body signature: HMAC-SHA256 of the raw request body with the webhook
// secret, sent in X-Razorpay-Signature.
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

export function signWebhookBody(rawBody: Buffer, secret: string): string {
  return hmacHex(secret, rawBody);
}
