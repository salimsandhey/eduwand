import { getTemplateDef, setEmailOverrides } from "./registry";
import type { EmailCopy } from "./registry";

// Emails are rendered synchronously all over the app, so the wording admins
// saved is kept in memory and re-read from the database every minute (and right
// after a save). A change reaches every running server within a minute.

const REFRESH_MS = 60_000;

// Whatever is stored, never hand the renderer anything but a complete EmailCopy.
export function normaliseCopy(raw: unknown, fallback: EmailCopy): EmailCopy {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (value: unknown, def: string) => (typeof value === "string" ? value : def);
  return {
    subject: str(o.subject, fallback.subject),
    preheader: str(o.preheader, fallback.preheader),
    heading: str(o.heading, fallback.heading),
    paragraphs: Array.isArray(o.paragraphs) ? o.paragraphs.filter((p): p is string => typeof p === "string") : fallback.paragraphs,
    note: str(o.note, fallback.note),
    ctaLabel: str(o.ctaLabel, fallback.ctaLabel),
  };
}

export async function refreshEmailOverrides(): Promise<void> {
  // Loaded lazily so rendering an email in a test needs no database.
  const { prisma } = await import("../prisma");
  const rows = await prisma.emailTemplateOverride.findMany();
  const next = new Map<string, EmailCopy>();
  for (const row of rows) {
    const def = getTemplateDef(row.key);
    if (def) next.set(row.key, normaliseCopy(row.copy, def.copy));
  }
  setEmailOverrides(next);
}

export function startEmailOverrideRefresh(): NodeJS.Timeout {
  const run = () => refreshEmailOverrides().catch((err) => console.error("[email] could not load saved templates", err));
  void run();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref();
  return timer;
}
