import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AiGuardLimit, AiGuardOverview, AiModelPrice } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionTabs } from "../components/SectionTabs";
import { StatTile } from "../components/StatTile";

// Spend guard for every Claude / Gemini call (backend lib/llm/guard.ts). A call
// is refused BEFORE it is sent if it could push spend past any enabled limit
// below, or past the server's own hard ceiling.

const REFRESH_MS = 30_000;

const formatInr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatNumber = (n: number) => n.toLocaleString("en-IN");

const PERIOD_LABELS: Record<AiGuardLimit["period"], string> = { minute: "per minute", day: "per day", month: "per month", call: "per call" };
const SCOPE_LABELS: Record<AiGuardLimit["scope"], string> = { global: "Whole platform", user: "Each user", call: "Each request" };

function formatLimitValue(limit: AiGuardLimit, value: number): string {
  if (limit.unit === "inr") return formatInr(value);
  return `${formatNumber(value)} ${limit.unit === "tokens" ? "tokens" : "requests"}`;
}

function barColor(fraction: number): string {
  if (fraction >= 1) return "var(--status-critical)";
  if (fraction >= 0.8) return "var(--status-warning)";
  return "var(--status-good)";
}

function UsageBar({ limit }: { limit: AiGuardLimit }) {
  if (limit.usage === null) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Applies to each request</span>;
  const fraction = limit.value > 0 ? limit.usage / limit.value : 0;
  return (
    <div style={{ minWidth: 170, opacity: limit.enabled ? 1 : 0.45 }}>
      <div style={styles.barTrack}>
        <div style={{ ...styles.barFill, width: `${Math.min(100, fraction * 100)}%`, background: barColor(fraction) }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {formatLimitValue(limit, limit.usage)} of {formatLimitValue(limit, limit.value)} ({Math.round(fraction * 100)}%)
      </span>
    </div>
  );
}

export function AiLimitsPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AiGuardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setData(await api.getAiGuard(accessToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI limits");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, failure: string) {
    setBusyKey(key);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusyKey(null);
    }
  }

  function togglePause() {
    if (!accessToken || !data) return;
    const next = !data.paused;
    if (next && !window.confirm("Pause ALL AI for every user? Nothing can be generated, graded or answered until you resume.")) return;
    run("pause", () => api.setAiPaused(accessToken, next), "Failed to change pause state");
  }

  function toggleLimit(limit: AiGuardLimit, enabled: boolean) {
    if (!accessToken) return;
    if (!enabled && limit.scope === "global" && !window.confirm(`Turn off "${limit.label}"? Without it, only the server's hard ceiling protects against overspend.`)) return;
    run(limit.key, () => api.updateAiGuardLimit(accessToken, limit.key, { enabled }), "Failed to update limit");
  }

  function changeLimitValue(limit: AiGuardLimit, raw: string) {
    const value = Number(raw);
    if (!accessToken || raw.trim() === "" || value === limit.value) return;
    if (!Number.isFinite(value) || value <= 0) {
      setError("A limit must be a number above 0");
      return;
    }
    run(limit.key, () => api.updateAiGuardLimit(accessToken, limit.key, { value }), "Failed to update limit");
  }

  function changeRate(raw: string) {
    const value = Number(raw);
    if (!accessToken || !data || raw.trim() === "" || value === data.usdInr) return;
    run("usdInr", () => api.setAiUsdInr(accessToken, value), "Failed to update exchange rate");
  }

  function changePrice(price: AiModelPrice, field: keyof Pick<AiModelPrice, "inputPerMtokUsd" | "outputPerMtokUsd" | "cacheReadPerMtokUsd" | "cacheWritePerMtokUsd" | "perSearchUsd">, raw: string) {
    const value = Number(raw);
    if (!accessToken || raw.trim() === "" || value === price[field]) return;
    if (!Number.isFinite(value) || value < 0) {
      setError("A price must be 0 or more");
      return;
    }
    run(`price-${price.model}`, () => api.updateAiModelPrice(accessToken, price.model, { [field]: value }), "Failed to update price");
  }

  return (
    <div>
      <SectionTabs group="ai" />
      <PageHeader
        title="AI Limits"
        subtitle="Spending safeguards - an AI call is refused before it is sent if it could pass any limit below"
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!data ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div
            style={{
              ...styles.banner,
              borderColor: data.paused ? "var(--status-critical)" : "var(--status-good)",
              background: data.paused ? "rgba(208, 59, 59, 0.08)" : "rgba(12, 163, 12, 0.07)",
            }}
          >
            <div>
              <strong style={{ fontSize: 16 }}>{data.paused ? "AI is paused for everyone" : "AI is running"}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {data.paused
                  ? "Every AI request is being refused. Nothing is being spent."
                  : "Requests go through as long as they stay within the limits below."}
              </p>
            </div>
            <button
              style={data.paused ? styles.button : styles.dangerButton}
              disabled={busyKey === "pause"}
              onClick={togglePause}
            >
              {data.paused ? "Resume AI" : "Pause all AI"}
            </button>
          </div>

          <div style={styles.tiles}>
            <StatTile label="Spent today" value={formatInr(data.totals.day.spentInr)} />
            <StatTile label="Spent this month" value={formatInr(data.totals.month.spentInr)} />
            <StatTile label="AI requests today" value={formatNumber(data.totals.day.requests)} />
            <StatTile label="Tokens today" value={formatNumber(data.totals.day.tokens)} />
          </div>

          <Card title="Limits">
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>On</th>
                    <th style={styles.th}>Limit</th>
                    <th style={styles.th}>Applies to</th>
                    <th style={styles.th}>Value</th>
                    <th style={styles.th}>Right now</th>
                  </tr>
                </thead>
                <tbody>
                  {data.limits.map((limit) => (
                    <tr key={limit.key}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={limit.enabled}
                          disabled={busyKey === limit.key}
                          onChange={(e) => toggleLimit(limit, e.target.checked)}
                          aria-label={`Enforce ${limit.label}`}
                        />
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{limit.label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 380 }}>{limit.description}</div>
                      </td>
                      <td style={styles.td}>
                        <div>{SCOPE_LABELS[limit.scope]}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{PERIOD_LABELS[limit.period]}</div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {limit.unit === "inr" ? <span>₹</span> : null}
                          <input
                            key={`${limit.key}-${limit.value}`}
                            style={{ ...styles.input, width: 110 }}
                            type="number"
                            min={limit.unit === "inr" ? 0.01 : 1}
                            step={limit.unit === "inr" ? 1 : 1}
                            defaultValue={limit.value}
                            disabled={busyKey === limit.key}
                            onBlur={(e) => changeLimitValue(limit, e.target.value)}
                          />
                          {limit.unit !== "inr" ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{limit.unit}</span> : null}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <UsageBar limit={limit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.note}>
              Day limits reset at midnight IST and month limits on the 1st. Turning a limit off stops it being enforced. You
              are emailed when a platform spend limit reaches 80% and again at 100%.
            </p>
          </Card>

          <Card title="Server hard ceiling">
            <p style={{ margin: 0, fontSize: 14 }}>
              Regardless of the settings above, the server refuses AI calls beyond{" "}
              <strong>{formatInr(data.hardCeilings.dayInr)} per day</strong> (${data.hardCeilings.dayUsd}) and{" "}
              <strong>{formatInr(data.hardCeilings.monthInr)} per month</strong> (${data.hardCeilings.monthUsd}).
            </p>
            <p style={styles.note}>
              This is the last line of defence if a limit is turned off by mistake. It is set with the server settings
              AI_HARD_MAX_USD_PER_DAY and AI_HARD_MAX_USD_PER_MONTH, so it cannot be changed from this page.
            </p>
          </Card>

          <Card title="Exchange rate and model prices">
            <div style={{ ...styles.row, marginBottom: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 600 }} htmlFor="usd-inr">
                1 USD =
              </label>
              <span>₹</span>
              <input
                id="usd-inr"
                key={`usdinr-${data.usdInr}`}
                style={{ ...styles.input, width: 100 }}
                type="number"
                min={30}
                max={300}
                step={0.5}
                defaultValue={data.usdInr}
                disabled={busyKey === "usdInr"}
                onBlur={(e) => changeRate(e.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Rupee limits are converted to dollars (what AWS and Google bill) at this rate. Set it slightly above the real rate to be safe.
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Model</th>
                    <th style={styles.th}>Input $/1M tokens</th>
                    <th style={styles.th}>Output $/1M tokens</th>
                    <th style={styles.th}>Cache read $/1M</th>
                    <th style={styles.th}>Cache write $/1M</th>
                    <th style={styles.th}>$ per web search</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map((price) => (
                    <tr key={price.model}>
                      <td style={styles.td}>
                        <div style={{ fontFamily: "monospace" }}>{price.model}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{price.provider}</div>
                      </td>
                      {(["inputPerMtokUsd", "outputPerMtokUsd", "cacheReadPerMtokUsd", "cacheWritePerMtokUsd", "perSearchUsd"] as const).map((field) => (
                        <td style={styles.td} key={field}>
                          <input
                            key={`${price.model}-${field}-${price.updatedAt}`}
                            style={{ ...styles.input, width: 90 }}
                            type="number"
                            min={0}
                            step="any"
                            defaultValue={price[field]}
                            disabled={busyKey === `price-${price.model}`}
                            onBlur={(e) => changePrice(price, field, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.note}>
              These decide what every call is counted as costing. A model with no row here is counted at a high default so
              it can never slip through cheaply. Gemini's per-search price should be checked against Google's current pricing.
            </p>
          </Card>

          <Card title="Highest spenders today">
            {data.topUsers.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>No AI usage yet today.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Spent today</th>
                    <th style={styles.th}>AI requests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.map((user) => (
                    <tr key={user.userId}>
                      <td style={styles.td}>
                        <div>{user.name}</div>
                        {user.email ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{user.email}</div> : null}
                      </td>
                      <td style={styles.td}>{formatInr(user.spentInr)}</td>
                      <td style={styles.td}>{formatNumber(user.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Recently refused requests">
            {data.recentBlocked.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>Nothing has been refused.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>When</th>
                    <th style={styles.th}>Request</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentBlocked.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>{new Date(row.createdAt).toLocaleString("en-IN")}</td>
                      <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 13 }}>{row.purpose}</td>
                      <td style={styles.td}>{row.userName ?? "-"}</td>
                      <td style={{ ...styles.td, fontSize: 13 }}>{row.reason ?? "-"}</td>
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
  banner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    border: "1px solid",
    borderRadius: 18,
    padding: "18px 22px",
    marginBottom: 18,
  },
  tiles: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    padding: "0 12px 10px 0",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "middle" },
  input: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 },
  barTrack: { height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden", marginBottom: 4 },
  barFill: { height: "100%", borderRadius: 4, transition: "width 0.3s" },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  dangerButton: {
    background: "var(--status-critical)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 18px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
};
