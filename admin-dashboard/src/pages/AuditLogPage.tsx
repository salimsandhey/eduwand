import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { AuditLogEntry } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

const ACTION_LABELS: Record<string, string> = {
  "user.invite": "Invited user",
  "user.update": "Updated user",
  "user.admin_password_reset": "Reset password for",
  "trust.status_change": "Changed trust status",
  "trust.delete": "Deleted trust",
  "school.status_change": "Changed school status",
  "school.delete": "Deleted school",
};

function describeMetadata(entry: AuditLogEntry): string | null {
  if (!entry.metadata) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(entry.metadata)) {
    if (value && typeof value === "object" && "from" in value && "to" in value) {
      const v = value as { from: unknown; to: unknown };
      parts.push(`${key}: ${String(v.from ?? "—")} → ${String(v.to ?? "—")}`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join(", ");
}

export function AuditLogPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";
  const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;

  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 30;

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const res = await api.listAuditLog(accessToken, { schoolId, page, pageSize });
      setEntries(res.data ?? []);
      setTotalCount((res.meta?.totalCount as number | undefined) ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    }
  }, [accessToken, schoolId, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [schoolId]);

  // Unlike other school-scoped pages, this one never blocks on the picker -
  // platform_admin without a school selected still sees the unscoped
  // (all-schools) log, and leadership without one sees their whole trust's
  // log (both handled server-side in backend/src/routes/audit-log.ts).
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle={
          needsSchoolPicker && !selectedSchoolId
            ? "Showing all schools - pick one from \"Viewing\" in the top bar to filter"
            : "Who invited, disabled, reassigned, or deleted what"
        }
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!entries ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No activity recorded yet.</p>
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>When</th>
                  <th style={styles.th}>Who</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td style={styles.td}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td style={styles.td}>{e.actorEmail}</td>
                    <td style={styles.td}>{ACTION_LABELS[e.action] ?? e.action}</td>
                    <td style={styles.td}>{e.targetLabel ?? e.targetId ?? "—"}</td>
                    <td style={{ ...styles.td, color: "var(--text-muted)", fontSize: 13 }}>{describeMetadata(e) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 ? (
              <div style={styles.pager}>
                <button style={styles.smallButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ← Prev
                </button>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Page {page} of {totalPages}
                </span>
                <button style={styles.smallButton} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    padding: "0 12px 10px 0",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "10px 12px 10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  pager: { display: "flex", alignItems: "center", gap: 12, marginTop: 16 },
  smallButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
