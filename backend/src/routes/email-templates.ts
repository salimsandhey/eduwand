import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { recordAuditEvent } from "../lib/audit";
import { sendEmail } from "../lib/email/sender";
import "../lib/email/templates";
import { getEmailOverride, getTemplateDef, listTemplateDefs, placeholdersIn, renderTemplateSample } from "../lib/email/registry";
import type { EmailCopy, TemplateDef } from "../lib/email/registry";
import { normaliseCopy, refreshEmailOverrides } from "../lib/email/override-store";

// Platform admins read, preview, edit and reset the wording of every
// transactional email. See lib/email/registry.ts for how wording and code
// share an email, and Admin > Email templates for the screen that uses this.

interface CopyBody {
  copy?: Partial<EmailCopy>;
}

type Def = TemplateDef<never>;

function canHaveButton(def: Def): boolean {
  return def.copy.ctaLabel !== "";
}

// Checks a draft and returns either a clean EmailCopy or the per-field problems.
function validateCopy(def: Def, raw: Partial<EmailCopy> | undefined): { copy: EmailCopy } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const draft = normaliseCopy(raw, def.copy);
  const copy: EmailCopy = {
    subject: draft.subject.trim(),
    preheader: draft.preheader.trim(),
    heading: draft.heading.trim(),
    paragraphs: draft.paragraphs.map((p) => p.trim()).filter(Boolean),
    note: draft.note.trim(),
    ctaLabel: draft.ctaLabel.trim(),
  };

  if (!copy.subject) errors.subject = "Subject is required";
  if (copy.subject.length > 200) errors.subject = "Subject must be at most 200 characters";
  if (copy.preheader.length > 300) errors.preheader = "Preview text must be at most 300 characters";
  if (!copy.heading) errors.heading = "Heading is required";
  if (copy.heading.length > 200) errors.heading = "Heading must be at most 200 characters";
  if (copy.paragraphs.length === 0) errors.paragraphs = "Add at least one paragraph";
  else if (copy.paragraphs.length > 8) errors.paragraphs = "Use at most 8 paragraphs";
  else if (copy.paragraphs.some((p) => p.length > 2000)) errors.paragraphs = "A paragraph must be at most 2000 characters";
  if (copy.note.length > 1000) errors.note = "Note must be at most 1000 characters";
  if (copy.ctaLabel.length > 60) errors.ctaLabel = "Button text must be at most 60 characters";
  if (copy.ctaLabel && !canHaveButton(def)) errors.ctaLabel = "This email has no button to label";

  const allowed = new Set(def.vars.map((x) => x.name));
  const unknown = new Set<string>();
  for (const text of [copy.subject, copy.preheader, copy.heading, copy.note, copy.ctaLabel, ...copy.paragraphs]) {
    for (const name of placeholdersIn(text)) if (!allowed.has(name)) unknown.add(name);
  }
  if (unknown.size > 0) {
    const list = [...unknown].map((n) => `{{${n}}}`).join(", ");
    errors.placeholders = `${list} ${unknown.size === 1 ? "is not a placeholder" : "are not placeholders"} this email can use`;
  }

  return Object.keys(errors).length > 0 ? { errors } : { copy };
}

