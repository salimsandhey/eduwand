import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AdminPayments, BusinessDetails } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatTile } from "../components/StatTile";

// Platform-admin view of money taken for teacher plans, the business details
// printed on GST invoices, and the payment gateway status. Backend:
// routes/billing.ts.

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS_COLORS = { paid: "var(--status-good)", failed: "var(--status-critical)", created: "var(--text-muted)" } as const;
const STATUS_LABELS = { paid: "Paid", failed: "Failed", created: "Not completed" } as const;
const MODE_LABELS = { razorpay: "Razorpay (live keys set)", mock: "Test mode (mock gateway)", unconfigured: "Not configured" } as const;

export function PaymentsPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AdminPayments | null>(null);
  const [business, setBusiness] = useState<BusinessDetails | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ legalName: "", gstin: "", address: "", email: "", sacCode: "", gstRatePercent: "18" });

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [payments, details] = await Promise.all([api.listPayments(accessToken, { status, q: query, page }), api.getBusinessDetails(accessToken)]);
      setData(payments);
      setBusiness(details);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    }
  }, [accessToken, status, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Fill the form once the saved details arrive (and after each save).
  useEffect(() => {
    if (business) {
      setForm({
        legalName: business.legalName,
        gstin: business.gstin,
        address: business.address,
        email: business.email,
        sacCode: business.sacCode,
        gstRatePercent: String(business.gstRatePercent),
      });
    }
  }, [business]);

  async function saveBusiness() {
    if (!accessToken) return;
    setBusy(true);
    setSaved(false);
    try {
      await api.saveBusinessDetails(accessToken, {
        legalName: form.legalName,
        gstin: form.gstin,
        address: form.address,
        email: form.email,
        sacCode: form.sacCode,
        gstRatePercent: Number(form.gstRatePercent),
      });
      setSaved(true);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice(id: string, number: string) {
    if (!accessToken) return;
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
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => {
      setSaved(false);
      setForm({ ...form, [key]: e.target.value });
    },
  });

  return (
    <div>
      <PageHeader title="Payments" subtitle="Money taken for teacher plans, GST invoice details and gateway status" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!data ? (
        !error ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : null
      ) : (
        <>
          <div style={styles.tiles}>
            <StatTile label="Collected today" value={rupees(data.totals.today.collectedPaise)} />
            <StatTile label="Collected this month" value={rupees(data.totals.month.collectedPaise)} />
            <StatTile label="Net of GST this month" value={rupees(data.totals.month.netPaise)} />
            <StatTile label="GST this month" value={rupees(data.totals.month.taxPaise)} />
            <StatTile label="All-time payments" value={String(data.totals.allTime.count)} />
          </div>

          <Card title="Gateway status">
            <div style={styles.statusGrid}>
              <div>
                <div style={styles.small}>Mode</div>
                <div style={{ fontWeight: 700, color: data.gateway.mode === "unconfigured" ? "var(--status-critical)" : "inherit" }}>{MODE_LABELS[data.gateway.mode]}</div>
              </div>
              <div>
                <div style={styles.small}>Webhook secret</div>
                <div style={{ fontWeight: 700, color: data.gateway.webhookConfigured ? "var(--status-good)" : "var(--status-warning)" }}>
                  {data.gateway.webhookConfigured ? "Set" : "Not set"}
                </div>
              </div>
              <div>
                <div style={styles.small}>Invoice details</div>
                <div style={{ fontWeight: 700, color: data.businessReady ? "var(--status-good)" : "var(--status-warning)" }}>{data.businessReady ? "Ready" : "Incomplete"}</div>
              </div>
            </div>
            <p style={styles.note}>
              Payments are set up with the server settings RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. In Razorpay,
              point the webhook at <code>/api/v1/billing/webhook</code> and enable the payment.captured, order.paid and payment.failed
              events. The webhook is what applies a payment if the teacher closes the page before it finishes.
            </p>
          </Card>

          <Card title="GST invoice details">
            <div style={styles.formGrid}>
              <label style={styles.field}>
                <span style={styles.small}>Legal name</span>
                <input style={styles.input} {...field("legalName")} />
              </label>
              <label style={styles.field}>
                <span style={styles.small}>GSTIN (leave empty if not GST-registered)</span>
                <input style={styles.input} {...field("gstin")} maxLength={15} placeholder="27AAAAA0000A1Z5" />
              </label>
              <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <span style={styles.small}>Registered address</span>
                <input style={styles.input} {...field("address")} />
              </label>
              <label style={styles.field}>
                <span style={styles.small}>Billing email shown on invoices</span>
                <input style={styles.input} {...field("email")} />
              </label>
              <label style={styles.field}>
                <span style={styles.small}>SAC code</span>
                <input style={styles.input} {...field("sacCode")} />
              </label>
              <label style={styles.field}>
                <span style={styles.small}>GST rate (%)</span>
                <input style={styles.input} type="number" min={0} max={28} {...field("gstRatePercent")} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button style={styles.button} onClick={saveBusiness} disabled={busy}>
                {busy ? "Saving…" : "Save details"}
              </button>
              {saved ? <span style={{ color: "var(--status-good)", fontWeight: 600 }}>Saved</span> : null}
            </div>
            <p style={styles.note}>
              Prices are GST-inclusive. With a GSTIN, invoices split out the tax (CGST + SGST for buyers in your state, IGST for
              other states). Without one, invoices are issued without tax and the price is charged as-is. The SAC code is a default
              - confirm the right one with your accountant. Changes apply to invoices issued from now on.
            </p>
          </Card>

          <Card title="Payments">
            <div style={styles.filters}>
              <select
                style={styles.select}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                aria-label="Status"
              >
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="created">Not completed</option>
              </select>
              <form
                style={{ display: "flex", gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(search);
                  setPage(1);
                }}
              >
                <input style={{ ...styles.select, minWidth: 220 }} placeholder="Search teacher name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button style={styles.button} type="submit">
                  Search
                </button>
              </form>
            </div>

            {data.rows.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-muted)" }}>No payments yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>When</th>
                      <th style={styles.th}>Teacher</th>
                      <th style={styles.th}>Plan</th>
                      <th style={styles.th}>Amount</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Reference</th>
                      <th style={styles.th}>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td style={styles.td}>{dateTime(r.paidAt ?? r.createdAt)}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{r.teacherName}</div>
                          {r.teacherEmail ? <div style={styles.small}>{r.teacherEmail}</div> : null}
                        </td>
                        <td style={styles.td}>{r.planName}</td>
                        <td style={styles.td}>{rupees(r.amountPaise)}</td>
                        <td style={styles.td}>
                          <span style={{ fontWeight: 700, color: STATUS_COLORS[r.status] }}>{STATUS_LABELS[r.status]}</span>
                          {r.failureReason ? <div style={styles.small}>{r.failureReason}</div> : null}
                        </td>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 12 }}>
                          {r.gatewayPaymentId ?? "-"}
                          <div style={{ fontFamily: "inherit", color: "var(--text-muted)" }}>
                            {r.gateway}
                            {r.method ? ` - ${r.method}` : ""}
                          </div>
                        </td>
                        <td style={styles.td}>
                          {r.invoice ? (
                            <button style={styles.linkButton} onClick={() => downloadInvoice(r.invoice!.id, r.invoice!.number)}>
                              {r.invoice.number}
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

            <div style={styles.pager}>
              <button style={styles.smallButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Page {page} of {pageCount}
              </span>
              <button style={styles.smallButton} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  tiles: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  statusGrid: { display: "flex", gap: 36, flexWrap: "wrap" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  small: { fontSize: 12, color: "var(--text-muted)" },
  input: { padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 },
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 14, marginBottom: 0 },
  filters: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "top" },
  button: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  smallButton: { background: "var(--bg-page)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: 12 },
  linkButton: { background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 },
};
