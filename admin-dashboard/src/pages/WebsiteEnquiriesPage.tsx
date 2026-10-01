import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { WebsiteEnquiry, WebsiteEnquiryStatus } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { Modal, ModalFooter } from "../components/Modal";
import { btn } from "../components/buttons";
import { formatEnumLabel } from "../utils/format";

// Messages people send from the public website's Contact form. They are saved
// by POST /public/contact, the visitor gets an acknowledgement email, and the
// platform team works through them here.

type Filter = WebsiteEnquiryStatus | "all";
type Kind = "all" | "contact" | "waitlist";

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "contact", label: "Contact form" },
  { key: "waitlist", label: "Waitlist" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "spam", label: "Spam" },
];

const STATUS_STYLE: Record<WebsiteEnquiryStatus, { label: string; color: string; bg: string }> = {
  new: { label: "New", color: "#7c005a", bg: "var(--accent-wash)" },
  in_progress: { label: "In progress", color: "#8a5a00", bg: "#fff3d6" },
  resolved: { label: "Resolved", color: "#0a6b0a", bg: "#e3f6e3" },
  spam: { label: "Spam", color: "#756c72", bg: "#eeeae0" },
};

const PAGE_SIZE = 25;

export function WebsiteEnquiriesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<WebsiteEnquiry[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WebsiteEnquiry | null>(null);

  // Search runs shortly after typing stops, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const res = await api.listWebsiteEnquiries(accessToken, {
        kind: kind === "all" ? undefined : kind,
        status: filter === "all" ? undefined : filter,
        q: query || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.data ?? []);
      setTotalCount((res.meta?.totalCount as number | undefined) ?? 0);
      setCounts((res.meta?.counts as Record<string, number> | undefined) ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enquiries");
    }
  }, [accessToken, filter, kind, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalAll = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Website enquiries" subtitle="Contact-form messages and waitlist sign-ups from the EduWand website" />

      <div style={{ ...styles.filters, marginBottom: 12 }} role="tablist" aria-label="Filter by type">
        {KINDS.map((k) => (
          <button
            key={k.key}
            role="tab"
            aria-selected={kind === k.key}
            style={{ ...styles.chip, ...(kind === k.key ? styles.chipActive : {}) }}
            onClick={() => {
              setKind(k.key);
              setPage(1);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filters} role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = f.key === "all" ? totalAll : counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
              >
                {f.label}
                <span style={{ ...styles.chipCount, ...(active ? styles.chipCountActive : {}) }}>{n}</span>
              </button>
            );
          })}
        </div>
        <input
          style={styles.search}
          placeholder="Search name, email, school or message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!items ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            {filter === "all" && !query ? "No messages yet. They show up here when someone uses the website contact form." : "No messages match this view."}
          </p>
        ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Received</th>
                  <th style={styles.th}>From</th>
                  <th style={styles.th}>Message</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} style={styles.row} onClick={() => setSelected(e)}>
                    <td style={{ ...styles.td, whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 13 }}>
                      {new Date(e.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td style={styles.td}>
                      <div style={{ fontWeight: 600 }}>
                        {e.kind === "waitlist" ? "Waitlist sign-up" : e.name}
                      </div>
                      <div style={styles.muted}>{e.email}</div>
                      {e.schoolName ? <div style={styles.muted}>{e.schoolName}</div> : null}
                    </td>
                    <td style={{ ...styles.td, maxWidth: 380 }}>
                      {e.subject ? <div style={{ fontWeight: 600 }}>{e.subject}</div> : null}
                      <div style={styles.preview}>{e.message}</div>
                    </td>
                    <td style={styles.td}>
                      <StatusPill status={e.status} />
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <button
                        style={btn.small}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelected(e);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 ? (
              <div style={styles.pager}>
                <button style={btn.small} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  ← Prev
                </button>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Page {page} of {totalPages}
                </span>
                <button style={btn.small} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next →
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {selected ? (
        <EnquiryModal
          enquiry={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setSelected(updated);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: WebsiteEnquiryStatus }) {
  const s = STATUS_STYLE[status];
  return <span style={{ ...styles.pill, color: s.color, background: s.bg }}>{s.label}</span>;
}

function EnquiryModal({
  enquiry,
  onClose,
  onSaved,
}: {
  enquiry: WebsiteEnquiry;
  onClose: () => void;
  onSaved: (updated: WebsiteEnquiry) => void;
}) {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<WebsiteEnquiryStatus>(enquiry.status);
  const [note, setNote] = useState(enquiry.internalNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = status !== enquiry.status || note.trim() !== (enquiry.internalNote ?? "");

  async function save() {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateWebsiteEnquiry(accessToken, enquiry.id, { status, internalNote: note.trim() || null });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Website enquiry" onClose={onClose} width={640}>
      <div style={styles.detailGrid}>
        <Detail label="Type" value={enquiry.kind === "waitlist" ? "Waitlist sign-up" : "Contact form"} />
        {enquiry.kind === "waitlist" ? null : <Detail label="Name" value={enquiry.name} />}
        <Detail label="Email" value={<a href={`mailto:${enquiry.email}`} style={styles.link}>{enquiry.email}</a>} />
        <Detail label="School" value={enquiry.schoolName ?? "—"} />
        <Detail label="Role" value={enquiry.role ? formatEnumLabel(enquiry.role) : "—"} />
        <Detail label="Received" value={new Date(enquiry.createdAt).toLocaleString()} />
        <Detail label="Confirmation email" value={enquiry.ackSent ? "Sent to the visitor" : "Not sent"} />
      </div>

      {enquiry.subject ? <h4 style={styles.subject}>{enquiry.subject}</h4> : null}
      <div style={styles.messageBox}>{enquiry.message}</div>

      <label style={styles.label}>Status</label>
      <div style={styles.filters}>
        {FILTERS.filter((f) => f.key !== "all").map((f) => {
          const active = status === f.key;
          return (
            <button
              key={f.key}
              type="button"
              style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
              onClick={() => setStatus(f.key as WebsiteEnquiryStatus)}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <label style={styles.label} htmlFor="enquiry-note">Internal note</label>
      <textarea
        id="enquiry-note"
        style={styles.textarea}
        rows={3}
        maxLength={2000}
        placeholder="Only visible to the team, e.g. who replied and what was agreed."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error ? <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{error}</p> : null}

      <ModalFooter>
        <button style={btn.primary} disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={styles.detailLabel}>{label}</div>
      <div style={{ fontSize: 14, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  filters: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 34,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "#fff",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  chipActive: { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" },
  chipCount: { minWidth: 20, padding: "1px 6px", borderRadius: 10, background: "var(--accent-wash)", color: "var(--accent-dark)", fontSize: 11, fontWeight: 700, textAlign: "center" },
  chipCountActive: { background: "rgba(255,255,255,0.25)", color: "#fff" },
  search: { height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontSize: 14, minWidth: 260, flex: "0 1 340px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, padding: "0 12px 10px 0", borderBottom: "1px solid var(--border)" },
  td: { padding: "12px 12px 12px 0", borderBottom: "1px solid var(--border)", fontSize: 14, verticalAlign: "top" },
  row: { cursor: "pointer" },
  muted: { fontSize: 12, color: "var(--text-muted)" },
  preview: { fontSize: 13, color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  pill: { display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  pager: { display: "flex", alignItems: "center", gap: 12, marginTop: 16 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 },
  detailLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 },
  subject: { margin: "0 0 8px 0", fontSize: 15, fontWeight: 700 },
  messageBox: { padding: 14, background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 18 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8 },
  textarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, resize: "vertical", marginBottom: 8 },
  link: { color: "var(--accent)", fontWeight: 600 },
};
