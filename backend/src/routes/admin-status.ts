import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { loadGuardConfig, periodKeys } from "../lib/llm/guard";
import { gatewayMode, publicKeyId } from "../lib/razorpay";
import { getBusinessDetails } from "../lib/billing";

// A small "what needs attention" summary for the platform admin's sidebar
// badges and top status strip: pending approvals, AI on/off and today's spend,
// and whether payments are set up. Cheap counts only - polled by the dashboard.
export async function adminStatusRoutes(app: FastifyInstance) {
  app.get("/admin/status", { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] }, async () => {
    const [cfg, subject, classChange, board, today, business] = await Promise.all([
      loadGuardConfig(),
      prisma.subjectChangeRequest.count({ where: { status: "pending" } }),
      prisma.classChangeRequest.count({ where: { status: "pending" } }),
      prisma.boardChangeTicket.count({ where: { status: "pending" } }),
      prisma.aiSpendCounter.findUnique({ where: { scope_periodKey: { scope: "global", periodKey: periodKeys().day } } }),
      getBusinessDetails(),
    ]);

    const dayLimit = cfg.limits.get("spend_day_global");
    return {
      data: {
        approvals: { subject, class: classChange, board, total: subject + classChange + board },
        ai: {
          paused: cfg.paused,
          spentTodayInr: Math.round(((today?.spentUsd ?? 0) + (today?.reservedUsd ?? 0)) * cfg.usdInr * 100) / 100,
          dayLimitInr: dayLimit?.enabled ? dayLimit.value : null,
        },
        payments: {
          mode: gatewayMode(),
          // Razorpay keys say which mode they are for: rzp_test_... or rzp_live_...
          keyMode: gatewayMode() === "razorpay" ? (publicKeyId()?.startsWith("rzp_live_") ? "live" : "test") : null,
          webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
          // GST-registered sellers must have a name and address for invoices.
          invoiceDetailsReady: business.gstRegistered ? Boolean(business.legalName && business.address) : true,
        },
      },
      meta: {},
    };
  });
}
