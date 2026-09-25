import PDFDocument from "pdfkit";
import { Prisma, PrismaClient, type BillingInvoice, type BillingPayment } from "@prisma/client";
import { prisma } from "./prisma";
import { activatePlan } from "./subscriptions";
import { sendEmailInBackground } from "./email/sender";
import { invoiceEmail } from "./email/templates";
import { computeInvoiceTax, financialYear, formatInvoiceNumber, formatRupees, stateByCode, GSTIN_PATTERN } from "./gst";

type Tx = Prisma.TransactionClient | PrismaClient;

// --- Business details (printed on invoices) -----------------------------------

export interface BusinessDetails {
  legalName: string;
  gstin: string;
  address: string;
  stateCode: string;
  email: string;
  sacCode: string;
  gstRatePercent: number;
  // No GSTIN = not registered: no tax is charged and the price is the total.
  gstRegistered: boolean;
}

const BUSINESS_KEYS = {
  legalName: "business_legal_name",
  gstin: "business_gstin",
  address: "business_address",
  stateCode: "business_state_code",
  email: "business_email",
  sacCode: "invoice_sac_code",
  gstRate: "invoice_gst_rate",
} as const;

export const BUSINESS_SETTING_KEYS = Object.values(BUSINESS_KEYS);

export async function getBusinessDetails(tx: Tx = prisma): Promise<BusinessDetails> {
  const rows = await tx.platformSetting.findMany({ where: { key: { in: [...BUSINESS_SETTING_KEYS] } } });
  const value = (key: string) => rows.find((r) => r.key === key)?.value.trim() ?? "";
  const gstin = value(BUSINESS_KEYS.gstin).toUpperCase();
  const rate = Number(value(BUSINESS_KEYS.gstRate));
  return {
    legalName: value(BUSINESS_KEYS.legalName),
    gstin,
    address: value(BUSINESS_KEYS.address),
    stateCode: value(BUSINESS_KEYS.stateCode) || (GSTIN_PATTERN.test(gstin) ? gstin.slice(0, 2) : ""),
    email: value(BUSINESS_KEYS.email),
    sacCode: value(BUSINESS_KEYS.sacCode) || "998439",
    gstRatePercent: Number.isFinite(rate) && rate >= 0 ? rate : 18,
    gstRegistered: GSTIN_PATTERN.test(gstin),
  };
}

// --- Invoice ------------------------------------------------------------------

async function nextInvoiceNumber(tx: Tx, issuedAt: Date): Promise<string> {
  const fy = financialYear(issuedAt);
  // One atomic upsert-increment, so concurrent payments never share a number
  // and a rolled-back payment doesn't leave a gap.
  const rows = await tx.$queryRaw<{ last_number: number }[]>(Prisma.sql`
    INSERT INTO billing_invoice_counter (financial_year, last_number) VALUES (${fy}, 1)
    ON CONFLICT (financial_year) DO UPDATE SET last_number = billing_invoice_counter.last_number + 1
    RETURNING last_number`);
  return formatInvoiceNumber(fy, rows[0].last_number);
}

async function createInvoice(
  tx: Tx,
  payment: BillingPayment,
  customer: { fullName: string; email: string },
  period: { startsAt: Date; endsAt: Date },
  durationDays: number
): Promise<BillingInvoice> {
  const business = await getBusinessDetails(tx);
  const issuedAt = new Date();
  const tax = computeInvoiceTax({
    totalPaise: payment.amountPaise,
    ratePercent: business.gstRatePercent,
    gstRegistered: business.gstRegistered,
    sellerStateCode: business.stateCode || null,
    buyerStateCode: payment.buyerStateCode,
  });
  const sellerState = stateByCode(business.stateCode);

  return tx.billingInvoice.create({
    data: {
      number: await nextInvoiceNumber(tx, issuedAt),
      paymentId: payment.id,
      teacherUserId: payment.teacherUserId,
      issuedAt,
      customerName: customer.fullName,
      customerEmail: customer.email,
      buyerState: payment.buyerState,
      buyerStateCode: payment.buyerStateCode,
      description: `${payment.planName} plan - ${durationDays} days of EduWand AI access`,
      periodStart: period.startsAt,
      periodEnd: period.endsAt,
      sacCode: business.sacCode,
      gstRegistered: business.gstRegistered,
      taxRatePercent: business.gstRegistered ? business.gstRatePercent : 0,
      taxableValuePaise: tax.taxablePaise,
      cgstPaise: tax.cgstPaise,
      sgstPaise: tax.sgstPaise,
      igstPaise: tax.igstPaise,
      totalPaise: tax.totalPaise,
      seller: {
        legalName: business.legalName,
        gstin: business.gstin,
        address: business.address,
        email: business.email,
        stateCode: business.stateCode,
        stateName: sellerState?.name ?? "",
      },
    },
  });
}

// --- Fulfilment ---------------------------------------------------------------

export interface FulfilResult {
  payment: BillingPayment;
  invoice: BillingInvoice | null;
  alreadyPaid: boolean;
}

