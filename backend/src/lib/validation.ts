import { FastifyReply } from "fastify";

// One place for the input rules every route shares (names, email, Indian phone,
// password, dates, numbers, free text), so a field is accepted or rejected the
// same way everywhere. Mirrored on the clients in
// unified-app/src/utils/validation.ts and admin-dashboard/src/utils/validation.ts
// - keep the three in step when a rule changes.
//
// Usage:
//   const v = new Validator();
//   const fullName = v.personName("fullName", body.fullName, "Full name");
//   const email = v.email("email", body.email);
//   if (v.hasErrors) return v.reject(reply);
// Every method records the error against the field name and returns the
// cleaned value (trimmed, lowercased email, 10-digit phone, ...), or undefined
// when the field is invalid or (for optional fields) left empty.

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const LABEL_MAX = 40;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
export const NOTE_MAX = 2000;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Indian mobile: 10 digits starting 6-9, optionally written with +91 / 91 / 0.
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FieldErrors = Record<string, string>;

interface TextOptions {
  required?: boolean;
  min?: number;
  max?: number;
}

interface NumberOptions {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
}

export function normalizeIndianPhone(value: string): string | null {
  const digits = value.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  const national = digits.replace(/^(91|0)(?=\d{10}$)/, "");
  return INDIAN_MOBILE_RE.test(national) ? national : null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must include at least one letter and one number";
  return null;
}

export class Validator {
  readonly errors: FieldErrors = {};

  get hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  fail(field: string, message: string): undefined {
    // First error per field wins - it is the most basic one.
    if (!this.errors[field]) this.errors[field] = message;
    return undefined;
  }

  // Sends the standard 400. `message` is the first field error so clients that
  // only show one message still show something useful; `fields` lets a form
  // put each message under the right input.
  reject(reply: FastifyReply) {
    const message = Object.values(this.errors)[0] ?? "Invalid input";
    return reply.code(400).send({ data: null, error: { code: "validation_error", message, fields: this.errors } });
  }

