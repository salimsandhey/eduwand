import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { MessageTemplate, MessageChannel } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

const CHANNELS: MessageChannel[] = ["sms", "email"];

export function MessageTemplatesPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";
  const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;

  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [channel, setChannel] = useState<MessageChannel>("sms");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setError(null);
    try {
      const res = await api.listMessageTemplates(accessToken, { schoolId });
      setTemplates(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load message templates");
    }
  }, [accessToken, needsSchoolPicker, selectedSchoolId, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTemplate() {
    if (!accessToken || !name.trim() || !body.trim()) return;
    setIsSaving(true);
    setAddError(null);
    try {
      await api.createMessageTemplate(accessToken, { channel, name: name.trim(), body: body.trim() }, { schoolId });
      setName("");
      setBody("");
      setShowAdd(false);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setIsSaving(false);
    }
  }

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  return (
    <div>
      <PageHeader title="Message Templates" subtitle="SMS and email templates used for follow-up tasks" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card>
        {!templates ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No templates yet - add one below.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {templates.map((t) => (
              <div key={t.id} style={styles.templateBox}>
                <div style={styles.templateHeader}>
                  <strong>{t.name}</strong>
                  <span style={styles.channelBadge}>{t.channel}</span>
                </div>
                <p style={styles.templateBody}>{t.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Add a template">
        {!showAdd ? (
          <button style={styles.secondaryButton} onClick={() => setShowAdd(true)}>
            + New template
          </button>
        ) : (
          <div>
            <div style={styles.row}>
              <select style={styles.input} value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                style={styles.input}
                placeholder="Template name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <textarea
              style={styles.textarea}
              placeholder="Message body - use {{fieldName}} for placeholders like {{contactName}}"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
            />
            <div style={{ ...styles.row, marginTop: 8 }}>
              <button style={styles.button} onClick={addTemplate} disabled={isSaving || !name.trim() || !body.trim()}>
                {isSaving ? "Saving…" : "Save template"}
              </button>
              <button style={styles.secondaryButton} onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
            {addError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{addError}</p> : null}
          </div>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  templateBox: { border: "1px solid var(--border)", borderRadius: 10, padding: 14 },
  templateHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  channelBadge: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "2px 8px",
  },
  templateBody: { margin: 0, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    flex: 1,
    minWidth: 160,
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    marginTop: 8,
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
  },
  button: {
    background: "var(--accent)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  secondaryButton: {
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
};