// Turns a verified payment into a plan period, credits and an invoice. Safe to
// call any number of times for the same order (checkout callback and webhook
// both arrive): only the first call does the work.
export async function fulfilPayment(params: { orderId: string; paymentId: string; method?: string | null; amountPaise?: number }): Promise<FulfilResult> {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.billingPayment.findUnique({ where: { gatewayOrderId: params.orderId }, include: { invoice: true } });
    if (!payment) throw new Error(`No payment for order ${params.orderId}`);
    if (payment.status === "paid") return { payment, invoice: payment.invoice, alreadyPaid: true, customer: null };

    // The gateway reports what was actually paid - it must be what we asked for.
    if (params.amountPaise !== undefined && params.amountPaise !== payment.amountPaise) {
      throw new Error(`Amount mismatch for order ${params.orderId}: expected ${payment.amountPaise}, paid ${params.amountPaise}`);
    }

    const claimed = await tx.billingPayment.updateMany({
      where: { id: payment.id, status: { not: "paid" } },
      data: { status: "paid", paidAt: new Date(), gatewayPaymentId: params.paymentId, method: params.method ?? null, failureReason: null },
    });
    if (claimed.count === 0) return { payment, invoice: payment.invoice, alreadyPaid: true, customer: null };

    const plan = await tx.billingPlan.findUnique({ where: { key: payment.planKey } });
    const user = await tx.appUser.findUnique({ where: { id: payment.teacherUserId }, select: { fullName: true, email: true } });
    if (!plan || !user) throw new Error(`Plan or user missing for order ${params.orderId}`);

    const period = await activatePlan(tx, {
      userId: payment.teacherUserId,
      plan,
      source: "purchase",
      paymentId: payment.id,
      note: `Payment ${params.paymentId}`,
    });
    const paid = { ...payment, status: "paid", paidAt: new Date(), gatewayPaymentId: params.paymentId, method: params.method ?? null };
    const invoice = await createInvoice(tx, paid, user, period, plan.durationDays);
    return { payment: paid, invoice, alreadyPaid: false, customer: user };
  });

  if (!result.alreadyPaid && result.invoice && result.customer) {
    sendEmailInBackground(result.customer.email, invoiceEmail({ name: result.customer.fullName, invoice: result.invoice }));
  }
  return { payment: result.payment, invoice: result.invoice, alreadyPaid: result.alreadyPaid };
}

// --- PDF ----------------------------------------------------------------------

interface SellerSnapshot {
  legalName?: string;
  gstin?: string;
  address?: string;
  email?: string;
  stateName?: string;
}

const dateLabel = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function renderInvoicePdf(invoice: BillingInvoice): Promise<Buffer> {
  const seller = invoice.seller as SellerSnapshot;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 50;
    const right = doc.page.width - 50;
    const muted = "#666666";

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#000000").text(invoice.gstRegistered ? "TAX INVOICE" : "INVOICE", left, 50);
    doc.font("Helvetica").fontSize(10).fillColor(muted).text(`Invoice no: ${invoice.number}`, left, 78).text(`Date: ${dateLabel(invoice.issuedAt)}`, left, 92);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000").text(seller.legalName || "EduWand", left, 50, { width: right - left, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(muted);
    if (seller.address) doc.text(seller.address, left + 250, doc.y, { width: right - left - 250, align: "right" });
    if (seller.gstin) doc.text(`GSTIN: ${seller.gstin}`, left + 250, doc.y, { width: right - left - 250, align: "right" });
    if (seller.email) doc.text(seller.email, left + 250, doc.y, { width: right - left - 250, align: "right" });

    doc.moveTo(left, 140).lineTo(right, 140).strokeColor("#dddddd").stroke();

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("Billed to", left, 155);
    doc.font("Helvetica").fontSize(10).fillColor("#000000").text(invoice.customerName, left, 170).fillColor(muted).text(invoice.customerEmail, left, 184);
    if (invoice.buyerState) doc.text(`Place of supply: ${invoice.buyerState}${invoice.buyerStateCode ? ` (${invoice.buyerStateCode})` : ""}`, left, 198);

    // Line item table
    const top = 240;
    doc.rect(left, top, right - left, 22).fill("#f3f3f3");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
    doc.text("Description", left + 8, top + 7).text("SAC", left + 300, top + 7).text("Amount", left, top + 7, { width: right - left - 8, align: "right" });

    doc.font("Helvetica").fontSize(10);
    doc.text(invoice.description, left + 8, top + 34, { width: 280 });
    doc.fontSize(9).fillColor(muted).text(`${dateLabel(invoice.periodStart)} to ${dateLabel(invoice.periodEnd)}`, left + 8, doc.y + 2, { width: 280 });
    doc.fontSize(10).fillColor("#000000").text(invoice.sacCode, left + 300, top + 34);
    doc.text(formatRupees(invoice.taxableValuePaise), left, top + 34, { width: right - left - 8, align: "right" });

    // Totals
    let y = top + 100;
    const row = (label: string, amount: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#000000");
      doc.text(label, left + 300, y, { width: 120 }).text(amount, left, y, { width: right - left - 8, align: "right" });
      y += 18;
    };
    doc.moveTo(left + 290, y - 8).lineTo(right, y - 8).strokeColor("#dddddd").stroke();
    row("Taxable value", formatRupees(invoice.taxableValuePaise));
    if (invoice.gstRegistered) {
      const half = invoice.taxRatePercent / 2;
      if (invoice.igstPaise > 0) row(`IGST @ ${invoice.taxRatePercent}%`, formatRupees(invoice.igstPaise));
      else {
        row(`CGST @ ${half}%`, formatRupees(invoice.cgstPaise));
        row(`SGST @ ${half}%`, formatRupees(invoice.sgstPaise));
      }
    }
    doc.moveTo(left + 290, y - 4).lineTo(right, y - 4).strokeColor("#dddddd").stroke();
    y += 4;
    row("Total (incl. all taxes)", formatRupees(invoice.totalPaise), true);

    doc.font("Helvetica").fontSize(8).fillColor(muted).text("Paid online. This is a computer-generated invoice and needs no signature. Fees are non-refundable.", left, 720, {
      width: right - left,
      align: "center",
    });
    doc.end();
  });
}
