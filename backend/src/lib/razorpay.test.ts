import test from "node:test";
import assert from "node:assert/strict";
import { checkoutSignature, gatewayMode, signWebhookBody, verifyCheckoutSignature, verifyWebhookSignature } from "./razorpay";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("checkout signature: correct one passes, tampered ones fail", () => {
  withEnv({ RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "secret", RAZORPAY_MOCK: undefined }, () => {
    assert.equal(gatewayMode(), "razorpay");
    const sig = checkoutSignature("order_1", "pay_1");
    assert.ok(verifyCheckoutSignature("order_1", "pay_1", sig));
    assert.equal(verifyCheckoutSignature("order_1", "pay_2", sig), false);
    assert.equal(verifyCheckoutSignature("order_2", "pay_1", sig), false);
    assert.equal(verifyCheckoutSignature("order_1", "pay_1", "abc"), false);
    assert.equal(verifyCheckoutSignature("order_1", "pay_1", ""), false);
  });
});

test("nothing verifies when payments are not configured", () => {
  withEnv({ RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_MOCK: undefined }, () => {
    assert.equal(gatewayMode(), "unconfigured");
    assert.equal(verifyCheckoutSignature("o", "p", "anything"), false);
  });
});

test("the mock gateway is refused in production", () => {
  withEnv({ RAZORPAY_MOCK: "true", NODE_ENV: "production", RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }, () => {
    assert.equal(gatewayMode(), "unconfigured");
  });
  withEnv({ RAZORPAY_MOCK: "true", NODE_ENV: "development" }, () => {
    assert.equal(gatewayMode(), "mock");
  });
});

test("webhook signature is checked against the exact raw body", () => {
  withEnv({ RAZORPAY_WEBHOOK_SECRET: "whsec" }, () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = signWebhookBody(body, "whsec");
    assert.ok(verifyWebhookSignature(body, sig));
    assert.equal(verifyWebhookSignature(Buffer.from('{"event":"payment.captured" }'), sig), false);
    assert.equal(verifyWebhookSignature(body, undefined), false);
    assert.equal(verifyWebhookSignature(body, "deadbeef"), false);
  });
  withEnv({ RAZORPAY_WEBHOOK_SECRET: undefined }, () => {
    const body = Buffer.from("{}");
    assert.equal(verifyWebhookSignature(body, signWebhookBody(body, "")), false);
  });
});
