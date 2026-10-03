import { renderEmail } from "./layout";
import type { EmailDetail, EmailTone, RenderedEmail } from "./layout";

// Every EduWand email is a "template": a key, the wording people may edit (the
// copy, with {{placeholders}}), and the parts that stay in code (details table,
// code, button link, tone). The wording an admin saves in the dashboard is
// kept as an override and wins over the default written in templates.ts.

// The wording of one email. Any text may contain {{placeholders}}; a paragraph
// or line that ends up empty once they are filled in is simply left out.
export interface EmailCopy {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  // Small box under the content. Empty = none.
  note: string;
  // Text on the button. Empty = no button.
  ctaLabel: string;
}

// What a template needs besides wording, worked out from the real data.
export interface TemplateParts {
  recipientName?: string;
  senderContext?: string;
  code?: string;
  details?: EmailDetail[];
  // Where the button goes. No link, no button.
  ctaUrl?: string;
  tone?: EmailTone;
}

export interface TemplateVarDoc {
  name: string;
  description: string;
}

export interface TemplateDef<I = unknown> {
  key: string;
  label: string;
  // Heading the template is listed under in the admin dashboard.
  group: string;
  description: string;
  // Placeholders that can be used in the copy, with what each stands for.
  vars: TemplateVarDoc[];
  copy: EmailCopy;
  // Example data for the preview and the "send me a test" button.
  sample: I;
  // Turns real data into placeholder values and the non-copy parts.
  make: (input: I) => { vars: Record<string, string>; parts: TemplateParts };
}

const registry = new Map<string, TemplateDef<never>>();

export function listTemplateDefs(): TemplateDef<never>[] {
  return [...registry.values()];
}

export function getTemplateDef(key: string): TemplateDef<never> | undefined {
  return registry.get(key);
}

// --- Overrides (what admins saved) ----------------------------------------------

let overrides = new Map<string, EmailCopy>();

export function getEmailOverride(key: string): EmailCopy | undefined {
  return overrides.get(key);
}

export function setEmailOverrides(next: Map<string, EmailCopy>): void {
  overrides = next;
}

// --- Rendering ----------------------------------------------------------------

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => vars[name] ?? "");
}

export interface RenderOptions {
  // Use this wording instead of the saved one (the preview of an unsaved edit).
  copy?: EmailCopy;
  assetBase?: string;
  // Show the button even when the real link is not configured here.
  forceCtaUrl?: string;
}

export function renderWithCopy(def: TemplateDef<never>, made: { vars: Record<string, string>; parts: TemplateParts }, options: RenderOptions = {}): RenderedEmail {
  const copy = options.copy ?? overrides.get(def.key) ?? def.copy;
  const { vars, parts } = made;
  const filled = (text: string) => fill(text, vars).trim();

  const paragraphs = copy.paragraphs.map(filled).filter(Boolean);
  const ctaUrl = parts.ctaUrl ?? options.forceCtaUrl;
  const ctaLabel = filled(copy.ctaLabel);

  return renderEmail(filled(copy.subject) || def.label, {
    preheader: filled(copy.preheader) || undefined,
    heading: filled(copy.heading) || def.label,
    recipientName: parts.recipientName,
    paragraphs,
    code: parts.code,
    details: parts.details,
    cta: ctaUrl && ctaLabel ? { label: ctaLabel, url: ctaUrl } : undefined,
    note: filled(copy.note) || undefined,
    senderContext: parts.senderContext,
    tone: parts.tone,
    assetBase: options.assetBase,
  });
}

// Registers a template and returns the function the rest of the app calls.
export function defineTemplate<I>(def: TemplateDef<I>): (input: I) => RenderedEmail {
  registry.set(def.key, def as unknown as TemplateDef<never>);
  return (input) => renderWithCopy(def as unknown as TemplateDef<never>, def.make(input) as never);
}

// The email for a template's example data - for the dashboard preview. `copy`
// is an unsaved draft; without it the saved (or default) wording is used.
export function renderTemplateSample(key: string, options: RenderOptions = {}): RenderedEmail | null {
  const def = registry.get(key);
  if (!def) return null;
  return renderWithCopy(def, def.make(def.sample as never) as never, { forceCtaUrl: "https://example.com/open", ...options });
}
