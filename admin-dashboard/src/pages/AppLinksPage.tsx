import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { btn } from "../components/buttons";

// The Play Store and App Store addresses the public website's "Download the app"
// buttons point to. Leave one empty and that button is hidden on the website.
export function AppLinksPage() {
  const { accessToken } = useAuth();
  const [play, setPlay] = useState("");
  const [apple, setApple] = useState("");
  const [saved, setSaved] = useState({ play: "", apple: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getAppLinks()
      .then((links) => {
        setPlay(links.playStoreUrl);
        setApple(links.appStoreUrl);
        setSaved({ play: links.playStoreUrl, apple: links.appStoreUrl });
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed to load the links" }))
      .finally(() => setLoading(false));
  }, []);

  const dirty = play.trim() !== saved.play || apple.trim() !== saved.apple;

  async function save() {
    if (!accessToken) return;
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      const result = await api.updateAppLinks(accessToken, { playStoreUrl: play.trim(), appStoreUrl: apple.trim() });
      setPlay(result.playStoreUrl);
      setApple(result.appStoreUrl);
      setSaved({ play: result.playStoreUrl, apple: result.appStoreUrl });
      setMessage({ ok: true, text: "Saved. The website shows the new links straight away." });
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="App download links" subtitle="Where the website's download buttons send people. Leave a link empty to hide that button." />
      <Card>
        {loading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <>
            <Field label="Google Play Store link" error={errors.playStoreUrl} hint="e.g. https://play.google.com/store/apps/details?id=com.eduwand.app">
              <input style={styles.input} value={play} onChange={(e) => setPlay(e.target.value)} placeholder="https://play.google.com/store/apps/details?id=…" maxLength={2000} />
            </Field>
            <Field label="Apple App Store link" error={errors.appStoreUrl} hint="e.g. https://apps.apple.com/in/app/eduwand/id1234567890">
              <input style={styles.input} value={apple} onChange={(e) => setApple(e.target.value)} placeholder="https://apps.apple.com/…" maxLength={2000} />
            </Field>
            {message ? (
              <p role="status" style={{ color: message.ok ? "var(--status-good)" : "var(--status-critical)", fontSize: 13, fontWeight: 600 }}>
                {message.text}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={btn.primary} disabled={!dirty || saving} onClick={save}>
                {saving ? "Saving…" : "Save links"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={styles.label}>{label}</label>
      {children}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>
      {error ? <p style={{ color: "var(--status-critical)", fontSize: 13, margin: "4px 0 0" }}>{error}</p> : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "#fff", fontSize: 14 },
};
