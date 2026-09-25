import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { requireRoles } from "../lib/rbac";
import { PLATFORM_ADMIN_ROLE } from "../lib/roles";
import { getEntitlement } from "../lib/subscriptions";
import { BUSINESS_SETTING_KEYS, fulfilPayment, getBusinessDetails, renderInvoicePdf } from "../lib/billing";
import { GSTIN_PATTERN, GST_STATES, stateByCode } from "../lib/gst";
import { createGatewayOrder, gatewayMode, publicKeyId, verifyCheckoutSignature, verifyWebhookSignature } from "../lib/razorpay";

// Website billing for individual teachers (sign in on the web, pay, get a GST
// invoice) plus the platform-admin payments view. Plan in Docs/superpowers/
// plans/2026-09-25-trial-plans-and-purchase.md. The mobile app deliberately has
// no entry point to any of this.

const validationError = (message: string) => ({ data: null, error: { code: "validation_error", message } });

// Teachers on an individual account only - school teachers are billed by their school.
async function requireIndividualTeacher(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.user.role !== "teacher") {
    reply.code(403).send({ data: null, error: { code: "forbidden", message: "Requires role: teacher" } });
    return false;
  }
  const entitlement = await getEntitlement(request.user.sub);
  if (entitlement.status === "not_applicable") {
    reply.code(403).send({ data: null, error: { code: "not_individual", message: "Plans are only for individual teacher accounts" } });
    return false;
  }
  return true;
}

const invoiceSummary = (invoice: { id: string; number: string; totalPaise: number; issuedAt: Date } | null) =>
  invoice ? { id: invoice.id, number: invoice.number, totalPaise: invoice.totalPaise, issuedAt: invoice.issuedAt } : null;