  private text(field: string, raw: unknown, label: string, opts: TextOptions): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!value) return opts.required ? this.fail(field, `${label} is required`) : undefined;
    if (CONTROL_CHARS_RE.test(value)) return this.fail(field, `${label} contains invalid characters`);
    if (opts.min && value.length < opts.min) return this.fail(field, `${label} must be at least ${opts.min} characters`);
    if (opts.max && value.length > opts.max) return this.fail(field, `${label} must be at most ${opts.max} characters`);
    return value;
  }

  personName(field: string, raw: unknown, label = "Name", required = true): string | undefined {
    const value = this.text(field, raw, label, { required, min: NAME_MIN, max: NAME_MAX });
    if (value !== undefined && !/\p{L}/u.test(value)) return this.fail(field, `${label} must contain letters`);
    return value;
  }

  // Class / section / subject / room style short names.
  label(field: string, raw: unknown, label: string, required = true, max = LABEL_MAX): string | undefined {
    return this.text(field, raw, label, { required, min: 1, max });
  }

  // Free text. Keeps internal line breaks, so it doesn't collapse whitespace.
  note(field: string, raw: unknown, label: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim();
    if (!value) return opts.required ? this.fail(field, `${label} is required`) : undefined;
    const max = opts.max ?? NOTE_MAX;
    if (value.length > max) return this.fail(field, `${label} must be at most ${max} characters`);
    return value;
  }

  email(field: string, raw: unknown, required = true, label = "Email"): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim().toLowerCase();
    if (!value) return required ? this.fail(field, `${label} is required`) : undefined;
    if (value.length > EMAIL_MAX || !EMAIL_RE.test(value)) return this.fail(field, `Enter a valid ${label.toLowerCase()} address, like name@example.com`);
    return value;
  }

  // Returns the canonical 10-digit number.
  phone(field: string, raw: unknown, required = true, label = "Phone number"): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim();
    if (!value) return required ? this.fail(field, `${label} is required`) : undefined;
    const normalized = normalizeIndianPhone(value);
    if (!normalized) return this.fail(field, `Enter a valid 10-digit Indian mobile number (starts with 6-9)`);
    return normalized;
  }

  // IANA timezone name, e.g. Asia/Kolkata.
  timezone(field: string, raw: unknown, required = false, label = "Timezone"): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim();
    if (!value) return required ? this.fail(field, `${label} is required`) : undefined;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
    } catch {
      return this.fail(field, `${label} must be a valid timezone name, like Asia/Kolkata`);
    }
    return value;
  }

  // Web address, http(s) only. Returned trimmed.
  url(field: string, raw: unknown, required = true, label = "Link"): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim();
    if (!value) return required ? this.fail(field, `${label} is required`) : undefined;
    if (value.length > 2000) return this.fail(field, `${label} is too long`);
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
      if (!parsed.hostname.includes(".")) throw new Error("host");
    } catch {
      return this.fail(field, `Enter a valid link starting with http:// or https://`);
    }
    return value;
  }

  // 15-character GSTIN, e.g. 22AAAAA0000A1Z5. Returned uppercased.
  gstin(field: string, raw: unknown, required = false, label = "GSTIN"): string | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be text`);
    const value = (raw ?? "").trim().toUpperCase();
    if (!value) return required ? this.fail(field, `${label} is required`) : undefined;
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return this.fail(field, `${label} must be a valid 15-character GSTIN`);
    return value;
  }

  password(field: string, raw: unknown, label = "Password"): string | undefined {
    if (typeof raw !== "string" || !raw) return this.fail(field, `${label} is required`);
    const problem = passwordProblem(raw);
    return problem ? this.fail(field, problem) : raw;
  }

  // "YYYY-MM-DD" or a full ISO timestamp -> Date (UTC). Rejects impossible dates like 2026-02-31.
  date(field: string, raw: unknown, label: string, required = true): Date | undefined {
    if (raw !== undefined && raw !== null && typeof raw !== "string") return this.fail(field, `${label} must be a date`);
    const value = (raw ?? "").trim();
    if (!value) return required ? (this.fail(field, `${label} is required`) as undefined) : undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return this.fail(field, `${label} is not a valid date`);
    if (DATE_ONLY_RE.test(value) && parsed.toISOString().slice(0, 10) !== value) return this.fail(field, `${label} is not a valid date`);
    return parsed;
  }

  // Student date of birth: a real past date, age 2-25 (minAge 0 for a prospective
  // child on an enquiry, who may be a toddler).
  dateOfBirth(field: string, raw: unknown, label = "Date of birth", minAge = 2, required = true): Date | undefined {
    const dob = this.date(field, raw, label, required);
    if (!dob) return undefined;
    const now = new Date();
    if (dob.getTime() > now.getTime()) return this.fail(field, `${label} cannot be in the future`);
    const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < minAge || age > 25) return this.fail(field, `${label} must give an age between ${minAge} and 25`);
    return dob;
  }

  // Not before `after` (e.g. admission date vs date of birth).
  dateNotBefore(field: string, value: Date | undefined, after: Date | undefined, label: string, afterLabel: string): void {
    if (value && after && value.getTime() < after.getTime()) this.fail(field, `${label} cannot be before ${afterLabel}`);
  }

  number(field: string, raw: unknown, label: string, opts: NumberOptions = {}): number | undefined {
    if (raw === undefined || raw === null || raw === "") return opts.required ? this.fail(field, `${label} is required`) : undefined;
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(value)) return this.fail(field, `${label} must be a number`);
    if (opts.integer && !Number.isInteger(value)) return this.fail(field, `${label} must be a whole number`);
    if (opts.min !== undefined && value < opts.min) return this.fail(field, `${label} must be at least ${opts.min}`);
    if (opts.max !== undefined && value > opts.max) return this.fail(field, `${label} must be at most ${opts.max}`);
    return value;
  }
}

export const MAX_ASSIGNMENT_QUESTIONS = 60;

// Shape check for an assignment's questions JSON (mcq / true_false / written /
// match_following / sequencing). Lenient about optional keys, strict about the
// things that break grading: an empty prompt, an mcq without a valid correct
// option, a blank option, or an oversized payload.
export function validateAssignmentQuestions(v: Validator, field: string, raw: unknown): void {
  if (!Array.isArray(raw) || raw.length === 0) return void v.fail(field, "Add at least one question");
  if (raw.length > MAX_ASSIGNMENT_QUESTIONS) return void v.fail(field, `An assignment can have at most ${MAX_ASSIGNMENT_QUESTIONS} questions`);

  const blank = (value: unknown, max: number) => typeof value !== "string" || !value.trim() || value.length > max;
  raw.forEach((q, i) => {
    const n = i + 1;
    if (!q || typeof q !== "object") return void v.fail(field, `Question ${n} is not valid`);
    const question = q as { prompt?: unknown; type?: unknown; options?: unknown; correctOptionIndex?: unknown; pairs?: unknown; items?: unknown };
    if (blank(question.prompt, 1000)) return void v.fail(field, `Question ${n} needs a prompt (up to 1000 characters)`);
    const type = typeof question.type === "string" ? question.type : "short_answer";
    if (type === "mcq" || type === "true_false") {
      const options = question.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > 6) return void v.fail(field, `Question ${n} needs 2 to 6 options`);
      if (options.some((o) => blank(o, 300))) return void v.fail(field, `Question ${n} has an empty or too long option`);
      const correct = question.correctOptionIndex;
      if (typeof correct !== "number" || !Number.isInteger(correct) || correct < 0 || correct >= options.length) {
        return void v.fail(field, `Question ${n} needs a correct answer selected`);
      }
    }
    if (type === "match_following") {
      const pairs = question.pairs;
      if (!Array.isArray(pairs) || pairs.length < 2 || pairs.length > 10) return void v.fail(field, `Question ${n} needs 2 to 10 matching pairs`);
      if (pairs.some((p) => !p || blank((p as { left?: unknown }).left, 300) || blank((p as { right?: unknown }).right, 300))) {
        return void v.fail(field, `Question ${n} has an incomplete matching pair`);
      }
    }
    if (type === "sequencing") {
      const items = question.items;
      if (!Array.isArray(items) || items.length < 2 || items.length > 10) return void v.fail(field, `Question ${n} needs 2 to 10 steps`);
      if (items.some((item) => blank(item, 300))) return void v.fail(field, `Question ${n} has an empty step`);
    }
  });
}
