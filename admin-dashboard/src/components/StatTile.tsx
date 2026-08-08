export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.tile}>
      <span style={styles.value}>{value}</span>
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tile: {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderLeft: "4px solid var(--accent)",
    borderRadius: 12,
    padding: 20,
    flex: 1,
    minWidth: 160,
    boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
  },
  value: { display: "block", fontSize: 32, fontWeight: 700, color: "var(--text-primary)" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 4 },
};
