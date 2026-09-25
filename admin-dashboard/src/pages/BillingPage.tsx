import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { BillingOverview, CheckoutOrder } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

// Where an individual teacher manages their plan on the website: see the trial
// or plan, pay for the next period with Razorpay, and download GST invoices.
// The mobile app never links here (Google Play payments policy) - teachers
// arrive by signing in on the web, or from the reminder emails.

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function BillingPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [stateCode, setStateCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [schoolManaged, setSchoolManaged] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setData(await api.getBillingOverview(accessToken));
      setError(null);
    } catch (err) {
      // Teachers of a school are billed by their school, not here.
      if (err instanceof ApiError && err.code === "not_individual") setSchoolManaged(true);
      else setError(err instanceof Error ? err.message : "Failed to load your plan");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const plan = data?.plans[0];

  async function finishPayment(order: CheckoutOrder, success: RazorpaySuccess) {
    if (!accessToken) return;
    try {
      await api.verifyPayment(accessToken, { orderId: success.razorpay_order_id, paymentId: success.razorpay_payment_id, signature: success.razorpay_signature });
      setNotice(`Payment received - your ${order.description.split(" - ")[0]} is active. A GST invoice has been emailed to you.`);
    } catch (err) {
      // The webhook still applies a real payment even if this call fails.
      setNotice(null);
      setError(err instanceof Error ? err.message : "We could not confirm the payment yet");
    } finally {
      setPaying(false);
      await load();
    }
  }

  async function pay() {
    if (!accessToken || !plan) return;
    if (!stateCode) {
      setError("Choose your state first - it is needed for the GST invoice");
      return;
    }
    setError(null);
    setNotice(null);
    setPaying(true);

    let order: CheckoutOrder;
    try {
      order = await api.createCheckout(accessToken, { planKey: plan.key, stateCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
      setPaying(false);
      return;
    }

    // Local testing gateway: no real money moves.
    if (order.mode === "mock") {
      try {
        await api.mockPay(accessToken, order.orderId);
        setNotice("Test payment completed (mock gateway).");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Test payment failed");
      } finally {
        setPaying(false);
        await load();
      }
      return;
    }

    if (!(await loadRazorpayScript()) || !window.Razorpay) {
      setError("Could not load the payment window. Check your connection and try again.");
      setPaying(false);
      return;
    }

    const checkout = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "EduWand",
      description: order.description,
      prefill: order.prefill,
      theme: { color: "#7c005a" },
      handler: (response: RazorpaySuccess) => void finishPayment(order, response),
      modal: { ondismiss: () => setPaying(false) },
    });
    checkout.on("payment.failed", (response) => {
      setError(response.error?.description ?? "The payment did not go through. You have not been charged.");
      setPaying(false);
    });
    checkout.open();
  }

  async function downloadInvoice(id: string, number: string) {
    if (!accessToken) return;
    setDownloading(id);
    try {
      const blob = await api.downloadInvoice(accessToken, id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${number.replace(/\//g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the invoice");
    } finally {
      setDownloading(null);
    }
  }

  const sub = data?.subscription;
  const live = sub?.status === "trial" || sub?.status === "active";

  return (
    <div>
      <PageHeader title="My Plan" subtitle="Your trial or plan, payments and invoices" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}
      {notice ? <p style={{ color: "var(--status-good)", fontWeight: 600 }}>{notice}</p> : null}

      {schoolManaged ? (
        <Card title="Managed by your school">
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Your plan and AI credits are provided by your school, so there is nothing to buy here. Use the EduWand mobile app for your
            classes, lesson plans and students.
          </p>
        </Card>
      ) : !data || !sub ? (
        !error ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : null
      ) : (
        <>
          <Card title="Current plan">
            <div style={styles.statusRow}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>
                  {sub.status === "trial" ? "Free trial" : sub.status === "active" ? sub.planName : sub.status === "none" ? "No active plan" : sub.status === "cancelled" ? "Your plan was cancelled" : "Your plan has ended"}
                </div>
                <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                  {live && sub.endsAt
                    ? `${sub.daysLeft} day${sub.daysLeft === 1 ? "" : "s"} left - ends ${dateLabel(sub.endsAt)}`
                    : "AI features are paused. Your classes, students and saved content are not affected."}
                </div>
              </div>
              <div style={styles.credits}>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{data.balance.toLocaleString("en-IN")}</div>
                <div style={styles.small}>AI credits left</div>
              </div>
            </div>
          </Card>

          {plan ? (
            <Card title={live ? `Renew ${plan.name}` : `Get ${plan.name}`}>
              <div style={styles.planRow}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1px" }}>
                    ₹{plan.priceInr.toLocaleString("en-IN")}
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-muted)" }}> / {plan.durationDays} days</span>
                  </div>
                  <ul style={styles.list}>
                    <li>{plan.credits.toLocaleString("en-IN")} AI credits for lesson plans, presentations, grading and the assistant</li>
                    <li>{data.gstIncluded ? `Price includes ${data.gstRatePercent}% GST - a GST invoice is emailed to you` : "An invoice is emailed to you"}</li>
                    <li>Credits reset to {plan.credits.toLocaleString("en-IN")} when a new period starts</li>
                    {live ? <li>Renewing early adds another {plan.durationDays} days and {plan.credits.toLocaleString("en-IN")} credits</li> : null}
                    <li>Renews only when you pay - nothing is charged automatically</li>
                  </ul>
                </div>
                <div style={{ minWidth: 240, flex: "0 1 300px" }}>
                  <label style={styles.small} htmlFor="state">
                    Your state (for the GST invoice)
                  </label>
                  <select id="state" style={styles.select} value={stateCode} onChange={(e) => setStateCode(e.target.value)} disabled={paying}>
                    <option value="">Select state…</option>
                    {data.states.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button style={styles.payButton} onClick={pay} disabled={paying || data.gateway.mode === "unconfigured"}>
                    {paying ? "Processing…" : `Pay ₹${plan.priceInr.toLocaleString("en-IN")}`}
                  </button>
                  {data.gateway.mode === "unconfigured" ? (
                    <p style={{ ...styles.small, color: "var(--status-warning)", marginTop: 8 }}>Payments are not available yet. Please check back soon.</p>
                  ) : null}
                  {data.gateway.mode === "mock" ? <p style={{ ...styles.small, marginTop: 8 }}>Test mode: no real money is charged.</p> : null}
                  <p style={{ ...styles.small, marginTop: 10 }}>Payments are non-refundable. Secure payment by Razorpay - UPI, cards and netbanking.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Plans">
              <p style={{ margin: 0, color: "var(--text-muted)" }}>No plan is available to buy right now.</p>
            </Card>
          )}

          <Card title="Payments and invoices">
            {data.payments.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-muted)" }}>No payments yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Plan</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td style={styles.td}>{dateLabel(p.paidAt ?? p.createdAt)}</td>
                        <td style={styles.td}>{p.planName}</td>
                        <td style={styles.td}>{rupees(p.amountPaise)}</td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 700, color: p.status === "paid" ? "var(--status-good)" : p.status === "failed" ? "var(--status-critical)" : "var(--text-muted)" }}>
                            {p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : "Not completed"}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {p.invoice ? (
                            <button style={styles.linkButton} disabled={downloading === p.invoice.id} onClick={() => downloadInvoice(p.invoice!.id, p.invoice!.number)}>
                              {p.invoice.number} (PDF)
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  statusRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" },
  credits: { textAlign: "right" },
  small: { fontSize: 12, color: "var(--text-muted)", display: "block" },
  planRow: { display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" },
  list: { margin: "14px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.8 },
  select: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, margin: "6px 0 12px", background: "var(--bg-card)" },
  payButton: {
    width: "100%",
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "14px 18px",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  linkButton: { background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" },
};
