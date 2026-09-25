import { useCallback, useEffect, useState } from "react";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import { marked } from "marked";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { ContentPage } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { ContactCards } from "../components/ContactCards";

// Every key ContentPage is seeded with (prisma/content-pages/*.md) - shown
// even if a row is somehow missing, so there's always an obvious way to
// create it rather than the page just not appearing in the list.
const KNOWN_PAGES: { key: string; label: string; publicPath: string }[] = [
  { key: "privacy_policy", label: "Privacy Policy", publicPath: "/privacy" },
  { key: "terms_of_service", label: "Terms of Service", publicPath: "/terms" },
  { key: "about", label: "About EduWand", publicPath: "/about" },
  { key: "contact", label: "Contact Us", publicPath: "/contact" },
];

// "contact" is rendered everywhere (app + web) as cards from these fields,
// not as markdown - see ContentPage.fields in schema.prisma and
// components/ContactCards.tsx.
const CONTACT_FIELD_INPUTS: { key: string; label: string; placeholder: string }[] = [
  { key: "email", label: "Email", placeholder: "support@eduwand.com" },
  { key: "phone", label: "Phone", placeholder: "+91 22 4000 1234" },
  { key: "whatsapp", label: "WhatsApp (optional)", placeholder: "+91 22 4000 1234" },
  { key: "address", label: "Office address", placeholder: "Mumbai, Maharashtra, India" },
  { key: "hours", label: "Support hours (optional)", placeholder: "Mon-Sat, 9am-6pm IST" },
];

function fieldsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

export function ContentPagesEditor() {
  const { accessToken } = useAuth();
  const [pages, setPages] = useState<Record<string, ContentPage>>({});
  const [selectedKey, setSelectedKey] = useState<string>(KNOWN_PAGES[0].key);
  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.listContentPages();
      setPages(Object.fromEntries(list.map((p) => [p.key, p])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content pages");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const page = pages[selectedKey];
    setTitle(page?.title ?? KNOWN_PAGES.find((p) => p.key === selectedKey)?.label ?? selectedKey);
    setBodyMarkdown(page?.bodyMarkdown ?? "");
    setFields(page?.fields ?? {});
    setSavedAt(null);
  }, [selectedKey, pages]);

  const selectedMeta = KNOWN_PAGES.find((p) => p.key === selectedKey)!;
  const selectedPage = pages[selectedKey];
  const isContact = selectedKey === "contact";
  const isDirty = selectedPage
    ? title !== selectedPage.title || bodyMarkdown !== selectedPage.bodyMarkdown || (isContact && !fieldsEqual(fields, selectedPage.fields ?? {}))
    : bodyMarkdown.length > 0 || (isContact && Object.values(fields).some((v) => v.trim()));

  async function save() {
    if (!accessToken || !bodyMarkdown.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await api.updateContentPage(accessToken, selectedKey, {
        title: title.trim(),
        bodyMarkdown,
        ...(isContact ? { fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim())) } : {}),
      });
      setPages((prev) => ({ ...prev, [selectedKey]: updated }));
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Content Pages" subtitle="Privacy Policy, Terms of Service, About and Contact - editable here, no app or dashboard release needed" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card title="Pages">
        <div style={styles.tabRow}>
          {KNOWN_PAGES.map((p) => (
            <button
              key={p.key}
              style={{ ...styles.tab, ...(p.key === selectedKey ? styles.tabActive : {}) }}
              onClick={() => setSelectedKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <Card title={selectedMeta.label}>
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </Card>
      ) : (
        <>
          <Card title={selectedMeta.label}>
            <div style={styles.metaRow}>
              <a href={selectedMeta.publicPath} target="_blank" rel="noreferrer" style={styles.publicLink}>
                View public page ({selectedMeta.publicPath}) &rarr;
              </a>
              {selectedPage ? (
                <span style={styles.metaText}>
                  Version {selectedPage.version} · Last updated {new Date(selectedPage.updatedAt).toLocaleString()}
                </span>
              ) : (
                <span style={styles.metaText}>Not created yet - saving below creates it.</span>
              )}
            </div>

            <label style={styles.label}>Title</label>
            <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />

            {isContact ? (
              <>
                <label style={styles.label}>Intro line</label>
                <input
                  style={styles.input}
                  value={bodyMarkdown}
                  onChange={(e) => setBodyMarkdown(e.target.value)}
                  placeholder="We're happy to help with account issues, technical problems, or general questions."
                />

                <div style={styles.fieldGrid}>
                  {CONTACT_FIELD_INPUTS.map((f) => (
                    <div key={f.key}>
                      <label style={styles.label}>{f.label}</label>
                      <input
                        style={styles.input}
                        value={fields[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label style={styles.label}>Body (Markdown)</label>
                <textarea style={styles.textarea} value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} spellCheck={false} />
              </>
            )}

            <div style={styles.saveRow}>
              <button style={styles.button} onClick={save} disabled={isSaving || !bodyMarkdown.trim() || !isDirty}>
                {isSaving ? "Saving…" : "Save"}
              </button>
              {!isDirty && savedAt ? <span style={styles.savedText}>Saved</span> : null}
              {isDirty ? <span style={styles.metaText}>Unsaved changes</span> : null}
            </div>
          </Card>

          <Card title="Preview">
            {isContact ? (
              <>
                {bodyMarkdown.trim() ? <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 0 }}>{bodyMarkdown}</p> : null}
                <ContactCards fields={fields} />
              </>
            ) : (
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(bodyMarkdown || "_Nothing to preview yet._", { async: false }) as string) }} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  tabActive: { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" },
  metaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  publicLink: { fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none" },
  metaText: { fontSize: 12, color: "var(--text-muted)" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "14px 0 6px 0" },
  fieldGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 16px" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box" },
  textarea: {
    width: "100%",
    minHeight: 360,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: 1.6,
    boxSizing: "border-box",
    resize: "vertical",
  },
  saveRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 14 },
  button: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", fontSize: 14 },
  savedText: { fontSize: 12, color: "var(--status-good, #1a7f37)", fontWeight: 600 },
};
