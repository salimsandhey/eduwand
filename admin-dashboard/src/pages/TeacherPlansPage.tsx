import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { BillingPlan, SubscriptionList, SubscriptionRow } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { StatTile } from "../components/StatTile";

// Individual-teacher trial + paid plan (backend routes/billing-plans.ts, plan
// in Docs/superpowers/plans/2026-09-25-trial-plans-and-purchase.md). Every
// value here applies to teachers who sign up or renew from now on; a teacher
// already partway through a period keeps the length and credits they started with.

const STATUS_COLORS: Record<SubscriptionRow["status"], string> = {
  trial: "var(--status-warning)",
  active: "var(--status-good)",
  expired: "var(--status-critical)",
};
const STATUS_LABELS: Record<SubscriptionRow["status"], string> = { trial: "On trial", active: "Paid", expired: "Ended" };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const count = (n: number) => n.toLocaleString("en-IN");
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function TeacherPlansPage() {
  const { accessToken } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [subs, setSubs] = useState<SubscriptionList | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [planRows, subRows] = await Promise.all([
        api.listBillingPlans(accessToken),
        api.listSubscriptions(accessToken, { status, q: query, page }),
      ]);
      setPlans(planRows);
      setSubs(subRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    }
  }, [accessToken, status, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, failure: string) {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(null);
    }
  }

  function savePlanNumber(plan: BillingPlan, field: "priceInr" | "durationDays" | "credits", raw: string) {
    const value = Number(raw);
    if (!accessToken || raw.trim() === "" || value === plan[field]) return;
    if (!Number.isInteger(value) || value < 0) {
      setError("Enter a whole number");
      return;
    }
    run(plan.key, () => api.updateBillingPlan(accessToken, plan.key, { [field]: value }), "Failed to save the plan");
  }

  function savePlanName(plan: BillingPlan, raw: string) {
    const name = raw.trim();
    if (!accessToken || !name || name === plan.name) return;
    run(plan.key, () => api.updateBillingPlan(accessToken, plan.key, { name }), "Failed to save the plan");
  }

  function toggleEnabled(plan: BillingPlan, enabled: boolean) {
    if (!accessToken) return;
    const warning =
      plan.kind === "trial"
        ? "Turn the free trial off? New individual teachers will have NO AI access until they buy a plan."
        : "Turn the paid plan off? Teachers will not be able to buy it.";
    if (!enabled && !window.confirm(warning)) return;
    run(plan.key, () => api.updateBillingPlan(accessToken, plan.key, { enabled }), "Failed to save the plan");
  }

  function extend(row: SubscriptionRow) {
    if (!accessToken) return;
    const raw = window.prompt(`Extend ${row.name}'s ${row.planName} by how many days?`, "7");
    if (raw === null) return;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Enter a whole number of days between 1 and 365");
      return;
    }
    run(row.userId, () => api.extendSubscription(accessToken, row.userId, days), "Failed to extend");
  }

  function activate(row: SubscriptionRow, plan: BillingPlan) {
    if (!accessToken) return;
    if (!window.confirm(`Put ${row.name} on ${plan.name} for ${plan.durationDays} days with ${count(plan.credits)} credits? Use this for a payment taken outside the website.`)) return;
    run(row.userId, () => api.activateSubscription(accessToken, row.userId, plan.key), "Failed to activate the plan");
  }

  const paidPlan = plans?.find((p) => p.kind === "paid");
  const pageCount = subs ? Math.max(1, Math.ceil(subs.total / subs.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Teacher Plans" subtitle="The free trial and paid plan for individual teachers, and who is on what" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!plans || !subs ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.tiles}>
            <StatTile label="On free trial" value={count(subs.counts.trial)} />
            <StatTile label="On paid plan" value={count(subs.counts.active)} />
            <StatTile label="Plan ended" value={count(subs.counts.expired)} />
          </div>

          <div style={styles.planGrid}>
            {plans.map((plan) => (
              <Card key={plan.key} title={plan.kind === "trial" ? "Free trial" : "Paid plan"} style={{ flex: 1, minWidth: 300, opacity: plan.enabled ? 1 : 0.7 }}>
                <label style={styles.toggle}>
                  <input type="checkbox" checked={plan.enabled} disabled={busy === plan.key} onChange={(e) => toggleEnabled(plan, e.target.checked)} />
                  <span style={{ fontWeight: 600 }}>{plan.kind === "trial" ? "Give new teachers this trial" : "Plan can be bought"}</span>
                </label>
                <div style={styles.fields}>
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>Name</span>
                    <input
                      key={`${plan.key}-name-${plan.updatedAt}`}
                      style={styles.input}
                      defaultValue={plan.name}
                      disabled={busy === plan.key}
                      onBlur={(e) => savePlanName(plan, e.target.value)}
                    />
                  </label>
                  {plan.kind === "paid" ? (
                    <label style={styles.field}>
                      <span style={styles.fieldLabel}>Price (₹, GST included)</span>
                      <input
                        key={`${plan.key}-price-${plan.updatedAt}`}
                        style={styles.input}
                        type="number"
                        min={1}
                        defaultValue={plan.priceInr}
                        disabled={busy === plan.key}
                        onBlur={(e) => savePlanNumber(plan, "priceInr", e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>Length (days)</span>
                    <input
                      key={`${plan.key}-days-${plan.updatedAt}`}
                      style={styles.input}
                      type="number"
                      min={1}
                      defaultValue={plan.durationDays}
                      disabled={busy === plan.key}
                      onBlur={(e) => savePlanNumber(plan, "durationDays", e.target.value)}
                    />
                  </label>
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>AI credits</span>
                    <input
                      key={`${plan.key}-credits-${plan.updatedAt}`}
                      style={styles.input}
                      type="number"
                      min={0}
                      defaultValue={plan.credits}
                      disabled={busy === plan.key}
                      onBlur={(e) => savePlanNumber(plan, "credits", e.target.value)}
                    />
                  </label>
                </div>
                <p style={styles.note}>
                  {plan.kind === "trial"
                    ? `${plan.durationDays} days and ${count(plan.credits)} credits, free. Given automatically when an individual teacher signs up. When it ends, AI stops until they buy a plan.`
                    : `${inr(plan.priceInr)} for ${plan.durationDays} days and ${count(plan.credits)} credits. Paying resets the credit balance to this amount; paying early adds a period and the credits. Renewal is manual.`}
                </p>
              </Card>
            ))}
          </div>

          <Card title="Teachers">
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
                <option value="trial">On free trial</option>
                <option value="active">On paid plan</option>
                <option value="expired">Plan ended</option>
              </select>
              <form
                style={{ display: "flex", gap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(search);
                  setPage(1);
                }}
              >
                <input style={{ ...styles.select, minWidth: 220 }} placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button style={styles.button} type="submit">
                  Search
                </button>
              </form>
            </div>

            {subs.rows.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>No teachers match.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Teacher</th>
                      <th style={styles.th}>Plan</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Ends</th>
                      <th style={styles.th}>Credits left</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.rows.map((row) => (
                      <tr key={row.userId}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{row.name}</div>
                          {row.email ? <div style={styles.sub}>{row.email}</div> : null}
                        </td>
                        <td style={styles.td}>
                          <div>{row.planName}</div>
                          <div style={styles.sub}>via {row.source}</div>
                        </td>
                        <td style={styles.td}>
                          <span style={{ color: STATUS_COLORS[row.status], fontWeight: 700 }}>{STATUS_LABELS[row.status]}</span>
                        </td>
                        <td style={styles.td}>
                          <div>{dateLabel(row.endsAt)}</div>
                          <div style={styles.sub}>{row.status === "expired" ? "ended" : `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left`}</div>
                        </td>
                        <td style={styles.td}>{count(row.balance)}</td>
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button style={styles.smallButton} disabled={busy === row.userId} onClick={() => extend(row)}>
                              Extend
                            </button>
                            {paidPlan ? (
                              <button style={styles.smallButton} disabled={busy === row.userId} onClick={() => activate(row, paidPlan)}>
                                Activate {paidPlan.name}
                              </button>
                            ) : null}
                          </div>
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
  planGrid: { display: "flex", gap: 18, flexWrap: "wrap" },
  toggle: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 14 },
  fields: { display: "flex", gap: 14, flexWrap: "wrap" },
  field: { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 130px" },
  fieldLabel: { fontSize: 12, color: "var(--text-muted)", fontWeight: 600 },
  input: { padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 },
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 14, marginBottom: 0 },
  filters: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    padding: "0 12px 10px 0",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "middle" },
  sub: { fontSize: 12, color: "var(--text-muted)" },
  button: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  smallButton: {
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "6px 12px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 12,
  },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 },
};
