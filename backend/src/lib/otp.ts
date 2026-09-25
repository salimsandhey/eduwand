import crypto from "crypto";
import bcrypt from "bcryptjs";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

// Per-email cap on how many codes can be requested. Each code allows
// MAX_OTP_ATTEMPTS guesses, so without this an attacker rotating IP addresses
// could keep requesting fresh codes and keep guessing.
export const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const MAX_OTP_REQUESTS_PER_WINDOW = 5;

export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export const DEV_OTP_CODE = "123456";

// Opt-in only: the fixed code and the `devOtp` echo in API responses need
// ALLOW_DEV_OTP=true on a non-production backend. Being merely "not production"
// isn't enough - a production server that forgot NODE_ENV would otherwise
// accept 123456 for every account. server.ts refuses to boot with both set.
export function isDevOtpMode(): boolean {
  return process.env.ALLOW_DEV_OTP === "true" && process.env.NODE_ENV !== "production";
}

// Code for email-OTP sign-in and sign-up: a fixed 123456 on a local backend so
// nobody needs a real inbox while developing, a random code in production.
export function generateLoginOtp(): string {
  return isDevOtpMode() ? DEV_OTP_CODE : generateOtpCode();
}

export function hashOtpCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function compareOtpCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
