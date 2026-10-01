// Client-side input rules - the same rules the backend enforces in
// backend/src/lib/validation.ts (which stays the source of truth), so a field is
// flagged on the screen before the request is sent. admin-dashboard has an
// identical copy at admin-dashboard/src/utils/validation.ts - keep the three in
// step when a rule changes.
//
// A Rule takes the field's current text and returns an error message, or null
// when it is fine. Optional fields pass when empty.

export type Rule = (value: string) => string | null;

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const LABEL_MAX = 40;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
export const NOTE_MAX = 2000;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

/** Canonical 10-digit Indian mobile from +91 / 91 / 0 / spaced input, or null. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  const national = digits.replace(/^(91|0)(?=\d{10}$)/, "");
  return INDIAN_MOBILE_RE.test(national) ? national : null;
}

/**
 * Phone field input filter: digits only, at most 10. A pasted +91 / 91 / 0 prefix
 * (12 or 11 digits) is dropped, so "+91 98765 43210" becomes "9876543210".
 * Pair with maxLength={16} so a pasted formatted number isn't cut off first.
 */
export function phoneInput(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** Strips everything but digits as the user types (phone / OTP fields). */
export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return maxLength ? digits.slice(0, maxLength) : digits;
}

export function passwordChecks(password: string): { label: string; ok: boolean }[] {
  return [
    { label: `${PASSWORD_MIN}-${PASSWORD_MAX} characters`, ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX },
    { label: "A letter", ok: /[A-Za-z]/.test(password) },
    { label: "A number", ok: /\d/.test(password) },
  ];
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export const rules = {
  personName:
    (label = "Name", required = true): Rule =>
    (value) => {
      const v = clean(value);
      if (!v) return required ? `${label} is required` : null;
      if (v.length < NAME_MIN) return `${label} must be at least ${NAME_MIN} characters`;
      if (v.length > NAME_MAX) return `${label} must be at most ${NAME_MAX} characters`;
      if (!/\p{L}/u.test(v)) return `${label} must contain letters`;
      return null;
    },

  // Class / section / subject / room style short names.
  label:
    (label: string, required = true, max = LABEL_MAX): Rule =>
    (value) => {
      const v = clean(value);
      if (!v) return required ? `${label} is required` : null;
      if (v.length > max) return `${label} must be at most ${max} characters`;
      return null;
    },

  note:
    (label: string, required = false, max = NOTE_MAX): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      if (v.length > max) return `${label} must be at most ${max} characters`;
      return null;
    },

  email:
    (required = true, label = "Email"): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return `Enter a valid email address, like name@example.com`;
      return null;
    },

  phone:
    (required = true, label = "Phone number"): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      return normalizePhone(v) ? null : "Enter a valid 10-digit Indian mobile number (starts with 6-9)";
    },

  // Sign-up / reset / change: length + a letter + a number. Not used for the
  // sign-in field itself - existing passwords may pre-date these rules.
  newPassword:
    (label = "Password"): Rule =>
    (value) => {
      if (!value) return `${label} is required`;
      if (value.length < PASSWORD_MIN) return `${label} must be at least ${PASSWORD_MIN} characters`;
      if (value.length > PASSWORD_MAX) return `${label} must be at most ${PASSWORD_MAX} characters`;
      if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return `${label} must include a letter and a number`;
      return null;
    },

  required:
    (label: string): Rule =>
    (value) =>
      value.trim() ? null : `${label} is required`,

  otp:
    (length = 6): Rule =>
    (value) =>
      new RegExp(`^\\d{${length}}$`).test(value.trim()) ? null : `Enter the ${length}-digit code`,

  // "YYYY-MM-DD"
  date:
    (label: string, required = true): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} must be a date like 2016-04-12`;
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return `${label} is not a valid date`;
      return null;
    },

  // Student date of birth: real, not in the future, age minAge-25.
  dateOfBirth:
    (label = "Date of birth", minAge = 2, required = true): Rule =>
    (value) => {
      const basic = rules.date(label, required)(value);
      if (basic || !value.trim()) return basic;
      const dob = new Date(`${value.trim()}T00:00:00Z`).getTime();
      const now = Date.now();
      if (dob > now) return `${label} cannot be in the future`;
      const age = (now - dob) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < minAge || age > 25) return `${label} must give an age between ${minAge} and 25`;
      return null;
    },

  integer:
    (label: string, min: number, max: number, required = true): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      if (!/^-?\d+$/.test(v)) return `${label} must be a whole number`;
      const n = Number(v);
      if (n < min) return `${label} must be at least ${min}`;
      if (n > max) return `${label} must be at most ${max}`;
      return null;
    },

  number:
    (label: string, min: number, max: number, required = true): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      const n = Number(v);
      if (!Number.isFinite(n)) return `${label} must be a number`;
      if (n < min) return `${label} must be at least ${min}`;
      if (n > max) return `${label} must be at most ${max}`;
      return null;
    },

  // 15-character GSTIN, e.g. 22AAAAA0000A1Z5 (case-insensitive).
  gstin:
    (required = false, label = "GSTIN"): Rule =>
    (value) => {
      const v = value.trim().toUpperCase();
      if (!v) return required ? `${label} is required` : null;
      return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v) ? null : `${label} must be a valid 15-character GSTIN`;
    },

  // IANA timezone name, e.g. Asia/Kolkata.
  timezone:
    (required = false, label = "Timezone"): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return null;
      } catch {
        return `${label} must be a valid timezone name, like Asia/Kolkata`;
      }
    },

  // Web address, http(s) only.
  url:
    (required = true, label = "Link"): Rule =>
    (value) => {
      const v = value.trim();
      if (!v) return required ? `${label} is required` : null;
      if (v.length > 2000) return `${label} is too long`;
      try {
        const parsed = new URL(v);
        if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname.includes(".")) throw new Error("bad");
        return null;
      } catch {
        return "Enter a valid link starting with http:// or https://";
      }
    },

  matches:
    (other: () => string, message: string): Rule =>
    (value) =>
      value === other() ? null : message,
};

export type FormRules<T> = { [K in keyof T]?: Rule };
export type FormErrors<T> = { [K in keyof T]?: string };

export function validateAll<T extends { [K in keyof T]: string }>(values: T, formRules: FormRules<T>): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const key of Object.keys(formRules) as (keyof T)[]) {
    const rule = formRules[key];
    const message = rule ? rule(values[key] ?? "") : null;
    if (message) errors[key] = message;
  }
  return errors;
}

interface QuestionLike {
  prompt: string;
  type?: string;
  options?: string[];
  correctOptionIndex?: number;
  pairs?: { left: string; right: string }[];
  items?: string[];
}

/** Why an assignment question can't be saved yet, or null. Mirrors validateAssignmentQuestions in the backend. */
export function assignmentQuestionProblem(q: QuestionLike): string | null {
  const blank = (s: string | undefined, max: number) => !s || !s.trim() || s.length > max;
  if (blank(q.prompt, 1000)) return "Add the question text (up to 1000 characters)";
  const type = q.type ?? "short_answer";
  if (type === "mcq" || type === "true_false") {
    const options = q.options ?? [];
    if (options.length < 2 || options.length > 6) return "Add 2 to 6 options";
    if (options.some((o) => blank(o, 300))) return "Fill in every option (up to 300 characters each)";
    if (typeof q.correctOptionIndex !== "number" || q.correctOptionIndex < 0 || q.correctOptionIndex >= options.length) return "Mark the correct answer";
  }
  if (type === "match_following") {
    const pairs = q.pairs ?? [];
    if (pairs.length < 2 || pairs.length > 10) return "Add 2 to 10 matching pairs";
    if (pairs.some((p) => blank(p.left, 300) || blank(p.right, 300))) return "Complete every matching pair";
  }
  if (type === "sequencing") {
    const items = q.items ?? [];
    if (items.length < 2 || items.length > 10) return "Add 2 to 10 steps";
    if (items.some((item) => blank(item, 300))) return "Fill in every step";
  }
  return null;
}
