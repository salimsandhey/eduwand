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

export type ActivityCategory = "lead" | "communication" | "admission";

export interface ActivityItem {
  id: string;
  type: "stage_change" | "note_added" | "task_created" | "task_sent";
  category: ActivityCategory;
  occurredAt: string;
  actorName: string | null;
  payload: Record<string, unknown>;
}

// Same convention the unified-app EnquiryDetailScreen gates its Admission tab
// on - these are the pipeline-stage keys new schools are seeded with (FR-EG-3),
// not a hard schema constraint, so a school with fully custom stage keys won't
// see stage_change events reclassified as "admission" past this point.
const ADMISSION_STAGE_KEYS = new Set(["admitted", "enrolled"]);
const NOTE_TYPE_CATEGORY: Record<string, ActivityCategory> = {
  admission_note: "admission",
  lead_note: "lead",
  system_note: "lead",
};

interface EnquiryWithActivitySources {
  stageHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedAt: Date;
    changedBy: { fullName: string } | null;
  }[];
  notes: { id: string; body: string; type: string; createdAt: Date; author: { fullName: string } | null }[];
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
// so there is one source of truth per event type. `category` groups each item for
// the UI (lead / communication / admission) without needing a separate query.
export function buildActivityFeed(enquiry: EnquiryWithActivitySources): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const h of enquiry.stageHistory) {
    items.push({
      id: `stage-${h.id}`,
      type: "stage_change",
      category: ADMISSION_STAGE_KEYS.has(h.toStatus) ? "admission" : "lead",
      occurredAt: h.changedAt.toISOString(),
      actorName: h.changedBy?.fullName ?? null,
      payload: { fromStatus: h.fromStatus, toStatus: h.toStatus },
    });
  }

  for (const n of enquiry.notes) {
    items.push({
      id: `note-${n.id}`,
      type: "note_added",
      category: NOTE_TYPE_CATEGORY[n.type] ?? "lead",
      occurredAt: n.createdAt.toISOString(),
      actorName: n.author?.fullName ?? null,
      payload: { body: n.body, type: n.type },
    });
  }

  for (const t of enquiry.followUpTasks) {
    items.push({
      id: `task-created-${t.id}`,
      type: "task_created",
      category: "communication",
      occurredAt: t.createdAt.toISOString(),
      actorName: t.assignedTo?.fullName ?? null,
      payload: { channel: t.channel, dueAt: t.dueAt.toISOString() },
    });
    if (t.sentAt) {
      items.push({
        id: `task-sent-${t.id}`,
        type: "task_sent",
        category: "communication",
        occurredAt: t.sentAt.toISOString(),
        actorName: t.assignedTo?.fullName ?? null,
        payload: { channel: t.channel },
      });
    }
  }

  return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

// The fields the Admission tab's form collects (unified-app EnquiryDetailScreen /
// AdmissionConfirmationScreen before it). Used to score how much of the draft is
// filled in so the UI can show progress before the final confirm-admission call.
const ADMISSION_DRAFT_FIELDS = [
  "fullName",
  "dateOfBirth",
  "classSectionId",
  "guardianName",
  "guardianContact",
  "admissionDate",
] as const;

export function admissionCompletionPercent(draft: Record<string, unknown> | null | undefined): number {
  if (!draft) return 0;
  const filled = ADMISSION_DRAFT_FIELDS.filter((field) => {
    const value = draft[field];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  }).length;
  return Math.round((filled / ADMISSION_DRAFT_FIELDS.length) * 100);
}
