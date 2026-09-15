import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../api/client";
import type { SchoolBranding } from "../../api/client";
import { Card } from "../../components/Card";
import type { SchoolOutletContext } from "./SchoolLayout";

const DEFAULT_COLOR = "#4C4CE0";

export function SchoolBrandingTab() {
  const { id, accessToken, canManageAcademics } = useOutletContext<SchoolOutletContext>();

  const [branding, setBranding] = useState<SchoolBranding | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_COLOR);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoadError(null);
    try {
      const result = await api.getSchoolBranding(accessToken, id);
      setBranding(result);
      setPrimaryColor(result.primaryColor ?? DEFAULT_COLOR);
      setSecondaryColor(result.secondaryColor ?? DEFAULT_COLOR);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load branding");
    }
  }, [accessToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setSaved(false);
  }

  async function save() {
    if (!accessToken || !id) return;
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await api.saveSchoolBranding(accessToken, id, {
        logoFile: logoFile ?? undefined,
        primaryColor,
        secondaryColor,
      });
      setBranding(result);
      setLogoFile(null);
      setLogoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <Card title="Branding">
        <p style={styles.error}>{loadError}</p>
      </Card>
    );
  }

  if (!branding) {
    return (
      <Card title="Branding">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </Card>
    );
  }

  const displayedLogo = logoPreview ?? branding.logoUrl;

  return (
    <Card title="Branding">
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0 }}>
        Used by the Presentation "School format" style - your logo and brand colors appear on every slide.
      </p>

      <div style={styles.field}>
        <label style={styles.label}>Logo</label>
        <div style={styles.logoRow}>
          {displayedLogo ? (
            <img src={displayedLogo} alt="School logo" style={styles.logoPreview} />
          ) : (
            <div style={styles.logoPlaceholder}>No logo set</div>
          )}
          {canManageAcademics ? (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => pickLogo(e.target.files?.[0])}
              style={styles.fileInput}
            />
          ) : null}
        </div>
      </div>

      <div style={styles.colorRow}>
        <div style={styles.field}>
          <label style={styles.label}>Primary color</label>
          <div style={styles.colorInputRow}>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => { setPrimaryColor(e.target.value); setSaved(false); }}
              disabled={!canManageAcademics}
              style={styles.colorSwatch}
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => { setPrimaryColor(e.target.value); setSaved(false); }}
              disabled={!canManageAcademics}
              style={styles.hexInput}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Secondary color</label>
          <div style={styles.colorInputRow}>
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => { setSecondaryColor(e.target.value); setSaved(false); }}
              disabled={!canManageAcademics}
              style={styles.colorSwatch}
            />
            <input
              type="text"
              value={secondaryColor}
              onChange={(e) => { setSecondaryColor(e.target.value); setSaved(false); }}
              disabled={!canManageAcademics}
              style={styles.hexInput}
            />
          </div>
        </div>
      </div>

      {canManageAcademics ? (
        <div style={styles.actionRow}>
          <button style={styles.button} onClick={save} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save branding"}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
          Only school admins, trust leadership, and platform admins can edit branding.
        </p>
      )}

      {saved ? <p style={styles.success}>Saved</p> : null}
      {saveError ? <p style={styles.error}>{saveError}</p> : null}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { marginTop: 20 },
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: 8 },
  logoRow: { display: "flex", alignItems: "center", gap: 16 },
  logoPreview: { width: 90, height: 90, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-page)" },
  logoPlaceholder: {
    width: 90,
    height: 90,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    color: "var(--text-muted)",
    fontSize: 11,
    textAlign: "center",
  },
  fileInput: { fontSize: 13 },
  colorRow: { display: "flex", gap: 32, flexWrap: "wrap" },
  colorInputRow: { display: "flex", alignItems: "center", gap: 10 },
  colorSwatch: { width: 40, height: 36, padding: 2, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" },
  hexInput: {
    width: 100,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  actionRow: { display: "flex", gap: 8, marginTop: 24 },
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
  success: { color: "var(--status-good)", fontSize: 13, marginTop: 8, marginBottom: 0 },
  error: { color: "var(--status-critical)", fontSize: 13, marginTop: 8, marginBottom: 0 },
};