export async function billingRoutes(app: FastifyInstance) {
  const teacherGuard = { onRequest: [app.authenticate] };
  const adminGuard = { onRequest: [app.authenticate, requireRoles(PLATFORM_ADMIN_ROLE)] };

  app.get("/billing/overview", teacherGuard, async (request, reply) => {
    if (!(await requireIndividualTeacher(request, reply))) return;
    const userId = request.user.sub;

    const [entitlement, plans, payments, account, user, business] = await Promise.all([
      getEntitlement(userId),
      prisma.billingPlan.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.billingPayment.findMany({ where: { teacherUserId: userId }, orderBy: { createdAt: "desc" }, take: 20, include: { invoice: true } }),
      prisma.teacherCreditAccount.findUnique({ where: { teacherUserId: userId }, select: { balance: true } }),
      prisma.appUser.findUnique({ where: { id: userId }, select: { fullName: true, email: true, phone: true } }),
      getBusinessDetails(),
    ]);

    const mode = gatewayMode();
    return {
      data: {
        user,
        balance: account?.balance ?? 0,
        subscription: {
          status: entitlement.status,
          planName: entitlement.planName,
          endsAt: entitlement.endsAt,
          daysLeft: entitlement.daysLeft,
        },
        plans: plans
          .filter((p) => p.kind === "paid" && p.enabled)
          .map((p) => ({ key: p.key, name: p.name, priceInr: p.priceInr, durationDays: p.durationDays, credits: p.credits })),
        gstIncluded: business.gstRegistered,
        gstRatePercent: business.gstRegistered ? business.gstRatePercent : 0,
        gateway: { mode, keyId: mode === "razorpay" ? publicKeyId() : null },
        states: GST_STATES,
        payments: payments.map((p) => ({
          id: p.id,
          planName: p.planName,
          amountPaise: p.amountPaise,
          status: p.status,
          method: p.method,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
          invoice: invoiceSummary(p.invoice),
        })),
      },
      meta: {},
    };
  });

  // Creates the gateway order for a plan. The amount always comes from the plan
  // row on the server, never from the client.
  app.post<{ Body: { planKey?: string; stateCode?: string } }>(
    "/billing/checkout",
    { ...teacherGuard, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!(await requireIndividualTeacher(request, reply))) return;
      if (gatewayMode() === "unconfigured") {
        return reply.code(503).send({ data: null, error: { code: "payments_unavailable", message: "Payments are not available yet. Please try again later." } });
      }

      const state = stateByCode(request.body?.stateCode);
      if (!state) return reply.code(400).send(validationError("Choose your state - it is needed for the GST invoice"));

      const plan = await prisma.billingPlan.findFirst({
        where: { kind: "paid", enabled: true, ...(request.body?.planKey ? { key: request.body.planKey } : {}) },
        orderBy: { sortOrder: "asc" },
      });
      if (!plan) return reply.code(400).send(validationError("That plan is not available"));

      const userId = request.user.sub;
      const user = await prisma.appUser.findUnique({ where: { id: userId }, select: { fullName: true, email: true, phone: true } });
      if (!user) return reply.code(404).send({ data: null, error: { code: "not_found", message: "User not found" } });

      const amountPaise = plan.priceInr * 100;
      let orderId: string;
      try {
        ({ orderId } = await createGatewayOrder({
          amountPaise,
          receipt: `ew_${randomUUID().slice(0, 12)}`,
          notes: { teacherUserId: userId, planKey: plan.key },
        }));
      } catch (err) {
        request.log.error({ err }, "gateway order failed");
        return reply.code(502).send({ data: null, error: { code: "payments_unavailable", message: "Could not start the payment. Please try again." } });
      }

      const payment = await prisma.billingPayment.create({
        data: {
          teacherUserId: userId,
          planKey: plan.key,
          planName: plan.name,
          amountPaise,
          gateway: gatewayMode(),
          gatewayOrderId: orderId,
          buyerState: state.name,
          buyerStateCode: state.code,
        },
      });

      return reply.code(201).send({
        data: {
          paymentId: payment.id,
          orderId,
          amountPaise,
          currency: "INR",
          mode: gatewayMode(),
          keyId: gatewayMode() === "razorpay" ? publicKeyId() : null,
          description: `${plan.name} plan - ${plan.durationDays} days`,
          prefill: { name: user.fullName, email: user.email, contact: user.phone ?? "" },
        },
        meta: {},
      });
    }
  );

  // Called by the browser after Razorpay Checkout succeeds. The signature proves
  // the payment; the webhook may get there first, and fulfilment is idempotent.
  app.post<{ Body: { orderId?: string; paymentId?: string; signature?: string } }>(
    "/billing/verify",
    { ...teacherGuard, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!(await requireIndividualTeacher(request, reply))) return;
      const { orderId, paymentId, signature } = request.body ?? {};
      if (!orderId || !paymentId || !signature) return reply.code(400).send(validationError("orderId, paymentId and signature are required"));

      const payment = await prisma.billingPayment.findUnique({ where: { gatewayOrderId: orderId } });
      if (!payment || payment.teacherUserId !== request.user.sub) {
        return reply.code(404).send({ data: null, error: { code: "not_found", message: "Payment not found" } });
      }
      if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
        request.log.warn({ orderId }, "checkout signature mismatch");
        return reply.code(400).send({ data: null, error: { code: "invalid_signature", message: "We could not verify this payment. If money was taken, it will be applied automatically." } });
      }

      const result = await fulfilPayment({ orderId, paymentId });
      const entitlement = await getEntitlement(request.user.sub);
      return { data: { status: "paid", alreadyPaid: result.alreadyPaid, invoice: invoiceSummary(result.invoice), subscription: { status: entitlement.status, endsAt: entitlement.endsAt, daysLeft: entitlement.daysLeft } }, meta: {} };
    }
  );

  // Local testing only: completes an order without a real gateway.
  app.post<{ Body: { orderId?: string } }>("/billing/mock-pay", teacherGuard, async (request, reply) => {
    if (gatewayMode() !== "mock") return reply.code(404).send({ data: null, error: { code: "not_found", message: "Not found" } });
    if (!(await requireIndividualTeacher(request, reply))) return;

    const payment = request.body?.orderId ? await prisma.billingPayment.findUnique({ where: { gatewayOrderId: request.body.orderId } }) : null;
    if (!payment || payment.teacherUserId !== request.user.sub) return reply.code(404).send({ data: null, error: { code: "not_found", message: "Payment not found" } });

    const result = await fulfilPayment({ orderId: payment.gatewayOrderId, paymentId: `pay_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}`, method: "mock" });
    return { data: { status: "paid", alreadyPaid: result.alreadyPaid, invoice: invoiceSummary(result.invoice) }, meta: {} };
  });

  app.get<{ Params: { id: string } }>("/billing/invoices/:id/pdf", teacherGuard, async (request, reply) => {
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: request.params.id } });
    if (!invoice || (invoice.teacherUserId !== request.user.sub && request.user.role !== PLATFORM_ADMIN_ROLE)) {
      return reply.code(404).send({ data: null, error: { code: "not_found", message: "Invoice not found" } });
    }
    const pdf = await renderInvoicePdf(invoice);
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${invoice.number.replace(/\//g, "-")}.pdf"`)
      .send(pdf);
  });

  // --- Platform admin -----------------------------------------------------------

  app.get<{ Querystring: { status?: string; q?: string; page?: string } }>("/billing/admin/payments", adminGuard, async (request) => {
    const page = Math.max(1, Math.floor(Number(request.query.page ?? 1)) || 1);
    const pageSize = 25;
    const search = request.query.q?.trim();

    const where: Record<string, unknown> = {};
    if (request.query.status) where.status = request.query.status;
    if (search) {
      const matches = await prisma.appUser.findMany({
        where: { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] },
        select: { id: true },
        take: 50,
      });
      where.teacherUserId = { in: matches.map((m) => m.id) };
    }

    const istNow = new Date(Date.now() + 330 * 60_000);
    const dayStart = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - 330 * 60_000);
    const monthStart = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - 330 * 60_000);

    const [total, rows, day, month, allTime, statusCounts, business] = await Promise.all([
      prisma.billingPayment.count({ where }),
      prisma.billingPayment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { invoice: true } }),
      prisma.billingInvoice.aggregate({ where: { issuedAt: { gte: dayStart } }, _sum: { totalPaise: true, taxableValuePaise: true }, _count: true }),
      prisma.billingInvoice.aggregate({ where: { issuedAt: { gte: monthStart } }, _sum: { totalPaise: true, taxableValuePaise: true }, _count: true }),
      prisma.billingInvoice.aggregate({ _sum: { totalPaise: true, taxableValuePaise: true }, _count: true }),
      prisma.billingPayment.groupBy({ by: ["status"], _count: true }),
      getBusinessDetails(),
    ]);

    const userIds = [...new Set(rows.map((r) => r.teacherUserId))];
    const users = userIds.length ? await prisma.appUser.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const totals = (a: typeof day) => ({
      count: a._count,
      collectedPaise: a._sum.totalPaise ?? 0,
      netPaise: a._sum.taxableValuePaise ?? 0,
      taxPaise: (a._sum.totalPaise ?? 0) - (a._sum.taxableValuePaise ?? 0),
    });

    return {
      data: {
        gateway: { mode: gatewayMode(), webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) },
        businessReady: business.gstRegistered ? Boolean(business.legalName && business.address) : true,
        totals: { today: totals(day), month: totals(month), allTime: totals(allTime) },
        statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
        total,
        page,
        pageSize,
        rows: rows.map((r) => ({
          id: r.id,
          teacherName: userById.get(r.teacherUserId)?.fullName ?? "Unknown user",
          teacherEmail: userById.get(r.teacherUserId)?.email ?? null,
          planName: r.planName,
          amountPaise: r.amountPaise,
          status: r.status,
          gateway: r.gateway,
          method: r.method,
          gatewayPaymentId: r.gatewayPaymentId,
          failureReason: r.failureReason,
          createdAt: r.createdAt,
          paidAt: r.paidAt,
          invoice: invoiceSummary(r.invoice),
        })),
      },
      meta: {},
    };
  });

  app.get("/billing/admin/business", adminGuard, async () => ({ data: await getBusinessDetails(), meta: {} }));

  app.put<{
    Body: { legalName?: string; gstin?: string; address?: string; stateCode?: string; email?: string; sacCode?: string; gstRatePercent?: number };
  }>("/billing/admin/business", adminGuard, async (request, reply) => {
    const current = await getBusinessDetails();
    const body = request.body ?? {};
    const next = {
      legalName: (body.legalName ?? current.legalName).trim(),
      gstin: (body.gstin ?? current.gstin).trim().toUpperCase(),
      address: (body.address ?? current.address).trim(),
      stateCode: (body.stateCode ?? current.stateCode).trim(),
      email: (body.email ?? current.email).trim(),
      sacCode: (body.sacCode ?? current.sacCode).trim(),
      gstRatePercent: body.gstRatePercent ?? current.gstRatePercent,
    };

    if (next.gstin && !GSTIN_PATTERN.test(next.gstin)) return reply.code(400).send(validationError("That is not a valid 15-character GSTIN"));
    if (next.gstin) {
      // The first two digits of a GSTIN are the state code.
      if (next.stateCode && next.stateCode !== next.gstin.slice(0, 2)) return reply.code(400).send(validationError("The state must match the first two digits of the GSTIN"));
      next.stateCode = next.gstin.slice(0, 2);
      if (!next.legalName || !next.address) return reply.code(400).send(validationError("Legal name and address are required when a GSTIN is set"));
    }
    if (next.stateCode && !stateByCode(next.stateCode)) return reply.code(400).send(validationError("Unknown state code"));
    if (!/^\d{4,8}$/.test(next.sacCode)) return reply.code(400).send(validationError("SAC code must be 4 to 8 digits"));
    if (!Number.isFinite(next.gstRatePercent) || next.gstRatePercent < 0 || next.gstRatePercent > 28) return reply.code(400).send(validationError("GST rate must be between 0 and 28"));
    if (next.email && !/^\S+@\S+\.\S+$/.test(next.email)) return reply.code(400).send(validationError("That email address is not valid"));

    const values: Record<string, string> = {
      business_legal_name: next.legalName,
      business_gstin: next.gstin,
      business_address: next.address,
      business_state_code: next.stateCode,
      business_email: next.email,
      invoice_sac_code: next.sacCode,
      invoice_gst_rate: String(next.gstRatePercent),
    };
    await prisma.$transaction(
      BUSINESS_SETTING_KEYS.map((key) =>
        prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: values[key], updatedBy: request.user.sub },
          update: { value: values[key], updatedBy: request.user.sub },
        })
      )
    );
    return { data: await getBusinessDetails(), meta: {} };
  });
}

