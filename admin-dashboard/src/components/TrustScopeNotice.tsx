// Shown when a trust-scoped Leadership user (no single school_id) hits an endpoint
// that currently only supports single-school scope. Trust-level consolidated
// analytics (PRD section 4.1) isn't built yet - this says so plainly instead of
// showing a raw 403.
export function TrustScopeNotice() {
  return (
    <div style={styles.box}>
      <strong style={styles.title}>Trust-level view not available yet</strong>
      <p style={styles.body}>
        This screen currently only supports a single school's data. Consolidated
        analytics across every school in a trust hasn't been built yet - it needs a
        backend change to aggregate across schools, not just this screen.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    background: "#fff8e6",
    border: "1px solid var(--status-warning)",
    borderRadius: 8,
    padding: 16,
  },
  title: { color: "#8a5a00", display: "block", marginBottom: 6 },
  body: { margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 },
};
