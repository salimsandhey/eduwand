import { prisma } from "./prisma";

// Duplicate detection (FR-EG-7): flags other, not-already-merged enquiries in the
// same school sharing the same contact phone number.
export async function findPossibleDuplicates(schoolId: string, contactPhone: string, excludeId?: string) {
  return prisma.enquiry.findMany({
    where: {
      schoolId,
      contactPhone,
      duplicateOfEnquiryId: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, contactName: true, status: true, createdAt: true },
  });
}

export interface ActivityItem {
  id: string;
  type: "stage_change" | "note_added" | "task_created" | "task_sent";
  occurredAt: string;
  actorName: string | null;
  payload: Record<string, unknown>;
}

interface EnquiryWithActivitySources {
  stageHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedAt: Date;
    changedBy: { fullName: string } | null;
  }[];
  notes: { id: string; body: string; createdAt: Date; author: { fullName: string } | null }[];
  followUpTasks: {
    id: string;
    channel: string;
    dueAt: Date;
    createdAt: Date;
    sentAt: Date | null;
    assignedTo: { fullName: string } | null;
  }[];
}

// Builds a single chronological activity feed out of the underlying tables (stage
// history, notes, follow-up tasks) rather than persisting a separate activity log,
// so there is one source of truth per event type.
export function buildActivityFeed(enquiry: EnquiryWithActivitySources): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const h of enquiry.stageHistory) {
    items.push({
      id: `stage-${h.id}`,
      type: "stage_change",
      occurredAt: h.changedAt.toISOString(),
      actorName: h.changedBy?.fullName ?? null,
      payload: { fromStatus: h.fromStatus, toStatus: h.toStatus },
    });
  }

  for (const n of enquiry.notes) {
    items.push({
      id: `note-${n.id}`,
      type: "note_added",
      occurredAt: n.createdAt.toISOString(),
      actorName: n.author?.fullName ?? null,
      payload: { body: n.body },
    });
  }

  for (const t of enquiry.followUpTasks) {
    items.push({
      id: `task-created-${t.id}`,
      type: "task_created",
      occurredAt: t.createdAt.toISOString(),
      actorName: t.assignedTo?.fullName ?? null,
      payload: { channel: t.channel, dueAt: t.dueAt.toISOString() },
    });
    if (t.sentAt) {
      items.push({
        id: `task-sent-${t.id}`,
        type: "task_sent",
        occurredAt: t.sentAt.toISOString(),
        actorName: t.assignedTo?.fullName ?? null,
        payload: { channel: t.channel },
      });
    }
  }

  return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
