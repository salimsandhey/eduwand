import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { BoardChangeTicket } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

// Approval queue for board changes - board is a request/approval-only
// setting for every school (individual and institutional), there's no
// self-service edit path anywhere. See Docs/superpowers/plans/2026-09-09-
// individual-teacher-onboarding-and-credits.md and the SchoolDetailsTab
// "Request change" button that raises these tickets.

export function BoardChangeTicketsPage() {
  const { accessToken } = useAuth();

  const [tickets, setTickets] = useState<BoardChangeTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      setTickets(await api.listBoardChangeTickets(accessToken, { status: statusFilter || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board change tickets");
    }
  }, [accessToken, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(ticket: BoardChangeTicket, decision: "approved" | "rejected") {
    if (!accessToken) return;
    setDecidingId(ticket.id);
    try {
      await api.decideBoardChangeTicket(accessToken, ticket.id, { decision });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decide ticket");
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div>
      <PageHeader title="Board Change Tickets" subtitle="School board changes awaiting approval" />

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
        {!tickets ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : tickets.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No tickets here.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>School</th>
                <th style={styles.th}>Raised by</th>
                <th style={styles.th}>Current</th>
                <th style={styles.th}>Requested</th>
                <th style={styles.th}>Raised at</th>
                {statusFilter === "pending" ? <th style={styles.th}></th> : null}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td style={styles.td}>
                    {ticket.school.name}
                    <div style={{ color: "var(--text-muted)", fontSize: 12, textTransform: "capitalize" }}>{ticket.school.accountType}</div>
                  </td>
                  <td style={styles.td}>{ticket.raisedBy.fullName}</td>
                  <td style={styles.td}>{ticket.currentBoard}</td>
                  <td style={styles.td}>{ticket.requestedBoard}</td>
                  <td style={styles.td}>{new Date(ticket.createdAt).toLocaleDateString()}</td>
                  {statusFilter === "pending" ? (
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={styles.approveBtn} disabled={decidingId === ticket.id} onClick={() => decide(ticket, "approved")}>
                          Approve
                        </button>
                        <button style={styles.rejectBtn} disabled={decidingId === ticket.id} onClick={() => decide(ticket, "rejected")}>
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
