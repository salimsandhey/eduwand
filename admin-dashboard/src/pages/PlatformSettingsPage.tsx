import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { AiFeature, Plan, PlatformSetting } from "../api/client";
import { Card } from "../components/Card";
import { PageHeader } from "../components/PageHeader";
import { rules } from "../utils/validation";

// Individual-teacher onboarding + credits/billing
// (Docs/superpowers/plans/2026-09-09-individual-teacher-onboarding-and-
// credits.md). Credit-grant resolution order: a Trust's assigned Plan, else
// the Plan with isDefault true, else the "individual_default_credits"
// PlatformSetting below as a last-resort fallback. In practice, editing the
// default Plan's credits is what actually changes new signups - the setting
// only matters if no default Plan exists at all.

export function PlatformSettingsPage() {
  const { accessToken } = useAuth();

  const [settings, setSettings] = useState<PlatformSetting[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [aiFeatures, setAiFeatures] = useState<AiFeature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingFeatureKey, setSavingFeatureKey] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanCredits, setNewPlanCredits] = useState("");
  const [newPlanSeats, setNewPlanSeats] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    try {
      const [settingsRes, plansRes, featuresRes] = await Promise.all([
        api.listPlatformSettings(accessToken),
        api.listPlans(accessToken),
        api.listAiFeatures(accessToken),
      ]);
      setSettings(settingsRes);
      setPlans(plansRes);
      setAiFeatures(featuresRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform settings");
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateSetting(key: string, value: string) {
    if (!accessToken) return;
    if (!value.trim()) {
      setError("A setting cannot be empty");
      return;
    }
    setSavingKey(key);
    try {
      await api.updatePlatformSetting(accessToken, key, value.trim());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSavingKey(null);
    }
  }

  // Saves on blur/toggle like the plan table above; skips a no-op edit so
  // tabbing through the table doesn't fire a request per cell.
  async function updateAiFeature(feature: AiFeature, input: Parameters<typeof api.updateAiFeature>[2]) {
    if (!accessToken) return;
    const changed = Object.entries(input).some(([field, value]) => feature[field as keyof AiFeature] !== value);
    if (!changed) return;
    setSavingFeatureKey(feature.key);
    try {
      await api.updateAiFeature(accessToken, feature.key, input);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update AI feature");
    } finally {
      setSavingFeatureKey(null);
    }
  }

  function updateAiFeatureCost(feature: AiFeature, value: string) {
    const problem = rules.integer("Cost", 0, 100_000)(value);
    if (problem) {
      setError(problem);
      return;
    }
    const parsed = Number(value);
    updateAiFeature(feature, { cost: parsed });
  }

  async function makeDefault(plan: Plan) {
    if (!accessToken) return;
    setSavingPlanId(plan.id);
    try {
      await api.updatePlan(accessToken, plan.id, { isDefault: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSavingPlanId(null);
    }
  }

  async function updateCredits(plan: Plan, credits: string) {
    const problem = rules.integer("Credits per teacher seat", 0, 10_000_000)(credits);
    if (problem) {
      setError(problem);
      return;
    }
    const parsed = Number(credits);
    if (!accessToken || parsed === plan.creditsPerTeacherSeat) return;
    setSavingPlanId(plan.id);
    try {
      await api.updatePlan(accessToken, plan.id, { creditsPerTeacherSeat: parsed });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSavingPlanId(null);
    }
  }

  async function updateSeatLimit(plan: Plan, seats: string) {
    const problem = rules.integer("Teacher seat limit", 1, 100_000)(seats);
    if (problem) {
      setError(problem);
      return;
    }
    const parsed = Number(seats);
    if (!accessToken || parsed === plan.teacherSeatLimit) return;
    setSavingPlanId(plan.id);
    try {
      await api.updatePlan(accessToken, plan.id, { teacherSeatLimit: parsed });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSavingPlanId(null);
    }
  }

  async function addPlan() {
    if (!accessToken) return;
    const problem =
      rules.label("Plan name", true, 60)(newPlanName) ??
      rules.integer("Credits per teacher seat", 0, 10_000_000)(newPlanCredits) ??
      rules.integer("Teacher seat limit", 1, 100_000)(newPlanSeats);
    if (problem) {
      setAddError(problem);
      return;
    }
    const credits = Number(newPlanCredits);
    const seats = Number(newPlanSeats);
    setAddError(null);
    try {
      await api.createPlan(accessToken, { name: newPlanName.trim(), creditsPerTeacherSeat: credits, teacherSeatLimit: seats });
      setNewPlanName("");
      setNewPlanCredits("");
      setNewPlanSeats("");
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create plan");
    }
  }

  return (
    <div>
      <PageHeader title="Plans & pricing" subtitle="School billing plans, what each AI action costs in credits, and fallback settings" />

      {error ? <p style={{ color: "var(--status-critical)" }}>{error}</p> : null}

      <Card title="Billing plans">
        {!plans ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Credits / teacher seat</th>
                <th style={styles.th}>Teacher seat limit</th>
                <th style={styles.th}>Default</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td style={styles.td}>{plan.name}</td>
                  <td style={styles.td}>
                    <input
                      style={styles.labelInput}
                      type="number"
                      min={0}
                      defaultValue={plan.creditsPerTeacherSeat}
                      disabled={savingPlanId === plan.id}
                      onBlur={(e) => updateCredits(plan, e.target.value)}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      style={styles.labelInput}
                      type="number"
                      min={1}
                      defaultValue={plan.teacherSeatLimit}
                      disabled={savingPlanId === plan.id}
                      onBlur={(e) => updateSeatLimit(plan, e.target.value)}
                    />
                  </td>
                  <td style={styles.td}>
                    {plan.isDefault ? (
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>Default</span>
                    ) : (
                      <button style={styles.reorderBtn} disabled={savingPlanId === plan.id} onClick={() => makeDefault(plan)}>
                        Make default
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
          The default plan's credits are granted to every new individual-teacher signup and every institutional teacher
          seat whose trust has no plan explicitly assigned.
        </p>
      </Card>

      <Card title="AI feature costs">
        {!aiFeatures ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Feature</th>
                  <th style={styles.th}>Name shown to teachers</th>
                  <th style={styles.th}>Description</th>
                  <th style={styles.th}>Credits per use</th>
                  <th style={styles.th}>On Credits screen</th>
                </tr>
              </thead>
              <tbody>
                {aiFeatures.map((feature) => {
                  const disabled = savingFeatureKey === feature.key;
                  return (
                    <tr key={feature.key}>
                      <td style={{ ...styles.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{feature.key}</td>
                      <td style={styles.td}>
                        <input
                          key={`${feature.key}-label-${feature.updatedAt}`}
                          style={styles.labelInput}
                          defaultValue={feature.label}
                          disabled={disabled}
                          onBlur={(e) => e.target.value.trim() && updateAiFeature(feature, { label: e.target.value.trim() })}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          key={`${feature.key}-description-${feature.updatedAt}`}
                          style={{ ...styles.labelInput, minWidth: 260 }}
                          defaultValue={feature.description}
                          disabled={disabled}
                          onBlur={(e) => updateAiFeature(feature, { description: e.target.value.trim() })}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          key={`${feature.key}-cost-${feature.updatedAt}`}
                          style={{ ...styles.labelInput, minWidth: 90, width: 90 }}
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={feature.cost}
                          disabled={disabled}
                          onBlur={(e) => updateAiFeatureCost(feature, e.target.value)}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={feature.showOnCredits}
                          disabled={disabled}
                          onChange={(e) => updateAiFeature(feature, { showOnCredits: e.target.checked })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
          A cost change applies to every teacher's next AI action and is recorded in the audit log. Features shown on the
          Credits screen appear under "Your balance covers" in the mobile app.
        </p>
      </Card>

      <Card title="Add a plan">
        <div style={styles.row}>
          <input style={styles.input} placeholder="Name (e.g. Premium)" value={newPlanName} onChange={(e) => setNewPlanName(e.target.value)} />
          <input
            style={styles.input}
            placeholder="Credits per teacher seat"
            type="number"
            min={0}
            value={newPlanCredits}
            onChange={(e) => setNewPlanCredits(e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Teacher seat limit"
            type="number"
            min={1}
            value={newPlanSeats}
            onChange={(e) => setNewPlanSeats(e.target.value)}
          />
          <button style={styles.button} onClick={addPlan} disabled={!newPlanName.trim() || !newPlanCredits.trim() || !newPlanSeats.trim()}>
            Add plan
          </button>
        </div>
        {addError ? <p style={{ color: "var(--status-critical)", fontSize: 13, marginTop: 8 }}>{addError}</p> : null}
      </Card>

      <Card title="Fallback settings">
        {!settings ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Key</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={setting.id}>
                  <td style={{ ...styles.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{setting.key}</td>
                  <td style={styles.td}>
                    <input
                      style={styles.labelInput}
                      defaultValue={setting.value}
                      disabled={savingKey === setting.key}
                      onBlur={(e) => updateSetting(setting.key, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
          Only used when no default plan exists at all - editing the default plan above is the normal way to change the
          credit grant.
        </p>
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
  td: { padding: "10px 12px 10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 },
  reorderBtn: {
    height: 26,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-page)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 10px",
  },
  labelInput: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    fontSize: 14,
    minWidth: 160,
  },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    fontSize: 14,
    flex: 1,
    minWidth: 160,
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
};
