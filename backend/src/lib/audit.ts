import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

interface AuditEventInput {
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  schoolId?: string | null;
  trustId?: string | null;
  metadata?: Record<string, unknown>;
}

// Best-effort logging - a write failure here should never block the actual
// admin action it's describing.
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        targetLabel: input.targetLabel,
        schoolId: input.schoolId ?? undefined,
        trustId: input.trustId ?? undefined,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record event", input.action, err);
  }
}
