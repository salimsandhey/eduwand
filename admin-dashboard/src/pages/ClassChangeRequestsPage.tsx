import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { ClassChangeRequest } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SectionTabs } from "../components/SectionTabs";

// Approval queue for individual-account class changes. "add" creates one
// more class beyond the limit; "replace" archives an existing class
// (isActive=false - its students/topics/assignments stay intact) and
// creates a new one. See Docs/superpowers/plans/2026-09-09-individual-
// teacher-onboarding-and-credits.md.

export function ClassChangeRequestsPage() {
  const { accessToken } = useAuth();

  const [requests, setRequests] = useState<ClassChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setRequests(await api.listClassChangeRequests(accessToken, { status: statusFilter || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load class change requests");
    }
  }, [accessToken, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(request: ClassChangeRequest, decision: "approved" | "rejected") {
    if (!accessToken) return;
    setDecidingId(request.id);
    try {
      await api.decideClassChangeRequest(accessToken, request.id, { decision });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decide request");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div>
      <SectionTabs group="approvals" />
      <PageHeader title="Approvals - class changes" subtitle="Individual-teacher class add/replace requests awaiting review" />

      <div style={{ marginBottom: 16 }}>
        <select style={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!requests ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : requests.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No requests here.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Teacher</th>
                <th style={styles.th}>Workspace</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Requested class</th>
                <th style={styles.th}>Requested at</th>
                {statusFilter === "pending" ? <th style={styles.th}></th> : null}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td style={styles.td}>
                    {request.teacher.fullName}
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{request.teacher.email}</div>
                  </td>
                  <td style={styles.td}>{request.school.name}</td>
                  <td style={{ ...styles.td, textTransform: "capitalize" }}>{request.changeType}</td>
                  <td style={styles.td}>
                    {request.requestedClassName} {request.requestedSectionName}
                  </td>
                  <td style={styles.td}>{new Date(request.requestedAt).toLocaleDateString()}</td>
                  {statusFilter === "pending" ? (
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={styles.approveBtn} disabled={decidingId === request.id} onClick={() => decide(request, "approved")}>
                          Approve
                        </button>
                        <button style={styles.rejectBtn} disabled={decidingId === request.id} onClick={() => decide(request, "rejected")}>
                          Reject
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
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
  td: { padding: "10px 12px 10px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "top" },
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
  },
  approveBtn: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 12,
  },
  rejectBtn: {
    background: "var(--bg-page)",
    color: "var(--status-critical)",
    border: "1px solid var(--status-critical)",
    borderRadius: 6,
    padding: "6px 12px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 12,
  },
};
