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
    borderRadius: 12,
    padding: 20,
    flex: 1,
    minWidth: 160,
  },
  value: { display: "block", fontSize: 32, fontWeight: 600, color: "var(--text-primary)" },
  label: { display: "block", fontSize: 13, color: "var(--text-secondary)", marginTop: 4 },
};
