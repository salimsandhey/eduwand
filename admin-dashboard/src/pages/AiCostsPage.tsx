import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AiCostFeature, AiCostOverview } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionTabs } from "../components/SectionTabs";
import { StatTile } from "../components/StatTile";
import { LineChart } from "../components/LineChart";
import { BarChart } from "../components/BarChart";

// What AI really costs (measured from every provider call) against what
// teachers are charged in credits - the data for pricing each feature.
// Backend: routes/ai-costs.ts.

const PERIODS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const inr = (n: number, places = 2) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: places })}`;
const count = (n: number) => n.toLocaleString("en-IN");
const dash = "-";

function marginColor(pct: number | null): string {
  if (pct === null) return "var(--text-muted)";
  if (pct < 0) return "var(--status-critical)";
  if (pct < 50) return "var(--status-warning)";
  return "var(--status-good)";
}

export function AiCostsPage() {
  const { accessToken } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AiCostOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setData(await api.getAiCosts(accessToken, days));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI costs");
    }
  }, [accessToken, days]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSetting(field: "creditValueInr" | "targetMargin", raw: string) {
    const value = Number(raw);
    if (!accessToken || !data || raw.trim() === "" || value === data.pricing[field]) return;
    setBusy(field);
    try {
      await api.setAiCostSettings(accessToken, { [field]: value });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function applySuggestion(feature: AiCostFeature, credits: number) {
    if (!accessToken) return;
    if (!window.confirm(`Change "${feature.label}" from ${feature.currentCredits} to ${credits} credits per use? Teachers are charged this from their next action.`)) return;
    setBusy(feature.key);
    try {
      await api.updateAiFeature(accessToken, feature.key, { cost: credits });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the credit cost");
    } finally {
      setBusy(null);
    }
  }

  const summary = data?.summary;

  return (
    <div>
      <SectionTabs group="ai" />
      <PageHeader
        title="AI Costs"
        subtitle="What AI costs you per action, against what teachers are charged - use it to set credit prices"
        action={
          <select
            style={styles.select}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time period"
          >
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                Last {p.label}
              </option>
            ))}
          </select>
        }
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!data || !summary ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.tiles}>
            <StatTile label="AI cost" value={inr(summary.totalCostInr)} />
            <StatTile label="Credits charged" value={count(summary.creditsCharged)} />
            <StatTile label="Worth (at credit value)" value={inr(summary.revenueInr)} />
            <div style={styles.marginTile}>
              <span style={{ ...styles.marginValue, color: marginColor(summary.marginPct) }}>
                {summary.marginPct === null ? dash : `${summary.marginPct}%`}
              </span>
              <span style={styles.marginLabel}>Margin</span>
            </div>
            <StatTile label="Money collected (paid plans)" value={inr(summary.collectedInr)} />
            <div style={styles.marginTile}>
              <span style={{ ...styles.marginValue, color: marginColor(summary.realMarginPct) }}>
                {summary.realMarginPct === null ? dash : `${summary.realMarginPct}%`}
              </span>
              <span style={styles.marginLabel}>Real margin (ex GST)</span>
            </div>
          </div>

          <Card title="Pricing inputs">
            <div style={styles.row}>
              <label htmlFor="credit-value" style={styles.fieldLabel}>
                One credit is worth ₹
              </label>
              <input
                id="credit-value"
                key={`cv-${data.pricing.creditValueInr}`}
                style={{ ...styles.input, width: 90 }}
                type="number"
                min={0.001}
                step="any"
                defaultValue={data.pricing.creditValueInr}
                disabled={busy === "creditValueInr"}
                onBlur={(e) => saveSetting("creditValueInr", e.target.value)}
              />
              <label htmlFor="target-margin" style={{ ...styles.fieldLabel, marginLeft: 16 }}>
                Charge
              </label>
              <input
                id="target-margin"
                key={`tm-${data.pricing.targetMargin}`}
                style={{ ...styles.input, width: 70 }}
                type="number"
                min={1}
                max={20}
                step="any"
                defaultValue={data.pricing.targetMargin}
                disabled={busy === "targetMargin"}
                onBlur={(e) => saveSetting("targetMargin", e.target.value)}
              />
              <span style={styles.fieldLabel}>× the AI cost</span>
            </div>
            <p style={styles.note}>
              Suggested credits = average cost of the action × this multiple ÷ credit value, rounded up to the next 5. The
              multiple should cover 18% GST, payment-gateway fees (~2–3%), failed or retried calls, and your margin. The
              exchange rate (₹{data.usdInr} per $) and model prices are set on the AI Limits page.
            </p>
          </Card>

          <Card title="Cost by day">
            {data.daily.length === 0 ? (
              <p style={styles.empty}>No AI calls in this period yet.</p>
            ) : (
              <LineChart
                series={[{ label: "AI cost (₹)", color: "var(--accent)", values: data.daily.map((d) => d.costInr) }]}
                xLabels={data.daily.map((d) => d.day.slice(5))}
                valueFormatter={(v) => inr(v)}
              />
            )}
          </Card>

          <Card title="Cost per feature - and what to charge">
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Feature</th>
                    <th style={styles.th}>Actions</th>
                    <th style={styles.th}>AI calls each</th>
                    <th style={styles.th}>Tokens in / out</th>
                    <th style={styles.th}>Avg cost</th>
                    <th style={styles.th}>Worst 10%</th>
                    <th style={styles.th}>Charged now</th>
                    <th style={styles.th}>Margin now</th>
                    <th style={styles.th}>Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byFeature.map((f) => (
                    <tr key={f.key}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{f.label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{f.key}</div>
                      </td>
                      <td style={styles.td}>{f.actions ? count(f.actions) : dash}</td>
                      <td style={styles.td}>{f.avgCalls ?? dash}</td>
                      <td style={styles.td}>
                        {f.avgInputTokens === null ? dash : `${count(f.avgInputTokens)} / ${count(f.avgOutputTokens ?? 0)}`}
                      </td>
                      <td style={styles.td}>{f.avgCostInr === null ? dash : inr(f.avgCostInr, 3)}</td>
                      <td style={styles.td}>{f.p90CostInr === null ? dash : inr(f.p90CostInr, 3)}</td>
                      <td style={styles.td}>{f.currentCredits} credits</td>
                      <td style={{ ...styles.td, color: marginColor(f.marginPct), fontWeight: 600 }}>
                        {f.marginPct === null ? dash : `${f.marginPct}%`}
                      </td>
                      <td style={styles.td}>
                        {f.suggestedCredits === null ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No data yet</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{f.suggestedCredits} credits</div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.suggestedCreditsP90} at worst 10%</div>
                            </div>
                            {f.suggestedCredits !== f.currentCredits ? (
                              <button
                                style={styles.smallButton}
                                disabled={busy === f.key}
                                onClick={() => applySuggestion(f, f.suggestedCredits as number)}
                              >
                                Apply
                              </button>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--status-good)" }}>Up to date</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.note}>
              Cost is the total of every AI call behind one action (a slide deck is an outline call plus a content call).
              Margin now = (credits charged × credit value − cost) ÷ credits charged × credit value. A feature that covers
              several kinds of content is priced as one figure, so look at the per-call table below to see how much they
              differ. Small samples are noisy - suggestions firm up as more actions are recorded.
            </p>
          </Card>

          <Card title="Cost by kind of call">
            {data.byPurpose.length === 0 ? (
              <p style={styles.empty}>No AI calls in this period yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Call</th>
                      <th style={styles.th}>Calls</th>
                      <th style={styles.th}>Tokens in / out (avg)</th>
                      <th style={styles.th}>Avg cost</th>
                      <th style={styles.th}>Worst 10%</th>
                      <th style={styles.th}>Total</th>
                      <th style={styles.th}>Charged to teachers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byPurpose.map((p) => (
                      <tr key={p.purpose}>
                        <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 13 }}>{p.purpose}</td>
                        <td style={styles.td}>{count(p.calls)}</td>
                        <td style={styles.td}>
                          {count(p.avgInputTokens)} / {count(p.avgOutputTokens)}
                        </td>
                        <td style={styles.td}>{inr(p.avgCostInr, 3)}</td>
                        <td style={styles.td}>{inr(p.p90CostInr, 3)}</td>
                        <td style={styles.td}>{inr(p.totalCostInr)}</td>
                        <td style={styles.td}>
                          {p.chargedCalls === p.calls ? (
                            "Yes"
                          ) : p.chargedCalls === 0 ? (
                            <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>No</span>
                          ) : (
                            `${p.chargedCalls} of ${p.calls}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Spend that no credits paid for">
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>
              <strong>{inr(summary.unchargedCostInr)}</strong> of the cost in this period was not charged to any teacher
              {summary.failedCalls > 0 ? (
                <>
                  , and <strong>{inr(summary.failedCostInr)}</strong> went on {count(summary.failedCalls)} failed or timed-out call
                  {summary.failedCalls === 1 ? "" : "s"}
                </>
              ) : null}
              .
            </p>
            {data.uncharged.length === 0 ? (
              <p style={styles.empty}>Every call was charged to a teacher.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Call</th>
                    <th style={styles.th}>Calls</th>
                    <th style={styles.th}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.uncharged.map((u) => (
                    <tr key={u.purpose}>
                      <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 13 }}>{u.purpose}</td>
                      <td style={styles.td}>{count(u.calls)}</td>
                      <td style={styles.td}>{inr(u.costInr, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={styles.note}>
              Includes assistant chat and web research, which don't deduct credits yet, and calls that succeeded but whose
              action failed before charging.
            </p>
          </Card>

          <Card title="By model">
            {data.byModel.length === 0 ? (
              <p style={styles.empty}>No AI calls in this period yet.</p>
            ) : (
              <>
                <BarChart
                  data={data.byModel.map((m) => ({ label: m.model, value: m.costInr, color: "var(--accent)" }))}
                  valueFormatter={(v) => inr(v)}
                />
                <div style={{ overflowX: "auto", marginTop: 16 }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Model</th>
                        <th style={styles.th}>Calls</th>
                        <th style={styles.th}>Tokens in</th>
                        <th style={styles.th}>Tokens out</th>
                        <th style={styles.th}>Web searches</th>
                        <th style={styles.th}>Speed (avg / slowest 10%)</th>
                        <th style={styles.th}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byModel.map((m) => (
                        <tr key={m.model}>
                          <td style={styles.td}>
                            <div style={{ fontFamily: "monospace" }}>{m.model}</div>
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.provider}</div>
                          </td>
                          <td style={styles.td}>{count(m.calls)}</td>
                          <td style={styles.td}>{count(m.inputTokens)}</td>
                          <td style={styles.td}>{count(m.outputTokens)}</td>
                          <td style={styles.td}>{m.searches ? count(m.searches) : dash}</td>
                          <td style={styles.td}>
                            {(m.avgLatencyMs / 1000).toFixed(1)}s / {(m.p90LatencyMs / 1000).toFixed(1)}s
                          </td>
                          <td style={styles.td}>{inr(m.costInr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card title="Highest-cost users">
            {data.topUsers.length === 0 ? (
              <p style={styles.empty}>No AI calls in this period yet.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>AI calls</th>
                    <th style={styles.th}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((u) => (
                    <tr key={u.userId}>
                      <td style={styles.td}>
                        <div>{u.name}</div>
                        {u.email ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{u.email}</div> : null}
                      </td>
                      <td style={styles.td}>{count(u.calls)}</td>
                      <td style={styles.td}>{inr(u.costInr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  tiles: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  marginTile: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderTop: "3px solid var(--accent)",
    borderRadius: 18,
    padding: "20px 22px",
    flex: 1,
    minWidth: 160,
    boxShadow: "var(--shadow-card)",
  },
  marginValue: { display: "block", fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: "-1px" },
  marginLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
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
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  fieldLabel: { fontSize: 14, fontWeight: 600 },
  input: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)" },
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 },
  empty: { color: "var(--text-muted)", margin: 0 },
  smallButton: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 12,
  },
};