export async function emailTemplateRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] };

  app.get("/email-templates", guard, async () => {
    const rows = await prisma.emailTemplateOverride.findMany({ select: { key: true, updatedAt: true } });
    const savedAt = new Map(rows.map((r) => [r.key, r.updatedAt]));
    const items = listTemplateDefs().map((def) => {
      const saved = getEmailOverride(def.key);
      return {
        key: def.key,
        label: def.label,
        group: def.group,
        description: def.description,
        vars: def.vars,
        canHaveButton: canHaveButton(def),
        defaults: def.copy,
        // The wording in use: what was saved, or the default.
        copy: saved ?? def.copy,
        customised: savedAt.has(def.key),
        updatedAt: savedAt.get(def.key) ?? null,
      };
    });
    return { data: items, meta: {} };
  });

  // Renders the email with example data. Accepts an unsaved draft so the
  // dashboard can show the result of typing as it happens.
  app.post<{ Params: { key: string }; Body: CopyBody }>("/email-templates/:key/preview", guard, async (request, reply) => {
    const def = getTemplateDef(request.params.key);
    if (!def) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown email template" } });

    let copy: EmailCopy | undefined;
    if (request.body?.copy) {
      // A draft that is half-typed is still previewed; only its shape is made safe.
      copy = normaliseCopy(request.body.copy, def.copy);
      if (!canHaveButton(def)) copy = { ...copy, ctaLabel: "" };
    }
    // The images come from the dashboard's own /email folder.
    const mail = renderTemplateSample(def.key, { copy, assetBase: "/email" });
    return { data: mail, meta: {} };
  });

  app.put<{ Params: { key: string }; Body: CopyBody }>("/email-templates/:key", guard, async (request, reply) => {
    const def = getTemplateDef(request.params.key);
    if (!def) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown email template" } });

    const result = validateCopy(def, request.body?.copy);
    if ("errors" in result) {
      return reply.code(400).send({
        data: null,
        error: { code: "validation_error", message: Object.values(result.errors)[0], fields: result.errors },
      });
    }

    await prisma.emailTemplateOverride.upsert({
      where: { key: def.key },
      create: { key: def.key, copy: result.copy as never, updatedBy: request.user.sub },
      update: { copy: result.copy as never, updatedBy: request.user.sub },
    });
    await refreshEmailOverrides();
    await audit(request.user.sub, "email_template.update", def);
    return { data: { key: def.key, copy: result.copy }, meta: {} };
  });

  // Back to the default wording.
  app.delete<{ Params: { key: string } }>("/email-templates/:key", guard, async (request, reply) => {
    const def = getTemplateDef(request.params.key);
    if (!def) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown email template" } });

    await prisma.emailTemplateOverride.deleteMany({ where: { key: def.key } });
    await refreshEmailOverrides();
    await audit(request.user.sub, "email_template.reset", def);
    return { data: { key: def.key, copy: def.copy }, meta: {} };
  });

  // Emails the example to the admin's own address, so they can see it in a real inbox.
  app.post<{ Params: { key: string }; Body: CopyBody }>("/email-templates/:key/test", guard, async (request, reply) => {
    const def = getTemplateDef(request.params.key);
    if (!def) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown email template" } });

    const me = await prisma.appUser.findUnique({ where: { id: request.user.sub }, select: { email: true } });
    if (!me?.email) return reply.code(400).send({ data: null, error: { code: "no_email", message: "Your account has no email address" } });

    let copy: EmailCopy | undefined;
    if (request.body?.copy) {
      const result = validateCopy(def, request.body.copy);
      if ("errors" in result) {
        return reply.code(400).send({ data: null, error: { code: "validation_error", message: Object.values(result.errors)[0], fields: result.errors } });
      }
      copy = result.copy;
    }
    // Real mail clients need absolute image links, so this uses the configured address.
    const mail = renderTemplateSample(def.key, { copy });
    if (!mail) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Unknown email template" } });

    const sent = await sendEmail(me.email, { ...mail, subject: `[Test] ${mail.subject}` });
    if (!sent.success) {
      return reply.code(502).send({ data: null, error: { code: "send_failed", message: sent.error ?? "The email could not be sent" } });
    }
    return { data: { sentTo: me.email }, meta: {} };
  });

  async function audit(actorId: string, action: string, def: Def) {
    const actor = await prisma.appUser.findUnique({ where: { id: actorId }, select: { email: true } });
    await recordAuditEvent({
      actorUserId: actorId,
      actorEmail: actor?.email ?? "unknown",
      action,
      targetType: "email_template",
      targetLabel: def.label,
      metadata: { key: def.key },
    });
  }
}
