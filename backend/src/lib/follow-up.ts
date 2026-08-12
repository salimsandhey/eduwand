import { prisma } from "./prisma";
import { messageProvider, renderTemplate } from "./messaging";

export class FollowUpSendError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Shared by the manual "Send now" endpoint (backend/src/routes/follow-up-tasks.ts)
// and the worker's automated due-task sweep (backend/src/worker.ts, FR-EG-4) -
// one code path so "automated" and "manual" sends behave identically.
export async function sendFollowUpTask(taskId: string) {
  const task = await prisma.followUpTask.findUnique({
    where: { id: taskId },
    include: { enquiry: true, template: true },
  });

  if (!task) {
    throw new FollowUpSendError("not_found", "Follow up task not found");
  }
  if (task.status !== "pending") {
    throw new FollowUpSendError("validation_error", `Task is already ${task.status}, only pending tasks can be sent`);
  }
  if (!task.enquiry.consentCaptured) {
    throw new FollowUpSendError("consent_required", "Messaging consent has not been captured for this enquiry");
  }

  const recipient = task.channel === "sms" ? task.enquiry.contactPhone : task.enquiry.contactEmail;
  if (!recipient) {
    throw new FollowUpSendError(
      "validation_error",
      `Enquiry has no ${task.channel === "sms" ? "phone" : "email"} on file`
    );
  }

  const renderedBody = renderTemplate(task.template.body, {
    contactName: task.enquiry.contactName,
    contactPhone: task.enquiry.contactPhone,
    contactEmail: task.enquiry.contactEmail,
    gradeInterest: task.enquiry.gradeInterest,
  });

  const result = await messageProvider.send(task.channel as "sms" | "email", recipient, renderedBody);

  const updated = await prisma.followUpTask.update({
    where: { id: task.id },
    data: {
      status: result.success ? "sent" : "failed",
      sentAt: result.success ? new Date() : null,
    },
  });

  return { task: updated, renderedBody };
}
