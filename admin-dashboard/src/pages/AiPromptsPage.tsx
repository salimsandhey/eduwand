import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AiPromptTemplate, GenerationOutputType } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";

const OUTPUT_TYPE_LABELS: Record<GenerationOutputType, string> = {
  lesson_plan: "Lesson Plan",
  custom_activity_report: "Custom Activity",
  flashcards: "Flashcards",
  presentation: "Presentation",
};

// Platform-wide - not school-scoped, so no SchoolPicker/needsSchoolPicker
// dance like MessageTemplatesPage. Editing here changes what every school's
// Gemini calls for that outputType actually receive as instructions
// (backend/src/lib/ai.ts getPromptInstructions) - takes effect on the very
// next generation, no deploy needed.
export function AiPromptsPage() {
  const { accessToken } = useAuth();
  const [prompts, setPrompts] = useState<AiPromptTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const res = await api.listAiPrompts(accessToken);
      setPrompts(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI prompts");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  function updateLocal(outputType: GenerationOutputType, promptBody: string) {
    setPrompts((prev) => (prev ? prev.map((p) => (p.outputType === outputType ? { ...p, promptBody } : p)) : prev));
  }

  return (
    <div>
      <PageHeader
        title="AI Prompts"
        subtitle="The instructions sent to the model for each generation type. Changes apply to every school immediately."
      />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      {!prompts ? (
        <Card>
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </Card>
      ) : (
        prompts.map((prompt) => (
          <PromptCard
            key={prompt.outputType}
            prompt={prompt}
            accessToken={accessToken!}
            onLocalChange={(body) => updateLocal(prompt.outputType, body)}
            onSaved={(updated) =>
              setPrompts((prev) => (prev ? prev.map((p) => (p.outputType === updated.outputType ? updated : p)) : prev))
            }
          />
        ))
      )}
    </div>
  );
}

function PromptCard({
  prompt,
  accessToken,
  onLocalChange,
  onSaved,
}: {
  prompt: AiPromptTemplate;
  accessToken: string;
  onLocalChange: (body: string) => void;
  onSaved: (updated: AiPromptTemplate) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save() {
    if (!prompt.promptBody.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateAiPrompt(accessToken, prompt.outputType, prompt.promptBody.trim());
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetToDefault() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await api.resetAiPrompt(accessToken, prompt.outputType);
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to reset prompt");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <div style={styles.headerRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 15 }}>{OUTPUT_TYPE_LABELS[prompt.outputType]}</strong>
          <span style={{ ...styles.badge, ...(prompt.isCustom ? styles.badgeCustom : styles.badgeDefault) }}>
            {prompt.isCustom ? "Custom" : "Default"}
          </span>
        </div>
        {prompt.updatedAt ? (
          <span style={styles.updatedAt}>Last edited {new Date(prompt.updatedAt).toLocaleString()}</span>
        ) : null}
      </div>

      <textarea
        style={styles.textarea}
        value={prompt.promptBody}
        onChange={(e) => onLocalChange(e.target.value)}
        rows={7}
      />

      <div style={styles.actionRow}>
        <button style={styles.button} onClick={save} disabled={isSaving || !prompt.promptBody.trim()}>
          {isSaving ? "Saving…" : "Save"}
        </button>
        {prompt.isCustom ? (
          <button style={styles.secondaryButton} onClick={resetToDefault} disabled={isSaving}>
            Reset to default
          </button>
        ) : null}
      </div>
      {saveError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{saveError}</p> : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  badge: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderRadius: 8, padding: "2px 8px" },
  badgeDefault: { color: "var(--text-muted)", background: "var(--bg-page)", border: "1px solid var(--border)" },
  badgeCustom: { color: "var(--accent)", background: "rgba(124,0,90,0.08)", border: "1px solid var(--accent)" },
  updatedAt: { fontSize: 12, color: "var(--text-muted)" },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
  },
  actionRow: { display: "flex", gap: 8, marginTop: 10 },
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
