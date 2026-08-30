import { prisma } from "./prisma";

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

const ADMISSION_DRAFT_FIELDS = [
  "fullName",
  "dateOfBirth",
  "classSectionId",
  "guardianName",
  "guardianContact",
  "admissionDate",
] as const;

// dynamicRequiredFields is the school's active admission_detail FormDefinition's
// fields where isRequired is true (fetched by the caller via Prisma - kept out
// of this function to keep it pure/testable). Their values live in the same
// draft JSON blob, keyed by FormField.key, alongside the fixed
// ADMISSION_DRAFT_FIELDS.
export function admissionCompletionPercent(
  draft: Record<string, unknown> | null | undefined,
  dynamicRequiredFields: { key: string }[] = []
): number {
  if (!draft) return 0;
  const isFilled = (value: unknown) => (typeof value === "string" ? value.trim().length > 0 : value != null);
  const totalFields = ADMISSION_DRAFT_FIELDS.length + dynamicRequiredFields.length;
  const filledFixed = ADMISSION_DRAFT_FIELDS.filter((field) => isFilled(draft[field])).length;
  const filledDynamic = dynamicRequiredFields.filter((field) => isFilled(draft[field.key])).length;
  return Math.round(((filledFixed + filledDynamic) / totalFields) * 100);
}
