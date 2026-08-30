import { prisma } from "./prisma";
import { messageProvider, renderTemplate } from "./messaging";

export class FollowUpSendError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

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

  const recipient = task.channel === "sms" || task.channel === "whatsapp" ? task.enquiry.contactPhone : task.enquiry.contactEmail;
  if (!recipient) {
    throw new FollowUpSendError(
      "validation_error",
      `Enquiry has no ${task.channel === "sms" || task.channel === "whatsapp" ? "phone" : "email"} on file`
    );
  }

  const renderedBody = renderTemplate(task.template.body, {
    contactName: task.enquiry.contactName,
    contactPhone: task.enquiry.contactPhone,
    contactEmail: task.enquiry.contactEmail,
    gradeInterest: task.enquiry.gradeInterest,
  });

  const result = await messageProvider.send(task.channel as "sms" | "email" | "whatsapp", recipient, renderedBody);

  const updated = await prisma.followUpTask.update({
    where: { id: task.id },
    data: {
      status: result.success ? "sent" : "failed",
      sentAt: result.success ? new Date() : null,
    },
  });

  return { task: updated, renderedBody };
}
