import bcrypt from "bcryptjs";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Same convention the routes already use to echo `devOtp`: anything that isn't
// NODE_ENV=production is a local/dev backend.
export const DEV_OTP_CODE = "123456";

export function isDevOtpMode(): boolean {
  return process.env.NODE_ENV !== "production";
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
