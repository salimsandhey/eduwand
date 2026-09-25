import { Fragment, useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AiCallList, AiCallRow } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionTabs } from "../components/SectionTabs";
import { StatTile } from "../components/StatTile";

// Every AI provider call (and every request the spend guard refused), newest
// first. For digging into one user, one feature or one failure. Backend:
// routes/ai-costs.ts, GET /ai-costs/calls.

const PERIODS = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];
const STATUSES = ["success", "error", "timeout", "blocked"] as const;

const STATUS_COLORS: Record<AiCallRow["status"], string> = {
  success: "var(--status-good)",
  error: "var(--status-critical)",
  timeout: "var(--status-serious)",
  blocked: "var(--status-warning)",
};

const count = (n: number) => n.toLocaleString("en-IN");
const inr = (n: number, places = 3) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: places })}`;

export function AiCallLogPage() {
  const { accessToken } = useAuth();
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [feature, setFeature] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AiCallList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setData(await api.listAiCalls(accessToken, { days, page, status, model, purpose, feature, q: query }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI calls");
    }
  }, [accessToken, days, page, status, model, purpose, feature, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change goes back to the first page.
  function filter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <SectionTabs group="ai" />
      <PageHeader title="AI Call Log" subtitle="Every AI call and refused request - filter to find a user, a feature or a failure" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        <div style={styles.filters}>
          <select style={styles.select} value={days} onChange={(e) => filter(setDays)(Number(e.target.value))} aria-label="Time period">
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                Last {p.label}
              </option>
            ))}
          </select>
          <select style={styles.select} value={status} onChange={(e) => filter(setStatus)(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select style={styles.select} value={model} onChange={(e) => filter(setModel)(e.target.value)} aria-label="Model">
            <option value="">All models</option>
            {data?.filters.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select style={styles.select} value={purpose} onChange={(e) => filter(setPurpose)(e.target.value)} aria-label="Kind of call">
            <option value="">All kinds of call</option>
            {data?.filters.purposes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select style={styles.select} value={feature} onChange={(e) => filter(setFeature)(e.target.value)} aria-label="Charged feature">
            <option value="">Charged or not</option>
            <option value="none">Not charged to anyone</option>
            {data?.filters.features.map((f) => (
              <option key={f} value={f}>
                Charged as {f}
              </option>
            ))}
          </select>
          <form
            style={{ display: "flex", gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
              setPage(1);
            }}
          >
            <input
              style={{ ...styles.select, minWidth: 200 }}
              placeholder="Search user name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button style={styles.button} type="submit">
              Search
            </button>
          </form>
        </div>
      </Card>

      {!data ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={styles.tiles}>
            <StatTile label="Matching calls" value={count(data.total)} />
            <StatTile label="Cost of these" value={inr(data.totalCostInr, 2)} />
            <StatTile label="Tokens in" value={count(data.totalInputTokens)} />
            <StatTile label="Tokens out" value={count(data.totalOutputTokens)} />
          </div>

          <Card>
            {data.rows.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0 }}>No calls match these filters.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>When</th>
                      <th style={styles.th}>User</th>
                      <th style={styles.th}>Call</th>
                      <th style={styles.th}>Model</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Tokens in / out</th>
                      <th style={styles.th}>Time</th>
                      <th style={styles.th}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const hasDetail = Boolean(row.error || row.blockedReason);
                      const open = openId === row.id;
                      return (
                        <Fragment key={row.id}>
                          <tr
                            style={{ cursor: hasDetail ? "pointer" : "default" }}
                            onClick={() => hasDetail && setOpenId(open ? null : row.id)}
                          >
                            <td style={styles.td}>{new Date(row.createdAt).toLocaleString("en-IN")}</td>
                            <td style={styles.td}>
                              <div>{row.userName ?? "-"}</div>
                              {row.userEmail ? <div style={styles.sub}>{row.userEmail}</div> : null}
                            </td>
                            <td style={styles.td}>
                              <div style={{ fontFamily: "monospace", fontSize: 13 }}>{row.purpose}</div>
                              <div style={styles.sub}>{row.feature ? `Charged as ${row.feature}` : "Not charged"}</div>
                            </td>
                            <td style={styles.td}>
                              <div style={{ fontFamily: "monospace", fontSize: 13 }}>{row.model}</div>
                              <div style={styles.sub}>{row.provider}</div>
                            </td>
                            <td style={styles.td}>
                              <span style={{ color: STATUS_COLORS[row.status], fontWeight: 700 }}>{row.status}</span>
                              {hasDetail ? <span style={styles.sub}> {open ? "▲" : "▼"}</span> : null}
                            </td>
                            <td style={styles.td}>
                              {count(row.inputTokens)} / {count(row.outputTokens)}
                              {row.searches ? <div style={styles.sub}>{row.searches} web search</div> : null}
                            </td>
                            <td style={styles.td}>{row.latencyMs === null ? "-" : `${(row.latencyMs / 1000).toFixed(1)}s`}</td>
                            <td style={styles.td}>{row.status === "blocked" ? "-" : inr(row.costInr)}</td>
                          </tr>
                          {open ? (
                            <tr>
                              <td style={{ ...styles.td, background: "var(--bg-page)" }} colSpan={8}>
                                {row.blockedReason ? (
                                  <div>
                                    <strong>Refused by the spend guard:</strong> {row.blockedReason}
                                  </div>
                                ) : null}
                                {row.error ? (
                                  <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>{row.error}</div>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={styles.pager}>
              <button style={styles.pageButton} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Page {page} of {pageCount}
              </span>
              <button style={styles.pageButton} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
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
  filters: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, background: "var(--bg-card)" },
  tiles: { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18 },
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
  td: { padding: "10px 12px 10px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "top" },
  sub: { fontSize: 12, color: "var(--text-muted)" },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 16 },
  pageButton: {
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "6px 14px",
    cursor: "pointer",
    fontSize: 13,
  },
};
