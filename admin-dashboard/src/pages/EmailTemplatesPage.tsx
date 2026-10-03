import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import type { EmailCopy, EmailPreview, EmailTemplateItem } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { btn } from "../components/buttons";

// Preview and edit the wording of every email EduWand sends. The look (logo,
// colours, layout) is shared and fixed; what can be edited is the text: subject,
// preview line, heading, paragraphs, button text and the small note. Anything
// in {{double braces}} is filled in per email (the person's name, a code, ...).
// Details tables, codes and button links are filled in automatically.

type FieldKey = "subject" | "preheader" | "heading" | "note" | "ctaLabel" | `p${number}`;

const sameCopy = (a: EmailCopy, b: EmailCopy) => JSON.stringify(a) === JSON.stringify(b);

export function EmailTemplatesPage() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<EmailTemplateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const list = await api.listEmailTemplates(accessToken);
      setItems(list);
      setSelectedKey((current) => current ?? list[0]?.key ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email templates");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // The editor tells us when it holds unsaved changes, so switching template can ask first.
  const dirtyRef = useRef(false);
  const handleDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  function select(key: string) {
    if (key === selectedKey) return;
    if (dirtyRef.current && !window.confirm("You have unsaved changes to this email. Discard them?")) return;
    setSelectedKey(key);
  }

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = new Map<string, EmailTemplateItem[]>();
    for (const item of items ?? []) {
      if (q && !item.label.toLowerCase().includes(q) && !item.group.toLowerCase().includes(q)) continue;
      out.set(item.group, [...(out.get(item.group) ?? []), item]);
    }
    return [...out.entries()];
  }, [items, search]);

  const selected = items?.find((i) => i.key === selectedKey) ?? null;

  return (
    <div>
      <PageHeader title="Email templates" subtitle="Preview and edit the emails EduWand sends. The design stays on-brand; you control the wording." />
      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}
      {!items ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div className="et-layout">
          <aside className="et-list">
            <input style={styles.search} placeholder="Search emails…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {groups.length === 0 ? <p style={styles.muted}>No emails match.</p> : null}
            {groups.map(([group, list]) => (
              <div key={group} style={{ marginTop: 14 }}>
                <div style={styles.groupTitle}>{group}</div>
                {list.map((item) => {
                  const active = item.key === selectedKey;
                  return (
                    <button key={item.key} style={{ ...styles.listItem, ...(active ? styles.listItemActive : {}) }} onClick={() => select(item.key)}>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.customised ? <span style={styles.editedDot} title="Edited" aria-label="Edited" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          <div className="et-picker">
            <select style={styles.picker} value={selectedKey ?? ""} onChange={(e) => select(e.target.value)} aria-label="Choose an email">
              {groups.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                      {item.customised ? " (edited)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 0 }}>
            {selected ? (
              <TemplateEditor
                key={selected.key}
                item={selected}
                onDirtyChange={handleDirty}
                onChanged={load}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ item, onDirtyChange, onChanged }: { item: EmailTemplateItem; onDirtyChange: (dirty: boolean) => void; onChanged: () => Promise<void> }) {
  const { accessToken } = useAuth();
  const [draft, setDraft] = useState<EmailCopy>(item.copy);
  const [saved, setSaved] = useState<EmailCopy>(item.copy);
  const [customised, setCustomised] = useState(item.customised);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = !sameCopy(draft, saved);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  // --- Field plumbing: the placeholder chips insert into whichever field was last used.
  const lastField = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  function getValue(key: FieldKey): string {
    if (key.startsWith("p")) return draft.paragraphs[Number(key.slice(1))] ?? "";
    return draft[key as "subject"];
  }
  function setValue(key: FieldKey, value: string) {
    setDraft((d) => {
      if (key.startsWith("p")) {
        const paragraphs = [...d.paragraphs];
        paragraphs[Number(key.slice(1))] = value;
        return { ...d, paragraphs };
      }
      return { ...d, [key]: value };
    });
    setFieldErrors({});
  }
  function insertVar(name: string) {
    const target = lastField.current ?? { key: "p0" as FieldKey, el: null };
    const text = `{{${name}}}`;
    const current = getValue(target.key);
    const start = target.el?.selectionStart ?? current.length;
    const end = target.el?.selectionEnd ?? current.length;
    setValue(target.key, current.slice(0, start) + text + current.slice(end));
    const el = target.el;
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + text.length, start + text.length);
      });
    }
  }
  const track = (key: FieldKey) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      lastField.current = { key, el: e.currentTarget };
    },
  });

  // --- Live preview of the draft, a moment after typing stops.
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let stale = false;
    const timer = setTimeout(() => {
      api
        .previewEmailTemplate(accessToken, item.key, draft)
        .then((result) => {
          if (stale) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err) => {
          if (!stale) setPreviewError(err instanceof Error ? err.message : "Could not build the preview");
        });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [accessToken, item.key, draft]);

  async function run(kind: "save" | "reset" | "test", action: () => Promise<void>) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const result = await api.saveEmailTemplate(accessToken!, item.key, draft);
      setDraft(result.copy);
      setSaved(result.copy);
      setCustomised(true);
      setMessage({ kind: "ok", text: "Saved. New emails use this wording within a minute." });
      await onChanged();
    });

  const reset = () =>
    run("reset", async () => {
      if (!window.confirm("Go back to the original wording for this email? Your edits will be lost.")) return;
      const result = await api.resetEmailTemplate(accessToken!, item.key);
      setDraft(result.copy);
      setSaved(result.copy);
      setCustomised(false);
      setMessage({ kind: "ok", text: "Back to the original wording." });
      await onChanged();
    });

  const sendTest = () =>
    run("test", async () => {
      const result = await api.sendTestEmail(accessToken!, item.key, draft);
      setMessage({ kind: "ok", text: `Test email sent to ${result.sentTo}.` });
    });

  const atDefault = sameCopy(draft, item.defaults);

  return (
    <div>
      <Card title={item.label}>
        <p style={{ ...styles.muted, margin: "-6px 0 16px" }}>{item.description}</p>

        <Field label="Subject" error={fieldErrors.subject}>
          <input style={styles.input} value={draft.subject} onChange={(e) => setValue("subject", e.target.value)} {...track("subject")} maxLength={200} />
        </Field>
        <Field label="Preview text" hint="The grey line shown next to the subject in an inbox." error={fieldErrors.preheader}>
          <input style={styles.input} value={draft.preheader} onChange={(e) => setValue("preheader", e.target.value)} {...track("preheader")} maxLength={300} />
        </Field>
        <Field label="Heading" error={fieldErrors.heading}>
          <input style={styles.input} value={draft.heading} onChange={(e) => setValue("heading", e.target.value)} {...track("heading")} maxLength={200} />
        </Field>

        <Field label="Message" hint="The email opens with “Hi <first name>,” automatically." error={fieldErrors.paragraphs}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.paragraphs.map((text, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <textarea
                  style={{ ...styles.input, minHeight: 64, resize: "vertical", flex: 1 }}
                  value={text}
                  onChange={(e) => setValue(`p${i}`, e.target.value)}
                  {...track(`p${i}`)}
                  maxLength={2000}
                  aria-label={`Paragraph ${i + 1}`}
                />
                <button
                  type="button"
                  style={{ ...btn.small, flexShrink: 0 }}
                  disabled={draft.paragraphs.length <= 1}
                  onClick={() => setDraft((d) => ({ ...d, paragraphs: d.paragraphs.filter((_, j) => j !== i) }))}
                  aria-label={`Remove paragraph ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {draft.paragraphs.length < 8 ? (
              <div>
                <button type="button" style={btn.small} onClick={() => setDraft((d) => ({ ...d, paragraphs: [...d.paragraphs, ""] }))}>
                  + Add paragraph
                </button>
              </div>
            ) : null}
          </div>
        </Field>

        {item.canHaveButton ? (
          <Field label="Button text" hint="Leave empty to remove the button. The link itself is set automatically." error={fieldErrors.ctaLabel}>
            <input style={styles.input} value={draft.ctaLabel} onChange={(e) => setValue("ctaLabel", e.target.value)} {...track("ctaLabel")} maxLength={60} />
          </Field>
        ) : null}

        <Field label="Note" hint="A small boxed line at the bottom, e.g. a security reminder. Leave empty for none." error={fieldErrors.note}>
          <textarea style={{ ...styles.input, minHeight: 56, resize: "vertical" }} value={draft.note} onChange={(e) => setValue("note", e.target.value)} {...track("note")} maxLength={1000} />
        </Field>

        {item.vars.length > 0 ? (
          <div style={{ marginTop: 6 }}>
            <div style={styles.label}>Placeholders</div>
            <p style={{ ...styles.muted, margin: "0 0 8px" }}>Click one to add it where you were typing. Each is replaced with the real value in every email sent.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {item.vars.map((x) => (
                <button
                  key={x.name}
                  type="button"
                  style={styles.varChip}
                  title={x.description}
                  // Keep the cursor in the field you were typing in.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVar(x.name)}
                >
                  {`{{${x.name}}}`}
                  <span style={styles.varDesc}>{x.description}</span>
                </button>
              ))}
            </div>
            {fieldErrors.placeholders ? <p style={styles.error}>{fieldErrors.placeholders}</p> : null}
          </div>
        ) : null}

        <p style={{ ...styles.muted, marginTop: 16 }}>
          Fixed parts, such as the logo, details table, code and button link, are filled in automatically and can’t be edited here.
        </p>

        {message ? (
          <p role="status" style={message.kind === "ok" ? styles.success : styles.error}>
            {message.text}
          </p>
        ) : null}

        <div style={styles.actions}>
          <button style={btn.primary} disabled={!dirty || busy !== null} onClick={save}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button style={btn.secondary} disabled={busy !== null} onClick={sendTest}>
            {busy === "test" ? "Sending…" : "Send test to me"}
          </button>
          <button style={btn.secondary} disabled={busy !== null || (!customised && atDefault)} onClick={reset}>
            Reset to original
          </button>
          {customised ? <span style={styles.badge}>Edited</span> : null}
          {dirty ? <span style={{ ...styles.muted, alignSelf: "center" }}>Unsaved changes</span> : null}
        </div>
      </Card>

      <PreviewCard preview={preview} error={previewError} />
    </div>
  );
}

function PreviewCard({ preview, error }: { preview: EmailPreview | null; error: string | null }) {
  const [mobile, setMobile] = useState(false);
  const [height, setHeight] = useState(640);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // The preview is a full page of its own, shown in a frame sized to its content.
  const fit = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) setHeight(Math.max(320, doc.documentElement.scrollHeight));
  }, []);
  useEffect(() => {
    fit();
  }, [mobile, fit]);

  return (
    <Card title="Preview">
      <div style={styles.previewBar}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.label}>Subject</div>
          <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>{preview?.subject ?? "…"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button style={{ ...btn.small, ...(mobile ? {} : styles.toggleOn) }} onClick={() => setMobile(false)} aria-pressed={!mobile}>
            Desktop
          </button>
          <button style={{ ...btn.small, ...(mobile ? styles.toggleOn : {}) }} onClick={() => setMobile(true)} aria-pressed={mobile}>
            Phone
          </button>
        </div>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      <div style={styles.frameWrap}>
        <iframe
          ref={frameRef}
          title="Email preview"
          // No scripts run in it; same-origin only so its height can be measured.
          sandbox="allow-same-origin"
          srcDoc={preview?.html ?? ""}
          onLoad={fit}
          style={{ ...styles.frame, width: mobile ? 390 : "100%", height }}
        />
      </div>
      <p style={{ ...styles.muted, margin: "10px 0 0" }}>Shown with example data. Real emails use the recipient’s own details.</p>
    </Card>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={styles.label}>{label}</label>
      {children}
      {hint ? <div style={{ ...styles.muted, marginTop: 4 }}>{hint}</div> : null}
      {error ? <p style={{ ...styles.error, marginTop: 4 }}>{error}</p> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  muted: { fontSize: 13, color: "var(--text-muted)" },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontSize: 14, lineHeight: 1.5 },
  search: { width: "100%", height: 40, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontSize: 14 },
  groupTitle: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.9px", color: "var(--text-muted)", padding: "0 10px 6px" },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 10px",
    border: "none",
    borderRadius: 10,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },
  listItemActive: { background: "var(--accent-wash)", color: "var(--accent-dark)" },
  editedDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 },
  picker: { width: "100%", height: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontSize: 14, fontWeight: 600 },
  varChip: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--accent-wash)",
    color: "var(--accent-dark)",
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  varDesc: { fontFamily: "inherit", fontSize: 11, fontWeight: 500, color: "var(--text-muted)", fontStyle: "normal" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 18 },
  badge: { padding: "3px 10px", borderRadius: 999, background: "var(--accent-wash)", color: "var(--accent-dark)", fontSize: 12, fontWeight: 700 },
  success: { color: "var(--status-good)", fontSize: 13, fontWeight: 600, margin: "12px 0 0" },
  error: { color: "var(--status-critical)", fontSize: 13, fontWeight: 600, margin: "12px 0 0" },
  previewBar: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  toggleOn: { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" },
  frameWrap: { background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "flex", justifyContent: "center", overflow: "auto" },
  frame: { border: "none", background: "transparent", maxWidth: "100%", display: "block" },
};
