import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import type { SchoolFormatTemplateAppliesTo, SchoolFormatTemplates } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";

interface FieldConfig {
  appliesTo: SchoolFormatTemplateAppliesTo;
  label: string;
  placeholder: string;
  note?: string;
}

const FIELDS: FieldConfig[] = [
  {
    appliesTo: "generation",
    label: "Generation format",
    placeholder:
      "e.g. Always start with the school name as a top heading. Use CBSE-style section headers. " +
      "End every document with: Reviewed by: ______",
    note: "Applied automatically to every Lesson Studio generation for this school.",
  },
  {
    appliesTo: "attainment_report",
    label: "Attainment report format",
    placeholder: "e.g. Include the school crest reference and term dates in the header.",
    note: "Stored for later use - attainment report PDF export doesn't exist yet, so this isn't applied to anything yet.",
  },
];

// Free-text formatting/style instructions, not a structured document template
// - there's no PDF/document-rendering engine to consume a stricter format
// yet. "generation" is injected into the Gemini prompt
// (backend/src/routes/generations.ts); "attainment_report" is stored only.
export function SchoolTemplatesTab() {
  const { id, accessToken, canManageAcademics } = useOutletContext<SchoolOutletContext>();

  const [templates, setTemplates] = useState<SchoolFormatTemplates | null>(null);
  const [drafts, setDrafts] = useState<Record<SchoolFormatTemplateAppliesTo, string>>({
    generation: "",
    attainment_report: "",
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<SchoolFormatTemplateAppliesTo | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [fieldMessage, setFieldMessage] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoadError(null);
    try {
      const result = await api.getSchoolFormatTemplates(accessToken, id);
      setTemplates(result);
      setDrafts({
        generation: result.generation?.templateBody ?? "",
        attainment_report: result.attainmentReport?.templateBody ?? "",
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load format templates");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(appliesTo: SchoolFormatTemplateAppliesTo) {
    if (!accessToken || !id) return;
    const body = drafts[appliesTo].trim();
    if (!body) return;
    setSavingField(appliesTo);
    setFieldError((prev) => ({ ...prev, [appliesTo]: "" }));
    setFieldMessage((prev) => ({ ...prev, [appliesTo]: "" }));
    try {
      await api.saveSchoolFormatTemplate(accessToken, id, appliesTo, body);
      await load();
      setFieldMessage((prev) => ({ ...prev, [appliesTo]: "Saved" }));
    } catch (err) {
      setFieldError((prev) => ({ ...prev, [appliesTo]: err instanceof Error ? err.message : "Failed to save" }));
    } finally {
      setSavingField(null);
    }
  }

  async function clear(appliesTo: SchoolFormatTemplateAppliesTo) {
    if (!accessToken || !id) return;
    setSavingField(appliesTo);
    setFieldError((prev) => ({ ...prev, [appliesTo]: "" }));
    setFieldMessage((prev) => ({ ...prev, [appliesTo]: "" }));
    try {
      await api.deleteSchoolFormatTemplate(accessToken, id, appliesTo);
      await load();
      setFieldMessage((prev) => ({ ...prev, [appliesTo]: "Cleared" }));
    } catch (err) {
      setFieldError((prev) => ({ ...prev, [appliesTo]: err instanceof Error ? err.message : "Failed to clear" }));
    } finally {
      setSavingField(null);
    }
  }

  if (loadError) {
    return (
      <Card title="Format template">
        <p style={styles.error}>{loadError}</p>
      </Card>
    );
  }

  if (!templates) {
    return (
      <Card title="Format template">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </Card>
    );
  }

  return (
    <Card title="Format template">
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
        Formatting and style instructions so documents are standardised across the school - not a document
        template, plain instructions the AI follows when writing.
      </p>
      {FIELDS.map((field) => {
        const existing = field.appliesTo === "generation" ? templates.generation : templates.attainmentReport;
        return (
          <div key={field.appliesTo} style={styles.field}>
            <label style={styles.label}>{field.label}</label>
            {field.note ? <p style={styles.note}>{field.note}</p> : null}
            <textarea
              style={styles.textarea}
              value={drafts[field.appliesTo]}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [field.appliesTo]: e.target.value }))}
              placeholder={field.placeholder}
              disabled={!canManageAcademics}
            />
            {canManageAcademics ? (
              <div style={styles.actionRow}>
                <button
                  style={styles.button}
                  onClick={() => save(field.appliesTo)}
                  disabled={savingField === field.appliesTo || !drafts[field.appliesTo].trim()}
                >
                  {savingField === field.appliesTo ? "Saving…" : "Save"}
                </button>
                {existing ? (
                  <button style={styles.secondaryButton} onClick={() => clear(field.appliesTo)} disabled={savingField === field.appliesTo}>
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}
            {fieldMessage[field.appliesTo] ? <p style={styles.success}>{fieldMessage[field.appliesTo]}</p> : null}
            {fieldError[field.appliesTo] ? <p style={styles.error}>{fieldError[field.appliesTo]}</p> : null}
          </div>
        );
      })}
      {!canManageAcademics ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
          Only school admins, trust leadership, and platform admins can edit format templates.
        </p>
      ) : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { marginTop: 20 },
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "block" },
  note: { fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px 0" },
  textarea: {
    width: "100%",
    minHeight: 100,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
  },
  actionRow: { display: "flex", gap: 8, marginTop: 8 },
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
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 8, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 8, marginBottom: 0 },
};
