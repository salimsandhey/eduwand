import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSchoolContext } from "../context/SchoolContext";
import { api } from "../api/client";
import type { FormDefinitionPurpose, FormDefinitionWithFields, FormField, FormFieldType, PipelineStage } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { SelectSchoolPrompt } from "../components/SelectSchoolPrompt";

const PURPOSES: { value: FormDefinitionPurpose; label: string }[] = [
  { value: "enquiry_intake", label: "Enquiry Intake" },
  { value: "admission_detail", label: "Admission Detail" },
  { value: "document_checklist", label: "Document Checklist" },
];

const FIELD_TYPES: FormFieldType[] = ["text", "number", "date", "select", "multiselect", "checkbox", "textarea", "file"];

function slugify(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join("");
}

interface FieldFormState {
  label: string;
  key: string;
  keyEdited: boolean;
  fieldType: FormFieldType;
  isRequired: boolean;
  requiredAtStage: string;
  optionsText: string;
}

const EMPTY_FIELD_FORM: FieldFormState = {
  label: "",
  key: "",
  keyEdited: false,
  fieldType: "text",
  isRequired: false,
  requiredAtStage: "",
  optionsText: "",
};

export function FormBuilderPage() {
  const { accessToken, user } = useAuth();
  const { selectedSchoolId, isLoading: schoolsLoading } = useSchoolContext();
  const needsSchoolPicker = user?.role === "leadership" || user?.role === "platform_admin";
  const schoolId = needsSchoolPicker ? selectedSchoolId ?? undefined : undefined;

  const [purpose, setPurpose] = useState<FormDefinitionPurpose>("enquiry_intake");
  const [result, setResult] = useState<FormDefinitionWithFields | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [busy, setBusy] = useState(false);

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldFormState>(EMPTY_FIELD_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    setError(null);
    setNotFound(false);
    try {
      const res = await api.getFormDefinition(accessToken, purpose, { schoolId });
      setResult(res);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("no active")) {
        setResult(null);
        setNotFound(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load form definition");
      }
    }
  }, [accessToken, purpose, needsSchoolPicker, selectedSchoolId, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    if (needsSchoolPicker && !selectedSchoolId) return;
    api
      .listPipelineStages(accessToken, { schoolId })
      .then(setStages)
      .catch(() => {});
  }, [accessToken, needsSchoolPicker, selectedSchoolId, schoolId]);

  const sortedFields = useMemo(() => (result ? [...result.fields].sort((a, b) => a.order - b.order) : []), [result]);
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);

  function resetForm() {
    setEditingFieldId(null);
    setFieldForm(EMPTY_FIELD_FORM);
    setFormError(null);
  }

  async function createDefinition() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const name = PURPOSES.find((p) => p.value === purpose)?.label ?? purpose;
      await api.createFormDefinition(accessToken, { purpose, name }, { schoolId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create form definition");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(field: FormField) {
    setEditingFieldId(field.id);
    setFormError(null);
    setFieldForm({
      label: field.label,
      key: field.key,
      keyEdited: true,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      requiredAtStage: field.requiredAtStage ?? "",
      optionsText: Array.isArray(field.options) ? (field.options as string[]).join(", ") : "",
    });
  }

  function needsOptions(fieldType: FormFieldType) {
    return fieldType === "select" || fieldType === "multiselect";
  }

  async function submitField() {
    if (!accessToken || !result) return;
    if (!fieldForm.label.trim() || !fieldForm.key.trim()) {
      setFormError("Label and field key are required");
      return;
    }
    if (needsOptions(fieldForm.fieldType) && !fieldForm.optionsText.trim()) {
      setFormError("Provide at least one option for select/multiselect fields");
      return;
    }

    const options = needsOptions(fieldForm.fieldType)
      ? fieldForm.optionsText
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : undefined;

    setBusy(true);
    setFormError(null);
    try {
      if (editingFieldId) {
        await api.updateFormField(
          accessToken,
          result.definition.id,
          editingFieldId,
          {
            key: fieldForm.key.trim(),
            label: fieldForm.label.trim(),
            fieldType: fieldForm.fieldType,
            options,
            isRequired: fieldForm.isRequired,
            requiredAtStage: fieldForm.requiredAtStage || null,
          },
          { schoolId }
        );
      } else {
        await api.addFormField(
          accessToken,
          result.definition.id,
          {
            key: fieldForm.key.trim(),
            label: fieldForm.label.trim(),
            fieldType: fieldForm.fieldType,
            options,
            isRequired: fieldForm.isRequired,
            requiredAtStage: fieldForm.requiredAtStage || null,
          },
          { schoolId }
        );
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save field");
    } finally {
      setBusy(false);
    }
  }

  async function deleteField(field: FormField) {
    if (!accessToken || !result) return;
    if (!window.confirm(`Delete field "${field.label}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteFormField(accessToken, result.definition.id, field.id, { schoolId });
      if (editingFieldId === field.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete field");
    } finally {
      setBusy(false);
    }
  }

  async function move(field: FormField, direction: -1 | 1) {
    if (!accessToken || !result) return;
    const index = sortedFields.findIndex((f) => f.id === field.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sortedFields.length) return;

    const reordered = [...sortedFields];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];

    setBusy(true);
    setError(null);
    try {
      await api.reorderFormFields(
        accessToken,
        result.definition.id,
        reordered.map((f) => f.id),
        { schoolId }
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder fields");
    } finally {
      setBusy(false);
    }
  }

  if (needsSchoolPicker && !selectedSchoolId) {
    return schoolsLoading ? <p style={{ color: "var(--text-muted)" }}>Loading…</p> : <SelectSchoolPrompt />;
  }

  return (
    <div>
      <PageHeader title="Form Builder" subtitle="Configure the fields captured at each stage of the enrolment flow" />

      <div style={styles.tabs}>
        {PURPOSES.map((p) => (
          <button
            key={p.value}
            style={{ ...styles.tab, ...(purpose === p.value ? styles.tabActive : {}) }}
            onClick={() => {
              setPurpose(p.value);
              resetForm();
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {notFound ? (
        <Card>
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
            No active {PURPOSES.find((p) => p.value === purpose)?.label} form definition exists for this school yet.
          </p>
          <button style={styles.button} onClick={createDefinition} disabled={busy}>
            Create form definition
          </button>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card title={result.definition.name}>
            {sortedFields.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No fields yet - add one below.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}></th>
                    <th style={styles.th}>Label</th>
                    <th style={styles.th}>Key</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Required</th>
                    <th style={styles.th}>Required at stage</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFields.map((field, i) => (
                    <tr key={field.id}>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={styles.reorderBtn} disabled={i === 0 || busy} onClick={() => move(field, -1)}>
                            ↑
                          </button>
                          <button
                            style={styles.reorderBtn}
                            disabled={i === sortedFields.length - 1 || busy}
                            onClick={() => move(field, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td style={styles.td}>{field.label}</td>
                      <td style={{ ...styles.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{field.key}</td>
                      <td style={styles.td}>{field.fieldType}</td>
                      <td style={styles.td}>
                        {field.isRequired ? <span style={styles.badge}>Required</span> : <span style={{ color: "var(--text-muted)" }}>-</span>}
                      </td>
                      <td style={styles.td}>
                        {field.requiredAtStage ? (
                          <span style={styles.badgeStage}>{sortedStages.find((s) => s.key === field.requiredAtStage)?.label ?? field.requiredAtStage}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>-</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={styles.linkButton} onClick={() => startEdit(field)}>
                            Edit
                          </button>
                          <button style={{ ...styles.linkButton, color: "var(--status-critical)" }} onClick={() => deleteField(field)} disabled={busy}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={editingFieldId ? "Edit field" : "Add field"}>
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Label</label>
                <input
                  style={styles.input}
                  value={fieldForm.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setFieldForm((f) => ({ ...f, label, key: f.keyEdited ? f.key : slugify(label) }));
                  }}
                  placeholder="e.g. Guardian Occupation"
                />
              </div>
              <div>
                <label style={styles.label}>Field key</label>
                <input
                  style={{ ...styles.input, fontFamily: "monospace" }}
                  value={fieldForm.key}
                  onChange={(e) => setFieldForm((f) => ({ ...f, key: e.target.value, keyEdited: true }))}
                  placeholder="guardianOccupation"
                />
              </div>
              <div>
                <label style={styles.label}>Field type</label>
                <select
                  style={styles.input}
                  value={fieldForm.fieldType}
                  onChange={(e) => setFieldForm((f) => ({ ...f, fieldType: e.target.value as FormFieldType }))}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={styles.label}>Required at stage</label>
                <select
                  style={styles.input}
                  value={fieldForm.requiredAtStage}
                  onChange={(e) => setFieldForm((f) => ({ ...f, requiredAtStage: e.target.value }))}
                >
                  <option value="">Not stage-gated</option>
                  {sortedStages.map((stage) => (
                    <option key={stage.key} value={stage.key}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </div>
              {needsOptions(fieldForm.fieldType) ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={styles.label}>Options (comma-separated)</label>
                  <input
                    style={styles.input}
                    value={fieldForm.optionsText}
                    onChange={(e) => setFieldForm((f) => ({ ...f, optionsText: e.target.value }))}
                    placeholder="male, female, other"
                  />
                </div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="isRequired"
                  checked={fieldForm.isRequired}
                  onChange={(e) => setFieldForm((f) => ({ ...f, isRequired: e.target.checked }))}
                />
                <label htmlFor="isRequired" style={{ fontSize: 14, color: "var(--text-primary)" }}>
                  Required
                </label>
              </div>
            </div>

            {formError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{formError}</p> : null}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={styles.button} onClick={submitField} disabled={busy}>
                {editingFieldId ? "Save changes" : "Add field"}
              </button>
              {editingFieldId ? (
                <button style={styles.secondaryButton} onClick={resetForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabs: { display: "flex", gap: 8, marginBottom: 18 },
  tab: {
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  tabActive: {
    background: "var(--accent)",
    color: "#fff",
    borderColor: "var(--accent)",
  },
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
  reorderBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 13,
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    padding: 0,
  },
  badge: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--accent-dark)",
    background: "var(--accent-wash)",
    borderRadius: 8,
    padding: "3px 8px",
  },
  badgeStage: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-secondary)",
    background: "var(--bg-page)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "3px 8px",
  },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
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
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
};