// The gateway's webhook. It needs the exact raw bytes to check the signature, so
// it lives in its own encapsulated plugin with a buffer JSON parser that does
// not touch any other route. Webhooks are the source of truth: a payment that
// succeeded in the browser but never called /billing/verify is still applied here.
export async function billingWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  app.post("/billing/webhook", { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } }, async (request, reply) => {
    const raw = request.body as Buffer;
    const signature = request.headers["x-razorpay-signature"];
    if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, typeof signature === "string" ? signature : undefined)) {
      return reply.code(400).send({ data: null, error: { code: "invalid_signature", message: "Invalid signature" } });
    }

    let event: {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; amount?: number; method?: string; error_description?: string } };
        order?: { entity?: { id?: string } };
      };
    };
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return reply.code(400).send({ data: null, error: { code: "invalid_body", message: "Invalid JSON" } });
    }

    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;

    // Razorpay sends every event on an account to every webhook on it, so a
    // production server and a local tunnel will each see the other's orders.
    // An order this server never created is not an error - acknowledge and skip it.
    if (orderId && !(await prisma.billingPayment.findUnique({ where: { gatewayOrderId: orderId }, select: { id: true } }))) {
      request.log.info({ orderId, event: event.event }, "webhook for an unknown order ignored");
      return { data: { received: true, ignored: true }, meta: {} };
    }

    try {
      if ((event.event === "payment.captured" || event.event === "order.paid") && orderId && payment?.id) {
        await fulfilPayment({ orderId, paymentId: payment.id, method: payment.method, amountPaise: payment.amount });
      } else if (event.event === "payment.failed" && orderId) {
        // Never downgrade a payment that already succeeded.
        await prisma.billingPayment.updateMany({
          where: { gatewayOrderId: orderId, status: "created" },
          data: { status: "failed", failureReason: (payment?.error_description ?? "Payment failed").slice(0, 300) },
        });
      }
    } catch (err) {
      // A 5xx makes Razorpay retry, which is what we want for a real failure.
      request.log.error({ err, event: event.event, orderId }, "webhook handling failed");
      return reply.code(500).send({ data: null, error: { code: "webhook_failed", message: "Could not process the event" } });
    }
    return { data: { received: true }, meta: {} };
  });
}
